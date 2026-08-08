import { encryptBody } from './aes';
import type { CleanverseResult } from './types';

/**
 * SOURCE: API-TRUTH.md § Envelope, § Environment and auth (ultimately PART XI)
 * VERIFIED: SANDBOX: confirmed 2026-08-08 across query_apass_list, query_apass,
 *           verify_apass, query_deposit_atoken_list, atoken/rules, generate_apass,
 *           update_status.
 * ENCRYPTED: per-call (opts.encrypted). generate_apass + update_status = YES; reads = NO.
 * FALLBACK:  every transport failure becomes kind:'unavailable', never a silent success.
 *            Callers map that to a closed reason code. There is no permissive path.
 *
 * THE ADAPTER BOUNDARY: no Cleanverse call may exist outside src/lib/cleanverse/.
 */

/**
 * Timeout chosen from measured latency, not guessed (scripts/probe/14-latency.mjs):
 *   sequential  -> verify_apass avg 1237ms / max 2118ms, query_apass ~900ms, atoken/rules ~785ms
 *   concurrent  -> evaluate() issues 5 simultaneous requests and the sandbox degrades
 *                  well past 3000ms under that burst.
 * A 3s threshold sat BELOW real-world latency and made the pipeline fail closed constantly.
 * 10s leaves headroom for the concurrent burst while still catching a genuine outage.
 * Fail-closed is only meaningful if the threshold is above honest latency.
 */
const TIMEOUT_MS = Number(process.env.CLEANVERSE_TIMEOUT_MS ?? 10_000);

function baseUrl(): string {
  const u = process.env.CLEANVERSE_BASE_URL;
  if (!u) throw new Error('CLEANVERSE_BASE_URL missing from .env');
  return u.replace(/\/$/, '');
}

function apiId(): string {
  const id = process.env.CLEANVERSE_API_ID;
  if (!id || id.trim() === '') throw new Error('CLEANVERSE_API_ID missing from .env');
  return id.trim();
}

export interface CallOptions {
  encrypted?: boolean;
  timeoutMs?: number;
}

/**
 * CONCURRENCY LIMITER.
 *
 * Measured behaviour (scripts/probe/14-latency.mjs + observed test failures): the sandbox
 * answers sequential calls in under ~2s, but degrades past the timeout when several
 * requests land at once. evaluate() alone issues 5 concurrent calls; a 10-recipient batch
 * would issue ~50 and take the demo down.
 *
 * So Certus queues rather than floods. Requests above the limit wait for a slot instead of
 * being fired and timing out. The timeout clock starts AFTER a slot is acquired, so queued
 * work is never counted as a service failure, which would otherwise fail closed for the
 * wrong reason and report a false compliance outcome.
 */
const MAX_CONCURRENT = Number(process.env.CLEANVERSE_MAX_CONCURRENT ?? 4);
let active = 0;
const waiting: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    waiting.push(() => {
      active++;
      resolve();
    });
  });
}

function releaseSlot(): void {
  active--;
  waiting.shift()?.();
}

/**
 * POST to a Cooperate endpoint.
 *
 * Envelope semantics (API-TRUTH.md): code '0000' means the CALL succeeded. It does NOT
 * mean the compliance check passed. Compliance lives in data.code. Never conflate them.
 */
export async function post<T = unknown>(
  path: string,
  body: Record<string, unknown>,
  opts: CallOptions = {}
): Promise<CleanverseResult<T>> {
  const payload = opts.encrypted ? { data: encryptBody(JSON.stringify(body)) } : body;

  // Wait for a slot BEFORE starting the timeout clock: queueing is not a service failure.
  await acquireSlot();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(baseUrl() + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-id': apiId() },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'AbortError';
    return {
      kind: 'unavailable',
      reason: isAbort ? 'timeout' : 'network',
      detail: isAbort ? `timeout after ${opts.timeoutMs ?? TIMEOUT_MS}ms on ${path}` : String(err),
    };
  } finally {
    clearTimeout(timer);
    releaseSlot();
  }

  if (!res.ok) {
    // e.g. the HTTP 500 atoken/rules returns for a wrong field name.
    return { kind: 'unavailable', reason: 'http', detail: `HTTP ${res.status} on ${path}` };
  }

  let json: { code?: string; message?: string; data?: unknown };
  try {
    json = (await res.json()) as typeof json;
  } catch (err) {
    return { kind: 'unavailable', reason: 'parse', detail: `unparseable body on ${path}: ${String(err)}` };
  }

  const code = json.code ?? '';
  const message = json.message ?? '';

  if (code === '0000') {
    return { kind: 'ok', code: '0000', message, data: json.data as T };
  }
  return { kind: 'business', code, message, data: json.data };
}
