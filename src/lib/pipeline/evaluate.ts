import { verifyEligibility, queryIdentity } from '../cleanverse/cvi';
import { getAssetRules } from '../cleanverse/cva';
import { recordEvent } from '../audit/record';
import { ReasonCode } from './reasonCodes';
import { checkPolicy } from './policy';
import type { ATokenRule, EligibilityOutcome, QueryApassData } from '../cleanverse/types';
import type { CheckName, CheckResult, Decision, EvaluationContext, Trigger } from './types';

/**
 * THE ONLY WAY VALUE MOVES IN CERTUS.
 *
 * Called on: intent creation, every milestone release, every batch address, every
 * subscription epoch, every payment-link open, every yield accrual tick.
 *
 * Auditor: grep for any settlement that does not route through this function.
 * Any such path is a CRITICAL finding.
 *
 * Two properties this function guarantees structurally, not by convention:
 *  1. ALL FOUR checks execute on every call. Nothing short-circuits, so the dashboard
 *     always has four individual outcomes to display.
 *  2. An audit event is written INSIDE this function, so it is impossible to evaluate
 *     without leaving a compliance record.
 *
 * Every input that influences whether money moves is fetched FRESH here. Nothing is read
 * from a cache or a projection. If Cleanverse is unreachable, we FAIL CLOSED.
 */

/** Injectable for unit tests. These are test doubles, not product mocks (DECISIONS.md D4). */
export interface EvaluateDeps {
  verifyEligibility: typeof verifyEligibility;
  queryIdentity: typeof queryIdentity;
  getAssetRules: typeof getAssetRules;
  checkPolicy: typeof checkPolicy;
  recordEvent: typeof recordEvent;
}

const defaultDeps: EvaluateDeps = { verifyEligibility, queryIdentity, getAssetRules, checkPolicy, recordEvent };

/** Map a Cleanverse eligibility signal to a closed reason code. */
function eligibilityToCheck(check: CheckName, outcome: EligibilityOutcome): CheckResult {
  switch (outcome.signal) {
    case 'ALLOWED':
      return { check, passed: true, detail: outcome.detail, evidence: { code: outcome.code } };
    case 'NO_APASS':
      return { check, passed: false, reason: ReasonCode.NO_CVI, detail: outcome.detail, evidence: { code: 2 } };
    case 'ATOKEN_NOT_FOUND':
      return { check, passed: false, reason: ReasonCode.ATOKEN_NOT_FOUND, detail: outcome.detail, evidence: { code: 1 } };
    case 'APASS_NOT_ACTIVE':
      return {
        check,
        passed: false,
        reason: ReasonCode.CVI_REVOKED_OR_EXPIRED,
        detail: outcome.detail,
        evidence: { signal: 'APassNotActive', code: outcome.code },
      };
    case 'UNAVAILABLE':
    default:
      return {
        check,
        passed: false,
        reason: ReasonCode.CVI_UNAVAILABLE,
        detail: `Fail closed: ${outcome.detail}`,
        evidence: { failClosed: true },
      };
  }
}

/**
 * CHECK 3: the asset's own compliance rules, evaluated EXPLICITLY against both parties'
 * attributes.
 *
 * Honesty note: verify_apass already evaluates a pass against the A-Token's rules, so this
 * check overlaps checks 1 and 2 at the API level. It earns its place by evaluating the
 * attributes openly (tier vs min_tier, country lists, groups) so the dashboard can show WHY
 * an asset accepted or refused a counterparty. It must NOT be presented as a second,
 * independent on-chain enforcement. The A-Token contract is the enforcer; this is the
 * explanation.
 */
function evaluateRules(
  rules: ATokenRule[],
  parties: { label: string; identity: QueryApassData }[]
): CheckResult {
  for (const rule of rules) {
    for (const { label, identity } of parties) {
      const tier = Number(identity.tier);
      if (Number.isFinite(tier) && tier < rule.min_tier) {
        return {
          check: 'ASSET_RULES',
          passed: false,
          reason: ReasonCode.ASSET_RULE_TIER,
          detail: `${label} tier ${identity.tier} is below the asset minimum of ${rule.min_tier}`,
          evidence: { rule, party: label, tier: identity.tier },
        };
      }
      if (identity.subTier < rule.min_sub_tier) {
        return {
          check: 'ASSET_RULES',
          passed: false,
          reason: ReasonCode.ASSET_RULE_TIER,
          detail: `${label} sub tier ${identity.subTier} is below the asset minimum of ${rule.min_sub_tier}`,
          evidence: { rule, party: label, subTier: identity.subTier },
        };
      }
      if (rule.allowed_group && identity.group !== rule.allowed_group) {
        return {
          check: 'ASSET_RULES',
          passed: false,
          reason: ReasonCode.ASSET_RULE_GROUP,
          detail: `${label} group "${identity.group}" is not the permitted group "${rule.allowed_group}"`,
          evidence: { rule, party: label, group: identity.group },
        };
      }
      if (rule.countries.length > 0) {
        const intersects = identity.countries.some((c) => rule.countries.includes(c));
        if (rule.is_black_list && intersects) {
          return {
            check: 'ASSET_RULES',
            passed: false,
            reason: ReasonCode.ASSET_RULE_BLACKLIST,
            detail: `${label} country is denied by asset rule`,
            evidence: { rule, party: label, countries: identity.countries },
          };
        }
        if (!rule.is_black_list && !intersects) {
          return {
            check: 'ASSET_RULES',
            passed: false,
            reason: ReasonCode.ASSET_RULE_COUNTRY,
            detail: `${label} country is not on the permitted list for this asset`,
            evidence: { rule, party: label, countries: identity.countries },
          };
        }
      }
    }
  }
  return {
    check: 'ASSET_RULES',
    passed: true,
    detail: rules.length === 0 ? 'Asset carries no transfer restrictions' : 'Both parties satisfy all asset rules',
    evidence: { ruleCount: rules.length },
  };
}

