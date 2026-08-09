import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isAddress } from 'viem';
import { prisma } from '@/lib/db';
import { assets } from '@/lib/cleanverse/cva';
import { deployment, listChains } from '@/lib/chain/config';
import { recordEvent } from '@/lib/audit/record';

export const dynamic = 'force-dynamic';

const RowSchema = z.object({
  recipientCvi: z.string().refine((value) => isAddress(value, { strict: false }), 'Invalid recipient wallet'),
  amount: z.string().regex(/^\d+$/, 'Amount must be base units').refine((value) => BigInt(value) > 0n, 'Amount must be greater than zero'),
});

const BodySchema = z.object({
  chain: z.string().refine((value) => listChains().includes(value), 'Unsupported chain'),
  senderCvi: z.string().refine((value) => isAddress(value, { strict: false }), 'Invalid sender wallet'),
  policyId: z.enum(['PERMISSIVE', 'STANDARD', 'STRICT']).default('STANDARD'),
  privacyMode: z.enum(['PUBLIC', 'PRIVATE_METADATA']).default('PUBLIC'),
  rows: z.array(RowSchema).min(1).max(100),
});

/** Create a payroll batch draft. Funds are committed only after /fund verifies the chain transaction. */
export async function POST(req: Request) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid payroll batch', issues: parsed.error.issues }, { status: 400 });

  const { chain, senderCvi, policyId, privacyMode, rows } = parsed.data;
  const configured = assets(chain);
  const deployed = deployment(chain);
  if (!deployed.batch || !deployed.batchAsset) {
    return NextResponse.json({ error: 'Clean payroll is not deployed on this network yet' }, { status: 409 });
  }
  if (deployed.batchAsset.toLowerCase() !== configured.aToken.toLowerCase()) {
    return NextResponse.json({ error: 'Payroll contract is not bound to the active aUSDC asset' }, { status: 409 });
  }

  const total = rows.reduce((sum, row) => sum + BigInt(row.amount), 0n);
  const intent = await prisma.intent.create({
    data: {
      chain,
      type: 'BATCH',
      senderCvi,
      asset: deployed.batchAsset,
      amount: total.toString(),
      status: 'DRAFT',
      policyId,
      privacyMode,
      legs: { create: rows.map((row, index) => ({ recipientCvi: row.recipientCvi, amount: row.amount, sequence: index + 1, status: 'PENDING' })) },
    },
    include: { legs: true },
  });
  await recordEvent({
    intentId: intent.id,
    eventType: 'CHECK_RUN',
    trigger: 'INTENT_CREATE',
    verdict: 'PENDING',
    checkResults: [],
    payload: { chain, asset: deployed.batchAsset, sender: senderCvi, rows: rows.length, amount: total.toString(), policyId, privacyMode, mode: 'CLEAN_PAYROLL' },
  });
  return NextResponse.json({ intentId: intent.id, chain, asset: deployed.batchAsset, batch: deployed.batch, totalAmount: total.toString(), rows: intent.legs }, { status: 201 });
}
