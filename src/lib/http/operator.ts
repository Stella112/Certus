import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

/**
 * Operator boundary for routes that mutate settlement state or expose the full audit store.
 * Local development remains usable without credentials, but a production deployment fails
 * closed unless CERTUS_OPERATOR_TOKEN is configured.
 */
export function requireOperator(req: Request): NextResponse | null {
  const expected = process.env.CERTUS_OPERATOR_TOKEN?.trim();
  const url = new URL(req.url);
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';

  if (!expected) {
    if (process.env.NODE_ENV !== 'production' && local) return null;
    return NextResponse.json({ error: 'Operator authentication is not configured' }, { status: 503 });
  }

  const authorization = req.headers.get('authorization');
  const supplied = authorization?.startsWith('Bearer ')
    ? authorization.slice(7).trim()
    : req.headers.get('x-certus-operator-token')?.trim();
  if (!supplied) return NextResponse.json({ error: 'Operator authentication required' }, { status: 401 });

  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return NextResponse.json({ error: 'Operator authentication failed' }, { status: 403 });
  }
  return null;
}
