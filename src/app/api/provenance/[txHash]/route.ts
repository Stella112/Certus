import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, context: { params: Promise<{ txHash: string }> }) {
  const { txHash } = await context.params;
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) return NextResponse.json({ error: 'Invalid transaction hash' }, { status: 400 });
  const events = await prisma.auditEvent.findMany({ where: { eventType: 'RELEASE' }, orderBy: { occurredAt: 'desc' } });
  for (const event of events) {
    try {
      const payload = JSON.parse(event.payload);
      if (payload.txHash?.toLowerCase() === txHash.toLowerCase() && payload.provenance) {
        return new NextResponse(JSON.stringify(payload.provenance, null, 2), {
          headers: {
            'Content-Type': 'application/json',
            'Content-Disposition': `attachment; filename="certus-provenance-${txHash.slice(2, 10)}.json"`,
          },
        });
      }
    } catch {
      // An older event without the v1 provenance payload is simply not a match.
    }
  }
  return NextResponse.json({ error: 'Provenance attestation not found' }, { status: 404 });
}
