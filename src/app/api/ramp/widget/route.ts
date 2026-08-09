import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ramp } from '@/lib/cleanverse/ramp';
import { requireOperator } from '@/lib/http/operator';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  quoteToken: z.string().trim().min(1).max(200),
  wallet: z.object({
    address: z.string().trim().min(20).max(120),
    chain: z.string().trim().min(2).max(32),
  }),
  email: z.string().email().optional(),
  userIp: z.string().trim().max(64).optional(),
});

export async function POST(req: Request) {
  const denied = requireOperator(req); if (denied) return denied;
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid ramp widget request', issues: parsed.error.issues }, { status: 400 });
  const result = await ramp.widget(parsed.data);
  if (result.kind === 'ok') return NextResponse.json(result.data);
  if (result.kind === 'business') return NextResponse.json({ error: result.message, code: result.code, data: result.data }, { status: 422 });
  return NextResponse.json({ error: 'Cleanverse ramp unavailable', detail: result.detail }, { status: 503 });
}
