import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { downloadTransactionReport } from '@/lib/cleanverse/reports';
import { assets } from '@/lib/cleanverse/cva';
import { listChains } from '@/lib/chain/config';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, context: { params: Promise<{ txHash: string }> }) {
  const { txHash } = await context.params;
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) return NextResponse.json({ error: 'Invalid transaction hash' }, { status: 400 });
  const leg = await prisma.leg.findFirst({
    where: { txHash },
    include: { intent: true },
  });
  if (!leg) return NextResponse.json({ error: 'Settlement transaction not found' }, { status: 404 });

  const chain = leg.intent.chain;
  if (!listChains().includes(chain)) return NextResponse.json({ error: 'Settlement chain is unsupported' }, { status: 409 });
  const result = await downloadTransactionReport({
    chain: assets(chain).chain,
    walletAddress: leg.recipientCvi,
    txHash,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : result.kind === 'REJECTED' ? 422 : 503 });
}
