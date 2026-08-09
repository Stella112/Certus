'use client';

import { useState } from 'react';

type Result = {
  opened?: boolean;
  verdict?: string;
  reason?: string;
  detail?: string;
  attestationRequired?: boolean;
  chain?: string;
};

export function PaymentLinkClient({ slug }: { slug: string }) {
  const [address, setAddress] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);

  async function verify() {
    setBusy(true);
    setResult(null);

    try {
      const response = await fetch(`/api/links/${encodeURIComponent(slug)}/open`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ visitorAddress: address }),
      });
      setResult(await response.json());
    } catch {
      setResult({ opened: false, detail: 'Verification is temporarily unavailable. Please try again.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-200" htmlFor="payer-address">
        Payer wallet
      </label>
      <input
        id="payer-address"
        value={address}
        onChange={(event) => setAddress(event.target.value)}
        placeholder="0x..."
        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-mono text-sm outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900"
      />
      <button
        type="button"
        disabled={busy || !/^0x[0-9a-fA-F]{40}$/.test(address)}
        onClick={verify}
        className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? 'Running four compliance checks…' : 'Verify and continue'}
      </button>
      {result && (
        <div
          role="status"
          className={`rounded-xl border p-4 text-sm ${result.opened ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100' : 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100'}`}
        >
          <p className="font-semibold">
            {result.opened ? 'Identity verified' : result.attestationRequired ? 'A-Pass required' : 'Payment unavailable'}
          </p>
          <p className="mt-1">{result.opened ? 'All four checks passed. The payment may proceed.' : result.detail ?? result.reason}</p>
          {result.attestationRequired && (
            <p className="mt-3 text-xs leading-5">
              Ask the payment issuer to complete your operator-verified A-Pass onboarding, then verify this wallet again.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
