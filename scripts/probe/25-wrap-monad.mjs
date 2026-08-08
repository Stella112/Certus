/**
 * Does releasing into a recipient's per-identity deposit wallet mint aUSDC?
 *
 * On Base this failed: the deposit wallet swept and forwarded the ORIGIN token instead.
 * The difference on Monad is that the Cleanverse origin token IS Circle FiatToken v2, and
 * per Cleanverse support the wrap is driven by depositing Circle USDC to that address.
 * If it works here, "settlement lands as a verified asset" becomes a demonstrated claim
 * rather than a narrowed one.
 */
import { createWalletClient, createPublicClient, http, parseAbi, encodeFunctionData, defineChain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { call } from './call.mjs';

const RPC = 'https://testnet-rpc.monad.xyz';
const CHAIN = 'monad';
const ESCROW = '0xb327709Ec4f0830722776746b1da42F98d51868e';
const USDC = '0x534b2f3A21130d7a60830c2Df862319e593943A3';
const AUSDC = '0xaC0893567D43C3E7e6e35a72803df05416C1f20D';

const monad = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

const account = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY);
const pub = createPublicClient({ chain: monad, transport: http(RPC) });
const wallet = createWalletClient({ account, chain: monad, transport: http(RPC) });

const erc20 = parseAbi(['function approve(address,uint256) returns (bool)', 'function balanceOf(address) view returns (uint256)']);
const escrowAbi = parseAbi([
  'function fundIntent(bytes32,address[],uint256[])',
  'function releaseLeg(bytes32,uint256,bytes32)',
  'function freezeIntent(bytes32,bytes32,bytes32)',
  'function quarantinedOf(bytes32) view returns (uint256)',
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const bal = (t, w) => pub.readContract({ address: t, abi: erc20, functionName: 'balanceOf', args: [w] });
const send = async (to, data) => {
  const hash = await wallet.sendTransaction({ to, data });
  const rc = await pub.waitForTransactionReceipt({ hash });
  return { hash, status: rc.status };
};
const rand32 = () => '0x' + Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex');

console.log('1. Minting a recipient identity on monad to get its deposit route...');
const recipient = privateKeyToAccount(rand32()).address;
const gen = await call('/generate_apass', {
  wallet: { chain: CHAIN, address: recipient },
  customerId: 'CERTUSWRAP' + Date.now(),
  expirationTime: 1900000000,
  tier: '50', subTier: 0, group: '', subGroup: '', countries: ['NG'],
}, { encrypted: true });
const deposit = gen.json?.data?.wallet?.depositUSDCWallet;
console.log(`   recipient : ${recipient}`);
console.log(`   deposit   : ${deposit}`);
if (!deposit) process.exit(1);

for (let i = 0; i < 8; i++) {
  await sleep(5000);
  const v = await call('/verify_apass', { chain: CHAIN, atoken: AUSDC, address: recipient }, { encrypted: false });
  if (v.json?.data?.code === 4) { console.log(`   eligible after ${(i + 1) * 5}s`); break; }
}

const intentId = rand32();
const LEG = 500_000n; // 0.5 USDC
console.log(`\n2. Funding escrow with 2 x ${LEG} base units`);
console.log(`   treasury USDC: ${await bal(USDC, account.address)}`);
await send(USDC, encodeFunctionData({ abi: erc20, functionName: 'approve', args: [ESCROW, LEG * 2n] }));
const f = await send(ESCROW, encodeFunctionData({ abi: escrowAbi, functionName: 'fundIntent', args: [intentId, [deposit, deposit], [LEG, LEG]] }));
console.log(`   fundIntent : ${f.hash} (${f.status})`);
console.log(`   escrow USDC: ${await bal(USDC, ESCROW)}`);

console.log('\n3. Releasing milestone 1 into the deposit route...');
const before = await bal(AUSDC, recipient);
const r = await send(ESCROW, encodeFunctionData({ abi: escrowAbi, functionName: 'releaseLeg', args: [intentId, 0n, intentId] }));
console.log(`   releaseLeg : ${r.hash} (${r.status})`);
let wrapped = false;
for (let i = 0; i < 10; i++) {
  await sleep(6000);
  const [aNow, uNow, dNow] = [await bal(AUSDC, recipient), await bal(USDC, recipient), await bal(USDC, deposit)];
  console.log(`   poll ${String(i + 1).padStart(2)}: recipient aUSDC=${aNow} USDC=${uNow} | deposit USDC=${dNow}`);
  if (aNow > before) { wrapped = true; console.log('   *** aUSDC MINTED: value landed as a VERIFIED ASSET ***'); break; }
}

console.log('\n4. Freezing (Moment B on an eligible chain)...');
const z = await send(ESCROW, encodeFunctionData({
  abi: escrowAbi, functionName: 'freezeIntent',
  args: [intentId, '0x' + Buffer.from('CVI_REVOKED_OR_EXPIRED'.padEnd(32, '\0')).toString('hex'), intentId],
}));
console.log(`   freezeIntent: ${z.hash} (${z.status})`);
console.log(`   quarantined : ${await pub.readContract({ address: ESCROW, abi: escrowAbi, functionName: 'quarantinedOf', args: [intentId] })}`);
console.log(`\nWRAP RESULT: ${wrapped ? 'aUSDC minted, claim RESTORED' : 'no aUSDC after 60s, claim stays narrowed'}`);
console.log(`Explorer: https://testnet.monadscan.com/address/${ESCROW}`);
