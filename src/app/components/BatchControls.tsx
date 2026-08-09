'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function BatchControls({ intentId, active }: { intentId?: string; active: boolean }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string>();

  async function execute() {
    if (!intentId || !active) return;
    setRunning(true);
    setMessage(undefined);
    try {
      const response = await fetch('/api/batch/release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intentId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail ?? body.error ?? 'Batch failed');
      setMessage(`${body.released} released · ${body.isolated} isolated`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <button onClick={() => router.refresh()} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50">
        Refresh state
      </button>
      <button disabled={!active || running} onClick={execute} className="rounded-xl bg-ink px-4 py-2.5 text-xs font-semibold text-white shadow-[0_8px_20px_rgba(13,16,48,0.16)] transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none disabled:hover:translate-y-0">
        {running ? 'Evaluating…' : active ? 'Execute batch' : 'Awaiting live batch'}
      </button>
      {message && <span className="max-w-xs text-xs text-slate-500">{message}</span>}
    </div>
  );
}
