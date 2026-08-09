import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { listChains } from '@/lib/chain/config';
import { auditPdf } from '@/lib/audit/pdf';
import { requireOperator } from '@/lib/http/operator';

export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  const denied = requireOperator(req); if (denied) return denied;
  const url = new URL(req.url); const chain = url.searchParams.get('chain') ?? 'monad';
  if (!listChains().includes(chain)) return NextResponse.json({ error: 'Unsupported chain' }, { status: 400 });
  const asOf = new Date(url.searchParams.get('asOf') ?? Date.now());
  if (Number.isNaN(asOf.getTime())) return NextResponse.json({ error: 'Invalid asOf timestamp' }, { status: 400 });
  const events = await prisma.auditEvent.findMany({ where: { occurredAt: { lte: asOf }, intent: { chain } }, orderBy: { occurredAt: 'asc' } });
  const pdf = await auditPdf({ asOf, chain, events });
  return new Response(new Uint8Array(pdf), { headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="certus-audit-${chain}.pdf"`, 'cache-control': 'no-store' } });
}
