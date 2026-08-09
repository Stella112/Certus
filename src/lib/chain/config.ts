import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

/**
 * MULTI-CHAIN registry. Certus settles on more than one chain, so chain is a per-intent
 * property, not a global mode.
 *
 * This replaces an earlier single-chain singleton that read one chain out of .env. That
 * shape forced the whole build to be flipped between chains one at a time, which is churn
 * and is wrong for a product whose compliance claim spans registries: an A-Pass is scoped to
 * (chain, address), so a counterparty verified on one chain is NOT thereby verified on
 * another. Certus has to hold several chains in mind at once to say anything honest about a
 * cross-chain payment.
 *
 * Network parameters live in config/chains.json, checked in, because none of them are secret
 * and a fresh clone should not have to rediscover them. Only credentials stay in .env.
 */

const ChainSchema = z.object({
  cleanverseChain: z.string().min(1),
  label: z.string().min(1),
  chainId: z.number().int().positive(),
  rpcUrl: z.string().url(),
  rpcFallbackUrl: z.string().url().optional(),
  explorerUrl: z.string().url(),
  nativeSymbol: z.string().min(1),
  originToken: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  aToken: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  symbol: z.string().min(1),
  assetMode: z.enum(['canonical-deposit', 'self-issued']).default('canonical-deposit'),
  selfIssuedAToken: z.object({
    address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    symbol: z.string().min(1),
    decimals: z.number().int().min(0).max(18),
  }).optional(),
  decimals: z.number().int().min(0).max(18),
  /** Whether the Cleanverse Build announcement permits deploying here. */
  hackathonEligible: z.boolean(),
  /** True only if the chainId was confirmed with a live `cast chain-id`, never from memory. */
  chainIdVerified: z.boolean().optional().default(false),
  usdcSource: z.enum(['circle-faucet', 'cleanverse-faucet', 'unknown']).optional().default('unknown'),
  notes: z.string().optional(),
});

const RegistrySchema = z.object({
  defaultChain: z.string().min(1),
  chains: z.record(z.string(), ChainSchema),
});

export type ChainConfig = z.infer<typeof ChainSchema>;
export type ChainKey = string;

let cached: z.infer<typeof RegistrySchema> | null = null;

function registry() {
  if (cached) return cached;
  const file = path.resolve(process.cwd(), 'config', 'chains.json');
  if (!fs.existsSync(file)) throw new Error(`Chain registry missing at ${file}`);
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  delete raw._comment;
  const parsed = RegistrySchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      'config/chains.json is invalid:\n' + parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')
    );
  }
  if (!parsed.data.chains[parsed.data.defaultChain]) {
    throw new Error(`defaultChain "${parsed.data.defaultChain}" is not present in chains`);
  }
  cached = parsed.data;
  return cached;
}

/** Every configured chain key. */
export function listChains(): ChainKey[] {
  return Object.keys(registry().chains);
}

/**
 * Chains the submission may actually deploy on. Base is deliberately excluded: Cleanverse
 * supports it, but the hackathon announcement does not list it, and shipping a submission
 * that settles on an ineligible chain would be a scoring failure, not a technical one.
 */
export function eligibleChains(): ChainKey[] {
  return listChains().filter((k) => registry().chains[k].hackathonEligible);
}

/** Throws if the chain cannot carry submission work. Call before any deploy. */
export function assertEligible(chain: ChainKey): void {
  if (!chainConfig(chain).hackathonEligible) {
    throw new Error(
      `Chain "${chain}" is NOT hackathon-eligible. Eligible: ${eligibleChains().join(', ')}. ` +
        'Deploying the submission here would not count.'
    );
  }
}

/**
 * The chain used when a caller does not specify one (seeds, single-chain demos).
 * DEFAULT_CHAIN in .env overrides config/chains.json, so an operator can switch the demo
 * chain without editing checked-in config.
 */
export function defaultChain(): ChainKey {
  const override = process.env.DEFAULT_CHAIN?.trim();
  if (override) {
    if (!registry().chains[override]) {
      throw new Error(`DEFAULT_CHAIN="${override}" is not in config/chains.json (have: ${listChains().join(', ')})`);
    }
    return override;
  }
  return registry().defaultChain;
}

export function chainConfig(chain: ChainKey = defaultChain()): ChainConfig {
  const c = registry().chains[chain];
  if (!c) throw new Error(`Unknown chain "${chain}". Configured: ${listChains().join(', ')}`);
  return c;
}

/** Resolve a Cleanverse API chain value back to Certus's typed registry key. */
export function chainKeyForCleanverse(cleanverseChain: string): ChainKey {
  const key = listChains().find((candidate) => registry().chains[candidate].cleanverseChain === cleanverseChain);
  if (!key) throw new Error(`No configured chain maps to Cleanverse chain "${cleanverseChain}"`);
  return key;
}

export function txUrl(txHash: string, chain: ChainKey = defaultChain()): string {
  return `${chainConfig(chain).explorerUrl}/tx/${txHash}`;
}

export function addressUrl(address: string, chain: ChainKey = defaultChain()): string {
  return `${chainConfig(chain).explorerUrl}/address/${address}`;
}

