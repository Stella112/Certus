import { prisma } from '@/lib/db';
import { listChains } from '@/lib/chain/config';
import { requireOperator } from '@/lib/http/operator';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const denied = requireOperator(req); if (denied) return denied;
  const url = new URL(req.url);
  const chain = url.searchParams.get('chain') ?? 'monad';
  if (!listChains().includes(chain)) return Response.json({ error: 'Unsupported chain' }, { status: 400 });
  if (url.searchParams.get('snapshot') === '1') {
    const events = await prisma.auditEvent.findMany({ where: { intent: { chain } }, orderBy: { occurredAt: 'desc' }, take: 12 });
    return Response.json({ events }, { headers: { 'cache-control': 'no-store' } });
  }
  let cursor = new Date(url.searchParams.get('after') ?? Date.now());
  if (Number.isNaN(cursor.getTime())) return Response.json({ error: 'Invalid after timestamp' }, { status: 400 });
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode('retry: 500\n\n'));
      const poll = async () => {
        if (req.signal.aborted) return controller.close();
        try {
          const events = await prisma.auditEvent.findMany({
            where: { occurredAt: { gt: cursor }, intent: { chain } }, orderBy: { occurredAt: 'asc' }, take: 50,
          });
          for (const event of events) {
            cursor = event.occurredAt;
            controller.enqueue(encoder.encode(`id: ${event.id}\nevent: audit\ndata: ${JSON.stringify(event)}\n\n`));
          }
          controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
          timer = setTimeout(poll, 500);
        } catch (error) {
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ detail: error instanceof Error ? error.message : String(error) })}\n\n`));
          timer = setTimeout(poll, 1000);
        }
      };
      await poll();
    },
    cancel() { if (timer) clearTimeout(timer); },
  });
  return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive' } });
}
