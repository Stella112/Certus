import { NextResponse } from 'next/server';
import { isAddress } from 'viem';
import { z } from 'zod';
import { chainConfig, listChains } from '@/lib/chain/config';
import { publicClient, ERC20_ABI } from '@/lib/chain/escrow';

export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  chain: z.string().refine((value) => listChains().includes(value), 'Unsupported chain'),
  address: z.string().refine(isAddress, 'Invalid wallet address'),
});

/** Read the canonical settlement-asset balance from the configured chain RPC. */
export async function GET(req: Request) {
  const parsed = QuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid balance request', issues: parsed.error.issues }, { status: 400 });
  const config = chainConfig(parsed.data.chain);
  try {
    const units = await publicClient(parsed.data.chain).readContract({
      address: config.aToken as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [parsed.data.address as `0x${string}`],
    });
    return NextResponse.json({ chain: parsed.data.chain, address: parsed.data.address, asset: config.aToken, symbol: config.symbol, decimals: config.decimals, units: units.toString() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not read chain balance' }, { status: 503 });
  }
}
