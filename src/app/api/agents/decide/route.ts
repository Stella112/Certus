import { NextResponse } from 'next/server';
import { isAddress, verifyMessage } from 'viem';
import { z } from 'zod';
import { chainConfig, deployment, listChains, type ChainKey } from '@/lib/chain/config';
import { assets } from '@/lib/cleanverse/cva';
import { evaluate } from '@/lib/pipeline/evaluate';
import type { PolicyId } from '@/lib/pipeline/policies';
import type { Chain } from '@/lib/cleanverse/types';
import { prisma } from '@/lib/db';
import { agentRequestMessage } from '@/lib/agents/mandate';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  mandateId: z.string().min(1),
  principalAddress: z.string().refine((value) => isAddress(value, { strict: false }), 'Invalid principal wallet'),
  recipientAddress: z.string().refine((value) => isAddress(value, { strict: false }), 'Invalid recipient wallet'),
  amount: z.string().regex(/^\d+$/, 'Amount must be base units').refine((value) => BigInt(value) > 0n, 'Amount must be greater than zero'),
  chain: z.string().refine((value) => listChains().includes(value), 'Unsupported chain'),
  agentAddress: z.string().refine((value) => isAddress(value, { strict: false }), 'Invalid agent wallet').optional(),
  agentSignature: z.string().regex(/^0x[0-9a-fA-F]+$/, 'Invalid agent signature').optional(),
  requestId: z.string().trim().min(8).max(120).optional(),
}).superRefine((value, ctx) => {
  if (value.agentAddress && (!value.agentSignature || !value.requestId)) ctx.addIssue({ code: 'custom', path: ['agentSignature'], message: 'Signed agent requests require agentSignature and requestId' });
  if (value.agentSignature && (!value.agentAddress || !value.requestId)) ctx.addIssue({ code: 'custom', path: ['agentAddress'], message: 'Signed agent requests require agentAddress and requestId' });
});

/** Evaluate an agent request without giving the agent a private key or a bypass path. */
export async function POST(req: Request) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid agent request', issues: parsed.error.issues }, { status: 400 });

  const { mandateId, principalAddress, recipientAddress, amount, chain, agentAddress, agentSignature, requestId } = parsed.data;
  const mandate = await prisma.agentMandate.findUnique({ where: { id: mandateId } });
  if (!mandate) return NextResponse.json({ error: 'Agent mandate not found' }, { status: 404 });
  if (mandate.status !== 'ACTIVE') return NextResponse.json({ error: `Agent mandate is ${mandate.status.toLowerCase()}` }, { status: 409 });
  if (mandate.principalAddress !== principalAddress.toLowerCase()) return NextResponse.json({ error: 'Principal does not match the mandate' }, { status: 403 });
  if (mandate.chain !== chain) return NextResponse.json({ error: 'Request chain does not match the mandate' }, { status: 409 });
  if (agentAddress) {
    if (mandate.agentAddress !== agentAddress.toLowerCase()) return NextResponse.json({ error: 'Agent address does not match the mandate' }, { status: 403 });
    const message = agentRequestMessage({ mandateId, principalAddress, agentAddress, recipientAddress, amount, chain, requestId: requestId! });
    const valid = await verifyMessage({ address: agentAddress as `0x${string}`, message, signature: agentSignature as `0x${string}` }).catch(() => false);
    if (!valid) return NextResponse.json({ error: 'Agent signature did not verify' }, { status: 403 });
  }
  if (mandate.expiresAt && mandate.expiresAt.getTime() <= Date.now()) return NextResponse.json({ error: 'Agent mandate has expired' }, { status: 409 });
  if (BigInt(amount) > BigInt(mandate.perTransactionLimit)) return NextResponse.json({ error: 'Request exceeds the agent per-transaction limit', limit: mandate.perTransactionLimit }, { status: 403 });
  const recentEvents = await prisma.auditEvent.findMany({ where: { occurredAt: { gte: new Date(Date.now() - 86_400_000) }, eventType: 'CHECK_RUN' }, select: { payload: true } });
  const usedToday = recentEvents.reduce((sum, event) => {
    try {
      const payload = JSON.parse(event.payload) as { actorType?: string; actorName?: string; principalAddress?: string; amount?: string };
      if (payload.actorType !== 'AGENT' || payload.actorName !== mandate.name || payload.principalAddress !== mandate.principalAddress) return sum;
      return sum + BigInt(payload.amount ?? '0');
    } catch { return sum; }
  }, 0n);
  if (usedToday + BigInt(amount) > BigInt(mandate.dailyLimit)) return NextResponse.json({ error: 'Request exceeds the agent rolling 24-hour limit', remaining: (BigInt(mandate.dailyLimit) - usedToday).toString() }, { status: 403 });
  const config = chainConfig(chain as ChainKey);
  const escrow = deployment(chain).escrow;
  const asset = deployment(chain).escrowAsset ?? assets(chain).aToken;
  if (!escrow) return NextResponse.json({ error: 'No scoped Certus escrow is deployed on this network' }, { status: 409 });
  const intent = await prisma.intent.create({
    data: {
      chain,
      type: 'MILESTONE',
      senderCvi: principalAddress.toLowerCase(),
      asset,
      amount,
      status: 'DRAFT',
      policyId: mandate.policyId,
      legs: { create: [{ recipientCvi: recipientAddress.toLowerCase(), amount, sequence: 1, status: 'PENDING' }] },
    },
    include: { legs: true },
  });
  const decision = await evaluate({
    trigger: 'INTENT_CREATE',
    chain: chain as Chain,
    atoken: config.aToken,
    senderAddress: principalAddress,
    recipientAddress,
    amount: BigInt(amount),
    policyId: mandate.policyId as PolicyId,
    actorType: 'AGENT',
    actorName: mandate.name,
    principalAddress,
    intentId: intent.id,
    legId: intent.legs[0]?.id,
  });

  if (decision.verdict !== 'PASS') await prisma.intent.update({ where: { id: intent.id }, data: { status: 'REJECTED' } });

  return NextResponse.json({
    agentName: mandate.name,
    mandateId: mandate.id,
    principalAddress,
    recipientAddress,
    amount,
    chain,
    policyId: mandate.policyId,
    intentId: intent.id,
    escrow,
    decision,
    execution: decision.verdict === 'PASS' ? 'AWAITING_PRINCIPAL_FUNDING' : 'BLOCKED',
  });
}
