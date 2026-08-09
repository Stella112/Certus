import { post } from './client';
import { parseOrNull, TravelRuleReportSchema } from './schemas';
import type { Chain } from './types';

/**
 * SOURCE: Cleanverse Cooperate API v5.6, Download Travel Rule Report.
 * VERIFIED: pending the live probe recorded in docs/API-TRUTH.md.
 * ENCRYPTED: NO. This endpoint is absent from the encrypted-endpoint list.
 * FALLBACK: never invent a document. Business, transport, and malformed responses are
 * returned as explicit failures and the UI retains the Certus-signed artifact.
 */
export type TransactionReportOutcome =
  | { ok: true; downloadUrl: string; fileName: string }
  | { ok: false; kind: 'REJECTED' | 'UNAVAILABLE' | 'MALFORMED'; detail: string };

export interface ReportDeps {
  post: typeof post;
}

const defaultDeps: ReportDeps = { post };

export async function downloadTransactionReport(args: {
  chain: Chain;
  walletAddress: string;
  txHash: string;
}, deps: ReportDeps = defaultDeps): Promise<TransactionReportOutcome> {
  const result = await deps.post<unknown>('/download_travel_rule', {
    txHash: args.txHash,
    wallet: { chain: args.chain, address: args.walletAddress },
  });
  if (result.kind === 'unavailable') {
    return { ok: false, kind: 'UNAVAILABLE', detail: `${result.reason}: ${result.detail}` };
  }
  if (result.kind === 'business') {
    return { ok: false, kind: 'REJECTED', detail: `envelope ${result.code}: ${result.message}` };
  }
  const parsed = parseOrNull(TravelRuleReportSchema, result.data);
  if (!parsed) return { ok: false, kind: 'MALFORMED', detail: 'download_travel_rule returned an invalid artifact shape' };
  return {
    ok: true,
    downloadUrl: parsed.downloadUrl,
    fileName: parsed.fileName ?? `cleanverse-transaction-${args.txHash.slice(2, 10)}.pdf`,
  };
}
