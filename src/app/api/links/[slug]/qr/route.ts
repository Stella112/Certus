import { paymentLinkQr } from '@/lib/settlement/payment-links';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const link = await prisma.paymentLink.findUnique({ where: { slug }, select: { status: true, expiresAt: true } });
  if (!link || link.status !== 'ACTIVE') return Response.json({ error: 'Payment link is not active' }, { status: 404 });
  if (link.expiresAt && link.expiresAt <= new Date()) return Response.json({ error: 'Payment link has expired' }, { status: 410 });
  const origin = process.env.APP_URL ?? new URL(req.url).origin;
  const svg = await paymentLinkQr(slug, origin);
  return new Response(svg, { headers: { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'no-store' } });
}
