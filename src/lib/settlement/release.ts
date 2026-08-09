import { keccak256, stringToHex, type Hex } from 'viem';
import { prisma } from '../db';
import { evaluate } from '../pipeline/evaluate';
import { recordEvent } from '../audit/record';
import { ReasonCode } from '../pipeline/reasonCodes';
import { assets } from '../cleanverse/cva';
import { defaultChain, type ChainKey } from '../chain/config';
import { ESCROW_ABI, escrowAddressForIntent, publicClient, releaserClient } from '../chain/escrow';
import type { PolicyId } from '../pipeline/policies';

/**
 * SETTLEMENT SERVICE. The only code that signs a value-moving transaction.
 *
 * The rule this file exists to enforce: a settlement transaction is only ever signed after
 * evaluate() returns PASS for that exact leg, at that exact moment. Nothing here reads a
 * cached verdict or a stored status; the pipeline is re-run against the live API every time,
 * which is what makes compliance continuous rather than a gate at the door.
 *
 * Auditor: there is no other module that calls releaseLeg or freezeIntent with a signer.
 */

/** Stable bytes32 id for a database intent id. Deterministic, so chain and DB always agree. */
export function onChainIntentId(intentId: string): Hex {
  return keccak256(stringToHex(intentId));
}

function reasonToBytes32(reason: string): Hex {
  return keccak256(stringToHex(reason));
}

export type ReleaseOutcome =
  | { settled: true; txHash: string; auditRef: Hex }
  | { settled: false; verdict: 'FAIL' | 'ISOLATE' | 'FREEZE'; reason: string; detail: string };

/**
 * Attempt to release one milestone leg.
 *
 * Order matters and is not negotiable: evaluate FIRST, sign SECOND. Reversing it, or
 * signing while a verdict is pending, would make every compliance claim false.
 */
export async function releaseMilestone(args: {
  intentId: string;
  legSequence: number;
  chain?: ChainKey;
}): Promise<ReleaseOutcome> {
  const intent = await prisma.intent.findUnique({ where: { id: args.intentId }, include: { legs: true } });
  if (!intent) throw new Error(`Unknown intent ${args.intentId}`);
  const chain = args.chain ?? intent.chain ?? defaultChain();
  if (chain !== intent.chain) throw new Error(`Intent ${intent.id} belongs to ${intent.chain}, not ${chain}`);
  if (intent.type !== 'MILESTONE' && intent.type !== 'RECURRING') {
    throw new Error(`Intent ${intent.id} is ${intent.type}, not a releasable escrow`);
  }
  if (intent.status !== 'ACTIVE' && intent.status !== 'FROZEN') {
    throw new Error(`Intent ${intent.id} is ${intent.status}, not ACTIVE`);
  }

  const leg = intent.legs.find((l) => l.sequence === args.legSequence);
  if (!leg) throw new Error(`Intent ${args.intentId} has no leg at sequence ${args.legSequence}`);

  // A frozen intent must never reach the chain. The contract also refuses, but failing here
  // keeps the reason code and the audit event meaningful instead of surfacing a raw revert.
  if (intent.status === 'FROZEN' || leg.status === 'FROZEN') {
    return {
      settled: false,
      verdict: 'FREEZE',
      reason: ReasonCode.CVI_REVOKED_OR_EXPIRED,
      detail: 'Intent is frozen; remaining milestones are quarantined',
    };
  }
  if (leg.status !== 'PENDING') throw new Error(`Leg ${leg.id} is ${leg.status}, not PENDING`);

  const A = assets(chain);
  const escrow = escrowAddressForIntent(chain, intent.asset, intent.yieldMode);
  const escrowToken = await publicClient(chain).readContract({
    address: escrow, abi: ESCROW_ABI, functionName: 'token',
  });
  if (intent.asset.toLowerCase() !== escrowToken.toLowerCase()) {
    throw new Error(`Intent ${intent.id} asset does not match the deployed ${chain} escrow token`);
  }
  const decision = await evaluate({
    trigger: 'MILESTONE_RELEASE',
    chain: A.chain,
    atoken: intent.asset,
    identityAtoken: intent.asset.toLowerCase() === A.originToken.toLowerCase() ? A.aToken : undefined,
    senderAddress: intent.senderCvi,
    recipientAddress: leg.recipientCvi,
    amount: BigInt(leg.amount),
    policyId: intent.policyId as PolicyId,
    intentId: intent.id,
    legId: leg.id,
  });

  if (decision.verdict === 'FREEZE') {
    await freezeCascade({ intentId: intent.id, reason: decision.reason, detail: decision.detail, chain });
    return { settled: false, verdict: 'FREEZE', reason: decision.reason, detail: decision.detail };
  }

  if (decision.verdict !== 'PASS') {
    await prisma.leg.update({
      where: { id: leg.id },
      data: { status: decision.verdict === 'ISOLATE' ? 'ISOLATED' : 'PENDING' },
    });
    return { settled: false, verdict: decision.verdict, reason: decision.reason, detail: decision.detail };
  }

  // PASS. Only now do we sign.
  const auditRef = onChainIntentId(`${intent.id}:${leg.id}`);
  const { client, account } = releaserClient(chain);
  const txHash = await client.writeContract({
    address: escrow,
    abi: ESCROW_ABI,
    functionName: 'releaseLeg',
    args: [onChainIntentId(intent.id), BigInt(args.legSequence - 1), auditRef],
    account,
    chain: null,
  });
  const receipt = await publicClient(chain).waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== 'success') throw new Error(`Release transaction ${txHash} reverted`);

  await prisma.leg.update({
    where: { id: leg.id },
    data: { status: 'RELEASED', releasedAt: new Date(), txHash },
  });
  await recordEvent({
    intentId: intent.id,
    legId: leg.id,
    eventType: 'RELEASE',
    trigger: 'MILESTONE_RELEASE',
    verdict: 'PASS',
    checkResults: decision.checks,
    payload: { txHash, auditRef, chain, amount: leg.amount, recipient: leg.recipientCvi },
  });

  const remaining = await prisma.leg.count({ where: { intentId: intent.id, status: 'PENDING' } });
  if (remaining === 0) {
    await prisma.intent.update({ where: { id: intent.id }, data: { status: 'COMPLETED' } });
  }

  return { settled: true, txHash, auditRef };
}

