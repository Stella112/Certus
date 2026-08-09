import { describe, expect, it, vi } from 'vitest';
import { downloadTransactionReport } from '../../src/lib/cleanverse/reports';

const args = {
  chain: 'monad' as const,
  walletAddress: '0x0000000000000000000000000000000000001234',
  txHash: `0x${'ab'.repeat(32)}`,
};

describe('Cleanverse transaction report adapter', () => {
  it('returns a validated official artifact', async () => {
    const post = vi.fn(async () => ({
      kind: 'ok' as const,
      code: '0000' as const,
      message: 'success',
      data: { downloadUrl: 'https://test-admin.cleanverse.com/report/token', fileName: 'transaction.pdf' },
    }));
    const result = await downloadTransactionReport(args, { post: post as any });
    expect(result).toEqual({ ok: true, downloadUrl: 'https://test-admin.cleanverse.com/report/token', fileName: 'transaction.pdf' });
    expect(post).toHaveBeenCalledWith('/download_travel_rule', {
      txHash: args.txHash,
      wallet: { chain: 'monad', address: args.walletAddress },
    });
  });

  it('rejects a success envelope without a valid URL and filename', async () => {
    const post = vi.fn(async () => ({ kind: 'ok' as const, code: '0000' as const, message: 'success', data: { url: 'nope' } }));
    await expect(downloadTransactionReport(args, { post: post as any })).resolves.toEqual(expect.objectContaining({ ok: false, kind: 'MALFORMED' }));
  });

  it('normalises UAT null fileName while preserving the official download URL', async () => {
    const post = vi.fn(async () => ({
      kind: 'ok' as const,
      code: '0000' as const,
      message: 'success',
      data: { downloadUrl: 'https://test-admin-api.cleanverse.com/report/token', fileName: null },
    }));
    await expect(downloadTransactionReport(args, { post: post as any })).resolves.toEqual({
      ok: true,
      downloadUrl: 'https://test-admin-api.cleanverse.com/report/token',
      fileName: `cleanverse-transaction-${args.txHash.slice(2, 10)}.pdf`,
    });
  });

  it('surfaces business refusal without inventing a report', async () => {
    const post = vi.fn(async () => ({ kind: 'business' as const, code: '0002', message: 'unsupported transaction', data: null }));
    await expect(downloadTransactionReport(args, { post: post as any })).resolves.toEqual(expect.objectContaining({ ok: false, kind: 'REJECTED' }));
  });
});
