import { post } from './client';
import { chainConfig } from '../chain/config';
import { ATokenRulesSchema, DepositAssetListSchema, parseOrNull } from './schemas';
import type { ATokenRule, Chain } from './types';

/**
 * Assets (A-Token = CVA) adapters. Traced to docs/API-TRUTH.md § Assets.
 */

/**
 * The active CVA pair, read from the single typed chain config rather than hardcoded.
 * Now Base Sepolia (DECISIONS.md D11); was Monad until its faucet reservoir proved empty.
 * Confirmed via query_deposit_atoken_list 2026-08-08.
 */
export function assets(chain?: string) {
  const c = chainConfig(chain);
  return {
    chain: c.cleanverseChain as Chain,
    originToken: c.originToken,
    aToken: c.aToken,
    /** Per chain. BNB Chain is 18dp while the others are 6dp, so never hardcode this. */
    decimals: c.decimals,
    symbol: c.symbol,
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
  const res = await post<unknown>('/query_deposit_atoken_list', { chain });
  if (res.kind !== 'ok') return null;
  return parseOrNull(DepositAssetListSchema, res.data);
}

/** Live canonical pair preflight. Never deploy from the pinned registry alone. */
export async function canonicalDepositAsset(chain: Chain, originAddress: string) {
  const data = await listDepositAssets(chain);
  return data?.tokens?.find((pair) => pair.origin_token.address.toLowerCase() === originAddress.toLowerCase()) ?? null;
}

/** Cleanverse Common Query: resolve the user's per-identity USDC deposit wallet. */
export async function queryDepositAddress(args: { chain: Chain; address: string }) {
  const res = await post<unknown>('/query_deposit_address', { chain: args.chain, address: args.address });
  if (res.kind === 'business') return { ok: false as const, error: res.message, code: res.code };
  if (res.kind === 'unavailable') return { ok: false as const, error: 'Cleanverse is temporarily unavailable.', detail: res.detail };
  if (!res.data || typeof res.data !== 'object') return { ok: false as const, error: 'Cleanverse returned an unexpected deposit response.' };
  const data = res.data as Record<string, unknown>;
  if (typeof data.depositUSDCWallet !== 'string' || typeof data.address !== 'string' || typeof data.chain !== 'string') return { ok: false as const, error: 'Cleanverse returned no deposit wallet for this identity.' };
  return { ok: true as const, data: {
    address: data.address,
    chain: data.chain,
    depositUSDCWallet: data.depositUSDCWallet,
    depositUSDTWallet: typeof data.depositUSDTWallet === 'string' ? data.depositUSDTWallet : data.depositUSDCWallet,
  }};
}
