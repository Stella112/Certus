// Poll the async issuance of our self-issued A-Token.
// query_apply_status is documented as GET /atoken/query_apply_status/{requestId}; our helper
// only POSTs, so try both the path form and a POST body form.
import { call } from './call.mjs';

const REQUEST_ID = 'IA20260808205025557489';
const BASE = process.env.CLEANVERSE_BASE_URL;
const API_ID = process.env.CLEANVERSE_API_ID;

console.log('--- GET /atoken/query_apply_status/{requestId} ---');
const res = await fetch(`${BASE}/atoken/query_apply_status/${REQUEST_ID}`, {
  method: 'GET',
  headers: { 'api-id': API_ID },
});
console.log('  http', res.status, (await res.text()).slice(0, 400));

console.log('\n--- POST variants, in case the helper path is wrong ---');
await call(`/atoken/query_apply_status/${REQUEST_ID}`, {}, { encrypted: false });
await call('/atoken/query_apply_status', { requestId: REQUEST_ID }, { encrypted: false });
await call('/atoken/query_apply_status', { request_id: REQUEST_ID }, { encrypted: false });

console.log('\n--- has a new A-Token appeared for this chain? ---');
const list = await call('/query_deposit_atoken_list', { chain: process.env.CHAIN_NAME }, { encrypted: false });
for (const t of list.json?.data?.tokens ?? []) {
  console.log(`  ${t.origin_token?.symbol} -> ${t.atoken?.symbol} ${t.atoken?.address}`);
}
