import { describe, it, expect } from 'vitest';
import { evaluate } from '../../src/lib/pipeline/evaluate';
import { ReasonCode } from '../../src/lib/pipeline/reasonCodes';
import { MONAD_ASSETS } from '../../src/lib/cleanverse/cva';
import type { EvaluationContext } from '../../src/lib/pipeline/types';

/**
 * LIVE INTEGRATION TESTS. These call the real Cleanverse UAT sandbox and write real audit
 * events to the local store. No test doubles anywhere in this file.
 *
 * Fixtures are real, verified addresses recorded in docs/API-TRUTH.md:
 */
const ACTIVE = '0x2e2BA14F6784B72fE9874b41811193B5B0bdd0cA'; // tier 50, status 1, verify -> 4
const FROZEN = '0x820350D47277784A26FF4D4cE08C12CAD6F19094'; // frozen in Phase 0, unrecoverable
const NO_APASS = '0x00000000000000000000000000000000DeaDBeeF'; // never had an A-Pass -> code 2
const BOGUS_ATOKEN = '0x1111111111111111111111111111111111111111'; // -> code 1

const base = (over: Partial<EvaluationContext> = {}): EvaluationContext => ({
  trigger: 'INTENT_CREATE',
  chain: 'monad',
  atoken: MONAD_ASSETS.aToken,
  senderAddress: ACTIVE,
  recipientAddress: ACTIVE,
  amount: 1_000_000n, // 1.000000 aUSDC (6 decimals)
  policyId: 'STANDARD',
  ...over,
});

describe('evaluate() against the LIVE Cleanverse sandbox', () => {
  it('CASE 1 - PASS: verified counterparty, compliant asset, within policy', async () => {
    // Sender and recipient are the same verified identity. That is deliberate: it isolates
    // the pipeline from the sandbox's supply of active identities while still exercising
    // two real verify_apass calls, live rules, and live attributes.
    const d = await evaluate(base());
    expect(d.verdict).toBe('PASS');
    expect(d.checks).toHaveLength(4);
    expect(d.checks.every((c) => c.passed)).toBe(true);
  });

  it('CASE 2 - FAIL / NO_CVI: recipient holds no verified identity', async () => {
    const d = await evaluate(base({ recipientAddress: NO_APASS }));
    expect(d.verdict).toBe('FAIL');
    if (d.verdict !== 'PASS') expect(d.reason).toBe(ReasonCode.NO_CVI);
    expect(d.checks.find((c) => c.check === 'RECIPIENT_CVI')!.passed).toBe(false);
    expect(d.checks.find((c) => c.check === 'SENDER_CVI')!.passed).toBe(true);
  });

  it('CASE 3 - FREEZE: a revoked credential mid-contract freezes the next milestone (MOMENT B)', async () => {
    const d = await evaluate(base({ recipientAddress: FROZEN, trigger: 'MILESTONE_RELEASE' }));
    expect(d.verdict).toBe('FREEZE');
    if (d.verdict !== 'PASS') expect(d.reason).toBe(ReasonCode.CVI_REVOKED_OR_EXPIRED);
  });

  it('CASE 4 - ISOLATE: the same revoked credential in a batch isolates one row (MOMENT A)', async () => {
    const d = await evaluate(base({ recipientAddress: FROZEN, trigger: 'BATCH_ADDRESS' }));
    expect(d.verdict).toBe('ISOLATE');
    if (d.verdict !== 'PASS') expect(d.reason).toBe(ReasonCode.CVI_REVOKED_OR_EXPIRED);
  });

  it('CASE 5 - FAIL / ATOKEN_NOT_FOUND: settlement asset is not a verified asset', async () => {
    const d = await evaluate(base({ atoken: BOGUS_ATOKEN }));
    expect(d.verdict).toBe('FAIL');
    if (d.verdict !== 'PASS') expect(d.reason).toBe(ReasonCode.ATOKEN_NOT_FOUND);
  });

  it('CASE 6 - FAIL / POLICY_AMOUNT_LIMIT: real identities, amount over the Standard cap', async () => {
    // 30,000 aUSDC exceeds STANDARD's 25,000 per payment cap. Identity and asset checks
    // all pass against the live API; only the institutional policy refuses.
    const d = await evaluate(base({ amount: 30_000_000_000n }));
    expect(d.verdict).toBe('FAIL');
    if (d.verdict !== 'PASS') expect(d.reason).toBe(ReasonCode.POLICY_AMOUNT_LIMIT);
    expect(d.checks.find((c) => c.check === 'SENDER_CVI')!.passed).toBe(true);
    expect(d.checks.find((c) => c.check === 'ASSET_RULES')!.passed).toBe(true);
  });

  it('CASE 7 - the four checks are individually reported for the dashboard', async () => {
    const d = await evaluate(base({ recipientAddress: NO_APASS }));
    const names = d.checks.map((c) => c.check).sort();
    expect(names).toEqual(['ASSET_RULES', 'POLICY', 'RECIPIENT_CVI', 'SENDER_CVI']);
    for (const c of d.checks) expect(typeof c.detail).toBe('string');
  });
});
