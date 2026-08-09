import fs from 'node:fs';
import path from 'node:path';
import { createPublicClient, createWalletClient, http, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { assets, canonicalDepositAsset } from '../src/lib/cleanverse/cva';
import { generateIdentity, verifyEligibility } from '../src/lib/cleanverse/cvi';
import { assertEligible, chainConfig, defaultChain } from '../src/lib/chain/config';

const chainKey = defaultChain();
assertEligible(chainKey);
const network = chainConfig(chainKey);
const A = assets(chainKey);
const key = process.env.DEPLOYER_PRIVATE_KEY as Hex | undefined;
if (!key) throw new Error('DEPLOYER_PRIVATE_KEY missing');
const account = privateKeyToAccount(key);

if (network.assetMode === 'canonical-deposit') {
  const canonical = await canonicalDepositAsset(A.chain, A.originToken);
  if (!canonical) throw new Error(`Cleanverse exposes no canonical deposit pair for ${A.originToken} on ${A.chain}`);
  if (canonical.atoken.address.toLowerCase() !== A.aToken.toLowerCase() || canonical.atoken.decimals !== A.decimals) {
    throw new Error(`STALE_ASSET_CONFIG: pinned ${A.aToken}/${A.decimals}dp, Cleanverse reports ${canonical.atoken.address}/${canonical.atoken.decimals}dp.`);
  }
} else {
  const treasuryEligibility = await verifyEligibility({ chain: A.chain, atoken: A.aToken, address: account.address });
  if (treasuryEligibility.signal !== 'ALLOWED') throw new Error(`SELF_ISSUED_ASSET_NOT_READY: ${treasuryEligibility.signal}`);
}
const chain = {
  id: network.chainId,
  name: network.label,
  nativeCurrency: { name: network.nativeSymbol, symbol: network.nativeSymbol, decimals: 18 },
  rpcUrls: { default: { http: [network.rpcUrl] } },
} as const;
const publicClient = createPublicClient({ chain, transport: http(network.rpcUrl) });
const walletClient = createWalletClient({ account, chain, transport: http(network.rpcUrl) });
const artifact = JSON.parse(fs.readFileSync('contracts/out/CertusBatch.sol/CertusBatch.json', 'utf8'));

console.log(`Deploying CertusBatch on ${network.label} for ${A.aToken}`);
const deployTx = await walletClient.deployContract({
  abi: artifact.abi,
  bytecode: artifact.bytecode.object,
  args: [A.aToken],
});
const receipt = await publicClient.waitForTransactionReceipt({ hash: deployTx });
if (!receipt.contractAddress) throw new Error('Deployment returned no contract address');
const address = receipt.contractAddress;
console.log(`contract: ${address}`);
console.log(`deploy tx: ${deployTx}`);

const identity = await generateIdentity({
  chain: A.chain,
  address,
  customerId: `CERTUSBATCH${Date.now()}`,
  expirationTime: 1_900_000_000,
  tier: '50',
});
if (!identity.ok) throw new Error(`Batch deployed but A-Pass registration failed: ${identity.detail}`);

let eligible = false;
for (let attempt = 1; attempt <= 12 && !eligible; attempt++) {
  await new Promise((resolve) => setTimeout(resolve, 5_000));
  const result = await verifyEligibility({ chain: A.chain, atoken: A.aToken, address });
  eligible = result.signal === 'ALLOWED';
  console.log(`eligibility ${attempt}: ${result.signal}`);
}
if (!eligible) throw new Error('Batch deployed and registered but did not become aToken-eligible');

const deploymentFile = path.resolve('deployments', `${chainKey}.json`);
const deployment = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
deployment.contracts = deployment.contracts ?? {};
deployment.contracts.CertusBatch = {
  address,
  deployTx,
  constructorArgs: { token: A.aToken },
  aPassTx: identity.txHash,
  status: 'active batch isolation deployment',
};
fs.writeFileSync(deploymentFile, `${JSON.stringify(deployment, null, 2)}\n`);
console.log(`Recorded in ${deploymentFile}`);
