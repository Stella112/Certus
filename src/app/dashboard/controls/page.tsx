import { LiveOversight } from '@/app/components/LiveOversight';
import { prisma } from '@/lib/db';
import { deployment } from '@/lib/chain/config';
import { selectedChain, type SearchParams } from '@/lib/chain/selection';
import { PageTitle, StatCard } from '../components';

export default async function Controls({ searchParams }: { searchParams: SearchParams }) {
  const chain = await selectedChain(searchParams);
  const deployed = deployment(chain);
  const [intents, eventCount, recent, pending] = await Promise.all([
    prisma.intent.findMany({ where: { chain }, include: { legs: true }, take: 50 }),
    prisma.auditEvent.count({ where: { intent: { chain } } }),
    prisma.auditEvent.findMany({ where: { intent: { chain } }, orderBy: { occurredAt: 'desc' }, take: 12 }),
    prisma.leg.findMany({ where: { status: 'PENDING', intent: { chain, status: 'ACTIVE' } }, select: { recipientCvi: true }, distinct: ['recipientCvi'] }),
  ]);
  const held = intents.flatMap((intent) => intent.legs).filter((leg) => ['ISOLATED', 'FROZEN', 'QUARANTINED'].includes(leg.status)).length;
  const symbols = [...new Set([deployed.escrowAssetSymbol, deployed.batchAssetSymbol].filter(Boolean))];

  return (
    <>
      <PageTitle eyebrow="Protection" title="Controls & audit" description="The safeguards behind every Certus payment. Inspect decisions, trace lineage, or freeze an unsafe relationship." />
      <section className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard label="Audit events" value={eventCount} detail="Append-only evidence" tone="indigo" />
        <StatCard label="Held payments" value={held} detail="Protected from release" tone="amber" />
        <StatCard label="Deployed assets" value={symbols.join(' / ') || 'None'} detail={`${chain} contract bindings`} tone="green" />
      </section>
      <LiveOversight chain={chain} initial={recent.map((event) => ({ ...event, occurredAt: event.occurredAt.toISOString() }))} counterparties={pending.map((leg) => leg.recipientCvi)} />
    </>
  );
}
