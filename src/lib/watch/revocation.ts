import { prisma } from '../db';
import { verifyEligibility } from '../cleanverse/cvi';
import { assets } from '../cleanverse/cva';
import { recordEvent } from '../audit/record';
import { ReasonCode } from '../pipeline/reasonCodes';
import { freezeAllForCounterparty } from '../settlement/release';
import { defaultChain, type ChainKey } from '../chain/config';

/**
 * REVOCATION WATCHER. This is what makes the product's central claim literally true:
 * compliance is continuous, not a gate at the door.
 *
 * Mechanism is POLL, not push: no webhook for A-Pass status exists on the Cooperate API
 * (API-TRUTH.md § revocation detection). Every counterparty with an active, unsettled leg is
 * re-verified on an interval, and a credential that has gone from eligible to APassNotActive
 * triggers the freeze cascade without any human deciding to look.
 *
 * Fail-closed: a counterparty we cannot reach is NOT treated as revoked (that would freeze
 * real money on a network blip) but is also NOT treated as valid: it is recorded, and the
 * settlement path independently refuses because evaluate() fails closed on the same signal.
 * The watcher's job is detection; refusal is always the pipeline's.
 */

export const POLL_INTERVAL_MS = 5000;

export interface WatcherEvent {
  address: string;
  signal: string;
  frozenIntents: string[];
}

/** One sweep. Exported separately so it can be tested and driven manually in a demo. */
export async function sweepOnce(chain: ChainKey = defaultChain()): Promise<WatcherEvent[]> {
  const A = assets(chain);

  // Only counterparties with money still at stake are worth polling.
  const legs = await prisma.leg.findMany({
    where: { status: 'PENDING', intent: { status: 'ACTIVE' } },
    select: { recipientCvi: true },
    distinct: ['recipientCvi'],
  });

  const events: WatcherEvent[] = [];

  for (const { recipientCvi } of legs) {
    const outcome = await verifyEligibility({ chain: A.chain, atoken: A.aToken, address: recipientCvi });

    if (outcome.signal === 'ALLOWED') continue;

    if (outcome.signal === 'UNAVAILABLE') {
      // Do not freeze on an unreachable service. Record it so the dashboard can show the
      // check is degraded, and let evaluate() refuse settlement independently.
      await recordEvent({
        eventType: 'CHECK_RUN',
        verdict: 'FAIL',
        reasonCode: ReasonCode.CVI_UNAVAILABLE,
        checkResults: [],
        payload: { watcher: true, address: recipientCvi, detail: outcome.detail },
      });
      continue;
    }

    // NO_APASS, ATOKEN_NOT_FOUND or APASS_NOT_ACTIVE: the counterparty is no longer settleable.
    const reason =
      outcome.signal === 'APASS_NOT_ACTIVE' ? ReasonCode.CVI_REVOKED_OR_EXPIRED : ReasonCode.NO_CVI;

    await recordEvent({
      eventType: 'REVOCATION',
      verdict: 'FREEZE',
      reasonCode: reason,
      checkResults: [],
      payload: { watcher: true, address: recipientCvi, signal: outcome.signal, detail: outcome.detail },
    });

    const frozenIntents = await freezeAllForCounterparty({
      recipientAddress: recipientCvi,
      reason,
      detail: outcome.detail,
      chain,
    });

    events.push({ address: recipientCvi, signal: outcome.signal, frozenIntents });
  }

  return events;
}

/**
 * Run the watcher until stopped. Returns a stop function.
 * Sweeps never overlap: a slow sweep delays the next one rather than stacking, which would
 * multiply load on an API that already degrades under concurrency.
 */
export function startWatcher(opts: { chain?: ChainKey; intervalMs?: number; onEvent?: (e: WatcherEvent) => void } = {}) {
  const interval = opts.intervalMs ?? POLL_INTERVAL_MS;
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  const tick = async () => {
    if (stopped) return;
    try {
      const events = await sweepOnce(opts.chain);
      for (const e of events) opts.onEvent?.(e);
    } catch (err) {
      // A watcher that dies silently is worse than one that logs and continues: the system
      // would look healthy while no longer detecting revocations.
      console.error('[certus:watcher] sweep failed, continuing:', err instanceof Error ? err.message : err);
    }
    if (!stopped) timer = setTimeout(tick, interval);
  };

  timer = setTimeout(tick, interval);

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
