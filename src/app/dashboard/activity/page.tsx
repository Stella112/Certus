import { prisma } from '@/lib/db';
import { chainConfig, formatAmount, txUrl } from '@/lib/chain/config';
import { ReasonText, type ReasonCode } from '@/lib/pipeline/reasonCodes';
import { selectedChain, type SearchParams } from '@/lib/chain/selection';
import { PageTitle, EmptyState, Panel } from '../components';

export default async function Activity({ searchParams }: { searchParams: SearchParams }) {
  const chain = await selectedChain(searchParams);
  const asset = chainConfig(chain);
  const legs = await prisma.leg.findMany({ where: { intent: { chain } }, include: { intent: true }, orderBy: { intent: { createdAt: 'desc' } }, take: 100 });
  const events = await prisma.auditEvent.findMany({ where: { intent: { chain } }, orderBy: { occurredAt: 'desc' }, take: 300 });
  const heldReasons = new Map<string, { reason: string; amount?: string; txHash?: string }>();
  for (const event of events) {
    if (!event.intentId || !['FAIL', 'ISOLATE', 'FREEZE'].includes(event.verdict ?? '')) continue;
    let payload: Record<string, unknown> = {};
    try { payload = JSON.parse(event.payload) as Record<string, unknown>; } catch { /* old event */ }
    if (!heldReasons.has(event.intentId)) heldReasons.set(event.intentId, { reason: event.reasonCode ? ReasonText[event.reasonCode as ReasonCode] ?? event.reasonCode : event.trigger ?? 'Compliance hold', amount: typeof payload.amount === 'string' ? payload.amount : undefined, txHash: typeof payload.txHash === 'string' ? payload.txHash : undefined });
  }
  return <><PageTitle eyebrow={`${asset.label} history`} title="Provenance & activity" description="Every settlement, hold, receipt, and transaction reference on the selected network." /><Panel title="Intent legs" subtitle="Real records from the append-only Certus settlement store">{legs.length === 0 ? <EmptyState title="No activity on this network" body="Settled and protected intent legs will appear here." /> : <div className="divide-y divide-slate-100 dark:divide-slate-800">{legs.map(leg => { const held = heldReasons.get(leg.intentId); return <div key={leg.id} className="grid gap-3 px-5 py-4 sm:px-6 lg:grid-cols-[1fr_180px_170px_110px] lg:items-center"><div><p className="font-mono text-xs">{leg.recipientCvi}</p><p className="mt-1 text-[10px] text-slate-400">{leg.intent.type} · {leg.status} · {leg.intent.id}</p>{held && <p className="mt-2 text-[10px] font-semibold text-amber-700 dark:text-amber-300">Held · {held.reason}</p>}{held && <p className="mt-1 text-[10px] text-slate-500">{held.amount ? `Held ${formatAmount(BigInt(held.amount), chain)} ${asset.symbol} · ` : ''}principal remains quarantined</p>}</div><p className="amount text-xs font-semibold">{formatAmount(BigInt(leg.amount), chain)} {asset.symbol}</p>{held?.txHash ? <a className="text-xs font-semibold text-indigo-brand" href={txUrl(held.txHash, chain)} target="_blank" rel="noreferrer">View hold receipt</a> : leg.txHash ? <a className="text-xs font-semibold text-indigo-brand" href={txUrl(leg.txHash, chain)} target="_blank" rel="noreferrer">View receipt</a> : <span className="text-[10px] text-slate-400">No chain receipt</span>}<span className="text-[10px] text-slate-400">{leg.intent.yieldMode ? 'Yield protection' : 'Standard escrow'}</span></div>; })}</div>}</Panel></>;
}
