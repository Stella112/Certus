import { prisma } from '../db';
import { getPolicy } from './policies';
import { ReasonCode } from './reasonCodes';
import type { CheckResult, EvaluationContext } from './types';

/**
 * CHECK 4: institutional spending policy. Local layer per DECISIONS.md D2.
 * Budget is derived from the append-only record (released legs), not a mutable counter,
 * so it cannot drift from the audit trail.
 */

/** Sum of already-released legs for this sender in the trailing 24h, in base units. */
export async function spentInWindow(senderAddress: string, since: Date): Promise<bigint> {
  const legs = await prisma.leg.findMany({
    where: {
      status: 'RELEASED',
      releasedAt: { gte: since },
      intent: { senderCvi: senderAddress },
    },
    select: { amount: true },
  });
  // Amounts are decimal strings in the DB. BigInt() on a string, never parseFloat.
  return legs.reduce((sum: bigint, l: { amount: string }) => sum + BigInt(l.amount), 0n);
}

export async function checkPolicy(ctx: EvaluationContext, now: Date = new Date()): Promise<CheckResult> {
  const policy = getPolicy(ctx.policyId);

  // 1. Per-leg amount cap
  if (policy.maxPerLeg !== null && ctx.amount > policy.maxPerLeg) {
    return {
      check: 'POLICY',
      passed: false,
      reason: ReasonCode.POLICY_AMOUNT_LIMIT,
      detail: `Amount ${ctx.amount} exceeds ${policy.label} per payment cap of ${policy.maxPerLeg}`,
      evidence: { policyId: policy.id, maxPerLeg: policy.maxPerLeg, amount: ctx.amount },
    };
  }

  // 2. Settlement window
  if (policy.windowUTC) {
    const hour = now.getUTCHours();
    const { startHour, endHour } = policy.windowUTC;
    const open = startHour <= endHour ? hour >= startHour && hour < endHour : hour >= startHour || hour < endHour;
    if (!open) {
      return {
        check: 'POLICY',
        passed: false,
        reason: ReasonCode.POLICY_WINDOW_CLOSED,
        detail: `Current hour ${hour}:00 UTC is outside the ${policy.label} window ${startHour}:00 to ${endHour}:00 UTC`,
        evidence: { policyId: policy.id, hourUTC: hour, window: policy.windowUTC },
      };
    }
  }

  // 3. Recipient allowlist
  if (policy.allowlist !== null) {
    const allowed = policy.allowlist.some((a) => a.toLowerCase() === ctx.recipientAddress.toLowerCase());
    if (!allowed) {
      return {
        check: 'POLICY',
        passed: false,
        reason: ReasonCode.POLICY_RECIPIENT_NOT_ALLOWED,
        detail: `Recipient is not on the ${policy.label} approved list`,
        evidence: { policyId: policy.id, recipient: ctx.recipientAddress },
      };
    }
  }

  // 4. Rolling budget, derived from the audit-backed leg history
  if (policy.dailyBudget !== null) {
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const spent = await spentInWindow(ctx.senderAddress, since);
    if (spent + ctx.amount > policy.dailyBudget) {
      return {
        check: 'POLICY',
        passed: false,
        reason: ReasonCode.POLICY_BUDGET_EXCEEDED,
        detail: `Spent ${spent} plus ${ctx.amount} exceeds the ${policy.label} 24 hour budget of ${policy.dailyBudget}`,
        evidence: { policyId: policy.id, spent, amount: ctx.amount, dailyBudget: policy.dailyBudget },
      };
    }
  }

  return {
    check: 'POLICY',
    passed: true,
    detail: `Within ${policy.label} limits`,
    evidence: { policyId: policy.id },
  };
}
