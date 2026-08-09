import { prisma } from '@/lib/db';
import { chainConfig, formatAmount } from '@/lib/chain/config';
import { selectedChain, type SearchParams } from '@/lib/chain/selection';
import { PageTitle, EmptyState } from '../components';
import { EscrowAction } from './EscrowAction';

export default async function Escrow({ searchParams }: { searchParams: SearchParams }) {
  const chain = await selectedChain(searchParams);
  const asset = chainConfig(chain);
  const intents = await prisma.intent.findMany({ where: { type: 'MILESTONE', chain }, include: { legs: true }, orderBy: { createdAt: 'desc' } });
  return <>
    <PageTitle eyebrow={`${asset.label} milestones`} title="Milestone escrow" description="Lock funds once, then release them stage by stage. Certus re-runs identity, asset, and policy checks before every release." />
    <section className="mb-6 grid gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 dark:border-indigo-950 dark:bg-indigo-950/20 sm:grid-cols-3">
      <Step number="1" title="Declare" body="Start in Send payment and choose the recipient and amount." />
      <Step number="2" title="Fund" body="Approve the asset and lock it in scoped escrow." />
      <Step number="3" title="Release" body="Release a milestone only after the fresh checks pass." />
    </section>
    {intents.length === 0 ? <EmptyState title="No milestone escrows on this network" body="Create a milestone intent to protect funds until each stage is approved." /> : <div className="grid gap-4 lg:grid-cols-2">{intents.map((intent) => {
      const released = intent.legs.filter((leg) => leg.status === 'RELEASED').length;
      const escrowed = intent.status === 'ACTIVE' ? intent.legs.filter((leg) => leg.status === 'PENDING').length : 0;
      const isolated = intent.legs.filter((leg) => ['FROZEN', 'QUARANTINED', 'ISOLATED'].includes(leg.status)).length;
      const nextPending = intent.legs.find((leg) => leg.status === 'PENDING');
      return <article key={intent.id} className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><div className="flex justify-between gap-4"><div><p className="font-mono text-xs font-semibold">{intent.id}</p><p className="mt-1 text-[10px] text-slate-400">{intent.status} · {escrowed} escrowed · {isolated} isolated</p></div><p className="amount text-sm font-semibold">{formatAmount(BigInt(intent.amount), chain)} {asset.symbol}</p></div><div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-indigo-brand" style={{ width: `${intent.legs.length ? released / intent.legs.length * 100 : 0}%` }} /></div><p className="mt-2 text-[10px] text-slate-400">{released} of {intent.legs.length} milestones released{escrowed ? ` · ${escrowed} awaiting release` : ''}</p>{intent.status === 'ACTIVE' && nextPending && <EscrowAction intentId={intent.id} chain={chain} legSequence={nextPending.sequence} />}</article>;
    })}</div>}
  </>;
}

function Step({ number, title, body }: { number: string; title: string; body: string }) {
  return <div className="flex gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-indigo-brand text-[10px] font-bold text-white">{number}</span><div><p className="text-xs font-semibold text-indigo-950 dark:text-indigo-100">{title}</p><p className="mt-1 text-[10px] leading-4 text-indigo-900/70 dark:text-indigo-200/70">{body}</p></div></div>;
}
