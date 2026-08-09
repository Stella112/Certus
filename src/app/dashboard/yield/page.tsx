import Link from 'next/link';
import { parseAbi } from 'viem';
import { prisma } from '@/lib/db';
import { chainConfig, defaultChain, deployment, formatAmount, addressUrl } from '@/lib/chain/config';
import { onChainIntentId } from '@/lib/settlement/release';
import { publicClient } from '@/lib/chain/escrow';
import { PageTitle, EmptyState, Panel, StatCard } from '../components';
import { StandaloneYieldPanel } from './StandaloneYieldPanel';

const VAULT_ABI = parseAbi(['function positionOf(bytes32) view returns (uint256 principal, uint256 accruedYield, uint256 lastAccrualBlock, bool active, bool frozen)']);

type Position = { principal: bigint; accruedYield: bigint; active: boolean; frozen: boolean };

export default async function YieldPage() {
  const chain = defaultChain();
  const config = chainConfig(chain);
  const deployed = deployment(chain);
  const intents = await prisma.intent.findMany({ where: { chain, yieldMode: true }, include: { legs: true }, orderBy: { createdAt: 'desc' }, take: 50 });
  const positions = new Map<string, Position>();
  if (deployed.yieldVault) {
    const client = publicClient(chain);
    await Promise.all(intents.filter((intent) => intent.status !== 'DRAFT').map(async (intent) => {
      try {
        const [principal, accruedYield, , active, frozen] = await client.readContract({ address: deployed.yieldVault as `0x${string}`, abi: VAULT_ABI, functionName: 'positionOf', args: [onChainIntentId(intent.id)] });
        positions.set(intent.id, { principal, accruedYield, active, frozen });
      } catch { /* A draft or legacy record may not exist in the demo vault yet. */ }
    }));
  }
  const totalPrincipal = [...positions.values()].reduce((sum, position) => sum + position.principal, 0n);
  const totalYield = [...positions.values()].reduce((sum, position) => sum + position.accruedYield, 0n);
  return <>
    <PageTitle eyebrow="Optional capital protection" title="Yield protection" description="Deposit aUSDC into the custodial testnet pilot, accrue a bounded sponsor bonus, and withdraw only while your A-Pass remains eligible. Milestone-linked accounting remains below as historical evidence." action={<Link href="/dashboard/escrow" className="rounded-xl bg-indigo-brand px-4 py-3 text-xs font-semibold text-white">View milestone escrow</Link>} />
    <section className="mb-5 grid gap-3 sm:grid-cols-3"><StatCard label="Protected intents" value={intents.length} detail="Legacy escrow evidence" tone="indigo"/><StatCard label="Principal tracked" value={`${formatAmount(totalPrincipal, chain)} aUSDC`} detail="Historical escrow positions"/><StatCard label="Accrued accounting yield" value={`${formatAmount(totalYield, chain)} aUSDC`} detail="Fixed-rate demo accounting · not APY" tone="green"/></section>
    <StandaloneYieldPanel chain={chain} chainId={config.chainId} chainName={config.label} rpcUrl={config.rpcUrl} nativeSymbol={config.nativeSymbol} explorerUrl={config.explorerUrl} token={config.aToken} vault={deployed.sponsoredYieldVault} custodian={deployed.sponsoredYieldCustodian} decimals={config.decimals} />
    <div className="mb-6 mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"><strong>Product boundary:</strong> this is a custodial, deployer-sponsored testnet bonus. The deployer EOA is A-Pass verified and holds principal; no protocol-generated yield or production APY is promised. A trustless vault requires Cleanverse to authorize a contract asset route.</div>
    <section className="mb-6 grid gap-4 lg:grid-cols-[1.35fr_.65fr]"><Panel title="Live testnet configuration" subtitle="Transparent contracts, no production yield promise"><div className="space-y-4 p-5 text-xs"><Row label="Custodied pilot" value={deployed.sponsoredYieldVault} href={deployed.sponsoredYieldVault ? addressUrl(deployed.sponsoredYieldVault, chain) : undefined} /><Row label="A-Pass custodian" value={deployed.sponsoredYieldCustodian} href={deployed.sponsoredYieldCustodian ? addressUrl(deployed.sponsoredYieldCustodian, chain) : undefined} /><Row label="Asset" value={config.aToken} href={addressUrl(config.aToken, chain)} /><div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-5 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"><strong>Honest boundary:</strong> canonical aUSDC rejects arbitrary contract holders, so principal remains with the verified custodian EOA. The pilot records positions and pays a bounded sponsor bonus; it is custodial, testnet-only, and not APY.</div></div></Panel><Panel title="How quarantine works" subtitle="Trust remains the release condition"><div className="space-y-3 p-5 text-xs text-slate-600 dark:text-slate-300"><Step n="01" title="Deposit after a fresh check" body="The wallet approves aUSDC and the pilot records principal against the A-Pass custodian."/><Step n="02" title="Bonus accrues while valid" body="The bounded sponsor bonus is computed on-chain while the position remains active."/><Step n="03" title="Failure stops payout" body="A freeze halts accrual; principal and accrued bonus remain held for compliance review."/></div></Panel></section>
    <Panel title="Yield-protected intent register" subtitle="Every row shows principal, accrued yield, status, and evidence">{intents.length === 0 ? <EmptyState title="No yield-protected intents yet" body="Open Send payment, choose aUSDC, and enable the optional Yield-protected escrow toggle."/> : <div className="divide-y divide-slate-100 dark:divide-slate-800">{intents.map((intent) => { const position = positions.get(intent.id); const held = position?.frozen || intent.status === 'FROZEN' || intent.status === 'REJECTED'; return <article key={intent.id} className="grid gap-4 px-5 py-5 sm:px-6 lg:grid-cols-[1.3fr_1fr_1fr_170px]"><div><div className="flex flex-wrap items-center gap-2"><p className="font-mono text-xs font-semibold">{intent.id}</p><span className="rounded-full bg-amber-100 px-2 py-1 text-[9px] font-bold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">TESTNET VAULT</span></div><p className="mt-2 text-[10px] text-slate-500">{intent.status} · {intent.legs.length} milestone{intent.legs.length === 1 ? '' : 's'}</p>{held&&<p className="mt-1 text-[10px] font-semibold text-amber-700 dark:text-amber-300">Held · principal + yield quarantined</p>}</div><Metric label="Principal" value={position ? `${formatAmount(position.principal, chain)} aUSDC` : 'Awaiting funding'}/><Metric label="Accrued yield" value={position ? `${formatAmount(position.accruedYield, chain)} aUSDC` : '—'}/><div className="flex flex-col items-start gap-2"><span className={`rounded-full px-2 py-1 text-[9px] font-bold ${held ? 'bg-amber-50 text-amber-700' : position?.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{held ? 'QUARANTINED' : position?.active ? 'ACCRUING' : 'PENDING'}</span><Link className="text-[10px] font-semibold text-indigo-brand" href={`/dashboard/audit?intent=${encodeURIComponent(intent.id)}`}>View audit evidence</Link></div></article>; })}</div>}</Panel>
    <p className="mt-5 text-[11px] leading-5 text-slate-500">Cross-chain note: this vault is configured only for the Monad aUSDC deployment. Other chains have independent registries and do not inherit this position or its identity decision.</p>
  </>;
}

function Row({ label, value, href }: { label: string; value?: string; href?: string }) { return <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-slate-500">{label}</span>{value ? href ? <a className="font-mono text-[10px] text-indigo-brand" href={href} target="_blank" rel="noreferrer">{value}</a> : <span className="font-mono text-[10px] text-slate-700 dark:text-slate-200">{value}</span> : <span className="text-amber-600">Not configured</span>}</div>; }
function Metric({ label, value }: { label: string; value: string }) { return <div><p className="text-[10px] uppercase tracking-[.12em] text-slate-400">{label}</p><p className="mt-2 text-sm font-semibold text-ink dark:text-white">{value}</p></div>; }
function Step({ n, title, body }: { n: string; title: string; body: string }) { return <div className="flex gap-3"><span className="text-[10px] font-bold text-indigo-brand">{n}</span><div><p className="font-semibold text-ink dark:text-white">{title}</p><p className="mt-1 leading-5">{body}</p></div></div>; }
