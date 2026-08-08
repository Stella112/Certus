import { keccak256, stringToHex, encodeFunctionData, type Hex } from 'viem';
import { prisma } from '../src/lib/db';
import { assets } from '../src/lib/cleanverse/cva';
import { freezeIdentity, verifyEligibility } from '../src/lib/cleanverse/cvi';
import { defaultChain, txUrl, formatAmount } from '../src/lib/chain/config';
import { ERC20_ABI, ESCROW_ABI, escrowAddress, publicClient, releaserClient, readLeg } from '../src/lib/chain/escrow';
import { releaseMilestone, onChainIntentId } from '../src/lib/settlement/release';
import { sweepOnce } from '../src/lib/watch/revocation';
import { consumeFromPool, availableCount } from './identityPool';
import { privateKeyToAccount } from 'viem/accounts';

/**
 * MOMENT B, END TO END. The Phase 2 exit criterion.
 *
 * A supplier's credential is revoked WHILE a contract is live. Nothing in this script tells
 * Certus to freeze anything: the watcher notices the revocation on its own and the cascade
 * follows. That distinction is the entire product claim, so the script is written to prove
 * it rather than to stage it.
 *
 * Real throughout: real escrow contract, real on-chain value, real Cleanverse revocation.
 * Burns one pooled identity, because freezing is irreversible in UAT.
 */

const CHAIN = defaultChain();
const A = assets(CHAIN);
const step = (n: number, s: string) => console.log(`\n${'='.repeat(64)}\n${n}. ${s}\n${'='.repeat(64)}`);

const target = consumeFromPool('moment-b', CHAIN);
if (!target) {
  console.error(`Freeze-target pool is empty for ${CHAIN}. Run: npm run mint-pool -- 3`);
  process.exit(1);
}

const { client, account } = releaserClient(CHAIN);
const pub = publicClient(CHAIN);
const escrow = escrowAddress(CHAIN);
const LEG = 200_000n; // 0.2 units
const intentDbId = `moment-b-${Date.now()}`;
const onChainId = onChainIntentId(intentDbId);

step(1, 'Confirm the supplier is currently VERIFIED');
for (let i = 0; i < 8; i++) {
  const v = await verifyEligibility({ chain: A.chain, atoken: A.aToken, address: target.address });
  console.log(`   ${target.address} -> ${v.signal}`);
  if (v.signal === 'ALLOWED') break;
  await new Promise((r) => setTimeout(r, 5000));
}

step(2, 'Fund a 2-milestone contract on chain');
await client.writeContract({
  address: A.originToken as Hex, abi: ERC20_ABI, functionName: 'approve',
  args: [escrow, LEG * 2n], account, chain: null,
});
const fundTx = await client.writeContract({
  address: escrow, abi: ESCROW_ABI, functionName: 'fundIntent',
  args: [onChainId, [target.address as Hex, target.address as Hex], [LEG, LEG]], account, chain: null,
});
await pub.waitForTransactionReceipt({ hash: fundTx });
console.log(`   funded ${formatAmount(LEG * 2n, CHAIN)} ${A.symbol}  ${txUrl(fundTx, CHAIN)}`);

await prisma.intent.deleteMany({ where: { id: intentDbId } });
await prisma.intent.create({
  data: {
    id: intentDbId, type: 'MILESTONE', senderCvi: account.address, asset: A.aToken,
    amount: (LEG * 2n).toString(), status: 'ACTIVE', policyId: 'STANDARD',
    legs: { create: [
      { id: `${intentDbId}-l1`, recipientCvi: target.address, amount: LEG.toString(), sequence: 1, status: 'PENDING' },
      { id: `${intentDbId}-l2`, recipientCvi: target.address, amount: LEG.toString(), sequence: 2, status: 'PENDING' },
    ] },
  },
});

step(3, 'Release milestone 1 through the pipeline (expect PASS)');
const r1 = await releaseMilestone({ intentId: intentDbId, legSequence: 1, chain: CHAIN });
if (!r1.settled) {
  console.error(`   UNEXPECTED refusal: ${r1.verdict} ${r1.reason} - ${r1.detail}`);
  process.exit(1);
}
console.log(`   SETTLED  ${txUrl(r1.txHash, CHAIN)}`);
console.log(`   leg 1 on chain: ${(await readLeg(CHAIN, onChainId, 0n)).status}`);

step(4, 'REVOKE the supplier credential mid-contract');
const fr = await freezeIdentity({ chain: A.chain, address: target.address, reason: 'certus moment B demo' });
console.log(fr.ok ? `   revoked, txHash ${fr.txHash}` : `   FAILED: ${fr.detail}`);
if (!fr.ok) process.exit(1);

step(5, 'The WATCHER notices. Nothing here tells it to freeze.');
let events: Awaited<ReturnType<typeof sweepOnce>> = [];
for (let i = 1; i <= 10; i++) {
  events = await sweepOnce(CHAIN);
  console.log(`   sweep ${i}: ${events.length ? `DETECTED ${events[0].signal}` : 'no change yet'}`);
  if (events.length) break;
  await new Promise((r) => setTimeout(r, 5000));
}
if (!events.length) {
  console.error('   watcher never detected the revocation');
  process.exit(1);
}
console.log(`   froze intents: ${events[0].frozenIntents.join(', ')}`);

step(6, 'Verify the cascade, on chain and in the record');
const leg2 = await readLeg(CHAIN, onChainId, 1n);
const quarantined = await pub.readContract({ address: escrow, abi: ESCROW_ABI, functionName: 'quarantinedOf', args: [onChainId] });
const dbIntent = await prisma.intent.findUnique({ where: { id: intentDbId }, include: { legs: true } });
console.log(`   on chain : leg 2 = ${leg2.status}, quarantined = ${formatAmount(quarantined, CHAIN)} ${A.symbol}`);
console.log(`   database : intent = ${dbIntent?.status}, legs = ${dbIntent?.legs.map((l) => `${l.sequence}:${l.status}`).join(' ')}`);

step(7, 'Milestone 2 must now be refused BY THE PIPELINE');
const r2 = await releaseMilestone({ intentId: intentDbId, legSequence: 2, chain: CHAIN });
console.log(r2.settled ? '   *** FAILURE: it settled ***' : `   REFUSED  ${r2.verdict} / ${r2.reason}`);

const events2 = await prisma.auditEvent.findMany({ where: { intentId: intentDbId }, orderBy: { occurredAt: 'asc' } });
console.log(`\n   audit trail: ${events2.length} events -> ${events2.map((e) => e.eventType).join(' > ')}`);

const ok = leg2.status === 'FROZEN' && quarantined === LEG && dbIntent?.status === 'FROZEN' && !r2.settled;
console.log(`\n${'='.repeat(64)}\nMOMENT B: ${ok ? 'PROVEN END TO END' : 'INCOMPLETE'}\n${'='.repeat(64)}`);
console.log(`pool remaining: ${availableCount(CHAIN)}`);
await prisma.$disconnect();
process.exit(ok ? 0 : 1);