/**
 * The freeze cascade. One revoked credential, every consequence, in one transaction boundary.
 *
 * Deliberately NOT a refund: principal stays in escrow under quarantine with its lineage
 * intact. Reactivation is impossible in UAT (DECISIONS.md D6), so this is terminal and the
 * UI must say so rather than implying an undo exists.
 */
export async function freezeCascade(args: {
  intentId: string;
  reason: string;
  detail: string;
  chain?: ChainKey;
}): Promise<{ frozen: true; txHash?: string; affectedIntents: string[] }> {
  const intent = await prisma.intent.findUnique({ where: { id: args.intentId }, include: { legs: true } });
  if (!intent) throw new Error(`Unknown intent ${args.intentId}`);
  const chain = args.chain ?? intent.chain ?? defaultChain();
  if (chain !== intent.chain) throw new Error(`Intent ${intent.id} belongs to ${intent.chain}, not ${chain}`);

  await prisma.intent.update({ where: { id: intent.id }, data: { status: 'FROZEN' } });
  await prisma.leg.updateMany({
    where: { intentId: intent.id, status: 'PENDING' },
    data: { status: 'FROZEN' },
  });

  let txHash: string | undefined;
  try {
    const escrow = escrowAddressForIntent(chain, intent.asset, intent.yieldMode);
    const { client, account } = releaserClient(chain);
    txHash = await client.writeContract({
      address: escrow,
      abi: ESCROW_ABI,
      functionName: 'freezeIntent',
      args: [onChainIntentId(intent.id), reasonToBytes32(args.reason), onChainIntentId(intent.id)],
      account,
      chain: null,
    });
    const receipt = await publicClient(chain).waitForTransactionReceipt({ hash: txHash as Hex });
    if (receipt.status !== 'success') throw new Error(`Freeze transaction ${txHash} reverted`);
  } catch (err) {
    // The DB freeze already happened and must stand: a chain failure must never leave the
    // system believing settlement is still permitted. Recorded, not swallowed.
    await recordEvent({
      intentId: intent.id,
      eventType: 'FREEZE',
      verdict: 'FREEZE',
      reasonCode: args.reason,
      checkResults: [],
      payload: { chainFreezeFailed: true, error: err instanceof Error ? err.message : String(err) },
    });
  }

  await recordEvent({
    intentId: intent.id,
    eventType: 'FREEZE',
    trigger: 'MILESTONE_RELEASE',
    verdict: 'FREEZE',
    reasonCode: args.reason,
    checkResults: [],
    payload: { detail: args.detail, txHash, chain, quarantinedLegs: intent.legs.filter((l) => l.status === 'PENDING').length },
  });

  return { frozen: true, txHash, affectedIntents: [intent.id] };
}

/**
 * Freeze EVERY active intent involving a revoked counterparty. This is what makes one
 * revocation visibly cascade into both a milestone escrow and a subscription, which is the
 * whole point of Moment B.
 */
export async function freezeAllForCounterparty(args: {
  recipientAddress: string;
  reason: string;
  detail: string;
  chain?: ChainKey;
  asset?: string;
}): Promise<string[]> {
  const legs = await prisma.leg.findMany({
    where: {
      recipientCvi: args.recipientAddress,
      status: 'PENDING',
      ...((args.chain || args.asset) ? { intent: { ...(args.chain ? { chain: args.chain } : {}), ...(args.asset ? { asset: args.asset } : {}) } } : {}),
    },
    include: { intent: true },
  });
  const intentIds = [...new Set(legs.filter((l) => l.intent.status === 'ACTIVE').map((l) => l.intentId))];

  for (const intentId of intentIds) {
    await freezeCascade({ intentId, reason: args.reason, detail: args.detail, chain: args.chain });
  }
  return intentIds;
}
