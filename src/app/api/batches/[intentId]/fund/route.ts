import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isAddress } from 'viem';
import { prisma } from '@/lib/db';
import { BATCH_ABI, batchAddress, publicClient } from '@/lib/chain/escrow';
import { chainConfig } from '@/lib/chain/config';
import { onChainIntentId } from '@/lib/settlement/release';
import { recordEvent } from '@/lib/audit/record';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({ txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'Invalid transaction hash'), sender: z.string().refine(isAddress, 'Invalid sender wallet') });

export async function POST(req: Request, context: { params: Promise<{ intentId: string }> }) {
  const { intentId } = await context.params;
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid funding confirmation', issues: parsed.error.issues }, { status: 400 });
  const intent = await prisma.intent.findUnique({ where: { id: intentId }, include: { legs: true } });
  if (!intent) return NextResponse.json({ error: 'Payroll batch not found' }, { status: 404 });
  if (intent.type !== 'BATCH' || intent.status !== 'DRAFT' || intent.legs.length === 0) return NextResponse.json({ error: 'Payroll batch is not awaiting funding' }, { status: 409 });
  if (parsed.data.sender.toLowerCase() !== intent.senderCvi.toLowerCase()) return NextResponse.json({ error: 'Funding sender does not match the batch employer' }, { status: 403 });

  const chain = intent.chain;
  const client = publicClient(chain);
  const contract = batchAddress(chain);
  const receipt = await client.waitForTransactionReceipt({ hash: parsed.data.txHash as `0x${string}` });
  if (receipt.status !== 'success') return NextResponse.json({ error: 'Funding transaction reverted' }, { status: 409 });
  const [funder, total, released, quarantined, processed, status] = await client.readContract({ address: contract, abi: BATCH_ABI, functionName: 'getBatch', args: [onChainIntentId(intent.id)] });
  const rowCount = await client.readContract({ address: contract, abi: BATCH_ABI, functionName: 'rowCount', args: [onChainIntentId(intent.id)] });
  if (Number(rowCount) !== intent.legs.length) return NextResponse.json({ error: 'Funding transaction has the wrong number of payroll rows' }, { status: 409 });
  for (const expected of intent.legs) {
    const [recipient, amount, rowStatus] = await client.readContract({ address: contract, abi: BATCH_ABI, functionName: 'getRow', args: [onChainIntentId(intent.id), BigInt(expected.sequence - 1)] });
    if (recipient.toLowerCase() !== expected.recipientCvi.toLowerCase() || amount !== BigInt(expected.amount) || rowStatus !== 0) return NextResponse.json({ error: 'Funding transaction does not match the declared payroll rows' }, { status: 409 });
  }
  if (funder.toLowerCase() !== intent.senderCvi.toLowerCase() || total !== BigInt(intent.amount) || released !== 0n || quarantined !== 0n || processed !== 0n || status !== 1) {
    return NextResponse.json({ error: 'Funding transaction does not match the declared payroll batch' }, { status: 409 });
  }
  const updated = await prisma.intent.update({ where: { id: intent.id }, data: { status: 'ACTIVE' } });
  await recordEvent({ intentId: intent.id, eventType: 'CHECK_RUN', trigger: 'INTENT_FUND', verdict: 'PASS', checkResults: [], payload: { txHash: parsed.data.txHash, chain, asset: intent.asset, amount: intent.amount, rows: intent.legs.length } });
  return NextResponse.json({ intent: updated, txHash: parsed.data.txHash, explorerUrl: `${chainConfig(chain).explorerUrl}/tx/${parsed.data.txHash}` });
}
