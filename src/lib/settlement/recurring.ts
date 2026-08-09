import { prisma } from '../db';
import { evaluate } from '../pipeline/evaluate';
import { assets } from '../cleanverse/cva';
import { defaultChain, type ChainKey } from '../chain/config';
import { releaseMilestone, freezeCascade } from './release';
import type { Decision } from '../pipeline/types';
import type { PolicyId } from '../pipeline/policies';

export interface DueSubscription {
  id: string;
  intentId: string;
  recipientCvi: string;
  amount: string;
  intervalSeconds: number;
  nextEpochAt: Date;
  nextLegSequence: number;
  status: string;
  intent: { chain: string; senderCvi: string; asset: string; policyId: string; status: string };
}

export interface RecurringDeps {
  evaluateEpoch(subscription: DueSubscription): Promise<Decision>;
  settleEpoch(subscription: DueSubscription): Promise<
    | { settled: true }
    | { settled: false; verdict: 'FAIL' | 'ISOLATE' | 'FREEZE'; reason: string; detail: string }
  >;
  halt(subscription: DueSubscription, reason: string, detail: string): Promise<void>;
  advance(subscription: DueSubscription, nextEpochAt: Date): Promise<void>;
}

export type EpochOutcome =
  | { status: 'SETTLED'; nextEpochAt: Date }
  | { status: 'HALTED'; verdict: Exclude<Decision['verdict'], 'PASS'>; reason: string; detail: string }
  | { status: 'NOT_DUE' };

/** One epoch, one fresh four-check decision. No cached eligibility is accepted. */
export async function processSubscriptionEpoch(
  subscription: DueSubscription,
  now: Date,
  deps: RecurringDeps
): Promise<EpochOutcome> {
  if (subscription.status !== 'ACTIVE' || subscription.intent.status !== 'ACTIVE' || subscription.nextEpochAt > now) {
    return { status: 'NOT_DUE' };
  }

  const decision = await deps.evaluateEpoch(subscription);
  if (decision.verdict !== 'PASS') {
    await deps.halt(subscription, decision.reason, decision.detail);
    return { status: 'HALTED', verdict: decision.verdict, reason: decision.reason, detail: decision.detail };
  }

  const settlement = await deps.settleEpoch(subscription);
  if (!settlement.settled) {
    await deps.halt(subscription, settlement.reason, settlement.detail);
    return { status: 'HALTED', verdict: settlement.verdict, reason: settlement.reason, detail: settlement.detail };
  }
  const nextEpochAt = new Date(subscription.nextEpochAt.getTime() + subscription.intervalSeconds * 1000);
  await deps.advance(subscription, nextEpochAt);
  return { status: 'SETTLED', nextEpochAt };
}

function productionDeps(chain: ChainKey): RecurringDeps {
  return {
    async evaluateEpoch(subscription) {
      const A = assets(chain);
      return evaluate({
        trigger: 'SUBSCRIPTION_EPOCH',
        chain: A.chain,
        atoken: subscription.intent.asset,
        senderAddress: subscription.intent.senderCvi,
        recipientAddress: subscription.recipientCvi,
        amount: BigInt(subscription.amount),
        policyId: subscription.intent.policyId as PolicyId,
        intentId: subscription.intentId,
      });
    },
    async settleEpoch(subscription) {
      return releaseMilestone({
        intentId: subscription.intentId,
        legSequence: subscription.nextLegSequence,
        chain,
      });
    },
    async halt(subscription, reason, detail) {
      await prisma.subscription.update({ where: { id: subscription.id }, data: { status: 'HALTED', lastProcessedAt: new Date() } });
      const current = await prisma.intent.findUnique({ where: { id: subscription.intentId }, select: { status: true } });
      if (current?.status === 'ACTIVE') {
        await freezeCascade({ intentId: subscription.intentId, reason, detail, chain });
      }
    },
    async advance(subscription, nextEpochAt) {
      const remaining = await prisma.leg.findFirst({ where: { intentId: subscription.intentId, sequence: subscription.nextLegSequence + 1 } });
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { nextEpochAt, nextLegSequence: { increment: 1 }, lastProcessedAt: new Date(), status: remaining ? 'ACTIVE' : 'COMPLETED' },
      });
      if (!remaining) await prisma.intent.update({ where: { id: subscription.intentId }, data: { status: 'COMPLETED' } });
    },
  };
}

export async function runDueSubscriptions(now = new Date(), chain: ChainKey = defaultChain()) {
  const due = await prisma.subscription.findMany({
    where: { status: 'ACTIVE', nextEpochAt: { lte: now }, intent: { chain } },
    include: { intent: true },
    orderBy: { nextEpochAt: 'asc' },
  });
  const deps = productionDeps(chain);
  const outcomes = [];
  for (const subscription of due) {
    outcomes.push({ id: subscription.id, outcome: await processSubscriptionEpoch(subscription, now, deps) });
  }
  return outcomes;
}
