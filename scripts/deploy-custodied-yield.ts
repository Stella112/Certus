import fs from 'node:fs';
import path from 'node:path';
import { createPublicClient, createWalletClient, http, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { assets } from '../src/lib/cleanverse/cva';
import { assertEligible, chainConfig, defaultChain } from '../src/lib/chain/config';

const chainKey = defaultChain();
assertEligible(chainKey);
if (chainKey !== 'monad') throw new Error('Custodied yield pilot is pinned to Monad testnet');
const network = chainConfig(chainKey);
const key = process.env.DEPLOYER_PRIVATE_KEY as Hex | undefined;
if (!key) throw new Error('DEPLOYER_PRIVATE_KEY missing');
const account = privateKeyToAccount(key);
const token = assets(chainKey).aToken;
const artifactPath = path.resolve('contracts/out/CertusCustodiedYieldVault.sol/CertusCustodiedYieldVault.json');
if (!fs.existsSync(artifactPath)) throw new Error('Build contracts first: forge build');
const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
const chain = { id: network.chainId, name: network.label, nativeCurrency: { name: network.nativeSymbol, symbol: network.nativeSymbol, decimals: 18 }, rpcUrls: { default: { http: [network.rpcUrl] } } } as const;
const publicClient = createPublicClient({ chain, transport: http(network.rpcUrl) });
const walletClient = createWalletClient({ account, chain, transport: http(network.rpcUrl) });
console.log(`Deploying custodial sponsored yield pilot for ${token}`);
console.log(`Custodian (A-Pass EOA): ${account.address}`);
const deployTx = await walletClient.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode.object, args: [token, account.address] });
const receipt = await publicClient.waitForTransactionReceipt({ hash: deployTx });
if (!receipt.contractAddress) throw new Error('Deployment returned no contract address');
const file = path.resolve('deployments', `${chainKey}.json`);
const deployment = JSON.parse(fs.readFileSync(file, 'utf8'));
deployment.contracts = deployment.contracts ?? {};
deployment.contracts.CertusCustodiedYieldVault = {
  address: receipt.contractAddress,
  deployTx,
  constructorArgs: { token, custodian: account.address },
  owner: account.address,
  status: 'testnet-only custodial pilot; principal held by A-Pass custodian EOA; not protocol-generated yield',
};
deployment.note = `${deployment.note ?? ''} Custodied yield pilot uses the A-Pass deployer EOA because canonical aUSDC rejects arbitrary vault contracts; it is testnet-only and not an APY promise.`.trim();
fs.writeFileSync(file, `${JSON.stringify(deployment, null, 2)}\n`);
console.log(`pilot: ${receipt.contractAddress}`);
console.log(`deploy tx: ${deployTx}`);
console.log('The custodian must approve this contract for aUSDC before withdrawals can pay out.');
