'use client';

import { useEffect, useState } from 'react';

function shorten(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function WalletButton() {
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    void window.ethereum?.request({ method: 'eth_accounts' }).then((accounts) => {
      const first = Array.isArray(accounts) ? accounts[0] : undefined;
      if (active && typeof first === 'string') setAddress(first);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  async function connect() {
    setBusy(true);
    setMessage('');
    try {
      if (!window.ethereum) {
        setMessage('No browser wallet detected');
        return;
      }
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const first = Array.isArray(accounts) ? accounts[0] : undefined;
      if (typeof first !== 'string') throw new Error('No account returned');
      setAddress(first);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Wallet connection was cancelled');
    } finally {
      setBusy(false);
    }
  }

  if (address) {
    return <button type="button" onClick={connect} title={address} className="inline-flex h-9 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-[11px] font-semibold text-emerald-800 shadow-sm transition hover:border-emerald-300 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{shorten(address)}</button>;
  }

  return <div className="relative"><button type="button" onClick={connect} disabled={busy} className="inline-flex h-9 items-center gap-2 rounded-xl bg-ink px-3.5 text-[11px] font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-wait disabled:opacity-70 dark:bg-indigo-brand dark:hover:bg-indigo-500"><WalletIcon />{busy ? 'Connecting…' : 'Connect wallet'}</button>{message && <span role="status" className="absolute right-0 top-11 z-30 w-48 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-medium leading-4 text-amber-800 shadow-lg dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">{message}</span>}</div>;
}

function WalletIcon() {
  return <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current" aria-hidden="true"><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H19a1 1 0 0 1 1 1v2H6.5A2.5 2.5 0 0 0 4 10.5v6A2.5 2.5 0 0 0 6.5 19H20v-8H6.5A2.5 2.5 0 0 1 4 8.5z" /><path d="M16 14h.01" /></svg>;
}
