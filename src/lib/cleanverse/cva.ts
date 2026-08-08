import { post } from './client';
import { chainConfig } from '../chain/config';
import { ATokenRulesSchema, parseOrNull } from './schemas';
import type { ATokenRule, Chain } from './types';

/**
 * Assets (A-Token = CVA) adapters. Traced to docs/API-TRUTH.md § Assets.
 */

/**
 * The active CVA pair, read from the single typed chain config rather than hardcoded.
 * Now Base Sepolia (DECISIONS.md D11); was Monad until its faucet reservoir proved empty.
 * Confirmed via query_deposit_atoken_list 2026-08-08.
 */
export function assets() {
  const c = chainConfig();
  return {
    chain: c.cleanverseChain as Chain,
    originToken: c.originToken,
    aToken: c.aToken,
    decimals: c.decimals,
    symbol: 'aUSDC',
  } as const;
}

/** Shared across chains in this sandbox; not chain-specific, so kept as constants. */
export const CLEANVERSE_INFRA = {
  accessCore: '0x8F118338a1fa41E7Fa86Be19A4e8B99Ed58A6EcC',
  apassRegistry: '0xbA82D189540CaC9DC6FF46B6837CaC1BFdEC58B9',
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
 * FALLBACK:  null on failure; callers fall back to the pinned assets() config,
 *            which were themselves read from this endpoint.
 */
export async function listDepositAssets(chain: Chain) {
  const res = await post<{ chain: string; tokens: unknown[] }>('/query_deposit_atoken_list', { chain });
  return res.kind === 'ok' ? res.data : null;
}
