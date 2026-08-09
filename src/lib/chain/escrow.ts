import { createPublicClient, createWalletClient, http, parseAbi, defineChain, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { chainConfig, deployment, type ChainKey } from './config';

/**
 * The ONLY place the CertusEscrow ABI is used and the only place transactions are signed.
 *
 * PART IV: deployment addresses come from deployments/<chain>.json, never pasted inline.
 * Chain objects are built from the typed registry, so adding a chain needs no code change.
 */

export const ESCROW_ABI = parseAbi([
  'function token() view returns (address)',
  'function fundIntent(bytes32 intentId, address[] recipients, uint256[] amounts)',
  'function releaseLeg(bytes32 intentId, uint256 legIndex, bytes32 auditRef)',
  'function freezeIntent(bytes32 intentId, bytes32 reasonCode, bytes32 auditRef)',
  'function quarantinedOf(bytes32 intentId) view returns (uint256)',
  'function totalQuarantined() view returns (uint256)',
  'function legCount(bytes32 intentId) view returns (uint256)',
  'function getLeg(bytes32 intentId, uint256 legIndex) view returns (address,uint256,uint8)',
  'function getIntent(bytes32 intentId) view returns (address,uint256,uint256,uint8,bytes32)',
  'event LegReleased(bytes32 indexed intentId, uint256 indexed legIndex, address indexed recipient, uint256 amount, bytes32 auditRef)',
  'event IntentFrozen(bytes32 indexed intentId, uint256 quarantined, bytes32 reasonCode, bytes32 auditRef)',
]);

export const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
]);

export const BATCH_ABI = parseAbi([
  'function token() view returns (address)',
  'function fundBatch(bytes32 batchId, address[] recipients, uint256[] amounts)',
  'function releaseRow(bytes32 batchId, uint256 rowIndex, bytes32 auditRef)',
  'function isolateRow(bytes32 batchId, uint256 rowIndex, bytes32 reasonCode, bytes32 auditRef)',
  'function getBatch(bytes32 batchId) view returns (address,uint256,uint256,uint256,uint256,uint8)',
  'function rowCount(bytes32 batchId) view returns (uint256)',
  'function getRow(bytes32 batchId, uint256 rowIndex) view returns (address,uint256,uint8,bytes32)',
  'function totalQuarantined() view returns (uint256)',
  'event RowReleased(bytes32 indexed batchId, uint256 indexed rowIndex, address indexed recipient, uint256 amount, bytes32 auditRef)',
  'event RowIsolated(bytes32 indexed batchId, uint256 indexed rowIndex, address indexed recipient, uint256 amount, bytes32 reasonCode, bytes32 auditRef)',
]);

export const SPONSORED_YIELD_ABI = parseAbi([
  'function token() view returns (address)',
  'function reserve() view returns (uint256)',
  'function previewBonus(address account) view returns (uint256)',
  'function positionOf(address account) view returns (uint256 principal, uint256 bonus, uint256 lastAccrualBlock, bool active, bool frozen)',
  'function deposit(uint256 amount)',
  'function withdraw() returns (uint256 principal, uint256 bonus)',
  'event Deposited(address indexed account, uint256 amount)',
  'event Withdrawn(address indexed account, uint256 principal, uint256 bonus)',
  'event PositionFrozen(address indexed account, uint256 principal, uint256 bonus, bytes32 reasonCode)',
]);

function viemChain(chain: ChainKey) {
  const c = chainConfig(chain);
  return defineChain({
    id: c.chainId,
    name: c.label,
    nativeCurrency: { name: c.nativeSymbol, symbol: c.nativeSymbol, decimals: 18 },
    rpcUrls: { default: { http: [c.rpcUrl] } },
    blockExplorers: { default: { name: 'explorer', url: c.explorerUrl } },
  });
}

export function publicClient(chain: ChainKey) {
  const c = chainConfig(chain);
  return createPublicClient({ chain: viemChain(chain), transport: http(c.rpcUrl) });
}

/**
 * Signing client. Requires DEPLOYER_PRIVATE_KEY, which is also the escrow releaser.
 * Kept behind a function so importing this module never demands a key.
 */
export function releaserClient(chain: ChainKey) {
  const key = process.env.DEPLOYER_PRIVATE_KEY;
  if (!key) throw new Error('DEPLOYER_PRIVATE_KEY missing; cannot sign settlement transactions');
  const account = privateKeyToAccount(key as Hex);
  const c = chainConfig(chain);
  return { account, client: createWalletClient({ account, chain: viemChain(chain), transport: http(c.rpcUrl) }) };
}

export function escrowAddress(chain: ChainKey): Hex {
  const addr = deployment(chain).escrow;
  if (!addr) {
    throw new Error(`No CertusEscrow deployment recorded for "${chain}". Expected deployments/${chain}.json`);
  }
  return addr as Hex;
}

/** Resolve the escrow deployment that is bound to a declared intent asset. */
export function escrowAddressForAsset(chain: ChainKey, asset: string): Hex {
  const d = deployment(chain);
  if (d.escrow && d.escrowAsset?.toLowerCase() === asset.toLowerCase()) return d.escrow as Hex;
  if (d.originEscrow && d.originEscrowAsset?.toLowerCase() === asset.toLowerCase()) return d.originEscrow as Hex;
  throw new Error(`No Certus escrow on "${chain}" is bound to asset ${asset}`);
}

export function escrowAddressForIntent(chain: ChainKey, asset: string, yieldMode = false): Hex {
  if (yieldMode) {
    const candidate = deployment(chain).yieldEscrow;
    if (!candidate) throw new Error(`No yield-protection escrow on "${chain}"`);
    const yieldAsset = deployment(chain).yieldAsset;
    if (!yieldAsset || yieldAsset.toLowerCase() !== asset.toLowerCase()) {
      throw new Error(`Yield escrow on "${chain}" is not bound to asset ${asset}`);
    }
    return candidate as Hex;
  }
  return escrowAddressForAsset(chain, asset);
}

export function batchAddress(chain: ChainKey): Hex {
  const addr = deployment(chain).batch;
  if (!addr) {
    throw new Error(`No CertusBatch deployment recorded for "${chain}". Expected deployments/${chain}.json`);
  }
  return addr as Hex;
}

export async function readQuarantined(chain: ChainKey, intentId: Hex): Promise<bigint> {
  return publicClient(chain).readContract({
    address: escrowAddress(chain),
    abi: ESCROW_ABI,
    functionName: 'quarantinedOf',
    args: [intentId],
  });
}

/** On-chain leg status. Mirrors the Solidity enum: 0 Pending, 1 Released, 2 Frozen. */
export async function readLeg(chain: ChainKey, intentId: Hex, legIndex: bigint) {
  const [recipient, amount, status] = await publicClient(chain).readContract({
    address: escrowAddress(chain),
    abi: ESCROW_ABI,
    functionName: 'getLeg',
    args: [intentId, legIndex],
  });
  return { recipient, amount, status: (['PENDING', 'RELEASED', 'FROZEN'] as const)[Number(status)] };
}
