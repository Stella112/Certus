/**
 * Deploy and prove a CertusEscrow that custodies Cleanverse aUSDC directly.
 *
 * Preconditions:
 * - treasury has an active Monad A-Pass and aUSDC
 * - DEPLOYER_PRIVATE_KEY is set
 *
 * Proofs:
 * 1. a contract address can receive an A-Pass and custody aUSDC;
 * 2. release to an eligible recipient succeeds;
 * 3. release to a recipient without an A-Pass reverts at the A-Token layer.
 */
import fs from 'node:fs';
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeFunctionData,
  formatUnits,
  http,
  keccak256,
  parseAbi,
  toBytes,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { call } from './call.mjs';

const RPC = 'https://testnet-rpc.monad.xyz';
const AUSDC = '0xaC0893567D43C3E7e6e35a72803df05416C1f20D';
const NO_APASS = '0x00000000000000000000000000000000deadbeef';
const key = process.env.DEPLOYER_PRIVATE_KEY;
if (!key) throw new Error('DEPLOYER_PRIVATE_KEY missing');

const account = privateKeyToAccount(key);
const chain = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});
const publicClient = createPublicClient({ chain, transport: http() });
const walletClient = createWalletClient({ account, chain, transport: http() });
const artifact = JSON.parse(fs.readFileSync('contracts/out/CertusEscrow.sol/CertusEscrow.json', 'utf8'));
const erc20 = parseAbi([
  'function approve(address spender,uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

console.log('1. Deploy aUSDC-configured CertusEscrow');
const deployHash = await walletClient.deployContract({
  abi: artifact.abi,
  bytecode: artifact.bytecode.object,
  args: [AUSDC],
});
const deployed = await publicClient.waitForTransactionReceipt({ hash: deployHash });
const escrow = deployed.contractAddress;
if (!escrow) throw new Error('deployment returned no contract address');
console.log('   escrow:', escrow);
console.log('   tx:', deployHash);

console.log('\n2. Issue the contract an A-Pass');
const generated = await call('/generate_apass', {
  wallet: { chain: 'monad', address: escrow },
  customerId: `CERTUSAUSDCESCROW${Date.now()}`,
  expirationTime: 1_900_000_000,
  tier: '50',
  subTier: 0,
}, { encrypted: true });
if (generated.json?.code !== '0000') throw new Error(`generate_apass failed: ${generated.text}`);

let eligible = false;
for (let i = 0; i < 12 && !eligible; i++) {
  await sleep(5000);
  const verified = await call('/verify_apass', {
    chain: 'monad', atoken: AUSDC, address: escrow,
  }, { encrypted: false });
  eligible = verified.json?.data?.code === 4;
  console.log(`   eligibility poll ${i + 1}: ${verified.json?.data?.code ?? '-'}`);
}
if (!eligible) throw new Error('escrow did not become aUSDC-eligible');

const amount = 100_000n; // 0.1 aUSDC per proof intent
const total = amount * 2n;
console.log('\n3. Approve and fund two proof intents');
const approveHash = await walletClient.writeContract({
  address: AUSDC, abi: erc20, functionName: 'approve', args: [escrow, total],
});
await publicClient.waitForTransactionReceipt({ hash: approveHash });

const goodIntent = keccak256(toBytes(`CERTUS-AUSDC-GOOD-${Date.now()}`));
const badIntent = keccak256(toBytes(`CERTUS-AUSDC-GATE-${Date.now()}`));
for (const [intentId, recipient] of [[goodIntent, account.address], [badIntent, NO_APASS]]) {
  const hash = await walletClient.writeContract({
    address: escrow,
    abi: artifact.abi,
    functionName: 'fundIntent',
    args: [intentId, [recipient], [amount]],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  console.log('   funded:', intentId, 'tx:', hash);
}

console.log('\n4. Release to eligible treasury (must succeed)');
const goodAudit = keccak256(toBytes('CERTUS-AUSDC-ELIGIBLE-PROOF'));
const releaseHash = await walletClient.writeContract({
  address: escrow,
  abi: artifact.abi,
  functionName: 'releaseLeg',
  args: [goodIntent, 0n, goodAudit],
});
await publicClient.waitForTransactionReceipt({ hash: releaseHash });
console.log('   release tx:', releaseHash);

console.log('\n5. Release to no-A-Pass recipient (must revert)');
let gateProven = false;
try {
  const data = encodeFunctionData({
    abi: artifact.abi,
    functionName: 'releaseLeg',
    args: [badIntent, 0n, keccak256(toBytes('CERTUS-AUSDC-GATE-PROOF'))],
  });
  await publicClient.call({ account, to: escrow, data });
} catch (error) {
  gateProven = true;
  console.log('   reverted as expected:', error.shortMessage ?? error.message);
}
if (!gateProven) throw new Error('UNSAFE: aUSDC simulation allowed transfer to no-A-Pass recipient');

console.log('\n6. Quarantine the intentionally blocked proof intent');
const freezeHash = await walletClient.writeContract({
  address: escrow,
  abi: artifact.abi,
  functionName: 'freezeIntent',
  args: [badIntent, keccak256(toBytes('NO_CVI')), keccak256(toBytes('CERTUS-AUSDC-GATE-PROOF'))],
});
await publicClient.waitForTransactionReceipt({ hash: freezeHash });

const escrowBalance = await publicClient.readContract({
  address: AUSDC, abi: erc20, functionName: 'balanceOf', args: [escrow],
});
console.log('\nPROOF COMPLETE');
console.log(JSON.stringify({
  escrow,
  deployTx: deployHash,
  token: AUSDC,
  eligibleReleaseTx: releaseHash,
  blockedRecipient: NO_APASS,
  gateProven,
  quarantineTx: freezeHash,
  quarantinedBalance: formatUnits(escrowBalance, 6),
}, null, 2));
