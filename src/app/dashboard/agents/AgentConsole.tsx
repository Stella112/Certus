'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { encodeFunctionData, keccak256, parseAbi, stringToHex } from 'viem';
import { mandateMessage } from '@/lib/agents/mandate';
import { ensureWalletChain } from '@/lib/wallet/network';

declare global { interface Window { ethereum?: { request(args: { method: string; params?: unknown[] }): Promise<unknown> }; } }

type Mandate = { id: string; name: string; principalAddress: string; agentAddress: string; policyId: string; perTransactionLimit: string; dailyLimit: string; expiresAt: string | null; status: string };
type Check = { check: string; passed: boolean; detail: string };
type Result = { agentName: string; mandateId?: string; principalAddress: string; recipientAddress: string; amount: string; chain: string; intentId?: string; escrow?: string; execution: string; fundingTxHash?: string; releaseTxHash?: string; decision: { verdict: string; detail?: string; reason?: string; checks: Check[] } };

const UNVERIFIED = '0x00000000000000000000000000000000deadbeef';
const TOKEN_ABI = parseAbi(['function approve(address spender, uint256 amount) returns (bool)']);
const ESCROW_FUND_ABI = parseAbi(['function fundIntent(bytes32 intentId, address[] recipients, uint256[] amounts)']);

