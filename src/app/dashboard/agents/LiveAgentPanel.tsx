'use client';

import { useEffect, useState } from 'react';
import { encodeFunctionData, keccak256, parseAbi, stringToHex } from 'viem';
import { ensureWalletChain } from '@/lib/wallet/network';

declare global { interface Window { ethereum?: { request(args: { method: string; params?: unknown[] }): Promise<unknown> }; } }

type Mandate = { id: string; name: string; principalAddress: string; agentAddress: string; status: string };
type Result = { agent?: { address?: string; requestId?: string }; proposal?: { recipientAddress: string; amount: string; chain: string }; intentId?: string; escrow?: string; execution?: string; decision?: { verdict: string; checks: Array<{ check: string; passed: boolean; detail: string }> }; fundingTxHash?: string; releaseTxHash?: string };

const TOKEN_ABI = parseAbi(['function approve(address spender, uint256 amount) returns (bool)']);
const ESCROW_ABI = parseAbi(['function fundIntent(bytes32 intentId, address[] recipients, uint256[] amounts)']);

export function LiveAgentPanel({ chain, symbol, tokenAddress, chainId, rpcUrl, nativeSymbol, explorerUrl }: { chain: string; symbol: string; tokenAddress: string; chainId: number; rpcUrl: string; nativeSymbol: string; explorerUrl: string }) {
  const [principal, setPrincipal] = useState('');
  const [mandates, setMandates] = useState<Mandate[]>([]);
  const [mandateId, setMandateId] = useState('');
  const [runnerAddress, setRunnerAddress] = useState('');
  const [task, setTask] = useState('Pay 0.50 aUSDC to 0x8FD349B2b66a03ce140c8E2e14Dc6c0e542D8384');
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => { void loadRunner(); }, []);

  async function loadRunner() {
    const response = await fetch('/api/agents/run', { cache: 'no-store' });
    const body = await response.json() as { configured?: boolean; agentAddress?: string };
    if (body.configured && body.agentAddress) setRunnerAddress(body.agentAddress);
  }

  async function connect(): Promise<string> {
    if (!window.ethereum) throw new Error('No browser wallet detected');
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' }) as string[];
    if (!accounts?.[0]) throw new Error('Connect the principal wallet first');
    const account = accounts[0];
    setPrincipal(account);
    const response = await fetch(`/api/agents?principal=${encodeURIComponent(account)}`, { cache: 'no-store' });
    if (response.ok) { const body = await response.json() as { mandates: Mandate[] }; setMandates(body.mandates); if (!mandateId && body.mandates[0]) setMandateId(body.mandates[0].id); }
    return account;
  }

  async function run() {
    setBusy(true); setMessage(''); setResult(null);
    try {
      const current = principal || await connect();
      if (!current) throw new Error('Connect the principal wallet first');
      if (!mandateId) throw new Error('Register a mandate for the live agent, then refresh mandates');
      const response = await fetch('/api/agents/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mandateId, task }) });
      const body = await response.json() as Result & { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Agent proposal failed');
      setResult(body); setMessage(`Signed by ${shorten(body.agent?.address ?? runnerAddress)}. Principal funding is still required.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Agent proposal failed'); }
    finally { setBusy(false); }
  }

  async function fund() {
    if (!result?.intentId || !result.escrow || !result.proposal) return;
    setBusy(true); setMessage('');
    try {
      const account = principal || await connect();
      if (!window.ethereum || !account) throw new Error('Connect the principal wallet first');
      await ensureWalletChain(window.ethereum, { chainId, chainName: 'Monad Testnet', rpcUrl, nativeSymbol, explorerUrl });
      const value = BigInt(result.proposal.amount);
      const approval = await window.ethereum.request({ method: 'eth_sendTransaction', params: [{ from: account, to: tokenAddress, data: encodeFunctionData({ abi: TOKEN_ABI, functionName: 'approve', args: [result.escrow as `0x${string}`, value] }) }] }) as string;
      await waitForReceipt(approval);
      const funding = await window.ethereum.request({ method: 'eth_sendTransaction', params: [{ from: account, to: result.escrow, data: encodeFunctionData({ abi: ESCROW_ABI, functionName: 'fundIntent', args: [keccak256(stringToHex(result.intentId)), [result.proposal.recipientAddress as `0x${string}`], [value]] }) }] }) as string;
      await waitForReceipt(funding);
      const confirm = await fetch(`/api/intents/${encodeURIComponent(result.intentId)}/fund`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ txHash: funding, sender: account }) });
      const body = await confirm.json() as { error?: string };
      if (!confirm.ok) throw new Error(body.error ?? 'Funding could not be verified');
      setResult({ ...result, execution: 'FUNDED_AWAITING_RELEASE', fundingTxHash: funding }); setMessage('Principal funding verified. Run the final compliance-gated release.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Funding failed'); }
    finally { setBusy(false); }
  }

  async function release() {
    if (!result?.intentId || !result.proposal) return;
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/release', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ intentId: result.intentId, legSequence: 1, chain: result.proposal.chain }) });
      const body = await response.json() as { settled?: boolean; txHash?: string; error?: string; detail?: string; reason?: string };
      if (!response.ok || !body.settled) throw new Error(body.error ?? body.reason ?? body.detail ?? 'Release was blocked');
      setResult({ ...result, execution: 'RELEASED', releaseTxHash: body.txHash }); setMessage('Released after a fresh compliance check and recorded in the audit trail.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Release failed'); }
    finally { setBusy(false); }
  }

  return <section className="mb-6 rounded-3xl border border-indigo-200 bg-indigo-50/50 p-6 shadow-sm dark:border-indigo-950 dark:bg-indigo-950/20 sm:p-7"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-indigo-brand">Real agent runner</p><h2 className="mt-2 text-xl font-semibold text-ink dark:text-white">Give the agent a task</h2><p className="mt-2 max-w-2xl text-xs leading-5 text-slate-600 dark:text-slate-300">A server-side agent identity parses the task, signs its proposal, and calls the same policy gate as every payment. It never receives the principal’s private key.</p></div><span className={`rounded-full px-3 py-1.5 text-[10px] font-bold ${runnerAddress ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'}`}>{runnerAddress ? 'RUNTIME READY' : 'RUNTIME NOT CONFIGURED'}</span></div><div className="mt-5 grid gap-4 lg:grid-cols-[.8fr_1fr]"><div className="space-y-3"><button type="button" onClick={() => void connect()} className="w-full rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-left text-[10px] font-semibold text-indigo-brand dark:border-indigo-900 dark:bg-slate-900">{principal ? `Principal · ${shorten(principal)}` : 'Connect principal wallet'}</button><div className="flex gap-2"><select value={mandateId} onChange={(e) => setMandateId(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-indigo-200 bg-white px-3 py-2.5 text-xs dark:border-indigo-900 dark:bg-slate-900"><option value="">Select live-agent mandate</option>{mandates.map((mandate) => <option key={mandate.id} value={mandate.id}>{mandate.name} · {shorten(mandate.agentAddress)}</option>)}</select><button type="button" onClick={() => void connect()} className="rounded-xl border border-indigo-200 px-3 text-[10px] font-semibold text-indigo-brand dark:border-indigo-900">Refresh</button></div><p className="text-[10px] leading-4 text-slate-500">{runnerAddress ? `Configured identity: ${runnerAddress}` : 'Set CERTUS_AGENT_PRIVATE_KEY to enable the runtime.'}</p></div><div><textarea value={task} onChange={(e) => setTask(e.target.value)} className="min-h-24 w-full rounded-xl border border-indigo-200 bg-white px-3 py-3 text-xs text-ink outline-none focus:ring-2 focus:ring-indigo-brand dark:border-indigo-900 dark:bg-slate-900 dark:text-white" placeholder="Pay 0.50 aUSDC to 0x…" /><button type="button" onClick={() => void run()} disabled={busy || !runnerAddress} className="mt-3 w-full rounded-xl bg-indigo-brand px-4 py-2.5 text-[10px] font-semibold text-white disabled:opacity-50">{busy ? 'Agent is working…' : 'Ask agent to propose payment'}</button></div></div>{result && <div className="mt-5 rounded-2xl bg-white p-4 dark:bg-slate-900"><div className="flex items-center justify-between"><span className={`text-2xl font-semibold ${result.decision?.verdict === 'PASS' ? 'text-emerald-600' : 'text-red-600'}`}>{result.decision?.verdict}</span><span className="text-[10px] font-semibold text-slate-400">{result.execution?.replaceAll('_', ' ')}</span></div><p className="mt-2 font-mono text-[10px] text-slate-500">Intent {result.intentId}</p>{result.execution === 'AWAITING_PRINCIPAL_FUNDING' && <button type="button" onClick={() => void fund()} disabled={busy} className="mt-3 w-full rounded-xl bg-indigo-brand px-4 py-2.5 text-[10px] font-semibold text-white disabled:opacity-50">Fund scoped agent payment</button>}{result.execution === 'FUNDED_AWAITING_RELEASE' && <button type="button" onClick={() => void release()} disabled={busy} className="mt-3 w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-[10px] font-semibold text-white disabled:opacity-50">Release after compliance check</button>}{result.fundingTxHash && <p className="mt-2 break-all text-[9px] text-slate-400">Funding tx: {result.fundingTxHash}</p>}{result.releaseTxHash && <p className="mt-2 break-all text-[9px] text-emerald-600">Release tx: {result.releaseTxHash}</p>}</div>}{message && <p role="status" className="mt-4 rounded-xl border border-indigo-200 bg-white px-3 py-2 text-[11px] leading-5 text-indigo-900 dark:border-indigo-900 dark:bg-slate-900 dark:text-indigo-200">{message}</p>}</section>;
}

function shorten(address: string) { return `${address.slice(0, 6)}…${address.slice(-4)}`; }
async function waitForReceipt(hash: string) { if (!window.ethereum) throw new Error('Wallet provider unavailable'); for (let attempt = 0; attempt < 120; attempt += 1) { const receipt = await window.ethereum.request({ method: 'eth_getTransactionReceipt', params: [hash] }) as { status?: string } | null; if (receipt) { if (receipt.status !== '0x1') throw new Error('Transaction reverted'); return; } await new Promise((resolve) => setTimeout(resolve, 1500)); } throw new Error('Transaction confirmation timed out'); }
