import fs from 'node:fs';
import path from 'node:path';
import { createPublicClient, createWalletClient, http, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { assets } from '../src/lib/cleanverse/cva';
import { generateIdentity, verifyEligibility } from '../src/lib/cleanverse/cvi';
import { assertEligible, chainConfig, defaultChain } from '../src/lib/chain/config';

const chainKey = defaultChain();
assertEligible(chainKey);
if (chainKey !== 'monad') throw new Error(`Yield demo is pinned to Monad; current chain is ${chainKey}`);
const network = chainConfig(chainKey);
const A = assets(chainKey);
const key = process.env.DEPLOYER_PRIVATE_KEY as Hex | undefined;
if (!key) throw new Error('DEPLOYER_PRIVATE_KEY missing');
const account = privateKeyToAccount(key);
const chain = { id: network.chainId, name: network.label, nativeCurrency: { name: network.nativeSymbol, symbol: network.nativeSymbol, decimals: 18 }, rpcUrls: { default: { http: [network.rpcUrl] } } } as const;
const publicClient = createPublicClient({ chain, transport: http(network.rpcUrl) });
const walletClient = createWalletClient({ account, chain, transport: http(network.rpcUrl) });
const escrowArtifact = JSON.parse(fs.readFileSync(path.resolve('contracts/out/CertusEscrow.sol/CertusEscrow.json'), 'utf8'));
const vaultArtifact = JSON.parse(fs.readFileSync(path.resolve('contracts/out/MockYieldVault.sol/MockYieldVault.json'), 'utf8'));

console.log(`Deploying testnet-only yield protection for ${A.aToken}`);
const escrowTx = await walletClient.deployContract({ abi: escrowArtifact.abi, bytecode: escrowArtifact.bytecode.object, args: [A.aToken] });
const escrowReceipt = await publicClient.waitForTransactionReceipt({ hash: escrowTx });
if (!escrowReceipt.contractAddress) throw new Error('Yield escrow deployment returned no address');
const escrow = escrowReceipt.contractAddress;
console.log(`yield escrow: ${escrow}`);
console.log(`yield escrow tx: ${escrowTx}`);

const escrowIdentity = await generateIdentity({ chain: A.chain, address: escrow, customerId: `CERTUSYIELDESCROW${Date.now()}`, expirationTime: 1_900_000_000, tier: '50' });
if (!escrowIdentity.ok) throw new Error(`Yield escrow A-Pass registration failed: ${escrowIdentity.detail}`);
await waitEligible(escrow, 'yield escrow');

const vaultTx = await walletClient.deployContract({ abi: vaultArtifact.abi, bytecode: vaultArtifact.bytecode.object, args: [A.aToken, escrow] });
const vaultReceipt = await publicClient.waitForTransactionReceipt({ hash: vaultTx });
if (!vaultReceipt.contractAddress) throw new Error('Yield vault deployment returned no address');
const vault = vaultReceipt.contractAddress;
console.log(`yield vault: ${vault}`);
console.log(`yield vault tx: ${vaultTx}`);

const vaultIdentity = await generateIdentity({ chain: A.chain, address: vault, customerId: `CERTUSYIELDVAULT${Date.now()}`, expirationTime: 1_900_000_000, tier: '50' });
if (!vaultIdentity.ok) throw new Error(`Yield vault A-Pass registration failed: ${vaultIdentity.detail}`);
await waitEligible(vault, 'yield vault');

const configureTx = await walletClient.writeContract({ address: escrow, abi: escrowArtifact.abi, functionName: 'setYieldVault', args: [vault], account });
const configureReceipt = await publicClient.waitForTransactionReceipt({ hash: configureTx });
if (configureReceipt.status !== 'success') throw new Error('Yield vault configuration reverted');
console.log(`configured tx: ${configureTx}`);

const deploymentFile = path.resolve('deployments', `${chainKey}.json`);
const deployment = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
deployment.contracts = deployment.contracts ?? {};
deployment.contracts.CertusEscrowYieldDemo = {
  address: escrow,
  deployTx: escrowTx,
  constructorArgs: { token: A.aToken },
  aPassTx: escrowIdentity.txHash,
  yieldVault: vault,
  yieldVaultDeployTx: vaultTx,
  yieldVaultAPassTx: vaultIdentity.txHash,
  configureTx,
  status: 'testnet-only optional yield protection; fixed-rate mock vault',
};
deployment.note = 'CertusEscrowAUSDC and CertusBatch are the active standard deployments. CertusEscrowYieldDemo is an optional testnet-only yield-protection path backed by MockYieldVault; it is not a production APY product.';
fs.writeFileSync(deploymentFile, `${JSON.stringify(deployment, null, 2)}\n`);
console.log(`Recorded in ${deploymentFile}`);

async function waitEligible(address: string, label: string) {
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    const result = await verifyEligibility({ chain: A.chain, atoken: A.aToken, address });
    console.log(`${label} eligibility ${attempt}: ${result.signal}`);
    if (result.signal === 'ALLOWED') return;
  }
  throw new Error(`${label} registered but did not become aToken-eligible`);
}
