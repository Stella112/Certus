import { NextResponse } from 'next/server';
import { z } from 'zod';
import { openPaymentLink } from '@/lib/settlement/payment-links';

export const dynamic = 'force-dynamic';
const BodySchema = z.object({ visitorAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/) });

export async function POST(req: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'A valid visitorAddress is required' }, { status: 400 });
  const result = await openPaymentLink({ slug, visitorAddress: parsed.data.visitorAddress });
  return NextResponse.json(result, { status: result.opened || 'attestationRequired' in result ? 200 : 404 });
}
