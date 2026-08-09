import { NextResponse } from 'next/server';
import { isAddress, verifyMessage } from 'viem';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { listChains, type ChainKey } from '@/lib/chain/config';
import { mandateMessage } from '@/lib/agents/mandate';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  name: z.string().trim().min(2).max(80),
  principalAddress: z.string().refine((value) => isAddress(value, { strict: false }), 'Invalid principal wallet'),
  agentAddress: z.string().refine((value) => isAddress(value, { strict: false }), 'Invalid agent wallet'),
  chain: z.string().refine((value) => listChains().includes(value), 'Unsupported chain'),
  policyId: z.enum(['PERMISSIVE', 'STANDARD', 'STRICT']),
  perTransactionLimit: z.string().regex(/^\d+$/, 'Per-transaction limit must be base units').refine((value) => BigInt(value) > 0n),
  dailyLimit: z.string().regex(/^\d+$/, 'Daily limit must be base units').refine((value) => BigInt(value) > 0n),
  expiresAt: z.string().datetime().nullable(),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/, 'Invalid mandate signature'),
}).superRefine((value, ctx) => {
  if (BigInt(value.dailyLimit) < BigInt(value.perTransactionLimit)) ctx.addIssue({ code: 'custom', path: ['dailyLimit'], message: 'Daily limit must cover the per-transaction limit' });
  if (value.expiresAt && new Date(value.expiresAt).getTime() <= Date.now()) ctx.addIssue({ code: 'custom', path: ['expiresAt'], message: 'Mandate expiry must be in the future' });
});

export async function GET(req: Request) {
  const principal = new URL(req.url).searchParams.get('principal');
  if (!principal || !isAddress(principal, { strict: false })) return NextResponse.json({ error: 'Valid principal query is required' }, { status: 400 });
  const mandates = await prisma.agentMandate.findMany({ where: { principalAddress: principal.toLowerCase() }, orderBy: { createdAt: 'desc' }, take: 25 });
  return NextResponse.json({ mandates });
}

export async function POST(req: Request) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid agent mandate', issues: parsed.error.issues }, { status: 400 });
  const input = parsed.data;
  const message = mandateMessage({ ...input, expiresAt: input.expiresAt ?? 'never' });
  const valid = await verifyMessage({ address: input.principalAddress as `0x${string}`, message, signature: input.signature as `0x${string}` }).catch(() => false);
  if (!valid) return NextResponse.json({ error: 'Principal signature did not verify' }, { status: 403 });
  const mandate = await prisma.agentMandate.create({ data: { ...input, chain: input.chain as ChainKey, expiresAt: input.expiresAt ? new Date(input.expiresAt) : null, principalAddress: input.principalAddress.toLowerCase(), agentAddress: input.agentAddress.toLowerCase() } });
  return NextResponse.json({ mandate }, { status: 201 });
}
