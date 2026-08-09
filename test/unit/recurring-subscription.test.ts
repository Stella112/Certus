import { describe, expect, it, vi } from 'vitest';
import { processSubscriptionEpoch, type DueSubscription, type RecurringDeps } from '../../src/lib/settlement/recurring';
import { ReasonCode } from '../../src/lib/pipeline/reasonCodes';

const checks = [
  { check: 'SENDER_CVI' as const, passed: true, detail: 'ok' },
  { check: 'RECIPIENT_CVI' as const, passed: true, detail: 'ok' },
  { check: 'ASSET_RULES' as const, passed: true, detail: 'ok' },
  { check: 'POLICY' as const, passed: true, detail: 'ok' },
];
const subscription: DueSubscription = {
  id: 'sub-1', intentId: 'intent-1', recipientCvi: '0xrecipient', amount: '1000000',
  intervalSeconds: 3600, nextEpochAt: new Date('2026-08-08T10:00:00Z'), nextLegSequence: 1,
  status: 'ACTIVE', intent: { chain: 'monad', senderCvi: '0xsender', asset: '0xasset', policyId: 'STANDARD', status: 'ACTIVE' },
};

describe('subscription epoch compliance', () => {
  it('settles a passing epoch and advances exactly one boundary', async () => {
    const advance = vi.fn(async () => undefined);
    const deps: RecurringDeps = {
      evaluateEpoch: vi.fn(async () => ({ verdict: 'PASS' as const, checks })),
      settleEpoch: vi.fn(async () => ({ settled: true as const })),
      halt: vi.fn(async () => undefined), advance,
    };
    const result = await processSubscriptionEpoch(subscription, new Date('2026-08-08T10:00:01Z'), deps);
    expect(result).toEqual({ status: 'SETTLED', nextEpochAt: new Date('2026-08-08T11:00:00Z') });
    expect(deps.evaluateEpoch).toHaveBeenCalledOnce();
    expect(deps.settleEpoch).toHaveBeenCalledOnce();
  });

  it('halts at the next due epoch after recipient revocation and never settles', async () => {
    const halt = vi.fn(async () => undefined);
    const settleEpoch = vi.fn(async () => ({ settled: true as const }));
    const deps: RecurringDeps = {
      evaluateEpoch: vi.fn(async () => ({ verdict: 'FREEZE' as const, reason: ReasonCode.CVI_REVOKED_OR_EXPIRED, detail: 'revoked', checks })),
      settleEpoch, halt, advance: vi.fn(async () => undefined),
    };
    const result = await processSubscriptionEpoch(subscription, new Date('2026-08-08T10:00:00Z'), deps);
    expect(result.status).toBe('HALTED');
    expect(halt).toHaveBeenCalledWith(subscription, ReasonCode.CVI_REVOKED_OR_EXPIRED, 'revoked');
    expect(settleEpoch).not.toHaveBeenCalled();
  });

  it('does nothing before the epoch boundary', async () => {
    const evaluateEpoch = vi.fn();
    const deps = { evaluateEpoch, settleEpoch: vi.fn(), halt: vi.fn(), advance: vi.fn() } as unknown as RecurringDeps;
    expect(await processSubscriptionEpoch(subscription, new Date('2026-08-08T09:59:59Z'), deps)).toEqual({ status: 'NOT_DUE' });
    expect(evaluateEpoch).not.toHaveBeenCalled();
  });

  it('halts safely when the fresh settlement re-check changes after an initial pass', async () => {
    const halt = vi.fn(async () => undefined);
    const deps: RecurringDeps = {
      evaluateEpoch: vi.fn(async () => ({ verdict: 'PASS' as const, checks })),
      settleEpoch: vi.fn(async () => ({ settled: false as const, verdict: 'FREEZE' as const, reason: ReasonCode.CVI_REVOKED_OR_EXPIRED, detail: 'revoked during settlement re-check' })),
      halt,
      advance: vi.fn(async () => undefined),
    };
    const result = await processSubscriptionEpoch(subscription, new Date('2026-08-08T10:00:00Z'), deps);
    expect(result.status).toBe('HALTED');
    expect(halt).toHaveBeenCalledWith(subscription, ReasonCode.CVI_REVOKED_OR_EXPIRED, 'revoked during settlement re-check');
    expect(deps.advance).not.toHaveBeenCalled();
  });
});
