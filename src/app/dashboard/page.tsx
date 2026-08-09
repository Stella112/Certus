import Link from 'next/link';
import { prisma } from '@/lib/db';
import { chainConfig, formatAmount } from '@/lib/chain/config';
import { selectedChain, type SearchParams } from '@/lib/chain/selection';
import { DepositGuide } from './DepositGuide';

export default async function Home({ searchParams }: { searchParams: SearchParams }) {
  const chain = await selectedChain(searchParams);
  const asset = chainConfig(chain);
  const [intents, subscriptions, links, eventCount] = await Promise.all([
    prisma.intent.findMany({ where: { chain }, include: { legs: true }, orderBy: { createdAt: 'desc' }, take: 30 }),
    prisma.subscription.findMany({ where: { intent: { chain }, status: 'ACTIVE' }, orderBy: { nextEpochAt: 'asc' }, take: 5 }),
    prisma.paymentLink.count({ where: { intent: { chain }, status: 'ACTIVE' } }),
    prisma.auditEvent.count({ where: { intent: { chain } } }),
  ]);
  const legs = intents.flatMap((intent) => intent.legs);
  const released = legs.filter((leg) => leg.status === 'RELEASED').reduce((sum, leg) => sum + BigInt(leg.amount), 0n);
  const protectedValue = legs.filter((leg) => ['PENDING', 'FROZEN', 'ISOLATED', 'QUARANTINED'].includes(leg.status)).reduce((sum, leg) => sum + BigInt(leg.amount), 0n);
  const held = legs.filter((leg) => ['FROZEN', 'ISOLATED', 'QUARANTINED'].includes(leg.status)).length;

  const actions = [
    ['Single intent', 'Pay one verified recipient', '/dashboard/send', 'send'],
    ['Milestone', 'Lock and release by stage', '/dashboard/escrow', 'lock'],
    ['Batch', 'Isolate failures by recipient', '/dashboard/batches', 'batch'],
    ['Recurring', 'Re-check every epoch', '/dashboard/recurring', 'repeat'],
    ['Payment link', 'Verify payer at checkout', '/dashboard/links', 'link'],
  ] as const;

  return <>
    <section className="relative mb-7 overflow-hidden rounded-3xl border border-indigo-100 bg-gradient-to-br from-white via-white to-indigo-50/80 px-6 py-7 shadow-[0_14px_38px_rgba(48,55,120,.06)] dark:border-indigo-950/70 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/40 sm:px-8 sm:py-8">
      <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-indigo-200/25 blur-3xl dark:bg-indigo-500/10" />
      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl"><div className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-white/80 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.16em] text-indigo-brand dark:border-indigo-900 dark:bg-slate-900/70"><span className="h-1.5 w-1.5 rounded-full bg-indigo-brand" />Policy-gated settlement</div><h1 className="mt-4 text-4xl font-semibold tracking-[-.05em] text-ink dark:text-white sm:text-[44px]">What should value do?</h1><p className="mt-3 max-w-xl text-sm leading-6 text-slate-500 dark:text-slate-400">Declare the outcome. Certus re-validates identity, asset, and spending policy before every movement.</p></div>
        <Link href="/dashboard/send" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-brand px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-200 transition hover:-translate-y-0.5 hover:bg-indigo-600 dark:shadow-none">Send payment <span aria-hidden>↗</span></Link>
      </div>
    </section>

    <DepositGuide chain={asset.cleanverseChain} chainId={asset.chainId} assetAddress={asset.aToken} />

    <section className="mb-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Protected in intents" value={`${formatAmount(protectedValue, chain)} ${asset.symbol}`} note="Pending or quarantined" tone="indigo" /><Metric label="Settled" value={`${formatAmount(released, chain)} ${asset.symbol}`} note="Confirmed settlement legs" tone="emerald" /><Metric label="Policy evidence" value={String(eventCount)} note="Append-only check events" tone="slate" /><Metric label="Held safely" value={String(held)} note="Failed legs never released" tone="amber" /></section>

    <section className="mb-7"><div className="mb-3 flex items-center justify-between"><div><p className="text-sm font-semibold text-ink dark:text-white">Start a payment flow</p><p className="mt-1 text-xs text-slate-500">Choose the protection pattern that fits the transfer.</p></div><span className="hidden rounded-full bg-slate-100 px-3 py-1.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 sm:inline-flex">aUSDC active</span></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{actions.map(([title, body, href, icon]) => <Link href={href} key={title} className="group rounded-2xl border border-slate-200/90 bg-white p-4 transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-[0_10px_24px_rgba(48,55,120,.08)] dark:border-slate-800 dark:bg-slate-900"><div className="flex items-start justify-between"><span className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-50 text-indigo-brand dark:bg-indigo-950/60"><ActionIcon name={icon} /></span><span className="text-lg text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-brand">↗</span></div><p className="mt-4 text-xs font-semibold text-ink dark:text-white">{title}</p><p className="mt-1.5 text-[11px] leading-4 text-slate-500">{body}</p></Link>)}</div></section>

    <div className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]"><section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"><header className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800"><div><h2 className="text-sm font-semibold text-ink dark:text-white">Active intent ledger</h2><p className="mt-1 text-[10px] text-slate-400">Every row is backed by the settlement store</p></div><Link href="/dashboard/activity" className="text-[10px] font-semibold text-indigo-brand hover:underline">View provenance</Link></header>{intents.length ? intents.slice(0, 7).map((intent) => <div key={intent.id} className="grid gap-3 border-b border-slate-100 px-5 py-4 last:border-0 dark:border-slate-800 sm:grid-cols-[1fr_100px_120px] sm:items-center"><div><p className="text-xs font-semibold text-ink dark:text-white">{intent.type} intent</p><p className="mt-1 font-mono text-[10px] text-slate-400">{intent.id}</p></div><span className={`w-fit rounded-full px-2 py-1 text-[9px] font-bold ${intent.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'}`}>{intent.status}</span><p className="amount text-right text-xs font-semibold text-ink dark:text-white">{formatAmount(BigInt(intent.amount), chain)} {asset.symbol}</p></div>) : <p className="p-6 text-xs text-slate-500">No intents declared yet.</p>}</section><aside className="space-y-5"><section className="rounded-2xl bg-ink p-5 text-white shadow-[0_14px_30px_rgba(13,16,48,.18)] dark:bg-slate-900"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-indigo-300">Live authorization</p><div className="mt-5 space-y-3">{['Sender A-Pass', 'Recipient A-Pass', 'A-Token rules', 'Institutional policy'].map((check, index) => <div key={check} className="flex items-center gap-3"><span className="grid h-7 w-7 place-items-center rounded-lg bg-white/10 text-[9px] text-indigo-200">0{index + 1}</span><p className="text-xs text-slate-200">{check}</p><span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-400" /></div>)}</div><p className="mt-5 border-t border-white/10 pt-4 text-[10px] leading-4 text-slate-400">Checks are fresh at each milestone, batch row, subscription epoch, and payment-link open.</p></section><section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-ink dark:text-white">Upcoming epochs</h2><span className="text-[10px] text-slate-400">{links} active links</span></div><div className="mt-4 space-y-3">{subscriptions.length ? subscriptions.map((subscription) => <div key={subscription.id} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950"><p className="text-xs font-semibold text-ink dark:text-white">{formatAmount(BigInt(subscription.amount), chain)} {asset.symbol}</p><p className="mt-1 text-[10px] text-slate-400">Re-checks {subscription.nextEpochAt.toLocaleString()}</p></div>) : <p className="text-xs leading-5 text-slate-500">No upcoming recurring intents.</p>}</div></section></aside></div>
  </>;
}

function Metric({ label, value, note, tone }: { label: string; value: string; note: string; tone: 'indigo' | 'emerald' | 'slate' | 'amber' }) {
  const dot = { indigo: 'bg-indigo-brand', emerald: 'bg-emerald-500', slate: 'bg-slate-400', amber: 'bg-amber-500' }[tone];
  return <article className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${dot}`} /><p className="text-[11px] font-medium text-slate-500">{label}</p></div><p className="amount mt-4 whitespace-nowrap text-xl font-semibold tracking-tight text-ink dark:text-white sm:text-2xl">{value}</p><p className="mt-1 text-[10px] text-slate-400">{note}</p></article>;
}

function ActionIcon({ name }: { name: string }) {
  const common = 'h-4 w-4 fill-none stroke-current';
  if (name === 'send') return <svg viewBox="0 0 24 24" className={common}><path d="m4 12 16-8-6 16-2.5-6.5z" /></svg>;
  if (name === 'lock') return <svg viewBox="0 0 24 24" className={common}><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>;
  if (name === 'batch') return <svg viewBox="0 0 24 24" className={common}><path d="M5 6h14M5 12h14M5 18h14" /></svg>;
  if (name === 'repeat') return <svg viewBox="0 0 24 24" className={common}><path d="M4 8h13l-3-3M20 16H7l3 3" /></svg>;
  return <svg viewBox="0 0 24 24" className={common}><path d="M9 15l6-6M7.5 17.5l-1 1a3.5 3.5 0 0 1-5-5l4-4a3.5 3.5 0 0 1 5 0M16.5 6.5l1-1a3.5 3.5 0 0 1 5 5l-4 4a3.5 3.5 0 0 1-5 0" /></svg>;
}
