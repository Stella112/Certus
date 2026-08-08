import { describe, it, expect, vi } from 'vitest';
import { evaluate, type EvaluateDeps } from '../../src/lib/pipeline/evaluate';
import { ReasonCode } from '../../src/lib/pipeline/reasonCodes';
import type { EvaluationContext, Trigger } from '../../src/lib/pipeline/types';
import type { EligibilityOutcome, QueryApassData } from '../../src/lib/cleanverse/types';

/**
 * Unit tests use TEST DOUBLES for the Cleanverse adapters. These are not product mocks:
 * they never run in a demo path, and MockYieldVault remains the only simulated component
 * in the shipped product (DECISIONS.md D4). Their purpose is to reach failure branches the
 * live sandbox cannot currently produce on demand.
 */

const ALLOWED: EligibilityOutcome = { signal: 'ALLOWED', code: 4, detail: 'apass verify success' };
const NO_APASS: EligibilityOutcome = { signal: 'NO_APASS', code: 2, detail: 'apass not exist' };
const FROZEN: EligibilityOutcome = { signal: 'APASS_NOT_ACTIVE', code: null, detail: 'A-Pass frozen or revoked on chain' };
const DOWN: EligibilityOutcome = { signal: 'UNAVAILABLE', code: null, detail: 'timeout: 3000ms' };

const identity = (over: Partial<QueryApassData> = {}): QueryApassData => ({
  cvRecordId: '1',
  tier: '50',
  subTier: 0,
  group: '',
  subGroup: '',
  countries: ['NG'],
  expirationTime: 1900000000,
  status: 1,
  ...over,
});

function makeDeps(over: Partial<EvaluateDeps> = {}): EvaluateDeps {
  return {
    verifyEligibility: vi.fn(async () => ALLOWED),
    queryIdentity: vi.fn(async () => identity()),
    getAssetRules: vi.fn(async () => [
      { allowed_group: '', allowed_sub_group: '', min_tier: 5, min_sub_tier: 0, is_black_list: false, countries: [] },
    ]),
    checkPolicy: vi.fn(async () => ({ check: 'POLICY' as const, passed: true, detail: 'Within Standard limits' })),
    recordEvent: vi.fn(async () => ({}) as any),
    ...over,
  };
}

const ctx = (over: Partial<EvaluationContext> = {}): EvaluationContext => ({
  trigger: 'INTENT_CREATE',
  chain: 'monad',
  atoken: '0xaC0893567D43C3E7e6e35a72803df05416C1f20D',
  senderAddress: '0xSender',
  recipientAddress: '0xRecipient',
  amount: 1_000_000n,
  policyId: 'STANDARD',
  ...over,
});

describe('evaluate() structural guarantees', () => {
  it('runs ALL FOUR checks on every call, even when the first fails', async () => {
    const deps = makeDeps({ verifyEligibility: vi.fn(async () => NO_APASS) });
    const d = await evaluate(ctx(), deps);
    expect(d.checks.map((c) => c.check).sort()).toEqual(['ASSET_RULES', 'POLICY', 'RECIPIENT_CVI', 'SENDER_CVI']);
    // rules + policy still consulted despite an identity failure: no short-circuit
    expect(deps.getAssetRules).toHaveBeenCalled();
    expect(deps.checkPolicy).toHaveBeenCalled();
  });

  it('always writes an audit event, including on PASS', async () => {
    const deps = makeDeps();
    await evaluate(ctx(), deps);
    expect(deps.recordEvent).toHaveBeenCalledTimes(1);
  });

  it('records all four outcomes and the amount as a string, never a float', async () => {
    const deps = makeDeps();
    await evaluate(ctx({ amount: 25_000_000_000n }), deps);
    const arg = (deps.recordEvent as any).mock.calls[0][0];
    expect(arg.checkResults).toHaveLength(4);
    expect(arg.payload.amount).toBe('25000000000');
    expect(typeof arg.payload.amount).toBe('string');
  });
});

