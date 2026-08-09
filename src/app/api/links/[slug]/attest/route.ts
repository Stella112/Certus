import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateIdentity } from '@/lib/cleanverse/cvi';
import { prisma } from '@/lib/db';
import { listChains } from '@/lib/chain/config';
import { assets } from '@/lib/cleanverse/cva';
import { requireOperator } from '@/lib/http/operator';

export const dynamic = 'force-dynamic';
const BodySchema = z.object({
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  customerId: z.string().regex(/^[A-Za-z0-9]{12,}$/),
  expirationTime: z.number().int().positive(),
  tier: z.string().optional(),
  countries: z.array(z.string().min(2)).min(1).optional(),
});

export async function POST(req: Request, context: { params: Promise<{ slug: string }> }) {
  const denied = requireOperator(req); if (denied) return denied;
  const { slug } = await context.params;
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid attestation request', issues: parsed.error.issues }, { status: 400 });
  const link = await prisma.paymentLink.findUnique({ where: { slug }, include: { intent: true } });
  if (!link || link.status !== 'ACTIVE' || (link.expiresAt && link.expiresAt <= new Date())) {
    return NextResponse.json({ error: 'Payment link is not active' }, { status: 404 });
  }
  if (!listChains().includes(link.intent.chain)) {
    return NextResponse.json({ error: 'Payment link chain is unsupported' }, { status: 409 });
  }
  const result = await generateIdentity({ ...parsed.data, chain: assets(link.intent.chain).chain });
  return NextResponse.json(result, { status: result.ok ? 201 : 503 });
}
