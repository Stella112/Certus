import { POLICIES } from '@/lib/pipeline/policies';
import { chainConfig, defaultChain, formatAmount } from '@/lib/chain/config';
import { PageTitle } from '../components';
import { AgentConsole } from './AgentConsole';
import { LiveAgentPanel } from './LiveAgentPanel';

export default function AgentsPage() {
  const chain = defaultChain();
  const asset = chainConfig(chain);
  return <>
    <PageTitle eyebrow="Agent guardrails" title="Autonomy inside hard boundaries" description="An agent wallet is a controlled payment operator. The principal funds scoped escrow, sets limits, and remains the owner while Certus checks every request." />
    <section className="mb-5 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-5 dark:border-indigo-950 dark:bg-indigo-950/20"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-indigo-brand">Demo evidence · principal stays in control</p><h2 className="mt-2 text-lg font-semibold text-ink dark:text-white">Mandate → request → principal funding → release</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600 dark:text-slate-300">The agent can propose within a signed limit, but it cannot spend principal directly. A principal wallet funds the scoped escrow, then Certus records the fresh checks and release.</p></div><span className="rounded-full bg-emerald-100 px-3 py-1.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">NO PRINCIPAL KEY TO AGENT</span></div><div className="mt-5 grid gap-2 sm:grid-cols-4">{['Mandate signed','Agent proposes','Principal funds','Checks release'].map((step,index)=><div key={step} className="rounded-xl border border-indigo-100 bg-white/75 p-3 dark:border-indigo-900 dark:bg-slate-900/60"><span className="text-[10px] font-bold text-indigo-brand">0{index+1}</span><p className="mt-2 text-xs font-semibold text-ink dark:text-white">{step}</p><p className="mt-1 text-[10px] leading-4 text-slate-500">{index===0?'Bounded policy and expiry':index===1?'Limited request only':index===2?'Wallet signs the funding tx':'Fresh identity and policy checks'}</p></div>)}</div></section>
    <AgentConsole chain={chain} symbol={asset.symbol} tokenAddress={asset.aToken} chainId={asset.chainId} rpcUrl={asset.rpcUrl} nativeSymbol={asset.nativeSymbol} explorerUrl={asset.explorerUrl} />
    <LiveAgentPanel chain={chain} symbol={asset.symbol} tokenAddress={asset.aToken} chainId={asset.chainId} rpcUrl={asset.rpcUrl} nativeSymbol={asset.nativeSymbol} explorerUrl={asset.explorerUrl} />
    <section className="mb-5 grid gap-4 lg:grid-cols-3">
      {Object.values(POLICIES).map((policy) => <article key={policy.id} className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between"><span className="rounded-lg bg-indigo-brand/10 px-2.5 py-1.5 text-[10px] font-bold text-indigo-brand">{policy.id}</span><span className="h-2 w-2 rounded-full bg-emerald-500" /></div>
        <h2 className="mt-5 text-lg font-semibold">{policy.label}</h2><p className="mt-2 min-h-12 text-xs leading-5 text-slate-500">{policy.description}</p>
        <dl className="mt-5 space-y-3 border-t border-slate-100 pt-4 text-xs dark:border-slate-800"><Rule label="Per intent" value={policy.maxPerLeg === null ? 'No policy cap' : formatAmount(policy.maxPerLeg, chain)} /><Rule label="Rolling 24h" value={policy.dailyBudget === null ? 'No policy cap' : formatAmount(policy.dailyBudget, chain)} /><Rule label="Counterparties" value={policy.allowlist === null ? 'Any verified identity' : 'Allowlist only'} /><Rule label="Execution window" value={policy.windowUTC ? `${policy.windowUTC.startHour}:00–${policy.windowUTC.endHour}:00 UTC` : 'Always open'} /></dl>
      </article>)}
    </section>
    <section className="rounded-2xl bg-ink p-6 text-white dark:bg-slate-900"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-indigo-300">Execution contract</p><div className="mt-5 grid gap-4 sm:grid-cols-4">{['Agent proposes intent', 'Four checks run live', 'Policy returns decision', 'Principal funds scoped escrow'].map((item, index) => <div key={item} className="rounded-xl border border-white/10 p-4"><span className="text-[10px] text-indigo-300">0{index + 1}</span><p className="mt-3 text-xs font-medium">{item}</p></div>)}</div></section>
  </>;
}

function Rule({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-3"><dt className="text-slate-400">{label}</dt><dd className="text-right font-semibold">{value}</dd></div>; }
