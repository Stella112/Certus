'use client';

import { useMemo, useState } from 'react';
import { encodeFunctionData, keccak256, parseAbi, stringToHex } from 'viem';
import { ensureWalletChain } from '@/lib/wallet/network';

declare global {
  interface Window {
    ethereum?: { request(args: { method: string; params?: unknown[] }): Promise<unknown> };
  }
}

type Mode = 'send' | 'link' | 'recurring';
type PolicyId = 'PERMISSIVE' | 'STANDARD' | 'STRICT';

export type PaymentNetwork = {
  key: string;
  label: string;
  symbol: string;
  aToken: string;
  decimals: number;
  settlementReady: boolean;
  chainId?: number;
  rpcUrl?: string;
  nativeSymbol?: string;
  explorerUrl?: string;
  escrow?: string;
  assetOptions?: Array<{ mode: 'AUSDC' | 'USDC'; label: string; aToken: string; escrow?: string; verified: boolean }>;
};

const TOKEN_ABI = parseAbi(['function approve(address spender, uint256 amount) returns (bool)']);
const ESCROW_FUND_ABI = parseAbi(['function fundIntent(bytes32 intentId, address[] recipients, uint256[] amounts)']);

const copy = {
  send: {
    eyebrow: 'Send',
    title: 'Send a protected payment',
    body: 'Choose where funds leave and where the recipient gets paid. A standard send uses a one-stage escrow: Certus locks the payment, re-checks all four controls, then releases it.',
  },
  link: {
    eyebrow: 'Request',
    title: 'Create a payment link',
    body: 'Share a checkout link that verifies the payer before accepting the payment.',
  },
  recurring: {
    eyebrow: 'Schedule',
    title: 'Set up recurring payments',
    body: 'Choose a recipient, amount, cadence, and number of payments. Certus funds the schedule in escrow and re-checks every epoch before release.',
  },
};

function toBaseUnits(value: string, decimals: number) {
  if (!/^\d+(\.\d+)?$/.test(value)) throw new Error('Enter a valid amount.');
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > decimals) throw new Error(`This asset supports up to ${decimals} decimal places.`);
  const units = BigInt(whole + fraction.padEnd(decimals, '0'));
  if (units <= 0n) throw new Error('Amount must be greater than zero.');
  return units.toString();
}

