import { describe, it, expect, vi } from 'vitest';
import { evaluate, type EvaluateDeps } from '../../src/lib/pipeline/evaluate';
import { ReasonCode } from '../../src/lib/pipeline/reasonCodes';
import type { EvaluationContext } from '../../src/lib/pipeline/types';

/**
 * REGRESSION SUITE for Phase 1 audit finding F1-01.
 *
 * The audit proved that a throwing adapter escaped evaluate() as an exception: no verdict
 * and, worse, no audit event. These tests pin the corrected contract:
 *
 *   evaluate() NEVER throws, and either records the evaluation or refuses to return PASS.
 *
 * If a future change reintroduces the crash, these fail.
 */

const healthy = (): EvaluateDeps => ({
  verifyEligibility: vi.fn(async () => ({ signal: 'ALLOWED' as const, code: 4, detail: 'ok' })),
  queryIdentity: vi.fn(async () => ({
    cvRecordId: '1',
    tier: '50',
    subTier: 0,
    group: '',
    subGroup: '',
    countries: ['NG'],
    expirationTime: 1900000000,
    status: 1,
  })),
  getAssetRules: vi.fn(async () => []),
  checkPolicy: vi.fn(async () => ({ check: 'POLICY' as const, passed: true, detail: 'ok' })),
  recordEvent: vi.fn(async () => ({}) as any),
});

const ctx = (over: Partial<EvaluationContext> = {}): EvaluationContext => ({
  trigger: 'MILESTONE_RELEASE',
  chain: 'monad',
  atoken: '0xaC0893567D43C3E7e6e35a72803df05416C1f20D',
  senderAddress: '0xSender',
  recipientAddress: '0xRecipient',
  amount: 1_000_000n,
  policyId: 'STANDARD',
  ...over,
});

const boom = () => {
  throw new Error('CLEANVERSE_API_KEY must Base64-decode to exactly 32 bytes');
};

describe('F1-01 regression: evaluate() never throws and never loses the record', () => {
  it('identity adapter throwing yields FAIL(SYSTEM_ERROR), not an exception', async () => {
    const deps = { ...healthy(), verifyEligibility: vi.fn(async () => boom()) as any };
    const d = await evaluate(ctx(), deps);
    expect(d.verdict).not.toBe('PASS');
    if (d.verdict !== 'PASS') expect(d.reason).toBe(ReasonCode.SYSTEM_ERROR);
  });

  it('a throwing check still produces an audit event', async () => {
    const deps = { ...healthy(), verifyEligibility: vi.fn(async () => boom()) as any };
    await evaluate(ctx(), deps);
    expect(deps.recordEvent).toHaveBeenCalledTimes(1);
  });

  it('asset-rules adapter throwing does not crash the evaluation', async () => {
    const deps = { ...healthy(), getAssetRules: vi.fn(async () => boom()) as any };
    const d = await evaluate(ctx(), deps);
    expect(d.verdict).not.toBe('PASS');
    expect(deps.recordEvent).toHaveBeenCalledTimes(1);
  });

  it('policy check throwing (database down) does not crash the evaluation', async () => {
    const deps = { ...healthy(), checkPolicy: vi.fn(async () => boom()) as any };
    const d = await evaluate(ctx(), deps);
    expect(d.verdict).not.toBe('PASS');
    if (d.verdict !== 'PASS') expect(d.reason).toBe(ReasonCode.SYSTEM_ERROR);
  });

  it('NO RECORD, NO SETTLEMENT: a failed audit write downgrades PASS to FAIL', async () => {
    const deps = {
      ...healthy(),
      recordEvent: vi.fn(async () => {
        throw new Error('SQLITE_CANTOPEN');
      }) as any,
    };
    const d = await evaluate(ctx(), deps);
    // Everything else passed, so without the guard this would have returned PASS.
    expect(d.verdict).toBe('FAIL');
    if (d.verdict !== 'PASS') expect(d.reason).toBe(ReasonCode.AUDIT_WRITE_FAILED);
  });

  it('one failing check does not discard the other three outcomes (allSettled, not all)', async () => {
    const deps = { ...healthy(), getAssetRules: vi.fn(async () => boom()) as any };
    const d = await evaluate(ctx(), deps);
    expect(d.checks).toHaveLength(4);
    // The identity checks still completed for real and are reportable in the dashboard.
    expect(d.checks.find((c) => c.check === 'SENDER_CVI')!.passed).toBe(true);
    expect(d.checks.find((c) => c.check === 'RECIPIENT_CVI')!.passed).toBe(true);
    expect(d.checks.find((c) => c.check === 'ASSET_RULES')!.passed).toBe(false);
  });

  it('every adapter throwing at once still resolves to a Decision', async () => {
    const deps: EvaluateDeps = {
      verifyEligibility: vi.fn(async () => boom()) as any,
      queryIdentity: vi.fn(async () => boom()) as any,
      getAssetRules: vi.fn(async () => boom()) as any,
      checkPolicy: vi.fn(async () => boom()) as any,
      recordEvent: vi.fn(async () => ({}) as any),
    };
    const d = await evaluate(ctx(), deps);
    expect(d.verdict).not.toBe('PASS');
    expect(d.checks).toHaveLength(4);
    expect(d.checks.every((c) => !c.passed)).toBe(true);
  });
});
