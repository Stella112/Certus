'use client';

import { useState } from 'react';

export function EscrowAction({ intentId, chain, legSequence }: { intentId: string; chain: string; legSequence: number }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function release() {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/release', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ intentId, legSequence, chain }) });
      const body = await response.json() as { error?: string; detail?: string; txHash?: string };
      if (!response.ok || !body.txHash) throw new Error(body.error ?? body.detail ?? 'Release was blocked by a compliance check.');
      setMessage(`Released · ${body.txHash.slice(0, 10)}…`);
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Release failed.');
    } finally { setBusy(false); }
  }

  return <div className="mt-4 flex flex-wrap items-center gap-3"><button type="button" onClick={() => void release()} disabled={busy} className="rounded-xl bg-emerald-600 px-3 py-2 text-[10px] font-semibold text-white disabled:opacity-50">{busy ? 'Running checks…' : 'Release milestone'}</button>{message && <span role="status" className="text-[10px] text-slate-500">{message}</span>}</div>;
}
