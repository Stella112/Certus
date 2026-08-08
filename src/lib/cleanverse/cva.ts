import { post } from './client';
import { ATokenRulesSchema, parseOrNull } from './schemas';
import type { ATokenRule, Chain } from './types';

/**
 * Assets (A-Token = CVA) adapters. Traced to docs/API-TRUTH.md § Assets.
 */

/** The pre-issued Monad CVA pair. Confirmed via query_deposit_atoken_list 2026-08-08. */
export const MONAD_ASSETS = {
  chain: 'monad' as Chain,
  originToken: '0x534b2f3A21130d7a60830c2Df862319e593943A3',
  aToken: '0xaC0893567D43C3E7e6e35a72803df05416C1f20D',
  accessCore: '0x8F118338a1fa41E7Fa86Be19A4e8B99Ed58A6EcC',
  apassRegistry: '0xbA82D189540CaC9DC6FF46B6837CaC1BFdEC58B9',
  /** BOTH tokens are 6 decimals on Monad. NOT 18. Getting this wrong is a 10^12 error. */
  decimals: 6,
  symbol: 'aUSDC',
} as const;

/**
 * SOURCE: API-TRUTH.md § POST /atoken/rules
 * VERIFIED: SANDBOX: confirmed 2026-08-08. aUSDC -> [{min_tier:5, no country/group/blacklist}].
 *           Origin USDC -> [] (ungated), which is what makes custody design (c) viable.
 * ENCRYPTED: NO (plain JSON)
 * FALLBACK:  null on failure. The asset check treats null as UNAVAILABLE and fails closed.
 *
 * REQUEST FIELD IS `atoken_address`. Any other name (e.g. `atoken`) returns HTTP 500,
 * a server crash rather than a clean validation error. Be exact.
 */
export async function getAssetRules(args: {
  chain: Chain;
  atokenAddress: string;
}): Promise<ATokenRule[] | null> {
  const res = await post<unknown>('/atoken/rules', {
    chain: args.chain,
    atoken_address: args.atokenAddress,
  });
  if (res.kind !== 'ok') return null;
  // F1-02: validate at the boundary. null propagates to ASSET_RULES_UNAVAILABLE (fail closed)
  // rather than silently becoming an empty rule set, which would read as "ungated".
  const parsed = parseOrNull(ATokenRulesSchema, res.data);
  return parsed ? (parsed.rules as ATokenRule[]) : null;
}

/**
 * SOURCE: API-TRUTH.md § POST /query_deposit_atoken_list
 * VERIFIED: SANDBOX: confirmed 2026-08-08.
 * ENCRYPTED: NO (plain JSON)
 * FALLBACK:  null on failure; callers fall back to the pinned MONAD_ASSETS constants above,
 *            which were themselves read from this endpoint.
 */
export async function listDepositAssets(chain: Chain) {
  const res = await post<{ chain: string; tokens: unknown[] }>('/query_deposit_atoken_list', { chain });
  return res.kind === 'ok' ? res.data : null;
}
