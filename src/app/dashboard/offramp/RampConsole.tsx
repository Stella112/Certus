'use client';

import { useEffect, useMemo, useState } from 'react';

type Side = 'BUY' | 'SELL';
type Quote = { quoteToken: string; quoteId: string; fiatCurrency: string; cryptoCurrency: string; fiatAmount: number; cryptoAmount: number; totalFee: number; isBuyOrSell: Side; network: string };
type Order = { orderId: string; status: string; buyOrSell: Side; fiatCurrency: string; fiatAmount: string | number; cryptoCurrency: string; cryptoAmount: string | number; wallet?: { address: string; chain: string; depositAddress?: string | null } };

export function RampConsole({ chain, walletChainId, defaultCrypto }: { chain: string; walletChainId: number; defaultCrypto: string }) {
  const [side, setSide] = useState<Side>('SELL');
  const [wallet, setWallet] = useState('');
  const [fiatCurrency, setFiatCurrency] = useState('USD');
  const [cryptoCurrency, setCryptoCurrency] = useState(defaultCrypto);
  const [paymentMethod, setPaymentMethod] = useState('credit_debit_card');
  const [amount, setAmount] = useState('100');
  const [email, setEmail] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    void window.ethereum?.request({ method: 'eth_accounts' }).then((accounts) => {
      const first = Array.isArray(accounts) ? accounts[0] : undefined;
      if (typeof first === 'string') setWallet(first);
    }).catch(() => undefined);
  }, []);

  const amountLabel = useMemo(() => side === 'BUY' ? `Fiat amount (${fiatCurrency})` : `Crypto amount (${cryptoCurrency})`, [side, fiatCurrency, cryptoCurrency]);

  async function connect() {
    setMessage('');
    if (!window.ethereum) { setMessage('Install or open a browser wallet first.'); return; }
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' }) as unknown;
    const first = Array.isArray(accounts) ? accounts[0] : undefined;
    if (typeof first !== 'string') throw new Error('No wallet account returned');
    setWallet(first);
  }

  async function requestQuote() {
    setBusy(true); setMessage(''); setQuote(null); setOrder(null);
    try {
      if (!wallet) await connect();
      const body: Record<string, unknown> = { fiatCurrency, cryptoCurrency, isBuyOrSell: side, network: chain, paymentMethod };
      if (side === 'BUY') body.fiatAmount = Number(amount); else body.cryptoAmount = Number(amount);
      const res = await fetch('/api/ramp/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json() as Quote & { error?: string; detail?: string };
      if (!res.ok) throw new Error(data.error ?? data.detail ?? 'Quote request failed');
      setQuote(data);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Quote request failed'); }
    finally { setBusy(false); }
  }

  async function openWidget() {
    if (!quote || !wallet) return;
    setBusy(true); setMessage('');
    try {
      const res = await fetch('/api/ramp/widget', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quoteToken: quote.quoteToken, wallet: { address: wallet, chain }, ...(email ? { email } : {}) }) });
      const data = await res.json() as { orderId?: string; widgetUrl?: string; error?: string; detail?: string };
      if (!res.ok || !data.orderId || !data.widgetUrl) throw new Error(data.error ?? data.detail ?? 'Widget creation failed');
      setOrder({ orderId: data.orderId, status: 'INIT', buyOrSell: quote.isBuyOrSell, fiatCurrency: quote.fiatCurrency, fiatAmount: quote.fiatAmount, cryptoCurrency: quote.cryptoCurrency, cryptoAmount: quote.cryptoAmount });
      window.open(data.widgetUrl, '_blank', 'noopener,noreferrer');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Widget creation failed'); }
    finally { setBusy(false); }
  }

  async function refreshOrder() {
    if (!order) return;
    setBusy(true); setMessage('');
    try {
      const res = await fetch('/api/ramp/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: order.orderId }) });
      const data = await res.json() as Order & { error?: string; detail?: string };
      if (!res.ok) throw new Error(data.error ?? data.detail ?? 'Order lookup failed');
      setOrder(data);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Order lookup failed'); }
    finally { setBusy(false); }
  }

  return <section className="ramp-console grid gap-5 xl:grid-cols-[1.05fr_.95fr]">
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_14px_50px_rgba(15,23,42,0.06)] dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-indigo-brand">1 · Quote</p><h2 className="mt-2 text-xl font-semibold text-ink dark:text-white">Choose a route</h2></div><span className="rounded-full bg-amber-50 px-3 py-1.5 text-[10px] font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">A-Pass required</span></div>
      <div className="mt-6 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1 dark:bg-slate-800"><button type="button" onClick={() => setSide('SELL')} className={`rounded-xl px-4 py-3 text-xs font-semibold ${side === 'SELL' ? 'bg-white text-ink shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500'}`}>Off-ramp · sell crypto</button><button type="button" onClick={() => setSide('BUY')} className={`rounded-xl px-4 py-3 text-xs font-semibold ${side === 'BUY' ? 'bg-white text-ink shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500'}`}>On-ramp · buy crypto</button></div>
      <div className="mt-5 space-y-4">
        <Field label="Wallet"><div className="flex gap-2"><input className="field flex-1" value={wallet} onChange={(event) => setWallet(event.target.value)} placeholder="Connect wallet"/><button type="button" onClick={() => void connect()} className="rounded-xl bg-ink px-3 text-[11px] font-semibold text-white dark:bg-indigo-brand">{wallet ? 'Connected' : 'Connect'}</button></div></Field>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Fiat currency"><input className="field" value={fiatCurrency} onChange={(event) => setFiatCurrency(event.target.value.toUpperCase())}/></Field><Field label="Crypto symbol"><select className="field" value={cryptoCurrency} onChange={(event) => setCryptoCurrency(event.target.value)}><option value="USDC">USDC · provider ramp</option><option value="aUSDC">aUSDC · verify provider support</option></select></Field></div>
        <div className="grid gap-4 sm:grid-cols-2"><Field label={amountLabel}><input className="field" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)}/></Field><Field label="Payment method"><input className="field" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} placeholder="credit_debit_card"/></Field></div>
        <Field label="Email (optional)"><input className="field" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="For the hosted provider widget"/></Field>
      </div>
      <button type="button" onClick={() => void requestQuote()} disabled={busy} className="mt-6 w-full rounded-xl bg-indigo-brand px-4 py-3.5 text-xs font-semibold text-white shadow-[0_8px_20px_rgba(91,99,232,.24)] disabled:opacity-60">{busy ? 'Contacting Cleanverse…' : 'Request binding quote'}</button>
      {message && <p role="status" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">{message}</p>}
      <p className="mt-4 text-[10px] leading-4 text-slate-400">Network: <span className="font-semibold text-slate-600 dark:text-slate-300">{chain}</span> · wallet chain ID {walletChainId}. Quote tokens are single-use and expire after 15 minutes.</p>
    </div>
    <div className="space-y-5">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-indigo-brand">2 · Hosted checkout</p><h2 className="mt-2 text-xl font-semibold text-ink dark:text-white">Review and open</h2>{quote ? <><div className="mt-5 grid grid-cols-2 gap-3"><Metric label="You provide" value={`${quote.isBuyOrSell === 'BUY' ? quote.fiatAmount : quote.cryptoAmount} ${quote.isBuyOrSell === 'BUY' ? quote.fiatCurrency : quote.cryptoCurrency}`}/><Metric label="You receive" value={`${quote.isBuyOrSell === 'BUY' ? quote.cryptoAmount : quote.fiatAmount} ${quote.isBuyOrSell === 'BUY' ? quote.cryptoCurrency : quote.fiatCurrency}`}/><Metric label="Fee" value={`${quote.totalFee} ${quote.fiatCurrency}`}/><Metric label="Quote" value={quote.quoteId.slice(0, 10)}/></div><button type="button" onClick={() => void openWidget()} disabled={busy} className="mt-5 w-full rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-xs font-semibold text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-300">{busy ? 'Creating hosted widget…' : 'Open Cleanverse provider widget'}</button></> : <Empty title="No quote yet" body="Choose a route and request a live Cleanverse quote. Certus does not invent prices."/>}</div>
      <div className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-indigo-brand">3 · Order</p><h2 className="mt-2 text-xl font-semibold text-ink dark:text-white">Track settlement</h2></div>{order && <button type="button" onClick={() => void refreshOrder()} disabled={busy} className="rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-semibold dark:border-slate-700">Refresh</button>}</div>{order ? <div className="mt-5"><div className="flex items-center justify-between rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/70"><span className="font-mono text-[11px]">{order.orderId}</span><span className="rounded-full bg-amber-100 px-2.5 py-1 text-[9px] font-bold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">{order.status}</span></div><p className="mt-4 text-xs leading-5 text-slate-500">The provider owns payment collection and delivery. Certus only keeps the Cleanverse order reference and its current status.</p></div> : <Empty title="No order created" body="After you open the hosted widget, the Cleanverse order reference will appear here."/>}</div>
    </div>
  </section>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">{label}</span>{children}</label>; }
function Metric({ label, value }: { label: string; value: string | number }) { return <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-800/70"><p className="text-[10px] text-slate-400">{label}</p><p className="mt-2 truncate text-sm font-semibold text-ink dark:text-white">{value}</p></div>; }
function Empty({ title, body }: { title: string; body: string }) { return <div className="mt-6 rounded-2xl border border-dashed border-slate-200 p-6 dark:border-slate-700"><p className="text-sm font-semibold text-ink dark:text-white">{title}</p><p className="mt-2 text-xs leading-5 text-slate-500">{body}</p></div>; }
