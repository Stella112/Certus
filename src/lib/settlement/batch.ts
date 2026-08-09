import { keccak256, stringToHex, type Hex } from 'viem';
import { prisma } from '../db';
import { recordEvent } from '../audit/record';
import { assets } from '../cleanverse/cva';
import { defaultChain, type ChainKey } from '../chain/config';
import { BATCH_ABI, batchAddress, publicClient, releaserClient } from '../chain/escrow';
import { evaluate } from '../pipeline/evaluate';
import { ReasonCode } from '../pipeline/reasonCodes';
import type { Decision } from '../pipeline/types';
import type { PolicyId } from '../pipeline/policies';
import { onChainIntentId } from './release';
import { signProvenance } from '../provenance/attestation';

export type BatchRowOutcome =
  | { legId: string; sequence: number; recipient: string; status: 'RELEASED'; txHash: string }
  | { legId: string; sequence: number; recipient: string; status: 'ISOLATED'; reason: string; detail: string };

export interface BatchRow {
  id: string;
  sequence: number;
  recipientCvi: string;
  amount: string;
}

/**
 * Pure isolation-ring orchestrator. Each row is evaluated and settled independently.
 * A refusal or chain failure is converted into that row's outcome and never aborts later
 * rows. The production wrapper below supplies the live evaluator and signer; unit tests
 * inject deterministic doubles without mocking any product component.
 */