export function AgentConsole({ chain, symbol, tokenAddress, chainId, rpcUrl, nativeSymbol, explorerUrl }: { chain: string; symbol: string; tokenAddress: string; chainId: number; rpcUrl: string; nativeSymbol: string; explorerUrl: string }) {
  const [principalAddress, setPrincipalAddress] = useState('');
  const [mandates, setMandates] = useState<Mandate[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [name, setName] = useState('Treasury agent');
  const [agentAddress, setAgentAddress] = useState('');
  const [policyId, setPolicyId] = useState('STANDARD');
  const [perTransaction, setPerTransaction] = useState('5000');
  const [dailyLimit, setDailyLimit] = useState('20000');
  const [expiryDays, setExpiryDays] = useState('30');
  const [recipientAddress, setRecipientAddress] = useState('');
  const [amount, setAmount] = useState('100');
  const [task, setTask] = useState('Pay 0.50 aUSDC to 0x8FD349B2b66a03ce140c8E2e14Dc6c0e542D8384');
  const [runnerAddress, setRunnerAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [runnerBusy, setRunnerBusy] = useState(false);
  const [fundBusy, setFundBusy] = useState(false);
  const [releaseBusy, setReleaseBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => { void connect(false); void loadRunner(); }, []);

  async function loadRunner() {
    const response = await fetch('/api/agents/run', { cache: 'no-store' });
    if (!response.ok) return;
    const body = await response.json() as { configured?: boolean; agentAddress?: string };
    if (body.configured && body.agentAddress) { setRunnerAddress(body.agentAddress); setAgentAddress((current) => current || body.agentAddress!); }
  }

  async function connect(request: boolean): Promise<string | null> {
    try {
      if (!window.ethereum) { if (request) setError('No browser wallet detected'); return null; }
      const accounts = await window.ethereum.request({ method: request ? 'eth_requestAccounts' : 'eth_accounts' });
      const first = Array.isArray(accounts) ? accounts[0] : undefined;
      if (typeof first !== 'string') { if (request) setError('Connect the principal wallet first'); return null; }
      setPrincipalAddress(first);
      const response = await fetch(`/api/agents?principal=${encodeURIComponent(first)}`, { cache: 'no-store' });
      if (response.ok) { const body = await response.json() as { mandates: Mandate[] }; setMandates(body.mandates); if (!selectedId && body.mandates[0]) setSelectedId(body.mandates[0].id); }
      return first;
    } catch (err) { if (request) setError(err instanceof Error ? err.message : 'Wallet connection failed'); return null; }
  }

  async function register() {
    setBusy(true); setError(''); setNotice('');
    try {
      const connectedPrincipal = await connect(true);
      const principal = connectedPrincipal ?? principalAddress;
      if (!window.ethereum || !principal) throw new Error('Connect the principal wallet first, then register again');
      if (!agentAddress.match(/^0x[0-9a-fA-F]{40}$/)) throw new Error('Enter the agent wallet address');
      const perTransactionLimit = toBaseUnits(perTransaction); const dailyLimitBase = toBaseUnits(dailyLimit);
      const expiresAt = expiryDays.trim() ? new Date(Date.now() + Number(expiryDays) * 86_400_000).toISOString() : null;
      const message = mandateMessage({ name, principalAddress: principal, agentAddress, chain, policyId, perTransactionLimit, dailyLimit: dailyLimitBase, expiresAt: expiresAt ?? 'never' });
      const signature = await window.ethereum.request({ method: 'personal_sign', params: [stringToHex(message), principal] }) as string;
      const response = await fetch('/api/agents', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, principalAddress: principal, agentAddress, chain, policyId, perTransactionLimit, dailyLimit: dailyLimitBase, expiresAt, signature }) });
      const body = await response.json() as { mandate?: Mandate; error?: string };
      if (!response.ok || !body.mandate) throw new Error(body.error ?? 'Registration failed');
      setMandates((current) => [body.mandate!, ...current]); setSelectedId(body.mandate.id); setNotice('Agent registered. Its mandate is active.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Registration failed'); }
    finally { setBusy(false); }
  }

  async function runRequest() {
    setBusy(true); setError(''); setNotice(''); setResult(null);
    try {
      if (!selectedId) throw new Error('Register or select an agent mandate first');
      const response = await fetch('/api/agents/decide', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mandateId: selectedId, principalAddress, recipientAddress, amount: toBaseUnits(amount), chain }) });
      const body = await response.json() as Result & { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Agent request was rejected');
      setResult(body);
    } catch (err) { setError(err instanceof Error ? err.message : 'Agent request failed'); }
    finally { setBusy(false); }
  }

  async function runLiveAgent() {
    setRunnerBusy(true); setError(''); setNotice(''); setResult(null);
    try {
      if (!selectedId) throw new Error('Register a mandate for the configured agent first');
      const response = await fetch('/api/agents/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mandateId: selectedId, task }) });
      const body = await response.json() as Result & { error?: string; agent?: { address: string; requestId: string } };
      if (!response.ok) throw new Error(body.error ?? 'Agent runtime could not propose this payment');
      setResult(body); setNotice(`Live agent proposal signed by ${shorten(body.agent?.address ?? runnerAddress)}. It cannot fund or release principal funds.`);
    } catch (err) { setError(err instanceof Error ? err.message : 'Agent runtime failed'); }
    finally { setRunnerBusy(false); }
  }

  async function fundRequest() {
    if (!result?.intentId || !result.escrow) return;
    setFundBusy(true); setError(''); setNotice('');
    try {
      const principal = await connect(true);
      if (!window.ethereum || !principal) throw new Error('Connect the principal wallet to fund this request.');
      if (principal.toLowerCase() !== result.principalAddress.toLowerCase()) throw new Error('The connected wallet does not match the mandate principal.');
      await assertChain();
      const value = BigInt(result.amount);
      const approveData = encodeFunctionData({ abi: TOKEN_ABI, functionName: 'approve', args: [result.escrow as `0x${string}`, value] });
      const approvalHash = await window.ethereum.request({ method: 'eth_sendTransaction', params: [{ from: principal, to: tokenAddress, data: approveData }] }) as string;
      setNotice('Approval submitted. Confirming it on Monad…');
      await waitForReceipt(approvalHash);
      const fundData = encodeFunctionData({ abi: ESCROW_FUND_ABI, functionName: 'fundIntent', args: [keccak256(stringToHex(result.intentId)), [result.recipientAddress as `0x${string}`], [value]] });
      const fundHash = await window.ethereum.request({ method: 'eth_sendTransaction', params: [{ from: principal, to: result.escrow, data: fundData }] }) as string;
      setNotice('Funding submitted. Verifying the scoped escrow…');
      await waitForReceipt(fundHash);
      const response = await fetch(`/api/intents/${encodeURIComponent(result.intentId)}/fund`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ txHash: fundHash, sender: principal }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Funding could not be verified.');
      setResult({ ...result, execution: 'FUNDED_AWAITING_RELEASE', fundingTxHash: fundHash });
      setNotice('Principal funding verified. Release is still gated by a fresh compliance check.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Principal funding failed'); }
    finally { setFundBusy(false); }
  }

  async function releaseRequest() {
    if (!result?.intentId) return;
    setReleaseBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/release', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ intentId: result.intentId, legSequence: 1, chain: result.chain }) });
      const body = await response.json() as { settled?: boolean; txHash?: string; error?: string; detail?: string; reason?: string };
      if (!response.ok) throw new Error(body.error ?? body.detail ?? 'Release could not be completed.');
      if (!body.settled) throw new Error(`Release blocked: ${body.reason ?? body.detail ?? 'compliance check failed'}`);
      setResult({ ...result, execution: 'RELEASED', releaseTxHash: body.txHash });
      setNotice('Released successfully after the final compliance check.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Release failed'); }
    finally { setReleaseBusy(false); }
  }

  async function assertChain() {
    if (!window.ethereum) throw new Error('Wallet provider unavailable.');
    await ensureWalletChain(window.ethereum, { chainId, chainName: 'Monad Testnet', rpcUrl, nativeSymbol, explorerUrl });
  }

  const selected = mandates.find((mandate) => mandate.id === selectedId);
  const verdict = result?.decision.verdict;
  return <section className="agent-console mb-6 rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-7">
    <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 dark:border-slate-800 sm:flex-row sm:items-start sm:justify-between"><div><div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.15em] text-indigo-brand"><span className="h-1.5 w-1.5 rounded-full bg-indigo-brand" />Agent workspace</div><h2 className="mt-3 text-xl font-semibold tracking-tight text-ink dark:text-white">Register an agent, then let it propose</h2><p className="mt-2 max-w-2xl text-xs leading-5 text-slate-500">The principal signs a bounded mandate. The agent gets no principal private key; every request is checked before approval.</p></div><span className="rounded-full border border-slate-200 px-3 py-1.5 text-[10px] font-semibold text-slate-500 dark:border-slate-700 dark:text-slate-400">{symbol} · {chain}</span></div>
    <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_.85fr]">
      <div className="space-y-5"><div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 dark:border-indigo-950 dark:bg-indigo-950/20"><div className="flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.14em] text-indigo-brand">Step 1 · Register</p><p className="mt-1 text-xs text-slate-500">Sign the mandate with the principal wallet.</p></div><button type="button" onClick={() => void connect(true)} className="rounded-xl bg-white px-3 py-2 text-[10px] font-semibold text-indigo-brand shadow-sm dark:bg-slate-900">{principalAddress ? shorten(principalAddress) : 'Connect principal'}</button></div><div className="mt-4 space-y-3"><Field label="Agent name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Treasury agent" /></Field><Field label="Agent wallet / public key"><input value={agentAddress} onChange={(e) => setAgentAddress(e.target.value)} placeholder="0x…" /></Field><div className="grid gap-3 sm:grid-cols-2"><Field label={`Per payment (${symbol})`}><input inputMode="decimal" value={perTransaction} onChange={(e) => setPerTransaction(e.target.value)} /></Field><Field label={`Daily limit (${symbol})`}><input inputMode="decimal" value={dailyLimit} onChange={(e) => setDailyLimit(e.target.value)} /></Field></div><div className="grid gap-3 sm:grid-cols-2"><Field label="Policy"><select value={policyId} onChange={(e) => setPolicyId(e.target.value)}><option value="PERMISSIVE">Permissive</option><option value="STANDARD">Standard</option><option value="STRICT">Strict</option></select></Field><Field label="Expires in (days)"><input inputMode="numeric" value={expiryDays} onChange={(e) => setExpiryDays(e.target.value)} /></Field></div><button type="button" onClick={() => void register()} disabled={busy} className="w-full rounded-xl bg-indigo-brand px-4 py-2.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-indigo-600 disabled:cursor-wait disabled:opacity-60">{busy ? 'Waiting for wallet…' : 'Sign and register agent'}</button></div></div>
        <div><div className="flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-400">Registered mandates</p><span className="text-[10px] text-slate-400">{mandates.length}</span></div>{mandates.length ? <div className="mt-2 space-y-2">{mandates.map((mandate) => <button type="button" key={mandate.id} onClick={() => setSelectedId(mandate.id)} className={`flex w-full items-center justify-between rounded-xl border p-3 text-left transition ${selectedId === mandate.id ? 'border-indigo-300 bg-indigo-50/60 dark:border-indigo-800 dark:bg-indigo-950/30' : 'border-slate-200 hover:border-indigo-200 dark:border-slate-800'}`}><span><span className="block text-xs font-semibold text-ink dark:text-white">{mandate.name}</span><span className="mt-1 block font-mono text-[9px] text-slate-400">{shorten(mandate.agentAddress)} · {mandate.policyId}</span></span><span className="rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">{mandate.status}</span></button>)}</div> : <p className="mt-2 text-xs text-slate-500">No agents registered for this principal yet.</p>}</div>
      </div>
      <div className="rounded-2xl bg-slate-50 p-5 dark:bg-slate-950/70"><p className="text-[10px] font-bold uppercase tracking-[.15em] text-slate-400">Step 2 · Request decision</p>{selected ? <><div className="mt-3 rounded-xl bg-white p-3 dark:bg-slate-900"><p className="text-xs font-semibold text-ink dark:text-white">{selected.name}</p><p className="mt-1 text-[10px] text-slate-500">{selected.policyId} · max {formatBase(selected.perTransactionLimit)} {symbol}</p></div><div className="mt-4 space-y-3"><Field label="Recipient wallet"><input value={recipientAddress} onChange={(e) => setRecipientAddress(e.target.value)} placeholder="0x…" /></Field><Field label={`Amount (${symbol})`}><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field><div className="flex flex-wrap gap-2"><button type="button" onClick={() => setRecipientAddress(UNVERIFIED)} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-semibold text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">Try blocked recipient</button><button type="button" onClick={() => void runRequest()} disabled={busy} className="rounded-xl bg-ink px-4 py-2 text-[10px] font-semibold text-white dark:bg-indigo-brand">{busy ? 'Running checks…' : 'Run agent request'}</button></div></div></> : <div className="flex min-h-64 flex-col items-center justify-center text-center"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-xl text-indigo-brand shadow-sm dark:bg-slate-900">✦</span><p className="mt-4 text-sm font-semibold text-ink dark:text-white">Register an agent first</p><p className="mt-2 max-w-xs text-xs leading-5 text-slate-500">After the principal signs a mandate, its policy and limits appear here.</p></div>}{result && <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-800"><p className={`text-2xl font-semibold ${verdict === 'PASS' ? 'text-emerald-600' : 'text-red-600'}`}>{verdict}</p><p className="mt-1 text-[10px] text-slate-500">{result.execution.replaceAll('_', ' ')}</p>{result.intentId && <p className="mt-2 rounded-xl bg-white p-2.5 font-mono text-[9px] text-slate-500 dark:bg-slate-900">Intent {result.intentId}<br /><span className="text-emerald-600">{result.execution === 'AWAITING_PRINCIPAL_FUNDING' ? 'Fund the bounded request below; the agent cannot move principal funds.' : result.execution === 'FUNDED_AWAITING_RELEASE' ? 'Funds are held in scoped escrow until the final check passes.' : result.execution === 'RELEASED' ? 'Settlement released and recorded in the audit trail.' : ''}</span></p>}{verdict === 'PASS' && result.execution === 'AWAITING_PRINCIPAL_FUNDING' && <button type="button" onClick={() => void fundRequest()} disabled={fundBusy} className="mt-3 w-full rounded-xl bg-indigo-brand px-4 py-2.5 text-[10px] font-semibold text-white disabled:opacity-60">{fundBusy ? 'Funding with principal wallet…' : 'Fund scoped agent payment'}</button>}{verdict === 'PASS' && result.execution === 'FUNDED_AWAITING_RELEASE' && <button type="button" onClick={() => void releaseRequest()} disabled={releaseBusy} className="mt-3 w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-[10px] font-semibold text-white disabled:opacity-60">{releaseBusy ? 'Running final checks…' : 'Release after compliance check'}</button>}{result.fundingTxHash && <p className="mt-2 break-all text-[9px] text-slate-400">Funding tx: {result.fundingTxHash}</p>}{result.releaseTxHash && <p className="mt-2 break-all text-[9px] text-emerald-600">Release tx: {result.releaseTxHash}</p>}<div className="mt-3 space-y-2">{result.decision.checks.map((check) => <div key={check.check} className="flex items-start gap-2 rounded-xl bg-white p-2.5 dark:bg-slate-900"><span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${check.passed ? 'bg-emerald-500' : 'bg-red-500'}`} /><p className="text-[10px] leading-4 text-slate-500"><strong className="text-ink dark:text-white">{check.check.replaceAll('_', ' ')}:</strong> {check.detail}</p></div>)}</div></div>}</div>
    </div>{notice && <p role="status" className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">{notice}</p>}{error && <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] leading-4 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
  </section>;
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block"><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[.12em] text-slate-400">{label}</span>{children}</label>; }
function shorten(address: string) { return `${address.slice(0, 6)}…${address.slice(-4)}`; }
function toBaseUnits(value: string) { if (!/^\d+(\.\d+)?$/.test(value)) throw new Error('Enter a valid amount'); const [whole, fraction = ''] = value.split('.'); if (fraction.length > 6) throw new Error('aUSDC supports up to 6 decimal places'); return whole + fraction.padEnd(6, '0'); }
function formatBase(value: string) { const whole = value.slice(0, -6) || '0'; const fraction = value.slice(-6).replace(/0+$/, ''); return fraction ? `${whole}.${fraction}` : whole; }

async function waitForReceipt(hash: string) {
  if (!window.ethereum) throw new Error('Wallet provider unavailable.');
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const receipt = await window.ethereum.request({ method: 'eth_getTransactionReceipt', params: [hash] }) as { status?: string } | null;
    if (receipt) { if (receipt.status !== '0x1') throw new Error(`Transaction ${hash.slice(0, 10)}… reverted.`); return; }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(`Transaction ${hash.slice(0, 10)}… was not confirmed in time.`);
}
