import { NextResponse } from 'next/server';
import { z } from 'zod';
import { freezeIdentity } from '@/lib/cleanverse/cvi';
import { assets } from '@/lib/cleanverse/cva';
import { listChains } from '@/lib/chain/config';
import { sweepOnce } from '@/lib/watch/revocation';
import { requireOperator } from '@/lib/http/operator';

export const dynamic = 'force-dynamic';
const Body = z.object({ chain: z.string().refine((value) => listChains().includes(value)), address: z.string().regex(/^0x[0-9a-fA-F]{40}$/), reason: z.string().min(4).max(200) });

export async function POST(req: Request) {
  const denied = requireOperator(req); if (denied) return denied;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid freeze request' }, { status: 400 });
  const { chain, address, reason } = parsed.data;
  const frozen = await freezeIdentity({ chain: assets(chain).chain, address, reason });
  if (!frozen.ok) return NextResponse.json({ frozen: false, detail: frozen.detail }, { status: 503 });
  const cascades = await sweepOnce(chain);
  return NextResponse.json({ frozen: true, txHash: frozen.txHash, cascades });
}
