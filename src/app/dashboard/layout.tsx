import { Suspense } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { defaultChain } from '@/lib/chain/config';
import { chainOptions } from '@/lib/chain/selection';
import { ThemeToggle } from '@/app/components/ThemeToggle';
import { DashboardNav } from './DashboardNav';
import { ChainSelector } from './ChainSelector';
import { WalletButton } from './WalletButton';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const options = chainOptions();

  return (
    <div className="min-h-screen bg-transparent lg:grid lg:grid-cols-[268px_minmax(0,1fr)]">
      <aside className="hidden min-h-screen border-r border-slate-200/80 bg-[#fbfcfe] dark:border-slate-800 dark:bg-[#0a0e17] lg:flex lg:flex-col">
        <Link href="/dashboard" className="flex h-[76px] items-center gap-3 border-b border-slate-200/70 px-6 dark:border-slate-800">
          <Image src="/certus-mark.svg" width={36} height={36} alt="Certus" priority />
          <div>
            <div className="text-[16px] font-bold tracking-tight text-ink dark:text-white">Certus</div>
            <div className="mt-0.5 text-[10px] font-medium uppercase tracking-[.14em] text-slate-400">Value, verified</div>
          </div>
        </Link>

        <div className="flex-1 px-4 py-7">
          <p className="px-3 text-[10px] font-bold uppercase tracking-[.18em] text-slate-400">Workspace</p>
          <DashboardNav />
        </div>

        <div className="m-4 rounded-2xl border border-emerald-200/80 bg-emerald-50/80 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/30">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>
            <span className="text-[11px] font-semibold text-emerald-900 dark:text-emerald-200">Protection is active</span>
          </div>
          <p className="mt-2 text-[10px] leading-4 text-emerald-800/75 dark:text-emerald-300/70">Every payment is checked before value moves.</p>
        </div>
      </aside>

      <main className="min-w-0">
        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-[#f8f9fc]/90 backdrop-blur-xl dark:border-slate-800 dark:bg-[#0a0e17]/90">
          <div className="flex h-[76px] items-center justify-between px-5 lg:px-9">
            <div className="flex items-center gap-3 lg:hidden">
              <Image src="/certus-mark.svg" width={31} height={31} alt="Certus" />
              <span className="text-sm font-bold text-ink dark:text-white">Certus</span>
            </div>
            <div className="hidden lg:block">
              <p className="text-[15px] font-semibold tracking-tight text-ink dark:text-white">Verified settlement</p>
              <p className="mt-0.5 text-[11px] text-slate-500">Send value with a fresh authorization check.</p>
            </div>
            <div className="flex items-center gap-2">
              <Suspense fallback={<div className="h-9 w-36 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />}>
                <ChainSelector chains={options} fallback={defaultChain()} />
              </Suspense>
              <ThemeToggle />
              <WalletButton />
              <span className="hidden items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300 sm:inline-flex">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span>Monad testnet</span>
              </span>
            </div>
          </div>
          <div className="overflow-x-auto border-t border-slate-100 px-4 py-2 dark:border-slate-800 lg:hidden"><DashboardNav /></div>
        </header>
        <div className="mx-auto max-w-[1480px] px-5 py-8 lg:px-9 lg:py-10">{children}</div>
      </main>
    </div>
  );
}
