import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ramp } from '@/lib/cleanverse/ramp';
import { requireOperator } from '@/lib/http/operator';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  fiatCurrency: z.string().trim().min(3).max(8).transform((value) => value.toUpperCase()),
  cryptoCurrency: z.string().trim().min(2).max(20).transform((value) => value.toUpperCase()),
  isBuyOrSell: z.enum(['BUY', 'SELL']),
  network: z.string().trim().min(2).max(32),
  paymentMethod: z.string().trim().min(2).max(80),
  fiatAmount: z.coerce.number().positive().max(1_000_000).optional(),
  cryptoAmount: z.coerce.number().positive().max(1_000_000_000).optional(),
  partnerCustomerId: z.string().trim().max(120).optional(),
}).superRefine((value, ctx) => {
  if (value.isBuyOrSell === 'BUY' && value.fiatAmount === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fiatAmount'], message: 'BUY requires fiatAmount' });
  }
  if (value.isBuyOrSell === 'SELL' && value.cryptoAmount === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cryptoAmount'], message: 'SELL requires cryptoAmount' });
  }
});

export async function POST(req: Request) {
  const denied = requireOperator(req); if (denied) return denied;
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid ramp quote', issues: parsed.error.issues }, { status: 400 });
  const result = await ramp.quote(parsed.data);
  if (result.kind === 'ok') return NextResponse.json(result.data);
  if (result.kind === 'business') return NextResponse.json({ error: result.message, code: result.code, data: result.data }, { status: 422 });
  return NextResponse.json({ error: 'Cleanverse ramp unavailable', detail: result.detail }, { status: 503 });
}
