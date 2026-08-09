import Link from 'next/link';
import { prisma } from '@/lib/db';
import { assets } from '@/lib/cleanverse/cva';
import { formatAmount, chainConfig, deployment } from '@/lib/chain/config';
import { ReasonText } from '@/lib/pipeline/reasonCodes';
import { selectedChain, type SearchParams } from '@/lib/chain/selection';
import { EmptyState, PageTitle, Panel } from '../components';
import { BatchComposer } from '@/app/components/BatchComposer';
import { BatchControls } from '@/app/components/BatchControls';

export default async function BatchesPage({ searchParams }: { searchParams: SearchParams }) {
  const chain = await selectedChain(searchParams);
  const asset = assets(chain);
  const config = chainConfig(chain);
  const deployed = deployment(chain);
  const batches = await prisma.intent.findMany({
    where: { type: 'BATCH', chain, asset: asset.aToken },
    orderBy: { createdAt: 'desc' },
    include: { legs: true, events: { orderBy: { occurredAt: 'desc' } } },
  });

  return (
    <>
      <PageTitle
        eyebrow={`${chain} batch disbursal`}
        title="Clean payroll"
        description="Fund one payroll batch, then screen every employee independently. Eligible rows release; a failed row is isolated without stopping the rest."
      />
      {deployed.batch && deployed.batchAsset === asset.aToken ? (
        <BatchComposer
          chain={chain}
          label={config.label}
          asset={deployed.batchAsset}
          assetLabel={deployed.batchAssetSymbol ?? asset.symbol}
          batch={deployed.batch}
          decimals={config.decimals}
          chainId={config.chainId}
          rpcUrl={config.rpcUrl}
          nativeSymbol={config.nativeSymbol}
          explorerUrl={config.explorerUrl}
        />
      ) : (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">Clean payroll is not deployed on this network yet.</div>
      )}
      <section className="mb-6 grid gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 dark:border-indigo-950 dark:bg-indigo-950/20 sm:grid-cols-3">
        <Step number="1" title="Fund the batch" body="The employer funds one scoped aUSDC payroll contract." />
        <Step number="2" title="Check every row" body="Each employee gets a fresh identity, asset, and policy decision." />
        <Step number="3" title="Settle safely" body="PASS rows release; failed rows stay isolated with a reason." />
      </section>
      <Panel title="Payroll register" subtitle={`${batches.length} records on ${chain}`}>
        {batches.length === 0 ? (
          <EmptyState title="No payroll batches on this network" body="Create a batch above to pay multiple verified recipients independently." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-[9px] uppercase tracking-[0.14em] text-slate-400">
                <tr>
                  <th className="px-6 py-3">Batch</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Rows</th>
                  <th className="px-4 py-3">Released</th>
                  <th className="px-4 py-3">Held</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {batches.map((batch) => {
                  const released = batch.legs.filter((leg) => leg.status === 'RELEASED').length;
                  const heldLegs = batch.legs.filter((leg) => ['ISOLATED', 'FROZEN', 'QUARANTINED'].includes(leg.status));
                  return (
                    <tr key={batch.id} className="align-top text-xs">
                      <td className="px-6 py-4 font-mono text-slate-600">{batch.id.slice(0, 10)}…</td>
                      <td className="amount px-4 py-4 font-semibold">{formatAmount(BigInt(batch.amount), chain)} {asset.symbol}</td>
                      <td className="px-4 py-4 text-slate-500">{batch.legs.length}</td>
                      <td className="px-4 py-4 text-emerald-600">{released}</td>
                      <td className="px-4 py-4 text-amber-600"><span className="block">{heldLegs.length}</span>{heldLegs.length > 0 && <span className="mt-1 block text-[10px] font-semibold text-amber-700/80 dark:text-amber-300/80">{formatAmount(heldLegs.reduce((sum, leg) => sum + BigInt(leg.amount), 0n), chain)} {asset.symbol}</span>}</td>
                      <td className="px-4 py-4"><span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-bold">{batch.status}</span></td>
                      <td className="min-w-[260px] px-4 py-4">
                        {heldLegs.length > 0 && <div className="space-y-2">{heldLegs.map((leg) => <HeldReason key={leg.id} recipient={leg.recipientCvi} amount={formatAmount(BigInt(leg.amount), chain)} symbol={asset.symbol} event={batch.events.find((event) => event.legId === leg.id && event.eventType === 'ISOLATE')} />)}</div>}
                        {batch.status === 'ACTIVE' && <BatchControls intentId={batch.id} active />}
                        {!heldLegs.length && batch.status !== 'ACTIVE' && <span className="text-[10px] text-slate-400">No held rows</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <p className="mt-4 text-xs text-slate-400">Need the live execution view? <Link href={`/dashboard?chain=${chain}`} className="font-semibold text-indigo-brand">Return to control center.</Link></p>
    </>
  );
}

function HeldReason({ recipient, amount, symbol, event }: { recipient: string; amount: string; symbol: string; event?: { reasonCode: string | null; payload: string } }) {
  const code = event?.reasonCode ?? 'COMPLIANCE_CHECK_FAILED';
  const reason = (ReasonText as Record<string, string>)[code] ?? code;
  return <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-900/60 dark:bg-amber-950/30"><div className="flex items-center justify-between gap-3"><p className="text-[9px] font-bold uppercase tracking-[.12em] text-amber-700 dark:text-amber-300">Held · {code}</p><p className="text-[10px] font-bold text-amber-950 dark:text-amber-100">{amount} {symbol}</p></div><p className="mt-1 text-[10px] font-semibold text-amber-950 dark:text-amber-100">{reason}</p><p className="mt-1 font-mono text-[9px] text-amber-800/70 dark:text-amber-200/70">{shorten(recipient)} · remains quarantined in the batch contract</p></div>;
}

function shorten(address: string) { return `${address.slice(0, 8)}…${address.slice(-6)}`; }

function Step({ number, title, body }: { number: string; title: string; body: string }) {
  return <div className="flex gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-indigo-brand text-[10px] font-bold text-white">{number}</span><div><p className="text-xs font-semibold text-indigo-950 dark:text-indigo-100">{title}</p><p className="mt-1 text-[10px] leading-4 text-indigo-900/70 dark:text-indigo-200/70">{body}</p></div></div>;
}
