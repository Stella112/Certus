import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isAddress } from 'viem';
import { prisma } from '@/lib/db';
import { assets } from '@/lib/cleanverse/cva';
import { deployment, listChains } from '@/lib/chain/config';
import { recordEvent } from '@/lib/audit/record';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  chain: z.string().refine((value) => listChains().includes(value), 'Unsupported chain'),
  senderCvi: z.string().refine((value) => isAddress(value, { strict: false }), 'Invalid sender wallet'),
  recipientCvi: z.string().refine((value) => isAddress(value, { strict: false }), 'Invalid recipient wallet'),
  amount: z.string().regex(/^\d+$/, 'Amount must be base units').refine((value) => BigInt(value) > 0n, 'Amount must be greater than zero'),
  intentType: z.enum(['MILESTONE', 'RECURRING']).default('MILESTONE'),
  recurrenceCount: z.number().int().min(1).max(24).default(1),
  policyId: z.enum(['PERMISSIVE', 'STANDARD', 'STRICT']),
  privacyMode: z.enum(['PUBLIC', 'PRIVATE_METADATA']).default('PUBLIC'),
  assetMode: z.enum(['AUSDC', 'USDC']).default('AUSDC'),
  yieldMode: z.boolean().default(false),
  purposeType: z.enum(['INVOICE', 'PURCHASE_ORDER', 'CONTRACT', 'MILESTONE', 'PAYROLL', 'OTHER']).optional(),
  purposeReference: z.string().trim().max(160).optional(),
  purposeHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'Purpose hash must be a 32-byte hex hash').optional(),
});

/** Create a locally tracked intent. Funds are not considered committed until /fund verifies the chain state. */
export async function POST(req: Request) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid intent', issues: parsed.error.issues }, { status: 400 });

  const { chain, senderCvi, recipientCvi, amount, policyId, privacyMode, assetMode, intentType, recurrenceCount, yieldMode, purposeType, purposeReference, purposeHash } = parsed.data;
  if ((purposeReference || purposeHash) && !purposeType) return NextResponse.json({ error: 'purposeType is required when proof-of-purpose evidence is supplied' }, { status: 400 });
  const configured = assets(chain);
  const deployed = deployment(chain);
  if (yieldMode && (assetMode !== 'AUSDC' || intentType !== 'MILESTONE')) return NextResponse.json({ error: 'Yield protection is currently available for one-stage aUSDC payments only' }, { status: 400 });
  const escrow = yieldMode ? deployed.yieldEscrow : assetMode === 'USDC' ? deployed.originEscrow : deployed.escrow;
  const asset = assetMode === 'USDC' ? (deployed.originEscrowAsset ?? configured.originToken) : (deployed.escrowAsset ?? configured.aToken);
  if (!escrow) return NextResponse.json({ error: 'No compatible Certus escrow is deployed on this network' }, { status: 409 });
  if (yieldMode && deployed.yieldAsset?.toLowerCase() !== asset.toLowerCase()) return NextResponse.json({ error: 'Yield escrow is not bound to the active aUSDC asset' }, { status: 409 });

  const unitAmount = BigInt(amount);
  const totalAmount = unitAmount * BigInt(intentType === 'RECURRING' ? recurrenceCount : 1);
  const intent = await prisma.intent.create({
    data: {
      chain,
      type: intentType,
      senderCvi,
      asset,
      amount: totalAmount.toString(),
      status: 'DRAFT',
      policyId,
      privacyMode,
      yieldMode,
      purposeType,
      purposeReference,
      purposeHash,
      legs: { create: Array.from({ length: intentType === 'RECURRING' ? recurrenceCount : 1 }, (_, index) => ({ recipientCvi, amount, sequence: index + 1, status: 'PENDING' })) },
    },
    include: { legs: true },
  });
  await recordEvent({
    intentId: intent.id,
    eventType: 'CHECK_RUN',
    trigger: 'INTENT_CREATE',
    verdict: 'PENDING',
    checkResults: [],
    payload: { chain, asset, assetMode, yieldMode, sender: senderCvi, recipient: recipientCvi, amount: totalAmount.toString(), unitAmount: amount, recurrenceCount, policyId, privacyMode, purpose: purposeType ? { type: purposeType, reference: purposeReference, hash: purposeHash } : null, disclosure: privacyMode === 'PRIVATE_METADATA' ? 'COUNTERPARTY_MINIMUM' : 'FULL_AUDIT' },
  });

  return NextResponse.json({ intentId: intent.id, chain, asset, assetMode, escrow, yieldMode, privacyMode, purpose: purposeType ? { type: purposeType, reference: purposeReference, hash: purposeHash } : null, recurrenceCount, unitAmount: amount, totalAmount: totalAmount.toString(), disclosure: privacyMode === 'PRIVATE_METADATA' ? 'COUNTERPARTY_MINIMUM' : 'FULL_AUDIT', leg: intent.legs[0] }, { status: 201 });
}