async function checkAssetRules(ctx: EvaluationContext, deps: EvaluateDeps): Promise<CheckResult> {
  const [rules, senderId, recipientId] = await Promise.all([
    deps.getAssetRules({ chain: ctx.chain, atokenAddress: ctx.atoken }),
    deps.queryIdentity({ chain: ctx.chain, address: ctx.senderAddress }),
    deps.queryIdentity({ chain: ctx.chain, address: ctx.recipientAddress }),
  ]);

  if (rules === null) {
    return {
      check: 'ASSET_RULES',
      passed: false,
      reason: ReasonCode.ASSET_RULES_UNAVAILABLE,
      detail: 'Fail closed: asset rules could not be read',
      evidence: { failClosed: true },
    };
  }
  if (rules.length === 0) {
    return { check: 'ASSET_RULES', passed: true, detail: 'Asset carries no transfer restrictions', evidence: { ruleCount: 0 } };
  }

  const parties: { label: string; identity: QueryApassData }[] = [];
  if (senderId) parties.push({ label: 'Sender', identity: senderId });
  if (recipientId) parties.push({ label: 'Recipient', identity: recipientId });

  if (parties.length < 2) {
    // Attributes unknown for at least one party. We cannot assert compliance, so we do not.
    return {
      check: 'ASSET_RULES',
      passed: false,
      reason: ReasonCode.ASSET_RULES_UNAVAILABLE,
      detail: 'Fail closed: counterparty attributes unavailable, asset rules not evaluable',
      evidence: { failClosed: true, senderKnown: !!senderId, recipientKnown: !!recipientId },
    };
  }

  return evaluateRules(rules, parties);
}

/**
 * Verdict is a function of REASON x TRIGGER. The same failure means different things in
 * different places, which is what makes the isolation ring and the freeze cascade fall out
 * of one function instead of three separate code paths.
 */
function verdictFor(trigger: Trigger, reason: ReasonCode): 'FAIL' | 'ISOLATE' | 'FREEZE' {
  const midLifecycle = trigger === 'MILESTONE_RELEASE' || trigger === 'SUBSCRIPTION_EPOCH' || trigger === 'YIELD_TICK';

  if (reason === ReasonCode.CVI_REVOKED_OR_EXPIRED) {
    if (midLifecycle) return 'FREEZE'; // a live relationship: cascade the freeze
    if (trigger === 'BATCH_ADDRESS') return 'ISOLATE'; // one bad row must not fail the batch
    return 'FAIL';
  }
  if (trigger === 'BATCH_ADDRESS') return 'ISOLATE';
  return 'FAIL';
}

/** Order matters: the first failing check supplies the primary reason code. */
const CHECK_ORDER: CheckName[] = ['SENDER_CVI', 'RECIPIENT_CVI', 'ASSET_RULES', 'POLICY'];

export async function evaluate(ctx: EvaluationContext, deps: EvaluateDeps = defaultDeps): Promise<Decision> {
  // All four run. Nothing short-circuits. Parallel for latency, not for skipping work.
  const [senderOutcome, recipientOutcome, assetCheck, policyCheck] = await Promise.all([
    deps.verifyEligibility({ chain: ctx.chain, atoken: ctx.atoken, address: ctx.senderAddress }),
    deps.verifyEligibility({ chain: ctx.chain, atoken: ctx.atoken, address: ctx.recipientAddress }),
    checkAssetRules(ctx, deps),
    deps.checkPolicy(ctx),
  ]);

  const checks: CheckResult[] = [
    eligibilityToCheck('SENDER_CVI', senderOutcome),
    eligibilityToCheck('RECIPIENT_CVI', recipientOutcome),
    assetCheck,
    policyCheck,
  ];

  const failed = CHECK_ORDER.map((name) => checks.find((c) => c.check === name)).filter(
    (c): c is CheckResult => !!c && !c.passed
  );

  let decision: Decision;
  if (failed.length === 0) {
    decision = { verdict: 'PASS', checks };
  } else {
    const primary = failed[0];
    const reason = primary.reason ?? ReasonCode.CVI_UNAVAILABLE;
    decision = { verdict: verdictFor(ctx.trigger, reason), reason, detail: primary.detail, checks };
  }

  // Written inside evaluate(): there is no way to evaluate without a compliance record.
  await deps.recordEvent({
    intentId: ctx.intentId ?? null,
    legId: ctx.legId ?? null,
    eventType:
      decision.verdict === 'FREEZE' ? 'FREEZE' : decision.verdict === 'ISOLATE' ? 'ISOLATE' : 'CHECK_RUN',
    trigger: ctx.trigger,
    verdict: decision.verdict,
    reasonCode: decision.verdict === 'PASS' ? null : decision.reason,
    checkResults: checks,
    payload: {
      chain: ctx.chain,
      atoken: ctx.atoken,
      sender: ctx.senderAddress,
      recipient: ctx.recipientAddress,
      amount: ctx.amount.toString(),
      policyId: ctx.policyId,
    },
  });

  return decision;
}
