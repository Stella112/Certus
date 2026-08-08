/**
 * Types generated from docs/API-TRUTH.md (real sandbox responses), NOT from memory.
 * If a field is not in API-TRUTH.md, it does not belong here.
 */

/**
 * Chains Cleanverse exposes an A-Token pair on, as confirmed by query_deposit_atoken_list
 * (2026-08-08). Certus settles on `base` (Base Sepolia) per DECISIONS.md D11.
 * Solana is listed by the API but excluded here: the stack is EVM only.
 */
export type Chain = 'base' | 'monad' | 'ethereum' | 'polygon' | 'bsc';

/** Envelope observed on every Cooperate endpoint. */
export type EnvelopeCode = '0000' | '0001' | '0002' | string;

/**
 * Discriminated transport result. Callers MUST handle 'unavailable' explicitly;
 * that is what makes fail-closed structural rather than a convention.
 */
export type CleanverseResult<T = unknown> =
  | { kind: 'ok'; code: '0000'; message: string; data: T }
  | { kind: 'business'; code: EnvelopeCode; message: string; data: unknown }
  | { kind: 'unavailable'; reason: 'timeout' | 'network' | 'http' | 'parse'; detail: string };

/** POST /verify_apass -> data */
export interface VerifyApassData {
  chain: string;
  atoken: string;
  address: string;
  /** 4 = allowed, 2 = no A-Pass, 1 = A-Token not found. 3 is unreachable (see API-TRUTH.md). */
  code: 1 | 2 | 3 | 4;
  message: string;
}

/** POST /query_apass -> data */
export interface QueryApassData {
  cvRecordId: string;
  tier: string;
  subTier: number;
  group: string;
  subGroup: string;
  countries: string[];
  expirationTime: number;
  /** 1 = active. Frozen identities surface via verify_apass APassNotActive. */
  status: number | null;
  currentKycHash?: string;
}

/** One compliance rule inside an A-Token contract. POST /atoken/rules -> data.rules[] */
export interface ATokenRule {
  allowed_group: string;
  allowed_sub_group: string;
  min_tier: number;
  min_sub_tier: number;
  is_black_list: boolean;
  countries: string[];
}

export interface ATokenRulesData {
  chain: string;
  atoken_address: string;
  rules: ATokenRule[];
}

/**
 * The eligibility signal Certus acts on. Deliberately NOT a raw passthrough of
 * Cleanverse's shape: the pipeline consumes a closed set of signals only.
 */
export type EligibilitySignal =
  | 'ALLOWED' //            verify data.code === 4
  | 'NO_APASS' //           verify data.code === 2
  | 'ATOKEN_NOT_FOUND' //   verify data.code === 1
  | 'APASS_NOT_ACTIVE' //   envelope 0002 + "APassNotActive" -> frozen/revoked
  | 'UNAVAILABLE'; //       transport failure or unrecognised response -> FAIL CLOSED

export interface EligibilityOutcome {
  signal: EligibilitySignal;
  /** raw data.code when present, for the audit record */
  code: number | null;
  detail: string;
}
