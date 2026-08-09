'use client';

import { useCallback, useEffect, useState } from 'react';
import { encodeFunctionData, parseAbi } from 'viem';

declare global { interface Window { ethereum?: { request(args: { method: string; params?: unknown[] }): Promise<unknown> } } }

const TOKEN_ABI = parseAbi(['function approve(address spender, uint256 amount) returns (bool)']);
const VAULT_ABI = parseAbi(['function deposit(uint256 amount)', 'function withdraw() returns (uint256 principal, uint256 bonus)']);

export function StandaloneYieldPanel({ chain, chainId, chainName, rpcUrl, nativeSymbol, explorerUrl, token, vault, custodian, decimals }: { chain: string; chainId: number; chainName: string; rpcUrl: string; nativeSymbol: string; explorerUrl: string; token: string; vault?: string; custodian?: string; decimals: number }) {
  const [account, setAccount] = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState('');
  const [position, setPosition] = useState<{ principal: string; bonus: string; active: boolean; frozen: boolean } | null>(null);
  const [reserve, setReserve] = useState('0');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async (address: string) => {
    if (!address || !vault) return;
    const response = await fetch(`/api/yield/position?chain=${encodeURIComponent(chain)}&address=${encodeURIComponent(address)}`);
    if (!response.ok) return;
    const data = await response.json() as { reserve: string; position: { principal: string; bonus: string; active: boolean; frozen: boolean } };
    setReserve(data.reserve); setPosition(data.position);
  }, [chain, vault]);

  async function connect() {
    if (!window.ethereum) { setStatus('Install or unlock a browser wallet first.'); return; }
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' }) as string[];
    const next = accounts?.[0] ?? '';
    setAccount(next); await refresh(next); setStatus(next ? `Connected ${short(next)}.` : 'No account selected.');
  }

  async function deposit() {
    if (!window.ethereum || !vault || !account) { setStatus('Connect your wallet first.'); return; }
    setBusy(true); setStatus('Checking your active CVI/A-Pass…');
    try {
      const check = await fetch('/api/yield/check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chain, address: account }) });
      const checked = await check.json() as { eligible?: boolean; detail?: string; error?: string };
      if (!check.ok || !checked.eligible) throw new Error(checked.error ?? checked.detail ?? 'Wallet is not eligible for this deposit.');
      await switchNetwork({ chainId, chainName, rpcUrl, nativeSymbol, explorerUrl });
      const base = toBaseUnits(amount, decimals);
      const approvalAmount = base + (base * 500n) / 10_000n;
      setStatus('Approve aUSDC principal plus the bounded bonus cap in your wallet…');
      const approval = await window.ethereum.request({ method: 'eth_sendTransaction', params: [{ from: account, to: token, data: encodeFunctionData({ abi: TOKEN_ABI, functionName: 'approve', args: [vault as `0x${string}`, approvalAmount] }) }] }) as string;
      await waitForReceipt(approval);
      setStatus('Record the aUSDC position with the custodial pilot…');
      const depositTx = await window.ethereum.request({ method: 'eth_sendTransaction', params: [{ from: account, to: vault, data: encodeFunctionData({ abi: VAULT_ABI, functionName: 'deposit', args: [base] }) }] }) as string;
      await waitForReceipt(depositTx); await refresh(account); setStatus(`Deposited ${amount} aUSDC. Bonus accrues while the position remains valid.`);
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Deposit failed.'); } finally { setBusy(false); }
  }

  async function withdraw() {
    if (!window.ethereum || !vault || !account) { setStatus('Connect your wallet first.'); return; }
    setBusy(true); setStatus('Withdraw principal plus sponsored bonus?');
    try { await switchNetwork({ chainId, chainName, rpcUrl, nativeSymbol, explorerUrl }); const tx = await window.ethereum.request({ method: 'eth_sendTransaction', params: [{ from: account, to: vault, data: encodeFunctionData({ abi: VAULT_ABI, functionName: 'withdraw' }) }] }) as string; await waitForReceipt(tx); await refresh(account); setStatus(`Withdrawal confirmed. View transaction on ${explorerUrl}.`); } catch (error) { setStatus(error instanceof Error ? error.message : 'Withdrawal failed.'); } finally { setBusy(false); }
  }

  useEffect(() => { if (account) void refresh(account); }, [account, refresh]);
  return <section className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-5 dark:border-indigo-950 dark:bg-indigo-950/20"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-indigo-brand">Custodied sponsored pilot</p><h2 className="mt-2 text-lg font-semibold text-ink dark:text-white">Deposit aUSDC. Earn a sponsored bonus.</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600 dark:text-slate-300">Canonical aUSDC does not allow arbitrary contracts to hold it, so principal stays with the verified A-Pass custodian EOA. Certus records the position, re-checks eligibility, and pays a bounded testnet bonus on withdrawal.</p></div><span className="rounded-full bg-amber-100 px-3 py-1.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">SPONSORED · TESTNET</span></div><div className="mt-3 rounded-xl border border-indigo-100 bg-white/60 px-3 py-2 text-[10px] text-slate-600 dark:border-indigo-900 dark:bg-slate-900/50 dark:text-slate-300">Custodian: <span className="font-mono">{custodian ? short(custodian) : 'A-Pass deployer'}</span> · custodial pilot, not a trustless vault</div><div className="mt-5 grid gap-3 sm:grid-cols-3"><Metric label="Reserve available" value={`${formatBase(reserve, decimals)} aUSDC`}/><Metric label="Principal" value={position ? `${formatBase(position.principal, decimals)} aUSDC` : '—'}/><Metric label="Bonus preview" value={position ? `${formatBase(position.bonus, decimals)} aUSDC` : '—'}/></div>{position?.frozen&&<p className="mt-4 rounded-xl bg-amber-100 p-3 text-xs font-semibold text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">Position frozen: principal and bonus remain quarantined.</p>}<div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto_auto]"><input value={amount} onChange={event=>setAmount(event.target.value)} placeholder="Amount of aUSDC" className="rounded-xl border border-indigo-100 bg-white px-4 py-3 text-sm dark:border-indigo-900 dark:bg-slate-900"/><button onClick={connect} className="rounded-xl border border-indigo-200 px-4 py-3 text-xs font-semibold text-indigo-brand dark:border-indigo-800">{account ? short(account) : 'Connect wallet'}</button><button onClick={deposit} disabled={busy || !account || !amount || !vault} className="rounded-xl bg-indigo-brand px-4 py-3 text-xs font-semibold text-white disabled:opacity-40">{busy ? 'Waiting…' : 'Deposit aUSDC'}</button></div>{position?.active&&!position.frozen&&<button onClick={withdraw} disabled={busy} className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">Withdraw principal + sponsored bonus</button>}{status&&<p role="status" className="mt-4 rounded-xl bg-white/70 p-3 text-xs leading-5 text-slate-700 dark:bg-slate-900/60 dark:text-slate-200">{status}</p>}<p className="mt-4 text-[10px] leading-4 text-slate-500">This is not protocol-generated yield or an APY promise. The bonus is bounded and paid from the deployer-funded aUSDC balance.</p></section>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-indigo-100 bg-white/70 p-3 dark:border-indigo-900 dark:bg-slate-900/60"><p className="text-[10px] uppercase tracking-[.12em] text-slate-400">{label}</p><p className="mt-2 text-sm font-semibold text-ink dark:text-white">{value}</p></div>; }
function short(address: string) { return `${address.slice(0, 6)}…${address.slice(-4)}`; }
function toBaseUnits(value: string, decimals: number) { if (!/^\d+(\.\d+)?$/.test(value)) throw new Error('Enter a valid amount.'); const [whole, fraction = ''] = value.split('.'); if (fraction.length > decimals) throw new Error('Amount has too many decimals.'); return BigInt(whole + fraction.padEnd(decimals, '0')); }
function formatBase(value: string, decimals: number) { const n = BigInt(value); const divisor = 10n ** BigInt(decimals); const fraction = (n % divisor).toString().padStart(decimals, '0').replace(/0+$/, ''); return `${n / divisor}${fraction ? `.${fraction}` : ''}`; }
async function switchNetwork(args: { chainId: number; chainName: string; rpcUrl: string; nativeSymbol: string; explorerUrl: string }) { if (!window.ethereum) throw new Error('Wallet provider unavailable.'); const target = `0x${args.chainId.toString(16)}`; try { await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: target }] }); } catch { await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [{ chainId: target, chainName: args.chainName, nativeCurrency: { name: args.nativeSymbol, symbol: args.nativeSymbol, decimals: 18 }, rpcUrls: [args.rpcUrl], blockExplorerUrls: [args.explorerUrl] }] }); } }
async function waitForReceipt(hash: string) { if (!window.ethereum) throw new Error('Wallet provider unavailable.'); for (let i=0;i<120;i+=1) { const receipt = await window.ethereum.request({ method: 'eth_getTransactionReceipt', params: [hash] }) as { status?: string }|null; if (receipt) { if (receipt.status !== '0x1') throw new Error('Transaction reverted.'); return; } await new Promise(resolve=>setTimeout(resolve, 1500)); } throw new Error('Transaction confirmation timed out.'); }