/** Format base units for display. Never uses floating point. */
export function formatAmount(baseUnits: bigint, chain: ChainKey = defaultChain()): string {
  const decimals = chainConfig(chain).decimals;
  const negative = baseUnits < 0n;
  const abs = negative ? -baseUnits : baseUnits;
  const divisor = 10n ** BigInt(decimals);
  const frac = (abs % divisor).toString().padStart(decimals, '0').replace(/0+$/, '');
  const whole = (abs / divisor).toString();
  return `${negative ? '-' : ''}${whole}${frac ? '.' + frac : ''}`;
}

/** Parse a decimal string into base units. Rejects anything that is not exact. */
export function parseAmount(value: string, chain: ChainKey = defaultChain()): bigint {
  const decimals = chainConfig(chain).decimals;
  if (!/^\d+(\.\d+)?$/.test(value)) throw new Error(`Invalid amount "${value}"`);
  const [whole, frac = ''] = value.split('.');
  if (frac.length > decimals) throw new Error(`Amount "${value}" exceeds ${decimals} decimal places on ${chain}`);
  return BigInt(whole + frac.padEnd(decimals, '0'));
}

/** Deployed contract addresses for a chain, from deployments/<chain>.json. */
export interface ChainDeployment {
  escrow?: string;
  escrowAsset?: string;
  escrowAssetSymbol?: string;
  escrowAssetVerified?: boolean;
  originEscrow?: string;
  originEscrowAsset?: string;
  batch?: string;
  batchAsset?: string;
  batchAssetSymbol?: string;
  yieldEscrow?: string;
  yieldAsset?: string;
  yieldVault?: string;
  yieldStatus?: string;
  sponsoredYieldVault?: string;
  sponsoredYieldStatus?: string;
  sponsoredYieldCustodian?: string;
  sponsoredYieldCustodyMode?: 'custodian_eoa' | 'contract';
}

export function deployment(chain: ChainKey = defaultChain()): ChainDeployment {
  const file = path.resolve(process.cwd(), 'deployments', `${chain}.json`);
  if (!fs.existsSync(file)) return {};
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const escrowRecord =
    raw?.contracts?.CertusEscrowAUSDC ??
    raw?.contracts?.CertusEscrow ??
    raw?.contracts?.CertusEscrowOriginUSDC;
  const originEscrowRecord = raw?.contracts?.CertusEscrowOriginUSDC;
  const batchRecord = raw?.contracts?.CertusBatch;
  const yieldRecord = raw?.contracts?.CertusEscrowYieldDemo;
  // Prefer the live custodial pilot. The earlier contract remains in the
  // deployment file as historical evidence but cannot hold canonical aUSDC.
  const sponsoredYieldRecord = raw?.contracts?.CertusCustodiedYieldVault ?? raw?.contracts?.CertusSponsoredYieldVault;
  const configured = chainConfig(chain);
  const tokenSymbol = (address?: string) => {
    if (!address) return undefined;
    if (address.toLowerCase() === configured.aToken.toLowerCase()) return configured.symbol;
    const match = Object.entries(raw?.tokens ?? {}).find(([, value]) =>
      typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value) && value.toLowerCase() === address.toLowerCase()
    );
    return match?.[0] === 'certusOriginUSD' ? 'cUSD' : match?.[0];
  };
  const escrowAsset = escrowRecord?.constructorArgs?.token as string | undefined;
  const canonicalAUsdc = raw?.tokens?.aUSDC as string | undefined;
  const rawBatchAsset = batchRecord?.constructorArgs?.token as string | undefined;
  const batchCompatible = !!rawBatchAsset && rawBatchAsset.toLowerCase() === configured.aToken.toLowerCase();
  return {
    escrow: escrowRecord?.address,
    escrowAsset,
    escrowAssetSymbol: tokenSymbol(escrowAsset),
    escrowAssetVerified: !!escrowAsset &&
      [configured.aToken, canonicalAUsdc].filter(Boolean).some((address) => address!.toLowerCase() === escrowAsset.toLowerCase()),
    originEscrow: originEscrowRecord?.address as string | undefined,
    originEscrowAsset: originEscrowRecord?.constructorArgs?.token as string | undefined,
    // An old deployment bound to another asset is deliberately not exposed as active.
    batch: batchCompatible ? batchRecord?.address : undefined,
    batchAsset: batchCompatible ? rawBatchAsset : undefined,
    batchAssetSymbol: batchCompatible ? tokenSymbol(rawBatchAsset) : undefined,
    yieldEscrow: yieldRecord?.address as string | undefined,
    yieldAsset: yieldRecord?.constructorArgs?.token as string | undefined,
    yieldVault: yieldRecord?.yieldVault as string | undefined,
    yieldStatus: yieldRecord?.status as string | undefined,
    sponsoredYieldVault: sponsoredYieldRecord?.address as string | undefined,
    sponsoredYieldStatus: sponsoredYieldRecord?.status as string | undefined,
    sponsoredYieldCustodian: sponsoredYieldRecord?.constructorArgs?.custodian as string | undefined,
    sponsoredYieldCustodyMode: raw?.contracts?.CertusCustodiedYieldVault ? 'custodian_eoa' : 'contract',
  };
}
