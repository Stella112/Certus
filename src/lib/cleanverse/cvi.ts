import { post } from './client';
import {
  GenerateApassSchema,
  IdentityListSchema,
  QueryApassSchema,
  TxHashSchema,
  VerifyApassSchema,
  parseOrNull,
} from './schemas';
import type { Chain, EligibilityOutcome, QueryApassData, VerifyApassData } from './types';

/**
 * Identity (A-Pass = CVI) adapters.
 * Every function here is traced to docs/API-TRUTH.md § Identity.
 */

/**
 * SOURCE: API-TRUTH.md § POST /verify_apass — THE CORE CHECK
 * VERIFIED: SANDBOX: confirmed 2026-08-08. code 4 (active identity), code 2 (address with
 *           no A-Pass), code 1 (bogus A-Token) all observed live. code 3 proven unreachable.
 * ENCRYPTED: NO (plain JSON)
 * FALLBACK:  any non-'ok' envelope or transport failure yields UNAVAILABLE, which the
 *            pipeline treats as not-eligible. Fail closed, always.
 *
 * THE FREEZE SIGNAL: a frozen A-Pass does NOT return data.code 3 (PART XI was wrong about
 * this; see API-TRUTH.md). It returns envelope 0002 with "APassNotActive" in the message.
 * That string is the revocation signal Moment B depends on.
 */
export async function verifyEligibility(args: {
  chain: Chain;
  atoken: string;
  address: string;
}): Promise<EligibilityOutcome> {
  const res = await post<VerifyApassData>('/verify_apass', {
    chain: args.chain,
    atoken: args.atoken,
    address: args.address,
  });

  if (res.kind === 'unavailable') {
    return { signal: 'UNAVAILABLE', code: null, detail: `${res.reason}: ${res.detail}` };
  }

  if (res.kind === 'business') {
    if (res.message.includes('APassNotActive')) {
      return { signal: 'APASS_NOT_ACTIVE', code: null, detail: 'A-Pass frozen or revoked on chain' };
    }
    // Any other business error is an unrecognised state: treat as unavailable, not as pass.
    return { signal: 'UNAVAILABLE', code: null, detail: `envelope ${res.code}: ${res.message}` };
  }

  // Boundary validation (F1-02). An unrecognised shape means we cannot assert
  // eligibility, so we refuse rather than reading fields off an unvalidated object.
  const parsed = parseOrNull(VerifyApassSchema, res.data);
  if (!parsed) {
    return { signal: 'UNAVAILABLE', code: null, detail: 'malformed verify_apass response, fail closed' };
  }

  const code = parsed.code;
  switch (code) {
    case 4:
      return { signal: 'ALLOWED', code: 4, detail: 'apass verify success' };
    case 2:
      return { signal: 'NO_APASS', code: 2, detail: 'apass not exist' };
    case 1:
      return { signal: 'ATOKEN_NOT_FOUND', code: 1, detail: 'atoken not exist' };
    case 3:
      // Documented as unreachable in this sandbox. Handled defensively: still not eligible.
      return { signal: 'APASS_NOT_ACTIVE', code: 3, detail: 'apass expired or frozen (code 3)' };
    default:
      return { signal: 'UNAVAILABLE', code: code ?? null, detail: `unrecognised data.code: ${String(code)}` };
  }
}

/**
 * SOURCE: API-TRUTH.md § POST /query_apass
 * VERIFIED: SANDBOX: confirmed 2026-08-08.
 * ENCRYPTED: NO (plain JSON)
 * FALLBACK:  null on any failure. Callers must treat null as "attributes unknown" and
 *            fail the asset-rule check rather than assuming compliance.
 *
 * REQUEST FIELD IS `address`, NOT `walletAddress`. The response uses walletAddress; the
 * request does not. Getting this wrong yields a Chinese "wallet address empty" error.
 */
export async function queryIdentity(args: {
  chain: Chain;
  address: string;
}): Promise<QueryApassData | null> {
  const res = await post<unknown>('/query_apass', {
    chain: args.chain,
    address: args.address,
  });
  if (res.kind !== 'ok') return null;
  return parseOrNull(QueryApassSchema, res.data) as QueryApassData | null;
}

/**
 * SOURCE: API-TRUTH.md § POST /query_apass_list
 * VERIFIED: SANDBOX: confirmed 2026-08-08 (865 identities, paginated).
 * ENCRYPTED: NO (plain JSON)
 * FALLBACK:  empty array on failure. Callers must treat an empty list as "cannot enumerate",
 *            never as "no identities exist".
 */
export interface IdentityListItem {
  cvRecordId: string;
  customerId: string;
  chain: string;
  walletAddress: string;
  status: number | null;
  tier: string;
  countries: string[];
  expirationTime: number;
  registeredAt: string;
}

export async function listIdentities(args: {
  page?: number;
  pageSize?: number;
}): Promise<IdentityListItem[]> {
  const res = await post<unknown>('/query_apass_list', {
    pageNo: args.page ?? 1,
    pageSize: args.pageSize ?? 20,
  });
  if (res.kind !== 'ok') return [];
  const parsed = parseOrNull(IdentityListSchema, res.data);
  return (parsed?.items ?? []) as IdentityListItem[];
}

