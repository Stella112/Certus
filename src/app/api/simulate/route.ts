import { NextResponse } from 'next/server';
import { isAddress } from 'viem';
import { z } from 'zod';
import { assets } from '@/lib/cleanverse/cva';
import { chainConfig, deployment, listChains } from '@/lib/chain/config';
import { evaluate } from '@/lib/pipeline/evaluate';
import { ReasonCode } from '@/lib/pipeline/reasonCodes';
import type { PolicyId } from '@/lib/pipeline/policies';
import { verifyEligibility, queryIdentity } from '@/lib/cleanverse/cvi';
import { getAssetRules } from '@/lib/cleanverse/cva';
import { checkPolicy } from '@/lib/pipeline/policy';
import { recordEvent } from '@/lib/audit/record';

export const dynamic = 'force-dynamic';

const Body = z.object({ chain: z.string().refine(value => listChains().includes(value), 'Unsupported chain'), sender: z.string().refine(value => isAddress(value, { strict: false }), 'Invalid sender wallet'), recipient: z.string().refine(value => isAddress(value, { strict: false }), 'Invalid recipient wallet'), amount: z.string().regex(/^\d+$/, 'Amount must be base units').refine(value => BigInt(value) > 0n), policyId: z.enum(['PERMISSIVE', 'STANDARD', 'STRICT']), assetMode: z.enum(['AUSDC', 'USDC']).default('AUSDC'), purposeType: z.enum(['INVOICE', 'PURCHASE_ORDER', 'CONTRACT', 'MILESTONE', 'PAYROLL', 'OTHER']), purposeReference: z.string().trim().min(1).max(160), purposeHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional() });

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Simulation requires sender, recipient, amount, policy, and proof-of-purpose', issues: parsed.error.issues }, { status: 400 });
  const input = parsed.data;
  const network = chainConfig(input.chain);
  const configured = assets(input.chain);
  const deployed = deployment(input.chain);
  const atoken = input.assetMode === 'USDC' ? (deployed.originEscrowAsset ?? configured.originToken) : (deployed.escrowAsset ?? configured.aToken);
  const noAudit = async (..._args: Parameters<typeof recordEvent>) => null as unknown as Awaited<ReturnType<typeof recordEvent>>;
  const decision = await evaluate({ trigger: 'INTENT_CREATE', chain: configured.chain, atoken, identityAtoken: configured.aToken, senderAddress: input.sender, recipientAddress: input.recipient, amount: BigInt(input.amount), policyId: input.policyId as PolicyId }, { verifyEligibility, queryIdentity, getAssetRules, checkPolicy, recordEvent: noAudit });
  return NextResponse.json({ mode: 'DRY_RUN', chain: input.chain, network: network.label, asset: atoken, purpose: { type: input.purposeType, reference: input.purposeReference, hash: input.purposeHash ?? null }, decision, reason: decision.verdict === 'PASS' ? null : { code: decision.reason, text: decision.reason ? ReasonCode[decision.reason] : 'Simulation failed' } });
}
