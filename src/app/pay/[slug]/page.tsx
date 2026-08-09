import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { PaymentLinkClient } from './payment-link-client';
import { chainConfig, formatAmount, listChains } from '@/lib/chain/config';

export const dynamic = 'force-dynamic';

export default async function PaymentLinkPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const link = await prisma.paymentLink.findUnique({ where: { slug }, include: { intent: true } });
  if (!link || link.status !== 'ACTIVE' || (link.expiresAt && link.expiresAt <= new Date())) notFound();
  if (!listChains().includes(link.intent.chain)) notFound();
  const chain = chainConfig(link.intent.chain);
  return (
    <main className="min-h-screen bg-slate-50 px-5 py-14 text-slate-950 dark:bg-slate-950 dark:text-white">
      <section className="mx-auto max-w-lg rounded-3xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/20">
        <div className="mb-7 flex items-center justify-between">
          <div><p className="text-sm font-semibold text-indigo-600">CERTUS</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">Compliant payment request</h1></div>
          <img src={`/api/links/${encodeURIComponent(slug)}/qr`} alt="QR code for this payment link" className="h-20 w-20 rounded-lg" />
        </div>
        <dl className="mb-7 grid grid-cols-2 gap-4 rounded-2xl bg-slate-50 p-4 text-sm dark:bg-slate-950">
          <div><dt className="text-slate-500">Amount</dt><dd className="mt-1 font-mono font-semibold">{formatAmount(BigInt(link.amount), link.intent.chain)} {chain.symbol}</dd></div>
          <div><dt className="text-slate-500">Network</dt><dd className="mt-1 font-semibold">{chain.label}</dd></div>
        </dl>
        <PaymentLinkClient slug={slug} />
      </section>
    </main>
  );
}
