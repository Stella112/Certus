import { z } from 'zod';

/**
 * THE single typed source of network and asset configuration.
 *
 * PART IV: "Every network value lives in exactly one typed config module. No magic numbers,
 * no inline RPC strings anywhere in the codebase." The Auditor greps for `http` outside
 * .env and this file; any other hit is a MAJOR finding.
 *
 * Settlement chain is Base Sepolia, not Monad (DECISIONS.md D11): the Monad USDC faucet
 * reservoir is empty and its origin token is a permissioned Circle FiatToken, so no test
 * value is obtainable there. Base Sepolia dispensed on the first call. Cleanverse hosts the
 * hackathon and permits six chains, so this costs nothing in sponsor alignment.
 */

const ConfigSchema = z.object({
  /** Chain identifier as CLEANVERSE names it, sent in every API call. */
  cleanverseChain: z.string().min(1),
  chainId: z.coerce.number().int().positive(),
  rpcUrl: z.string().url(),
  rpcFallbackUrl: z.string().url().optional(),
  explorerUrl: z.string().url(),
  /** Ungated ERC20 the escrow custodies (custody design (c), DECISIONS.md D1). */
  originToken: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  /** Compliance-enforcing A-Token the recipient ultimately receives. */
  aToken: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  /** BOTH tokens are 6 decimals here. Assuming 18 would be a 10^12 error. */
  decimals: z.coerce.number().int().min(0).max(18),
});

export type ChainConfig = z.infer<typeof ConfigSchema>;

let cached: ChainConfig | null = null;

export function chainConfig(): ChainConfig {
  if (cached) return cached;
  const parsed = ConfigSchema.safeParse({
    cleanverseChain: process.env.CHAIN_NAME,
    chainId: process.env.CHAIN_ID,
    rpcUrl: process.env.RPC_URL,
    rpcFallbackUrl: process.env.RPC_FALLBACK_URL || undefined,
    explorerUrl: process.env.EXPLORER_URL,
    originToken: process.env.ORIGIN_TOKEN,
    aToken: process.env.ATOKEN,
    decimals: process.env.TOKEN_DECIMALS,
  });
  if (!parsed.success) {
    throw new Error(
      'Chain configuration is invalid or missing in .env:\n' +
        parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')
    );
  }
  cached = parsed.data;
  return cached;
}

/** Explorer link for a transaction. The dashboard links every settlement through this. */
export function txUrl(txHash: string): string {
  return `${chainConfig().explorerUrl}/tx/${txHash}`;
}

export function addressUrl(address: string): string {
  return `${chainConfig().explorerUrl}/address/${address}`;
}

/** Format base units for display without ever using floating point. */
export function formatAmount(baseUnits: bigint, decimals = chainConfig().decimals): string {
  const negative = baseUnits < 0n;
  const abs = negative ? -baseUnits : baseUnits;
  const divisor = 10n ** BigInt(decimals);
  const whole = abs / divisor;
  const frac = (abs % divisor).toString().padStart(decimals, '0');
  return `${negative ? '-' : ''}${whole.toString()}${decimals > 0 ? '.' + frac : ''}`;
}

/** Parse a decimal string into base units. Never accepts a float. */
export function parseAmount(value: string, decimals = chainConfig().decimals): bigint {
  if (!/^\d+(\.\d+)?$/.test(value)) throw new Error(`Invalid amount "${value}"`);
  const [whole, frac = ''] = value.split('.');
  if (frac.length > decimals) throw new Error(`Amount "${value}" exceeds ${decimals} decimal places`);
  return BigInt(whole + frac.padEnd(decimals, '0'));
}
