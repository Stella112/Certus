import { describe, expect, it, vi } from 'vitest';
import { processIsolatedRows, type BatchRow } from '../../src/lib/settlement/batch';
import { ReasonCode } from '../../src/lib/pipeline/reasonCodes';

const rows: BatchRow[] = Array.from({ length: 10 }, (_, index) => ({
  id: `leg-${index + 1}`,
  sequence: index + 1,
  recipientCvi: index === 4 ? 'unverified' : `verified-${index + 1}`,
  amount: '10000',
}));
const checks = [
  { check: 'SENDER_CVI' as const, passed: true, detail: 'ok' },
  { check: 'RECIPIENT_CVI' as const, passed: true, detail: 'ok' },
  { check: 'ASSET_RULES' as const, passed: true, detail: 'ok' },
  { check: 'POLICY' as const, passed: true, detail: 'ok' },
];

describe('Moment A isolation ring', () => {
  it('settles nine rows and isolates one without aborting the batch', async () => {
    const settled: string[] = [];
    const isolated: string[] = [];
    const outcomes = await processIsolatedRows({
      rows,
      evaluateRow: async (row) =>
        row.recipientCvi === 'unverified'
          ? { verdict: 'ISOLATE', reason: ReasonCode.NO_CVI, detail: 'no A-Pass', checks }
          : { verdict: 'PASS', checks },
      settleRow: async (row) => {
        settled.push(row.id);
        return `0xtx-${row.id}`;
      },
      markReleased: async () => undefined,
      markIsolated: async (row) => { isolated.push(row.id); },
    });

    expect(outcomes.filter((row) => row.status === 'RELEASED')).toHaveLength(9);
    expect(outcomes.filter((row) => row.status === 'ISOLATED')).toHaveLength(1);
    expect(settled).toHaveLength(9);
    expect(isolated).toEqual(['leg-5']);
    expect(settled).toContain('leg-10');
  });

  it('contains a chain failure to its row and continues later rows', async () => {
    const markIsolated = vi.fn(async () => undefined);
    const outcomes = await processIsolatedRows({
      rows: rows.slice(0, 3),
      evaluateRow: async () => ({ verdict: 'PASS', checks }),
      settleRow: async (row) => {
        if (row.sequence === 2) throw new Error('token gate changed');
        return `0xtx-${row.id}`;
      },
      markReleased: async () => undefined,
      markIsolated,
    });

    expect(outcomes.map((row) => row.status)).toEqual(['RELEASED', 'ISOLATED', 'RELEASED']);
    expect(markIsolated).toHaveBeenCalledWith(rows[1], ReasonCode.SYSTEM_ERROR, expect.stringContaining('token gate changed'), expect.anything());
  });

  it('never reclassifies a confirmed transfer when post-settlement recording fails', async () => {
    const markIsolated = vi.fn(async () => undefined);
    await expect(processIsolatedRows({
      rows: rows.slice(0, 2),
      evaluateRow: async () => ({ verdict: 'PASS', checks }),
      settleRow: async (row) => `0xtx-${row.id}`,
      markReleased: async () => { throw new Error('attestation store unavailable'); },
      markIsolated,
    })).rejects.toThrow('POST_SETTLEMENT_RECORD_FAILED');
    expect(markIsolated).not.toHaveBeenCalled();
  });
});
