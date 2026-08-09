'use client';

import { useState } from 'react';
import { encodeFunctionData, keccak256, parseAbi, stringToHex } from 'viem';
import { ensureWalletChain } from '@/lib/wallet/network';

type Row = { recipient: string; amount: string };
type Props = { chain: string; label: string; asset: string; assetLabel: string; batch: string; decimals: number; chainId: number; rpcUrl: string; nativeSymbol: string; explorerUrl: string };
const TOKEN_ABI = parseAbi(['function approve(address spender, uint256 amount) returns (bool)']);
const BATCH_ABI = parseAbi(['function fundBatch(bytes32 batchId, address[] recipients, uint256[] amounts)']);

function units(value: string, decimals: number) {
  if (!/^\d+(\.\d+)?$/.test(value)) throw new Error('Enter valid payroll amounts.');
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > decimals) throw new Error(`Use at most ${decimals} decimals.`);
  const result = BigInt(whole + fraction.padEnd(decimals, '0'));
  if (result <= 0n) throw new Error('Amounts must be greater than zero.');
  return result;
}

export function BatchComposer(props: Props) {
  const [rows, setRows] = useState<Row[]>([{ recipient: '', amount: '' }, { recipient: '', amount: '' }]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const total = rows.reduce((sum, row) => { try { return sum + units(row.amount, props.decimals); } catch { return sum; } }, 0n);
  const update = (index: number, key: keyof Row, value: string) => setRows((current) => current.map((row, i) => i === index ? { ...row, [key]: value } : row));

  async function submit() {
    setBusy(true); setMessage('');
    try {
      if (!window.ethereum) throw new Error('Connect a browser wallet first.');
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' }) as string[];
      const sender = accounts?.[0]; if (!sender) throw new Error('No wallet account selected.');
      const parsed = rows.map((row) => ({ recipientCvi: row.recipient.trim().toLowerCase(), amount: units(row.amount, props.decimals) }));
      if (parsed.some((row) => !/^0x[0-9a-fA-F]{40}$/.test(row.recipientCvi))) throw new Error('Every employee wallet must be a valid 0x address.');
      await ensureWalletChain(window.ethereum, { chainId: props.chainId, chainName: props.label, rpcUrl: props.rpcUrl, nativeSymbol: props.nativeSymbol, explorerUrl: props.explorerUrl });
      setMessage('Creating payroll batch…');
      const createdResponse = await fetch('/api/batches', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chain: props.chain, senderCvi: sender, rows: parsed.map((row) => ({ recipientCvi: row.recipientCvi, amount: row.amount.toString() })), policyId: 'STANDARD' }) });
      const created = await createdResponse.json() as { intentId?: string; error?: string };
      if (!createdResponse.ok || !created.intentId) throw new Error(created.error ?? 'Unable to create payroll batch.');
      setMessage('Approve aUSDC, then fund the payroll contract…');
      const approval = await window.ethereum.request({ method: 'eth_sendTransaction', params: [{ from: sender, to: props.asset, data: encodeFunctionData({ abi: TOKEN_ABI, functionName: 'approve', args: [props.batch as `0x${string}`, total] }) }] }) as string;
      await waitForReceipt(approval);
      const fund = await window.ethereum.request({ method: 'eth_sendTransaction', params: [{ from: sender, to: props.batch, data: encodeFunctionData({ abi: BATCH_ABI, functionName: 'fundBatch', args: [keccak256(stringToHex(created.intentId)), parsed.map((row) => row.recipientCvi as `0x${string}`), parsed.map((row) => row.amount)] }) }] }) as string;
      await waitForReceipt(fund);
      const confirmation = await fetch(`/api/batches/${encodeURIComponent(created.intentId)}/fund`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ txHash: fund, sender }) });
      const confirmed = await confirmation.json() as { error?: string; explorerUrl?: string };
      if (!confirmation.ok) throw new Error(confirmed.error ?? 'Payroll funding could not be verified.');
      setMessage(`Payroll batch is live with ${rows.length} rows. ${confirmed.explorerUrl ?? ''}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to fund payroll batch.'); }
    finally { setBusy(false); }
  }

  return <section className="mb-6 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold text-ink dark:text-white">Register a payroll batch</p><p className="mt-1 max-w-xl text-xs leading-5 text-slate-500">Add employee wallets and amounts. One approval funds the live aUSDC batch; Certus then checks each row independently.</p></div><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">aUSDC · live</span></div><div className="mt-4 space-y-2">{rows.map((row, index) => <div key={index} className="grid gap-2 sm:grid-cols-[1fr_180px_auto]"><input value={row.recipient} onChange={(event) => update(index, 'recipient', event.target.value)} placeholder={`Employee ${index + 1} wallet · 0x…`} className="rounded-xl border border-slate-200 bg-transparent px-3 py-2.5 font-mono text-xs outline-none focus:ring-2 focus:ring-indigo-brand dark:border-slate-700"/><input value={row.amount} onChange={(event) => update(index, 'amount', event.target.value)} placeholder="Amount" inputMode="decimal" className="rounded-xl border border-slate-200 bg-transparent px-3 py-2.5 text-xs outline-none focus:ring-2 focus:ring-indigo-brand dark:border-slate-700"/>{rows.length > 1 && <button type="button" onClick={() => setRows((current) => current.filter((_, i) => i !== index))} className="rounded-xl border border-slate-200 px-3 text-xs text-slate-500 hover:border-red-200 hover:text-red-600 dark:border-slate-700">Remove</button>}</div>)}</div><div className="mt-4 flex flex-wrap items-center justify-between gap-3"><button type="button" onClick={() => setRows((current) => [...current, { recipient: '', amount: '' }])} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:border-indigo-300 dark:border-slate-700 dark:text-slate-200">+ Add employee</button><div className="flex items-center gap-4"><p className="text-xs text-slate-500">Total <span className="font-semibold text-ink dark:text-white">{formatUnits(total, props.decimals)} {props.assetLabel}</span></p><button type="button" disabled={busy} onClick={() => void submit()} className="rounded-xl bg-indigo-brand px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50">{busy ? 'Waiting for wallet…' : 'Fund payroll batch'}</button></div></div>{message && <p role="status" className="mt-4 rounded-xl bg-indigo-50 p-3 text-xs leading-5 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200">{message}</p>}</section>;
}

function formatUnits(value: bigint, decimals: number) { const divisor = 10n ** BigInt(decimals); const fraction = (value % divisor).toString().padStart(decimals, '0').replace(/0+$/, ''); return `${value / divisor}${fraction ? `.${fraction}` : ''}`; }
async function waitForReceipt(hash: string) { if (!window.ethereum) throw new Error('Wallet provider unavailable.'); for (let attempt = 0; attempt < 120; attempt += 1) { const receipt = await window.ethereum.request({ method: 'eth_getTransactionReceipt', params: [hash] }) as { status?: string } | null; if (receipt) { if (receipt.status !== '0x1') throw new Error(`Transaction ${hash.slice(0, 10)}… reverted.`); return; } await new Promise((resolve) => setTimeout(resolve, 1500)); } throw new Error(`Transaction ${hash.slice(0, 10)}… was not confirmed in time.`); }
