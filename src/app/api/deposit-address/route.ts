import { NextResponse } from 'next/server';
import { z } from 'zod';
import { queryDepositAddress } from '@/lib/cleanverse/cva';
import { requireOperator } from '@/lib/http/operator';
import { chainConfig, listChains } from '@/lib/chain/config';
import type { Chain } from '@/lib/cleanverse/types';

export const dynamic = 'force-dynamic';
const BodySchema = z.object({
  chain: z.string().refine((value) => listChains().includes(value), 'Unsupported chain'),
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Invalid EVM wallet address'),
});

export async function POST(req: Request) {
  const denied = requireOperator(req); if (denied) return denied;
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid deposit-address request', issues: parsed.error.issues }, { status: 400 });
  const result = await queryDepositAddress({ chain: chainConfig(parsed.data.chain).cleanverseChain as Chain, address: parsed.data.address });
  if (!result.ok) return NextResponse.json({ error: result.error, code: 'code' in result ? result.code : undefined, detail: 'detail' in result ? result.detail : undefined }, { status: 'detail' in result ? 503 : 422 });
  return NextResponse.json(result.data);
}
