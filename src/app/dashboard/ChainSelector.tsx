'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export function ChainSelector({chains,fallback}:{chains:{key:string;label:string;symbol:string}[];fallback:string}){
  const router=useRouter(); const pathname=usePathname(); const params=useSearchParams();
  const globalView=['/dashboard/audit','/dashboard/counterparties','/dashboard/policies','/dashboard/agents'].includes(pathname);
  const selected=params.get('chain')??fallback;
  function change(chain:string){const next=new URLSearchParams(params.toString());next.set('chain',chain);router.replace(`${pathname}?${next.toString()}`)}
  if(globalView)return <span className="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">All networks</span>;
  return <label className="relative"><span className="sr-only">Network</span><select value={selected} onChange={event=>change(event.target.value)} className="h-9 appearance-none rounded-xl border border-slate-200 bg-white pl-3 pr-8 text-[11px] font-semibold text-slate-700 shadow-sm outline-none transition hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">{chains.map(chain=><option key={chain.key} value={chain.key}>{chain.label} · {chain.symbol}</option>)}</select><span className="pointer-events-none absolute right-3 top-2.5 text-[10px] text-slate-400">⌄</span></label>;
}