describe('evaluate() verdicts', () => {
  it('PASS when all four checks pass', async () => {
    const d = await evaluate(ctx(), makeDeps());
    expect(d.verdict).toBe('PASS');
  });

  it('FAIL with NO_CVI when the sender holds no A-Pass', async () => {
    const deps = makeDeps({ verifyEligibility: vi.fn(async () => NO_APASS) });
    const d = await evaluate(ctx(), deps);
    expect(d.verdict).toBe('FAIL');
    if (d.verdict !== 'PASS') expect(d.reason).toBe(ReasonCode.NO_CVI);
  });

  it('FAIL with NO_CVI when only the recipient is unverified', async () => {
    const verify = vi.fn(async (a: { address: string }) => (a.address === '0xRecipient' ? NO_APASS : ALLOWED));
    const d = await evaluate(ctx(), makeDeps({ verifyEligibility: verify as any }));
    expect(d.verdict).toBe('FAIL');
    if (d.verdict !== 'PASS') expect(d.reason).toBe(ReasonCode.NO_CVI);
    // the failure is attributed to the recipient, not the sender
    const rec = d.checks.find((c) => c.check === 'RECIPIENT_CVI')!;
    const snd = d.checks.find((c) => c.check === 'SENDER_CVI')!;
    expect(rec.passed).toBe(false);
    expect(snd.passed).toBe(true);
  });

  it('FAIL CLOSED with CVI_UNAVAILABLE when Cleanverse is unreachable', async () => {
    const deps = makeDeps({ verifyEligibility: vi.fn(async () => DOWN) });
    const d = await evaluate(ctx(), deps);
    expect(d.verdict).toBe('FAIL');
    if (d.verdict !== 'PASS') expect(d.reason).toBe(ReasonCode.CVI_UNAVAILABLE);
  });

  it('FAIL with ASSET_RULE_TIER when a party is below the asset minimum tier', async () => {
    const deps = makeDeps({ queryIdentity: vi.fn(async () => identity({ tier: '1' })) });
    const d = await evaluate(ctx(), deps);
    expect(d.verdict).toBe('FAIL');
    if (d.verdict !== 'PASS') expect(d.reason).toBe(ReasonCode.ASSET_RULE_TIER);
  });

  it('FAIL CLOSED with ASSET_RULES_UNAVAILABLE when rules cannot be read', async () => {
    const deps = makeDeps({ getAssetRules: vi.fn(async () => null) });
    const d = await evaluate(ctx(), deps);
    expect(d.verdict).toBe('FAIL');
    if (d.verdict !== 'PASS') expect(d.reason).toBe(ReasonCode.ASSET_RULES_UNAVAILABLE);
  });

  it('FAIL with a policy reason when the policy check refuses', async () => {
    const deps = makeDeps({
      checkPolicy: vi.fn(async () => ({
        check: 'POLICY' as const,
        passed: false,
        reason: ReasonCode.POLICY_AMOUNT_LIMIT,
        detail: 'over cap',
      })),
    });
    const d = await evaluate(ctx(), deps);
    expect(d.verdict).toBe('FAIL');
    if (d.verdict !== 'PASS') expect(d.reason).toBe(ReasonCode.POLICY_AMOUNT_LIMIT);
  });
});

describe('verdict depends on REASON x TRIGGER (isolation ring and freeze cascade)', () => {
  const frozenRecipient = () =>
    makeDeps({
      verifyEligibility: vi.fn(async (a: { address: string }) =>
        a.address === '0xRecipient' ? FROZEN : ALLOWED
      ) as any,
    });

  const cases: { trigger: Trigger; expected: string }[] = [
    { trigger: 'MILESTONE_RELEASE', expected: 'FREEZE' },
    { trigger: 'SUBSCRIPTION_EPOCH', expected: 'FREEZE' },
    { trigger: 'YIELD_TICK', expected: 'FREEZE' },
    { trigger: 'BATCH_ADDRESS', expected: 'ISOLATE' },
    { trigger: 'INTENT_CREATE', expected: 'FAIL' },
    { trigger: 'LINK_OPEN', expected: 'FAIL' },
  ];

  for (const { trigger, expected } of cases) {
    it(`a revoked credential at ${trigger} yields ${expected}`, async () => {
      const d = await evaluate(ctx({ trigger }), frozenRecipient());
      expect(d.verdict).toBe(expected);
      if (d.verdict !== 'PASS') expect(d.reason).toBe(ReasonCode.CVI_REVOKED_OR_EXPIRED);
    });
  }

  it('a non-revocation failure in a batch still ISOLATEs rather than failing the batch', async () => {
    const deps = makeDeps({
      checkPolicy: vi.fn(async () => ({
        check: 'POLICY' as const,
        passed: false,
        reason: ReasonCode.POLICY_AMOUNT_LIMIT,
        detail: 'over cap',
      })),
    });
    const d = await evaluate(ctx({ trigger: 'BATCH_ADDRESS' }), deps);
    expect(d.verdict).toBe('ISOLATE');
  });

  it('writes the event with eventType FREEZE when the verdict is FREEZE', async () => {
    const deps = frozenRecipient();
    await evaluate(ctx({ trigger: 'MILESTONE_RELEASE' }), deps);
    const arg = (deps.recordEvent as any).mock.calls[0][0];
    expect(arg.eventType).toBe('FREEZE');
    expect(arg.reasonCode).toBe(ReasonCode.CVI_REVOKED_OR_EXPIRED);
  });
});
