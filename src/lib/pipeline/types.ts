import type { ReasonCode } from './reasonCodes';
import type { PolicyId } from './policies';
import type { Chain } from '../cleanverse/types';

/** Why the pipeline is running. The verdict depends on reason AND trigger. */
export type Trigger =
  | 'INTENT_CREATE'
  | 'MILESTONE_RELEASE'
  | 'BATCH_ADDRESS'
  | 'SUBSCRIPTION_EPOCH'
  | 'LINK_OPEN'
  | 'YIELD_TICK';

export type CheckName = 'SENDER_CVI' | 'RECIPIENT_CVI' | 'ASSET_RULES' | 'POLICY';

export interface CheckResult {
  check: CheckName;
  passed: boolean;
  reason?: ReasonCode;
  /** Human readable, shown in the oversight dashboard next to the reason code. */
  detail: string;
  /** Raw-ish signal retained for the audit record. */
  evidence?: unknown;
}

export interface EvaluationContext {
  trigger: Trigger;
  chain: Chain;
  /** A-Token address the payment settles in. */
  atoken: string;
  /** Identity credential asset used for checks when a payment settles in origin USDC. */
  identityAtoken?: string;
  senderAddress: string;
  recipientAddress: string;
  /** Asset base units. Decimal precision comes from the chain registry. NEVER a number. */
  amount: bigint;
  policyId: PolicyId;
  intentId?: string;
  legId?: string;
  /** Optional actor metadata for agent-originated requests. Never a private key. */
  actorType?: 'HUMAN' | 'AGENT';
  actorName?: string;
  principalAddress?: string;
}

export type Decision =
  | { verdict: 'PASS'; checks: CheckResult[] }
  | { verdict: 'FAIL'; reason: ReasonCode; detail: string; checks: CheckResult[] }
  | { verdict: 'ISOLATE'; reason: ReasonCode; detail: string; checks: CheckResult[] }
  | { verdict: 'FREEZE'; reason: ReasonCode; detail: string; checks: CheckResult[] };
