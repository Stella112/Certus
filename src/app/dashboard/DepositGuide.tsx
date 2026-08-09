'use client';

import { useState } from 'react';
import { encodeFunctionData, parseAbi } from 'viem';

const BALANCE_ABI = parseAbi(['function balanceOf(address) view returns (uint256)']);

export function DepositGuide({ chain, chainId, assetAddress }: { chain: string; chainId: number; assetAddress: string }) {
  const [wallet, setWallet] = useState('');
  const [deposit, setDeposit] = useState('');
  const [balance, setBalance] = useState('');
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState('');

  async function connect() {
    if (!window.ethereum) throw new Error('Install a browser wallet first.');
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' }) as unknown;
    const address = Array.isArray(accounts) && typeof accounts[0] === 'string' ? accounts[0] : '';
    if (!address) throw new Error('No wallet account returned.');
    setWallet(address);
    setStep((current) => Math.max(current, 2));
    return address;
  }

  async function resolve() {
    setBusy(true); setMessage('');
    try {
      const address = wallet || await connect();
      const response = await fetch('/api/deposit-address', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chain, address }) });
      const data = await response.json() as { depositUSDCWallet?: string; error?: string };
      if (!response.ok || !data.depositUSDCWallet) throw new Error(data.error ?? 'Cleanverse could not find a deposit address.');
      setDeposit(data.depositUSDCWallet);
      setStep(3);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to resolve deposit address.'); }
    finally { setBusy(false); }
  }

  async function copyDeposit() {
    if (!deposit) return;
    await navigator.clipboard?.writeText(deposit);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function verifyBalance() {
    setBusy(true); setMessage('');
    try {
      const address = wallet || await connect();
      let units: bigint;
      try {
        const response = await fetch(`/api/balance?chain=${encodeURIComponent(chain)}&address=${encodeURIComponent(address)}`, { cache: 'no-store' });
        const data = await response.json() as { units?: string; error?: string };
        if (!response.ok || !data.units) throw new Error(data.error ?? 'Canonical balance read failed');
        units = BigInt(data.units);
      } catch {
        // Keep a wallet-provider fallback for local chains and offline demos.
        if (!window.ethereum) throw new Error('Could not read the settlement balance.');
        const callData = encodeFunctionData({ abi: BALANCE_ABI, functionName: 'balanceOf', args: [address as `0x${string}`] });
        const raw = await window.ethereum.request({ method: 'eth_call', params: [{ to: assetAddress, data: callData }, 'latest'] }) as string;
        units = BigInt(raw);
      }
      const formatted = `${(Number(units) / 1_000_000).toFixed(6).replace(/\.?(0+)$|\.$/, '') || '0'} aUSDC`;
      setBalance(formatted);
      setStep(4);
      if (units === 0n) setMessage('No aUSDC detected yet. Give the faucet route a moment, then check again.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not read your aUSDC balance.'); }
    finally { setBusy(false); }
  }

  return <section className="mb-7 rounded-3xl border border-indigo-100 bg-white p-6 shadow-[0_10px_35px_rgba(48,55,120,.05)] dark:border-indigo-950/70 dark:bg-slate-900"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-indigo-brand">Quick start</p><h2 className="mt-2 text-xl font-semibold text-ink dark:text-white">Get ready to make your first payment</h2><p className="mt-2 max-w-xl text-xs leading-5 text-slate-500">Connect your wallet, get a personal deposit address, and use the Monad faucet. Certus will check when aUSDC reaches you.</p></div><span className="rounded-full bg-indigo-50 px-3 py-1.5 text-[10px] font-bold text-indigo-brand dark:bg-indigo-950/50 dark:text-indigo-300">{chain} · 4 steps</span></div>
    <div className="mt-6 grid gap-3 sm:grid-cols-4">{[['Connect','Use your wallet',1],['Deposit address','Generated for you',2],['Fund','Use Circle faucet',3],['Ready','Balance confirmed',4]].map(([title, body, index]) => <div key={String(index)} className={`rounded-2xl border p-4 ${step >= Number(index) ? 'border-indigo-200 bg-indigo-50/70 dark:border-indigo-900 dark:bg-indigo-950/30' : 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50'}`}><span className={`grid h-7 w-7 place-items-center rounded-lg text-[10px] font-bold ${step >= Number(index) ? 'bg-indigo-brand text-white' : 'bg-white text-slate-400 dark:bg-slate-700'}`}>{Number(index)}</span><p className="mt-3 text-xs font-semibold text-ink dark:text-white">{title}</p><p className="mt-1 text-[10px] leading-4 text-slate-500">{body}</p></div>)}</div>
    <div className="mt-5 flex flex-wrap gap-3">{!wallet ? <button type="button" onClick={() => void connect().catch((error) => setMessage(error instanceof Error ? error.message : 'Wallet connection failed.'))} className="rounded-xl bg-indigo-brand px-4 py-3 text-xs font-semibold text-white">1. Connect wallet</button> : <span className="rounded-xl bg-emerald-50 px-4 py-3 font-mono text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">Connected · {wallet.slice(0, 6)}…{wallet.slice(-4)}</span>}{wallet && !deposit && <button type="button" onClick={() => void resolve()} disabled={busy} className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-xs font-semibold text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-300">{busy ? 'Finding address…' : '2. Get my deposit address'}</button>}</div>
    {deposit && <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/30"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><p className="text-[10px] font-bold uppercase tracking-[.14em] text-emerald-700 dark:text-emerald-300">3. Send Monad USDC here</p><p className="mt-2 break-all font-mono text-xs font-semibold text-emerald-950 dark:text-emerald-100">{deposit}</p></div><button type="button" onClick={() => void copyDeposit()} className="shrink-0 rounded-lg bg-emerald-600 px-3 py-2 text-[10px] font-bold text-white">{copied ? 'Copied' : 'Copy address'}</button></div><div className="mt-3 flex flex-wrap items-center gap-3"><a href="https://faucet.circle.com" target="_blank" rel="noreferrer" className="rounded-lg bg-emerald-600 px-3 py-2 text-[10px] font-bold text-white">Open Circle Faucet ↗</a><span className="text-[10px] leading-4 text-emerald-800 dark:text-emerald-300">Choose Monad testnet → USDC → paste the address above.</span></div><button type="button" onClick={() => void verifyBalance()} disabled={busy} className="mt-4 rounded-lg border border-emerald-300 px-3 py-2 text-[10px] font-bold text-emerald-800 dark:border-emerald-800 dark:text-emerald-300">{busy ? 'Checking…' : '4. Check my aUSDC balance'}</button></div>}
    {balance && <p className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">Balance detected: {balance}</p>}{message && <div role="status" className="mt-4 rounded-xl bg-amber-50 px-3 py-3 text-xs leading-5 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200"><p>{message}</p>{/deposit wallet|identity|A-Pass|not registered/i.test(message) && <p className="mt-2 font-semibold">This wallet needs a Cleanverse A‑Pass on {chain} before Certus can generate its deposit address.</p>}</div>}<p className="mt-4 text-[10px] leading-4 text-slate-400">Your wallet must be on chain ID {chainId}. Active aUSDC: <span className="font-mono">{assetAddress}</span></p>
  </section>;
}
