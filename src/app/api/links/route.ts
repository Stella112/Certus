import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { paymentLinkUrl } from '@/lib/settlement/payment-links';
import { listChains } from '@/lib/chain/config';
import { assets } from '@/lib/cleanverse/cva';
import { requireOperator } from '@/lib/http/operator';

export const dynamic = 'force-dynamic';
const BodySchema = z.object({
  chain: z.string().refine((chain) => listChains().includes(chain), 'Unsupported chain'),
  recipientCvi: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  amount: z.string().regex(/^\d+$/),
  policyId: z.enum(['PERMISSIVE', 'STANDARD', 'STRICT']),
  expiresAt: z.string().datetime().optional(),
});

export async function POST(req: Request) {
  const denied = requireOperator(req); if (denied) return denied;
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid payment link', issues: parsed.error.issues }, { status: 400 });
  const input = parsed.data;
  if (BigInt(input.amount) <= 0n) return NextResponse.json({ error: 'Amount must be greater than zero' }, { status: 400 });
  const asset = assets(input.chain).aToken;
  const slug = randomBytes(12).toString('base64url');
  const intent = await prisma.intent.create({
    data: {
      chain: input.chain, type: 'LINK', senderCvi: input.recipientCvi, asset,
      amount: input.amount, status: 'ACTIVE', policyId: input.policyId,
      paymentLink: { create: {
        slug, recipientCvi: input.recipientCvi, amount: input.amount,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      } },
    },
    include: { paymentLink: true },
  });
  const origin = process.env.APP_URL ?? new URL(req.url).origin;
  return NextResponse.json({
    intentId: intent.id, slug, url: paymentLinkUrl(slug, origin), qrUrl: new URL(`/api/links/${slug}/qr`, origin).toString(),
  }, { status: 201 });
}