export async function processIsolatedRows(args: {
  rows: BatchRow[];
  evaluateRow: (row: BatchRow) => Promise<Decision>;
  settleRow: (row: BatchRow) => Promise<string>;
  markReleased: (row: BatchRow, txHash: string, decision: Extract<Decision, { verdict: 'PASS' }>) => Promise<void>;
  markIsolated: (row: BatchRow, reason: string, detail: string, decision?: Decision) => Promise<void>;
}): Promise<BatchRowOutcome[]> {
  const outcomes: BatchRowOutcome[] = [];

  for (const row of [...args.rows].sort((a, b) => a.sequence - b.sequence)) {
    let decision: Decision;
    try {
      decision = await args.evaluateRow(row);
    } catch (error) {
      const detail = `Fail closed: row evaluation threw (${error instanceof Error ? error.message : String(error)})`;
      await args.markIsolated(row, ReasonCode.SYSTEM_ERROR, detail);
      outcomes.push({
        legId: row.id,
        sequence: row.sequence,
        recipient: row.recipientCvi,
        status: 'ISOLATED',
        reason: ReasonCode.SYSTEM_ERROR,
        detail,
      });
      continue;
    }

    if (decision.verdict !== 'PASS') {
      await args.markIsolated(row, decision.reason, decision.detail, decision);
      outcomes.push({
        legId: row.id,
        sequence: row.sequence,
        recipient: row.recipientCvi,
        status: 'ISOLATED',
        reason: decision.reason,
        detail: decision.detail,
      });
      continue;
    }

    let txHash: string;
    try {
      txHash = await args.settleRow(row);
    } catch (error) {
      const detail = `Fail closed: settlement transaction failed (${error instanceof Error ? error.message : String(error)})`;
      await args.markIsolated(row, ReasonCode.SYSTEM_ERROR, detail, decision);
      outcomes.push({
        legId: row.id,
        sequence: row.sequence,
        recipient: row.recipientCvi,
        status: 'ISOLATED',
        reason: ReasonCode.SYSTEM_ERROR,
        detail,
      });
      continue;
    }

    // From this line onward value has moved. A provenance/database failure must NEVER
    // reclassify the row as isolated or call isolateRow: that would make the projection lie
    // about an irreversible transfer. Halt the batch for reconciliation instead.
    try {
      await args.markReleased(row, txHash, decision);
    } catch (error) {
      throw new Error(
        `POST_SETTLEMENT_RECORD_FAILED for ${row.id} tx ${txHash}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    outcomes.push({ legId: row.id, sequence: row.sequence, recipient: row.recipientCvi, status: 'RELEASED', txHash });
  }

  return outcomes;
}

export async function releaseBatch(args: { intentId: string; chain?: ChainKey }): Promise<{
  intentId: string;
  total: number;
  released: number;
  isolated: number;
  outcomes: BatchRowOutcome[];
  isolationTxHash?: string;
}> {
  const intent = await prisma.intent.findUnique({ where: { id: args.intentId }, include: { legs: true } });
  if (!intent) throw new Error(`Unknown intent ${args.intentId}`);
  const chain = args.chain ?? intent.chain ?? defaultChain();
  if (chain !== intent.chain) throw new Error(`Intent ${intent.id} belongs to ${intent.chain}, not ${chain}`);
  if (intent.type !== 'BATCH') throw new Error(`Intent ${args.intentId} is ${intent.type}, not BATCH`);
  if (intent.status !== 'ACTIVE') throw new Error(`Batch ${args.intentId} is ${intent.status}, not ACTIVE`);

  const A = assets(chain);
  const batchToken = await publicClient(chain).readContract({
    address: batchAddress(chain), abi: BATCH_ABI, functionName: 'token',
  });
  if (intent.asset.toLowerCase() !== batchToken.toLowerCase()) {
    throw new Error(`Intent ${intent.id} asset does not match the deployed ${chain} batch token`);
  }
  const rows = intent.legs.filter((leg) => leg.status === 'PENDING');
  const auditRef = (row: BatchRow): Hex => keccak256(stringToHex(`${intent.id}:${row.id}`));

  const outcomes = await processIsolatedRows({
    rows,
    evaluateRow: (row) =>
      evaluate({
        trigger: 'BATCH_ADDRESS',
        chain: A.chain,
        atoken: intent.asset,
        senderAddress: intent.senderCvi,
        recipientAddress: row.recipientCvi,
        amount: BigInt(row.amount),
        policyId: intent.policyId as PolicyId,
        intentId: intent.id,
        legId: row.id,
      }),
    settleRow: async (row) => {
      const { client, account } = releaserClient(chain);
      const txHash = await client.writeContract({
        address: batchAddress(chain),
        abi: BATCH_ABI,
        functionName: 'releaseRow',
        args: [onChainIntentId(intent.id), BigInt(row.sequence - 1), auditRef(row)],
        account,
        chain: null,
      });
      const receipt = await publicClient(chain).waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== 'success') throw new Error(`Batch release transaction ${txHash} reverted`);
      return txHash;
    },
    markReleased: async (row, txHash, decision) => {
      const provenance = await signProvenance({
        chain,
        batchContract: batchAddress(chain),
        batchId: onChainIntentId(intent.id),
        legId: row.id,
        sender: intent.senderCvi as Hex,
        recipient: row.recipientCvi as Hex,
        asset: intent.asset as Hex,
        amount: row.amount,
        txHash: txHash as Hex,
        auditRef: auditRef(row),
      });
      await prisma.leg.update({ where: { id: row.id }, data: { status: 'RELEASED', releasedAt: new Date(), txHash } });
      await recordEvent({
        intentId: intent.id,
        legId: row.id,
        eventType: 'RELEASE',
        trigger: 'BATCH_ADDRESS',
        verdict: 'PASS',
        checkResults: decision.checks,
        payload: { txHash, auditRef: auditRef(row), chain, amount: row.amount, recipient: row.recipientCvi, provenance },
      });
    },
    markIsolated: async (row, reason, detail, decision) => {
      let chainIsolationFailed: string | undefined;
      try {
        const { client, account } = releaserClient(chain);
        const txHash = await client.writeContract({
          address: batchAddress(chain),
          abi: BATCH_ABI,
          functionName: 'isolateRow',
          args: [onChainIntentId(intent.id), BigInt(row.sequence - 1), keccak256(stringToHex(reason)), auditRef(row)],
          account,
          chain: null,
        });
        const receipt = await publicClient(chain).waitForTransactionReceipt({ hash: txHash });
        if (receipt.status !== 'success') throw new Error(`Batch isolation transaction ${txHash} reverted`);
      } catch (error) {
        chainIsolationFailed = error instanceof Error ? error.message : String(error);
      }
      await prisma.leg.update({ where: { id: row.id }, data: { status: 'ISOLATED' } });
      // evaluate() already writes the ordinary isolation event. This additional event is
      // necessary only when a PASS later fails at the chain boundary or evaluation throws.
      if (!decision || decision.verdict === 'PASS' || chainIsolationFailed) {
        await recordEvent({
          intentId: intent.id,
          legId: row.id,
          eventType: 'ISOLATE',
          trigger: 'BATCH_ADDRESS',
          verdict: 'ISOLATE',
          reasonCode: reason,
          checkResults: decision?.checks ?? [],
          payload: {
            detail,
            chain,
            amount: row.amount,
            recipient: row.recipientCvi,
            chainBoundaryFailure: !!decision,
            chainIsolationFailed,
          },
        });
      }
    },
  });

  const isolated = outcomes.filter((outcome) => outcome.status === 'ISOLATED');
  await prisma.intent.update({ where: { id: intent.id }, data: { status: 'COMPLETED' } });
  return {
    intentId: intent.id,
    total: outcomes.length,
    released: outcomes.length - isolated.length,
    isolated: isolated.length,
    outcomes,
  };
}
