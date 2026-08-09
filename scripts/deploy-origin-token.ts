import fs from 'node:fs';
import path from 'node:path';
import { createPublicClient, createWalletClient, http, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { assertEligible, chainConfig, defaultChain } from '../src/lib/chain/config';

const CONFIRMATION = 'DEPLOY_CERTUS_USD_ON_MONAD';
const chainKey = defaultChain();
assertEligible(chainKey);
if (chainKey !== 'monad') throw new Error(`Origin launch is pinned to Monad; current chain is ${chainKey}`);

const network = chainConfig(chainKey);
const artifactPath = path.resolve('contracts/out/CertusUSD.sol/CertusUSD.json');
if (!fs.existsSync(artifactPath)) throw new Error('Missing CertusUSD artifact. Run the contract build first.');

const key = process.env.DEPLOYER_PRIVATE_KEY as Hex | undefined;
if (!key) throw new Error('DEPLOYER_PRIVATE_KEY missing');
const account = privateKeyToAccount(key);

console.log('Prepared Monad deployment:');
console.log(`  contract: CertusUSD (cUSD, 6 decimals)`);
console.log(`  owner:    ${account.address}`);
console.log(`  RPC:      ${network.rpcUrl}`);
if (process.env.CONFIRM_DEPLOY_ORIGIN !== CONFIRMATION) {
  console.log(`\nDRY RUN ONLY. Set CONFIRM_DEPLOY_ORIGIN=${CONFIRMATION} after explicit approval.`);
  process.exit(0);
}

const chain = {
  id: network.chainId,
  name: network.label,
  nativeCurrency: { name: network.nativeSymbol, symbol: network.nativeSymbol, decimals: 18 },
  rpcUrls: { default: { http: [network.rpcUrl] } },
} as const;
const publicClient = createPublicClient({ chain, transport: http(network.rpcUrl) });
const walletClient = createWalletClient({ account, chain, transport: http(network.rpcUrl) });
const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
const hash = await walletClient.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode.object });
const receipt = await publicClient.waitForTransactionReceipt({ hash });
if (!receipt.contractAddress) throw new Error('Deployment mined without a contract address');

console.log(`Origin token: ${receipt.contractAddress}`);
console.log(`Deploy tx:    ${hash}`);
console.log('Do not activate this address in config/chains.json until the Wrapped A-Token is ISSUED and verified.');
