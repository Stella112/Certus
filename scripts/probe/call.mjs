// Throwaway Phase-0 caller. Prints raw responses so we learn the REAL shapes.
// Not the production adapter (that is Phase 1, in src/lib/cleanverse).
import { encryptBody } from './aes.mjs';

const BASE = process.env.CLEANVERSE_BASE_URL;
const API_ID = process.env.CLEANVERSE_API_ID;

if (!BASE || !API_ID) {
  console.error('Missing CLEANVERSE_BASE_URL or CLEANVERSE_API_ID in env');
  process.exit(1);
}

/**
 * POST to a Cleanverse endpoint.
 * @param path   e.g. '/query_apass_list'
 * @param body   plain JS object
 * @param opts   { encrypted: boolean }  -> wrap as {"data":"<aes>"}
 */
export async function call(path, body = {}, opts = {}) {
  const url = BASE + path;
  const payload = opts.encrypted
    ? { data: encryptBody(JSON.stringify(body)) }
    : body;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-id': API_ID },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* leave as text */ }

  console.log(`\n=== POST ${path} ${opts.encrypted ? '(AES body)' : '(plain)'} ===`);
  console.log('HTTP status:', res.status);
  const limit = opts.full ? 100000 : 4000;
  console.log('raw body   :', text.length > limit ? text.slice(0, limit) + ' ...[truncated]' : text);

  if (opts.saveAs) {
    const fs = await import('node:fs');
    fs.mkdirSync('scripts/probe/out', { recursive: true });
    fs.writeFileSync(`scripts/probe/out/${opts.saveAs}.json`, text);
  }
  return { httpStatus: res.status, json, text };
}
