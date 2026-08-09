import { NextResponse } from 'next/server';
import { z } from 'zod';
import { runDueSubscriptions } from '@/lib/settlement/recurring';
import { listChains } from '@/lib/chain/config';
import { requireOperator } from '@/lib/http/operator';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({ chain: z.string().refine((value) => listChains().includes(value), 'Unsupported chain').optional() }).default({});

export async function POST(req: Request) {
  const denied = requireOperator(req); if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  try {
    const outcomes = await runDueSubscriptions(new Date(), parsed.data.chain);
    return NextResponse.json({ processed: outcomes.length, outcomes });
  } catch (error) {
    return NextResponse.json({ error: 'Epoch processing failed', detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
