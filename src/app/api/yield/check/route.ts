import { NextResponse } from 'next/server';
import { isAddress } from 'viem';
import { z } from 'zod';
import { assets } from '@/lib/cleanverse/cva';
import { chainConfig, deployment, listChains } from '@/lib/chain/config';
import { verifyEligibility } from '@/lib/cleanverse/cvi';
import { publicClient, SPONSORED_YIELD_ABI } from '@/lib/chain/escrow';

export const dynamic = 'force-dynamic';

const Body = z.object({ chain: z.string().refine((value) => listChains().includes(value), 'Unsupported chain'), address: z.string().refine((value) => isAddress(value, { strict: false }), 'Invalid wallet address') });

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid wallet request' }, { status: 400 });
  const deployed = deployment(parsed.data.chain);
  if (!deployed.sponsoredYieldVault) return NextResponse.json({ error: 'Standalone sponsored yield vault is not deployed on this chain' }, { status: 409 });
  const reserve = await publicClient(parsed.data.chain).readContract({ address: deployed.sponsoredYieldVault as `0x${string}`, abi: SPONSORED_YIELD_ABI, functionName: 'reserve' });
  if (reserve === 0n) return NextResponse.json({ error: 'Sponsored reserve is unavailable: the A-Pass custodian has no uncommitted aUSDC available for this testnet pilot.' }, { status: 409 });
  const network = chainConfig(parsed.data.chain);
  const result = await verifyEligibility({ chain: assets(parsed.data.chain).chain, atoken: network.aToken, address: parsed.data.address });
  return NextResponse.json({ eligible: result.signal === 'ALLOWED', signal: result.signal, detail: result.detail, chain: parsed.data.chain, vault: deployed.sponsoredYieldVault, custodian: deployed.sponsoredYieldCustodian, custodyMode: deployed.sponsoredYieldCustodyMode, asset: network.aToken });
}
