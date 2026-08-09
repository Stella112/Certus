import fs from 'node:fs';
import path from 'node:path';
import type { Hex } from 'viem';
import { prisma } from '../src/lib/db';
import { BATCH_ABI, batchAddress, publicClient } from '../src/lib/chain/escrow';
import { defaultChain } from '../src/lib/chain/config';
import { onChainIntentId } from '../src/lib/settlement/release';
import { verifyProvenance, type ProvenanceAttestation } from '../src/lib/provenance/attestation';

/** Independent Phase 3 exit-criterion auditor. It signs and moves nothing. */
const chain = defaultChain();
const client = publicClient(chain);
const contract = batchAddress(chain);
const intent = await prisma.intent.findFirst({
  where: { type: 'BATCH', status: 'COMPLETED' },
  orderBy: { createdAt: 'desc' },
  include: { legs: { orderBy: { sequence: 'asc' } }, events: { orderBy: { occurredAt: 'asc' } } },
});
if (!intent) throw new Error('AUDIT FAIL: no completed BATCH intent');

const released = intent.legs.filter((leg) => leg.status === 'RELEASED');
const isolated = intent.legs.filter((leg) => leg.status === 'ISOLATED');
const findings: string[] = [];
if (intent.legs.length !== 10) findings.push(`expected 10 rows, found ${intent.legs.length}`);
if (released.length !== 9) findings.push(`expected 9 released rows, found ${released.length}`);
if (isolated.length !== 1) findings.push(`expected 1 isolated row, found ${isolated.length}`);

const provenanceResults: Array<{ legId: string; txHash: string; valid: boolean }> = [];
for (const leg of released) {
  if (!leg.txHash) {
    findings.push(`${leg.id}: RELEASED without txHash`);
    continue;
  }
  const receipt = await client.getTransactionReceipt({ hash: leg.txHash as Hex });
  if (receipt.status !== 'success') findings.push(`${leg.id}: receipt is ${receipt.status}`);
  const event = intent.events.find((candidate) => {
    if (candidate.legId !== leg.id || candidate.eventType !== 'RELEASE') return false;
    try { return JSON.parse(candidate.payload).txHash?.toLowerCase() === leg.txHash?.toLowerCase(); } catch { return false; }
  });
  if (!event) {
    findings.push(`${leg.id}: missing RELEASE audit event`);
    continue;
  }
  const payload = JSON.parse(event.payload);
  const attestation = payload.provenance as ProvenanceAttestation | undefined;
  const valid = !!attestation && await verifyProvenance(attestation) &&
    attestation.legId === leg.id &&
    attestation.txHash.toLowerCase() === leg.txHash.toLowerCase() &&
    attestation.recipient.toLowerCase() === leg.recipientCvi.toLowerCase() &&
    attestation.amount === leg.amount;
  provenanceResults.push({ legId: leg.id, txHash: leg.txHash, valid });
  if (!valid) findings.push(`${leg.id}: invalid or mismatched provenance attestation`);
}

const batchId = onChainIntentId(intent.id);
const onchain = await client.readContract({ address: contract, abi: BATCH_ABI, functionName: 'getBatch', args: [batchId] });
const [, total, releasedAmount, quarantinedAmount, processed, status] = onchain;
const dbReleased = released.reduce((sum, leg) => sum + BigInt(leg.amount), 0n);
const dbIsolated = isolated.reduce((sum, leg) => sum + BigInt(leg.amount), 0n);
if (status !== 2) findings.push(`on-chain batch status is ${status}, expected Completed(2)`);
if (processed !== 10n) findings.push(`on-chain processed is ${processed}, expected 10`);
if (releasedAmount !== dbReleased) findings.push(`released amount mismatch: chain ${releasedAmount}, DB ${dbReleased}`);
if (quarantinedAmount !== dbIsolated) findings.push(`quarantine mismatch: chain ${quarantinedAmount}, DB ${dbIsolated}`);
if (total !== dbReleased + dbIsolated) findings.push('on-chain total does not equal released plus quarantined');

for (const leg of intent.legs) {
  const row = await client.readContract({
    address: contract,
    abi: BATCH_ABI,
    functionName: 'getRow',
    args: [batchId, BigInt(leg.sequence - 1)],
  });
  const [, amount, rowStatus] = row;
  const expectedStatus = leg.status === 'RELEASED' ? 1 : 2;
  if (amount !== BigInt(leg.amount) || rowStatus !== expectedStatus) {
    findings.push(`${leg.id}: on-chain row does not match DB projection`);
  }
}

const evidence = {
  auditedAt: new Date().toISOString(),
  verdict: findings.length === 0 ? 'PASS' : 'FAIL',
  chain,
  contract,
  intentId: intent.id,
  summary: { totalRows: intent.legs.length, released: released.length, isolated: isolated.length },
  onchain: {
    total: total.toString(),
    released: releasedAmount.toString(),
    quarantined: quarantinedAmount.toString(),
    processed: processed.toString(),
    status: Number(status),
  },
  provenance: provenanceResults,
  findings,
};
fs.mkdirSync(path.resolve('data'), { recursive: true });
fs.writeFileSync(path.resolve('data', 'moment-a-audit.json'), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
await prisma.$disconnect();
if (findings.length > 0) process.exitCode = 1;