export function PaymentComposer({ mode, networks, initialChain }: { mode: Mode; networks: PaymentNetwork[]; initialChain: string }) {
  const c = copy[mode];
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [intervalSeconds, setIntervalSeconds] = useState(2_592_000);
  const [occurrences, setOccurrences] = useState(12);
  const [policy, setPolicy] = useState<PolicyId>('STANDARD');
  const [source, setSource] = useState(initialChain);
  const [destination, setDestination] = useState(initialChain);
  const [assetMode, setAssetMode] = useState<'AUSDC' | 'USDC'>('USDC');
  const [privacyMode, setPrivacyMode] = useState<'PUBLIC' | 'PRIVATE_METADATA'>('PUBLIC');
  const [purposeType, setPurposeType] = useState<'INVOICE' | 'PURCHASE_ORDER' | 'CONTRACT' | 'MILESTONE' | 'PAYROLL' | 'OTHER'>('INVOICE');
  const [purposeReference, setPurposeReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');

  const sourceNetwork = networks.find((network) => network.key === source) ?? networks[0];
  const destinationNetwork = networks.find((network) => network.key === destination) ?? networks[0];
  const sourceAsset = sourceNetwork.assetOptions?.find((asset) => asset.mode === assetMode) ?? { mode: 'AUSDC' as const, label: sourceNetwork.symbol, aToken: sourceNetwork.aToken, escrow: sourceNetwork.escrow, verified: sourceNetwork.settlementReady };
  const recurringAsset = sourceNetwork.assetOptions?.find((asset) => asset.mode === 'AUSDC') ?? sourceAsset;
  const crossChain = mode === 'send' && source !== destination;
  const routeReady = mode === 'link' || (!crossChain && Boolean(sourceAsset.escrow));
  const routeLabel = useMemo(
    () => crossChain ? `${sourceNetwork.label} → ${destinationNetwork.label}` : sourceNetwork.label,
    [crossChain, sourceNetwork, destinationNetwork],
  );
  const addressValid = /^0x[0-9a-fA-F]{40}$/.test(recipient);
  const amountValid = /^\d+(\.\d+)?$/.test(amount) && Number(amount) > 0;
  const submitDisabled = busy || !addressValid || !amountValid;

  async function submit() {
    setBusy(true);
    setResult('');
    try {
      if (mode === 'recurring') {
        if (!recurringAsset.escrow || !sourceNetwork.chainId) throw new Error(`${sourceNetwork.label} does not have a recurring escrow deployment yet.`);
        if (!window.ethereum) throw new Error('Connect a browser wallet to set up recurring payments.');
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' }) as string[];
        const sender = accounts?.[0];
        if (!sender) throw new Error('No wallet account selected.');
        await ensureWalletChain(window.ethereum, { chainId: sourceNetwork.chainId, chainName: sourceNetwork.label, rpcUrl: sourceNetwork.rpcUrl ?? '', nativeSymbol: sourceNetwork.nativeSymbol ?? 'ETH', explorerUrl: sourceNetwork.explorerUrl ?? '' });
        const amountBase = toBaseUnits(amount, sourceNetwork.decimals);
        setResult('Creating your recurring payment…');
        const createResponse = await fetch('/api/intents', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ chain: source, senderCvi: sender, recipientCvi: recipient, amount: amountBase, policyId: policy, privacyMode: 'PUBLIC', assetMode: 'AUSDC', intentType: 'RECURRING', recurrenceCount: occurrences }),
        });
        const created = await createResponse.json() as { intentId?: string; error?: string };
        if (!createResponse.ok || !created.intentId) throw new Error(created.error ?? 'Unable to create recurring payment.');
        setResult('Approve the recurring payment asset in your wallet…');
        const approvalHash = await window.ethereum.request({ method: 'eth_sendTransaction', params: [{ from: sender, to: recurringAsset.aToken, data: encodeFunctionData({ abi: TOKEN_ABI, functionName: 'approve', args: [recurringAsset.escrow as `0x${string}`, BigInt(amountBase) * BigInt(occurrences)] }) }] }) as string;
        await waitForReceipt(approvalHash);
        setResult('Locking the first recurring payment in escrow…');
        const recipients = Array.from({ length: occurrences }, () => recipient as `0x${string}`);
        const amounts = Array.from({ length: occurrences }, () => BigInt(amountBase));
        const fundHash = await window.ethereum.request({ method: 'eth_sendTransaction', params: [{ from: sender, to: recurringAsset.escrow, data: encodeFunctionData({ abi: ESCROW_FUND_ABI, functionName: 'fundIntent', args: [keccak256(stringToHex(created.intentId)), recipients, amounts] }) }] }) as string;
        await waitForReceipt(fundHash);
        const confirm = await fetch(`/api/intents/${encodeURIComponent(created.intentId)}/fund`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ txHash: fundHash, sender }) });
        const confirmed = await confirm.json() as { error?: string };
        if (!confirm.ok) throw new Error(confirmed.error ?? 'Recurring escrow funding could not be verified.');
        const schedule = await fetch('/api/subscriptions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ intentId: created.intentId, intervalSeconds, firstEpochAt: new Date(Date.now() + intervalSeconds * 1000).toISOString() }) });
        const scheduled = await schedule.json() as { error?: string };
        if (!schedule.ok) throw new Error(scheduled.error ?? 'Recurring schedule could not be activated.');
        setResult(`Recurring payment active for ${occurrences} payments. Certus will pay ${amount} ${recurringAsset.label} every ${intervalLabel(intervalSeconds)} and re-run all four checks before each epoch.`);
        return;
      }
      if (mode === 'send') {
        if (crossChain) {
          setResult('Cross-chain route saved for review. Value cannot move yet: no audited bridge adapter or funded destination settlement pool is configured.');
          return;
        }
        const settlementEscrow = sourceAsset.escrow;
        if (!settlementEscrow || !sourceNetwork.chainId) {
          setResult(`${sourceNetwork.label} does not have a compatible verified-asset Certus escrow deployment yet.`);
          return;
        }
        if (!window.ethereum) {
          setResult('Connect a browser wallet to fund this protected payment.');
          return;
        }

        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' }) as string[];
        const sender = accounts?.[0];
        if (!sender) throw new Error('No wallet account selected.');
        await ensureWalletChain(window.ethereum, {
          chainId: sourceNetwork.chainId,
          chainName: sourceNetwork.label,
          rpcUrl: sourceNetwork.rpcUrl ?? '',
          nativeSymbol: sourceNetwork.nativeSymbol ?? 'ETH',
          explorerUrl: sourceNetwork.explorerUrl ?? '',
        });

        const amountBase = toBaseUnits(amount, sourceNetwork.decimals);
        setResult('Creating the protected intent…');
        const createResponse = await fetch('/api/intents', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ chain: source, senderCvi: sender, recipientCvi: recipient, amount: amountBase, policyId: policy, privacyMode, assetMode, intentType: 'MILESTONE', yieldMode: false, purposeType, purposeReference: purposeReference || undefined }),
        });
        const created = await createResponse.json();
        if (!createResponse.ok) throw new Error(created.error ?? 'Unable to create payment intent.');

        setResult('Approve the settlement asset in your wallet…');
        const approvalData = encodeFunctionData({ abi: TOKEN_ABI, functionName: 'approve', args: [settlementEscrow as `0x${string}`, BigInt(amountBase)] });
        const approvalHash = await window.ethereum.request({ method: 'eth_sendTransaction', params: [{ from: sender, to: sourceAsset.aToken, data: approvalData }] }) as string;
        await waitForReceipt(approvalHash);

        setResult('Fund the protected escrow in your wallet…');
        const fundData = encodeFunctionData({ abi: ESCROW_FUND_ABI, functionName: 'fundIntent', args: [keccak256(stringToHex(created.intentId)), [recipient as `0x${string}`], [BigInt(amountBase)]] });
        const fundHash = await window.ethereum.request({ method: 'eth_sendTransaction', params: [{ from: sender, to: settlementEscrow, data: fundData }] }) as string;
        await waitForReceipt(fundHash);

        const confirmResponse = await fetch(`/api/intents/${encodeURIComponent(created.intentId)}/fund`, {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ txHash: fundHash, sender }),
        });
        const confirmed = await confirmResponse.json();
        if (!confirmResponse.ok) throw new Error(confirmed.error ?? 'Funding could not be verified.');
        setResult(`Payment funded successfully. Certus will re-run all four checks before release. ${privacyMode === 'PRIVATE_METADATA' ? 'Private metadata mode is active; on-chain settlement remains publicly visible.' : ''} ${confirmed.explorerUrl}`);
        return;
      }

      const endpoint = '/api/links';
      const payload = mode === 'link'
        ? {
            chain: source,
            recipientCvi: recipient,
            amount: toBaseUnits(amount, sourceNetwork.decimals),
            policyId: policy,
          }
        : {};
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      setResult(response.ok ? (data.url ?? 'Recurring schedule activated.') : (data.error ?? 'Unable to continue.'));
    } catch (error) {
      setResult(error instanceof Error ? error.message : 'Unable to continue.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-8">
        <p className="text-[10px] font-bold uppercase tracking-[.18em] text-indigo-brand">{c.eyebrow}</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-.045em]">{c.title}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">{c.body}</p>
      </header>
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="space-y-5">
            {mode === 'send' && sourceNetwork.assetOptions && (
              <div><label className="text-xs font-semibold" htmlFor="payment-asset">Payment asset</label><select id="payment-asset" value={assetMode} onChange={(event) => setAssetMode(event.target.value as 'AUSDC' | 'USDC')} className="mt-2 w-full rounded-xl border border-slate-200 bg-transparent px-4 py-3 text-sm dark:border-slate-700">{sourceNetwork.assetOptions.map((asset) => <option key={asset.mode} value={asset.mode}>{asset.label} · {asset.mode === 'AUSDC' ? 'Cleanverse verified' : 'user payment asset'}</option>)}</select><p className="mt-2 text-[10px] leading-4 text-slate-400">{assetMode === 'USDC' ? 'USDC runs the same identity, policy, privacy, escrow, and audit flow. aUSDC remains available when Cleanverse’s gated asset is required.' : 'aUSDC is the Cleanverse-gated settlement asset and requires an active A-Pass.'}</p></div>
            )}
            {mode !== 'send' && (
              <div className="grid gap-4">
                <NetworkField
                  label="Network"
                  value={source}
                  onChange={(value) => { setSource(value); setDestination(value); }}
                  networks={networks}
                />
              </div>
            )}
            {mode === 'recurring' ? (
              <>
                <Field label="Recipient wallet" value={recipient} onChange={setRecipient} placeholder="0x..." />
                <Field label={`Amount (${recurringAsset.label})`} value={amount} onChange={setAmount} placeholder="10.00" />
                <div><label className="text-xs font-semibold" htmlFor="recurring-interval">Repeat every</label><select id="recurring-interval" value={intervalSeconds} onChange={(event) => setIntervalSeconds(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-slate-200 bg-transparent px-4 py-3 text-sm dark:border-slate-700"><option value={86400}>Day</option><option value={604800}>Week</option><option value={2592000}>Month</option></select></div>
                <div><label className="text-xs font-semibold" htmlFor="recurring-occurrences">Number of payments</label><select id="recurring-occurrences" value={occurrences} onChange={(event) => setOccurrences(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-slate-200 bg-transparent px-4 py-3 text-sm dark:border-slate-700"><option value={3}>3 payments</option><option value={6}>6 payments</option><option value={12}>12 payments</option><option value={24}>24 payments</option></select><p className="mt-2 text-[10px] leading-4 text-slate-500">All epochs are funded in escrow upfront; each one is re-checked before release.</p></div>
              </>
            ) : (
              <>
                <Field label="Recipient wallet" value={recipient} onChange={setRecipient} placeholder="0x..." />
                <Field label={`Amount (${sourceAsset.label})`} value={amount} onChange={setAmount} placeholder="10.00" />
              </>
            )}
            {mode !== 'recurring' && (
              <div className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-700">
                <div><p className="text-[10px] text-slate-400">Settlement route</p><p className="mt-1 text-sm font-semibold">{routeLabel}</p></div>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${routeReady ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'}`}>
                  {routeReady ? 'READY' : crossChain ? 'BRIDGE REQUIRED' : 'NOT DEPLOYED'}
                </span>
              </div>
            )}
            {mode === 'send' && <p className="-mt-2 text-[10px] leading-4 text-slate-400">Protected payment uses <span className="font-semibold text-slate-600 dark:text-slate-300">{sourceAsset.label}</span>. All identity, policy, privacy, escrow, and audit controls remain active.</p>}
            {mode === 'send' && <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-800/40"><p className="text-xs font-semibold text-ink dark:text-white">Proof of purpose <span className="ml-1 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[9px] font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">AUDITABLE</span></p><p className="mt-1 text-[10px] leading-4 text-slate-500">Bind this payment to an invoice, purchase order, contract, or payroll reference. Documents stay off-chain; Certus records the type and reference.</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><select value={purposeType} onChange={event => setPurposeType(event.target.value as typeof purposeType)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs dark:border-slate-700 dark:bg-slate-900"><option value="INVOICE">Invoice</option><option value="PURCHASE_ORDER">Purchase order</option><option value="CONTRACT">Contract</option><option value="MILESTONE">Milestone</option><option value="PAYROLL">Payroll</option><option value="OTHER">Other</option></select><input value={purposeReference} onChange={event => setPurposeReference(event.target.value)} placeholder="Reference e.g. INV-2048" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-mono dark:border-slate-700 dark:bg-slate-900" /></div></div>}
            <div>
              <label className="text-xs font-semibold" htmlFor={`${mode}-policy`}>Protection policy</label>
              <select id={`${mode}-policy`} value={policy} onChange={(event) => setPolicy(event.target.value as PolicyId)} className="mt-2 w-full rounded-xl border border-slate-200 bg-transparent px-4 py-3 text-sm dark:border-slate-700">
                <option value="STANDARD">Standard protection</option>
                <option value="STRICT">Strict protection</option>
                <option value="PERMISSIVE">Identity checks only</option>
              </select>
            </div>
            {mode !== 'recurring' && <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 dark:border-indigo-950 dark:bg-indigo-950/25"><input type="checkbox" checked={privacyMode === 'PRIVATE_METADATA'} onChange={(event) => setPrivacyMode(event.target.checked ? 'PRIVATE_METADATA' : 'PUBLIC')} className="mt-0.5 h-4 w-4 accent-indigo-brand" /><span><span className="block text-xs font-semibold text-ink dark:text-white">Privacy-aware metadata</span><span className="mt-1 block text-[10px] leading-4 text-slate-500">Keep identity context and payment notes limited to authorized audit views. Sender, recipient, amount, and contract events remain public on-chain.</span></span></label>}
            <button onClick={submit} disabled={submitDisabled} className="w-full rounded-xl bg-indigo-brand px-5 py-3.5 text-sm font-semibold text-white disabled:opacity-40">
              {busy ? 'Waiting for wallet…' : mode === 'link' ? 'Create payment link' : mode === 'recurring' ? 'Start recurring payment' : crossChain ? 'Review cross-chain route' : 'Fund protected payment'}
            </button>
            {result && <p role="status" className="rounded-xl bg-indigo-50 p-3 text-xs leading-5 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200">{result}</p>}
          </div>
        </section>
        <aside className="rounded-3xl bg-ink p-6 text-white dark:bg-slate-900">
          <p className="text-[10px] font-bold uppercase tracking-[.16em] text-indigo-300">Payment protection</p>
          <h2 className="mt-3 text-xl font-semibold">{crossChain ? 'Two networks. One audit trail.' : 'Four checks. Every time.'}</h2>
          <div className="mt-6 space-y-4">
            {(crossChain ? ['Source identity + asset', 'Source policy approval', 'Bridge transport evidence', 'Destination identity + asset'] : ['Sender identity', 'Recipient identity', 'Verified asset rules', 'Spending policy']).map((label, index) => (
              <div key={label} className="flex items-center gap-3"><span className="grid h-7 w-7 place-items-center rounded-full bg-white/10 text-[10px]">0{index + 1}</span><span className="text-xs text-slate-200">{label}</span></div>
            ))}
          </div>
          <p className="mt-7 border-t border-white/10 pt-5 text-xs leading-5 text-slate-400">{privacyMode === 'PRIVATE_METADATA' ? 'Privacy-aware mode limits off-chain context to authorized views. This does not hide public blockchain settlement data.' : 'Certus encrypts sensitive identity administration. Payment amounts, wallet addresses, and contract events remain public on-chain.'}</p>
        </aside>
      </div>
    </div>
  );
}

function NetworkField({ label, value, onChange, networks }: { label: string; value: string; onChange: (value: string) => void; networks: PaymentNetwork[] }) {
  return <div><label className="text-xs font-semibold">{label}</label><select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-transparent px-4 py-3 text-sm dark:border-slate-700">{networks.map((network) => <option key={network.key} value={network.key}>{network.label} · {network.symbol}</option>)}</select></div>;
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <div><label className="text-xs font-semibold">{label}</label><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mt-2 w-full rounded-xl border border-slate-200 bg-transparent px-4 py-3 font-mono text-sm outline-none focus:ring-2 focus:ring-indigo-brand dark:border-slate-700" /></div>;
}

function intervalLabel(seconds: number) { return seconds === 86400 ? 'day' : seconds === 604800 ? 'week' : 'month'; }

async function waitForReceipt(hash: string) {
  if (!window.ethereum) throw new Error('Wallet provider unavailable.');
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const receipt = await window.ethereum.request({ method: 'eth_getTransactionReceipt', params: [hash] }) as { status?: string } | null;
    if (receipt) {
      if (receipt.status !== '0x1') throw new Error(`Transaction ${hash.slice(0, 10)}… reverted.`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(`Transaction ${hash.slice(0, 10)}… was not confirmed in time.`);
}
