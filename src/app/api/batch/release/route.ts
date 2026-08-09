import { NextResponse } from 'next/server';
import { z } from 'zod';
import { releaseBatch } from '@/lib/settlement/batch';
import { listChains, txUrl } from '@/lib/chain/config';
import { requireOperator } from '@/lib/http/operator';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  intentId: z.string().min(1),
  chain: z.string().refine((value) => listChains().includes(value), 'Unsupported chain').optional(),
});

export async function POST(req: Request) {
  const denied = requireOperator(req); if (denied) return denied;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 });
  }
  try {
    const result = await releaseBatch(parsed.data);
    return NextResponse.json({
      ...result,
      outcomes: result.outcomes.map((outcome) =>
        outcome.status === 'RELEASED'
          ? { ...outcome, explorerUrl: txUrl(outcome.txHash, parsed.data.chain) }
          : outcome
      ),
      isolationExplorerUrl: result.isolationTxHash ? txUrl(result.isolationTxHash, parsed.data.chain) : undefined,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Batch release failed', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
