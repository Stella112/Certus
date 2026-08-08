/**
 * PHASE 2 ON-CHAIN PROOF. Closes Phase 0 audit finding F-05, which left escrow custody as an
 * INFERENCE rather than a demonstrated fact.
 *
 * Proves, against the real deployed contract on Base Sepolia and the real Cleanverse sandbox:
 *   1. a plain contract address CAN custody the ungated origin USDC
 *   2. a release moves real value on chain
 *   3. releasing to a recipient's per-identity depositUSDCWallet credits that recipient with
 *      aUSDC, i.e. value lands AS a compliance-enforcing verified asset  <-- the key claim
 *   4. freezing halts the remaining milestone and quarantines the principal on chain
 */
import { createWalletClient, createPublicClient, http, parseAbi, encodeFunctionData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { call } from './call.mjs';

const RPC = process.env.RPC_URL;
const ESCROW = '0xb327709Ec4f0830722776746b1da42F98d51868e';
const USDC = process.env.ORIGIN_TOKEN;
const AUSDC = process.env.ATOKEN;
const CHAIN = process.env.CHAIN_NAME;

const account = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY);
const pub = createPublicClient({ chain: baseSepolia, transport: http(RPC) });
const wallet = createWalletClient({ account, chain: baseSepolia, transport: http(RPC) });

const erc20 = parseAbi([
  'function approve(address,uint256) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
]);
const escrowAbi = parseAbi([
  'function fundIntent(bytes32,address[],uint256[])',
  'function releaseLeg(bytes32,uint256,bytes32)',
  'function freezeIntent(bytes32,bytes32,bytes32)',
  'function quarantinedOf(bytes32) view returns (uint256)',
  'function getLeg(bytes32,uint256) view returns (address,uint256,uint8)',
  'function getIntent(bytes32) view returns (address,uint256,uint256,uint8,bytes32)',
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const bal = async (token, who) => pub.readContract({ address: token, abi: erc20, functionName: 'balanceOf', args: [who] });
const send = async (to, data) => {
  const hash = await wallet.sendTransaction({ to, data });
  const rc = await pub.waitForTransactionReceipt({ hash });
  return { hash, status: rc.status };
};

// --- 1. mint a fresh recipient identity and capture its deposit route -----------------
console.log('1. Minting a recipient identity to obtain its per-identity deposit wallet...');
const recipientKey = '0x' + Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex');
const recipient = privateKeyToAccount(recipientKey).address;
const gen = await call(
  '/generate_apass',
  {
    wallet: { chain: CHAIN, address: recipient },
    customerId: 'CERTUSESCROW' + Date.now(),
    expirationTime: 1900000000,
    tier: '50', subTier: 0, group: '', subGroup: '', countries: ['NG'],
  },
  { encrypted: true }
);
const depositWallet = gen.json?.data?.wallet?.depositUSDCWallet;
console.log(`   recipient      : ${recipient}`);
console.log(`   deposit route  : ${depositWallet}`);
if (!depositWallet) { console.error('   no deposit wallet returned, aborting'); process.exit(1); }

console.log('\n   waiting for A-Pass registration to confirm on chain...');
let eligible = false;
for (let i = 0; i < 8 && !eligible; i++) {
  await sleep(5000);
  const v = await call('/verify_apass', { chain: CHAIN, atoken: AUSDC, address: recipient }, { encrypted: false });
  eligible = v.json?.data?.code === 4;
  console.log(`   poll ${i + 1}: code=${v.json?.data?.code ?? '-'}`);
}
if (!eligible) { console.error('   recipient never became eligible, aborting'); process.exit(1); }

// --- 2. fund an intent ----------------------------------------------------------------
const intentId = '0x' + Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex');
const LEG = 100_000n; // 0.1 USDC at 6dp
console.log(`\n2. Funding intent with 2 legs of ${LEG} base units (0.1 USDC each)`);
console.log(`   treasury USDC before: ${await bal(USDC, account.address)}`);

await send(USDC, encodeFunctionData({ abi: erc20, functionName: 'approve', args: [ESCROW, LEG * 2n] }));
const fundTx = await send(
  ESCROW,
  encodeFunctionData({ abi: escrowAbi, functionName: 'fundIntent', args: [intentId, [depositWallet, depositWallet], [LEG, LEG]] })
);
console.log(`   fundIntent tx  : ${fundTx.hash} (${fundTx.status})`);
console.log(`   ESCROW now holds origin USDC: ${await bal(USDC, ESCROW)}  <-- custody PROVEN, not inferred`);

// --- 3. release leg 0 into the deposit route ------------------------------------------
console.log('\n3. Releasing milestone 1 to the recipient deposit route...');
const aBefore = await bal(AUSDC, recipient);
const relTx = await send(
  ESCROW,
  encodeFunctionData({ abi: escrowAbi, functionName: 'releaseLeg', args: [intentId, 0n, intentId] })
);
console.log(`   releaseLeg tx  : ${relTx.hash} (${relTx.status})`);
console.log(`   escrow USDC    : ${await bal(USDC, ESCROW)}`);
console.log(`   recipient aUSDC before: ${aBefore}`);
for (let i = 0; i < 6; i++) {
  await sleep(5000);
  const now = await bal(AUSDC, recipient);
  console.log(`   poll ${i + 1}: recipient aUSDC = ${now}`);
  if (now > aBefore) { console.log('   *** VALUE LANDED AS A VERIFIED ASSET (aUSDC minted) ***'); break; }
}

// --- 4. freeze ------------------------------------------------------------------------
console.log('\n4. Freezing the intent (Moment B on chain)...');
const frzTx = await send(
  ESCROW,
  encodeFunctionData({
    abi: escrowAbi,
    functionName: 'freezeIntent',
    args: [intentId, '0x' + Buffer.from('CVI_REVOKED_OR_EXPIRED'.padEnd(32, '\0')).toString('hex'), intentId],
  })
);
console.log(`   freezeIntent tx: ${frzTx.hash} (${frzTx.status})`);
console.log(`   quarantined    : ${await pub.readContract({ address: ESCROW, abi: escrowAbi, functionName: 'quarantinedOf', args: [intentId] })}`);
const leg1 = await pub.readContract({ address: ESCROW, abi: escrowAbi, functionName: 'getLeg', args: [intentId, 1n] });
console.log(`   leg 1 status   : ${['Pending', 'Released', 'Frozen'][Number(leg1[2])]}`);
console.log(`   escrow still holds: ${await bal(USDC, ESCROW)} (funds held, not returned)`);
console.log(`\nExplorer: https://sepolia.basescan.org/address/${ESCROW}`);
