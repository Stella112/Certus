import { NextResponse } from 'next/server';
import { z } from 'zod';
import { releaseMilestone } from '@/lib/settlement/release';
import { ReasonText, type ReasonCode } from '@/lib/pipeline/reasonCodes';
import { txUrl } from '@/lib/chain/config';

/**
 * POST /api/release
 *
 * Release one milestone leg. This route does NOT decide anything: it validates input and
 * delegates to the settlement service, which re-runs the full four-check pipeline against
 * the live API before it will sign. There is no query parameter, header, or role that can
 * skip that. A refusal returns 200 with a verdict, not an error, because "we checked and the
 * answer is no" is a successful compliance outcome, not a failure of the request.
 */

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  intentId: z.string().min(1),
  legSequence: z.number().int().positive(),
  chain: z.string().optional(),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) },
      { status: 400 }
    );
  }

  try {
    const result = await releaseMilestone(parsed.data);

    if (result.settled) {
      return NextResponse.json({
        settled: true,
        verdict: 'PASS',
        txHash: result.txHash,
        explorerUrl: txUrl(result.txHash, parsed.data.chain),
        auditRef: result.auditRef,
      });
    }

    return NextResponse.json({
      settled: false,
      verdict: result.verdict,
      reasonCode: result.reason,
      reason: ReasonText[result.reason as ReasonCode] ?? result.reason,
      detail: result.detail,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'Release failed', detail: message }, { status: 500 });
  }
}
