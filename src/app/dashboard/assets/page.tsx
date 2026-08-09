import { assets, CLEANVERSE_INFRA } from '@/lib/cleanverse/cva';
import { chainConfig, deployment, listChains } from '@/lib/chain/config';
import { selectedChain, type SearchParams } from '@/lib/chain/selection';
import { PageTitle, Panel } from '../components';

export default async function AssetsPage({ searchParams }: { searchParams: SearchParams }) {
  const key = await selectedChain(searchParams);
  const network = chainConfig(key);
  const asset = assets(key);
  const deployed = deployment(key);
  const networks = listChains().map((chain) => ({
    key: chain,
    config: chainConfig(chain),
    asset: assets(chain),
    deployed: deployment(chain),
  }));

  return (
    <>
      <PageTitle
        eyebrow="Multi-chain registry"
        title="Asset infrastructure"
        description="Every network carries its own identity context and verified assets. Deployed escrow and batch contracts remain bound to their exact on-chain tokens."
      />
      <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {networks.map((item) => {
          const symbols = [...new Set([item.asset.symbol, item.deployed.escrowAssetSymbol, item.deployed.batchAssetSymbol].filter(Boolean))];
          return (
            <a key={item.key} href={`/dashboard/assets?chain=${item.key}`} className={`rounded-2xl border bg-white p-4 transition dark:bg-[#101622] ${item.key === key ? 'border-indigo-brand ring-4 ring-indigo-brand/[0.06]' : 'border-slate-200 hover:border-slate-300 dark:border-slate-800'}`}>
              <div className="flex items-center justify-between"><span className="text-xs font-semibold">{item.config.label}</span><span className={`h-2 w-2 rounded-full ${item.config.hackathonEligible ? 'bg-emerald-500' : 'bg-slate-300'}`} /></div>
              <p className="mt-3 text-lg font-semibold text-indigo-brand">{symbols.join(' / ')}</p>
              <p className="mt-1 text-[10px] text-slate-400">Chain {item.config.chainId} · {item.asset.decimals} decimals</p>
            </a>
          );
        })}
      </section>
      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <Panel title={`${network.label} configuration`} subtitle="Registry and deployed contract bindings">
          <div className="grid gap-3 p-5 sm:grid-cols-2">
            <Field label="Registry key" value={key} />
            <Field label="Native asset" value={network.nativeSymbol} />
            <Field label="Default verified asset" value={`${asset.symbol} · ${asset.decimals} decimals`} />
            <Field label="Default A-Token" value={asset.aToken} mono />
            <Field label="Escrow binding" value={deployed.escrowAsset ? `${deployed.escrowAssetSymbol ?? 'token'} · ${deployed.escrowAsset}` : 'Not deployed'} mono />
            <Field label="Batch binding" value={deployed.batchAsset ? `${deployed.batchAssetSymbol ?? 'token'} · ${deployed.batchAsset}` : 'Not deployed'} mono />
            <Field label="Origin token" value={asset.originToken} mono />
            <Field label="A-Pass registry" value={CLEANVERSE_INFRA.apassRegistry} mono />
            <Field label="Access core" value={CLEANVERSE_INFRA.accessCore} mono />
          </div>
        </Panel>
        <section className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm dark:border-amber-900/50 dark:bg-[#101622]">
          <div className="flex items-center justify-between"><p className="text-sm font-semibold text-amber-950 dark:text-amber-200">Execution preflight</p><span className="rounded-full bg-amber-100 px-2 py-1 text-[9px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">GATED</span></div>
          <p className="mt-4 text-xs leading-5 text-slate-600">A configured network is not automatically executable. Before signing, Certus verifies the intent asset against the selected contract&apos;s live token binding, then runs identity, asset-rule, and policy checks.</p>
          <div className="mt-5 rounded-xl bg-slate-50 p-4 dark:bg-slate-950"><p className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-400">Current selection</p><p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-200">{network.label} · {asset.symbol}</p></div>
        </section>
      </div>
    </>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950"><p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</p><p className={`mt-2 break-all text-xs font-semibold text-slate-700 dark:text-slate-200 ${mono ? 'font-mono' : ''}`}>{value}</p></div>;
}