/**
 * SOURCE: API-TRUTH.md § POST /update_status (API reference v5.2)
 * VERIFIED: SANDBOX: both directions confirmed working 2026-08-08.
 * ENCRYPTED: YES (AES body)
 * FALLBACK:  none. A failed freeze must surface, never be swallowed.
 *
 * `status` MUST be a STRING ("1" activate, "2" freeze).
 * We originally sent the integer 2, which the API happens to accept for freeze, and the
 * integer 1, which it does NOT accept for activate: it returned [500] System Error. That led
 * us to record reactivation as broken in UAT and to design the whole freeze-target pool
 * around a limitation that did not exist. It was a type bug on our side. Sending the
 * documented string works in both directions. Keep these as strings.
 *
 * This is the compliance officer's revoke control and the Moment B trigger.
 */
export async function freezeIdentity(args: {
  chain: Chain;
  address: string;
  reason: string;
}): Promise<{ ok: true; txHash: string } | { ok: false; detail: string }> {
  const res = await post<unknown>(
    '/update_status',
    { status: '2', wallet: { chain: args.chain, address: args.address }, blacklistReason: args.reason },
    { encrypted: true }
  );
  if (res.kind === 'ok') {
    const parsed = parseOrNull(TxHashSchema, res.data);
    if (parsed) return { ok: true, txHash: parsed.txHash };
    return { ok: false, detail: 'freeze returned success without a txHash, treat as unconfirmed' };
  }
  const detail = res.kind === 'unavailable' ? `${res.reason}: ${res.detail}` : `envelope ${res.code}: ${res.message}`;
  return { ok: false, detail };
}

/**
 * SOURCE: API-TRUTH.md § POST /update_status (API reference v5.2)
 * VERIFIED: SANDBOX: confirmed 2026-08-08. Reactivated an identity that had been frozen
 *           since Phase 0; verify_apass went from APassNotActive back to code 4.
 * ENCRYPTED: YES (AES body)
 * FALLBACK:  none. If reactivation fails the identity stays frozen, which is the safe state.
 *
 * Reactivation is what lets quarantined funds be released after a compliance review, and it
 * makes freeze-target identities reusable across rehearsals instead of single-use.
 */
export async function reactivateIdentity(args: {
  chain: Chain;
  address: string;
}): Promise<{ ok: true; txHash: string } | { ok: false; detail: string }> {
  const res = await post<unknown>(
    '/update_status',
    { status: '1', wallet: { chain: args.chain, address: args.address } },
    { encrypted: true }
  );
  if (res.kind === 'ok') {
    const parsed = parseOrNull(TxHashSchema, res.data);
    if (parsed) return { ok: true, txHash: parsed.txHash };
    return { ok: false, detail: 'activate returned success without a txHash' };
  }
  const detail = res.kind === 'unavailable' ? `${res.reason}: ${res.detail}` : `envelope ${res.code}: ${res.message}`;
  return { ok: false, detail };
}

/**
 * SOURCE: API-TRUTH.md § POST /generate_apass
 * VERIFIED: SANDBOX: one confirmed success 2026-08-08 (cvRecordId 1271, real txHash).
 *           INTERMITTENT: ~10 consecutive [CV_500] failures followed, while reads stayed
 *           healthy. See the reliability warning in API-TRUTH.md and DECISIONS.md D7.
 * ENCRYPTED: YES (AES body)
 * FALLBACK:  callers must tolerate failure. NOTHING on a demo or rehearsal path may call
 *            this live — freeze-targets come from a pre-minted pool (scripts/mint-pool.ts).
 *
 * Constraints learned from errors: customerId must be >= 12 chars AND alphanumeric only
 * (an underscore triggers a misleading "at least 12 characters" error); expirationTime
 * must be comfortably in the future.
 */
export async function generateIdentity(args: {
  chain: Chain;
  address: string;
  customerId: string;
  expirationTime: number;
  tier?: string;
  countries?: string[];
}): Promise<{ ok: true; cvRecordId: string; txHash?: string } | { ok: false; detail: string }> {
  if (!/^[A-Za-z0-9]{12,}$/.test(args.customerId)) {
    return { ok: false, detail: `customerId must be >=12 alphanumeric chars, got "${args.customerId}"` };
  }
  const res = await post<unknown>(
    '/generate_apass',
    {
      wallet: { chain: args.chain, address: args.address },
      customerId: args.customerId,
      expirationTime: args.expirationTime,
      tier: args.tier ?? '50',
      subTier: 0,
      group: '',
      subGroup: '',
      countries: args.countries ?? ['NG'],
    },
    { encrypted: true }
  );
  if (res.kind === 'ok') {
    const parsed = parseOrNull(GenerateApassSchema, res.data);
    if (!parsed) return { ok: false, detail: 'malformed generate_apass response' };
    return { ok: true, cvRecordId: parsed.cvRecordId, txHash: parsed.wallet?.txHash };
  }
  const detail = res.kind === 'unavailable' ? `${res.reason}: ${res.detail}` : `envelope ${res.code}: ${res.message}`;
  return { ok: false, detail };
}
