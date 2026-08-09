import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { listChains } from '@/lib/chain/config';
import { ESCROW_ABI, escrowAddress, publicClient } from '@/lib/chain/escrow';
import { onChainIntentId } from '@/lib/settlement/release';
import { requireOperator } from '@/lib/http/operator';

export const dynamic = 'force-dynamic';
const BodySchema = z.object({
  intentId: z.string().min(1),
  intervalSeconds: z.number().int().min(60),
  firstEpochAt: z.string().datetime(),
});

export async function POST(req: Request) {
  const denied = requireOperator(req); if (denied) return denied;
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid subscription', issues: parsed.error.issues }, { status: 400 });
  const input = parsed.data;
  const intent = await prisma.intent.findUnique({ where: { id: input.intentId }, include: { legs: true, subscription: true } });
  if (!intent || intent.type !== 'RECURRING' || intent.status !== 'ACTIVE' || intent.subscription || intent.yieldMode) {
    return NextResponse.json({ error: 'Intent must be an active, unscheduled recurring escrow' }, { status: 409 });
  }
  const legs = [...intent.legs].sort((a, b) => a.sequence - b.sequence);
  if (legs.length === 0 || legs.some((leg, index) => leg.status !== 'PENDING' || leg.sequence !== index + 1 || leg.recipientCvi !== legs[0].recipientCvi || leg.amount !== legs[0].amount)) {
    return NextResponse.json({ error: 'Recurring legs must be pending, contiguous, and share one recipient and amount' }, { status: 409 });
  }
  if (!listChains().includes(intent.chain)) return NextResponse.json({ error: 'Intent chain is unsupported' }, { status: 409 });

  const client = publicClient(intent.chain);
  const escrowToken = await client.readContract({
    address: escrowAddress(intent.chain), abi: ESCROW_ABI, functionName: 'token',
  });
  if (escrowToken.toLowerCase() !== intent.asset.toLowerCase()) {
    return NextResponse.json({ error: 'Intent asset does not match the deployed escrow token' }, { status: 409 });
  }
  const [funder, total, released, status] = await client.readContract({
    address: escrowAddress(intent.chain), abi: ESCROW_ABI, functionName: 'getIntent', args: [onChainIntentId(intent.id)],
  });
  const expectedTotal = legs.reduce((sum, leg) => sum + BigInt(leg.amount), 0n);
  if (funder === '0x0000000000000000000000000000000000000000' || status !== 1 || released !== 0n || total !== expectedTotal) {
    return NextResponse.json({ error: 'On-chain recurring escrow is not active or does not match the database plan' }, { status: 409 });
  }

  const subscription = await prisma.subscription.create({ data: {
    intentId: intent.id, recipientCvi: legs[0].recipientCvi, amount: legs[0].amount,
    intervalSeconds: input.intervalSeconds, nextEpochAt: new Date(input.firstEpochAt),
  } });
  return NextResponse.json({ intentId: intent.id, subscription }, { status: 201 });
}
