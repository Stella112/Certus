import { NextResponse } from 'next/server';
import { isAddress } from 'viem';
import { chainConfig, deployment, listChains } from '@/lib/chain/config';
import { publicClient, SPONSORED_YIELD_ABI } from '@/lib/chain/escrow';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const chain = url.searchParams.get('chain') ?? 'monad';
  const address = url.searchParams.get('address') ?? '';
  if (!listChains().includes(chain) || !isAddress(address, { strict: false })) return NextResponse.json({ error: 'Invalid chain or address' }, { status: 400 });
  const vault = deployment(chain).sponsoredYieldVault;
  if (!vault) return NextResponse.json({ error: 'Standalone sponsored yield vault is not deployed on this chain' }, { status: 409 });
  const client = publicClient(chain);
  const [position, reserve] = await Promise.all([
    client.readContract({ address: vault as `0x${string}`, abi: SPONSORED_YIELD_ABI, functionName: 'positionOf', args: [address as `0x${string}`] }),
    client.readContract({ address: vault as `0x${string}`, abi: SPONSORED_YIELD_ABI, functionName: 'reserve' }),
  ]);
  const [principal, bonus, lastAccrualBlock, active, frozen] = position;
  const deployed = deployment(chain);
  return NextResponse.json({ chain, vault, custodian: deployed.sponsoredYieldCustodian, custodyMode: deployed.sponsoredYieldCustodyMode, reserve: reserve.toString(), position: { principal: principal.toString(), bonus: bonus.toString(), lastAccrualBlock: lastAccrualBlock.toString(), active, frozen }, decimals: chainConfig(chain).decimals });
}
