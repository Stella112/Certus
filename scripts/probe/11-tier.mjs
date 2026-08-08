// Phase 1 open unknown: aUSDC requires min_tier 5.
// What does verify_apass return for a pass that EXISTS but is BELOW min_tier?
// - If a distinct code/message => check 3 has its own signal, surface it separately.
// - If code 4 anyway => verify_apass does NOT enforce tier; check 3 must do it locally.
// - If APassNotActive => tier failure is indistinguishable from revocation (bad; must
//   disambiguate via query_apass attributes before assigning a reason code).
import { call } from './call.mjs';

const ATOKEN = '0xaC0893567D43C3E7e6e35a72803df05416C1f20D'; // min_tier 5
const addr = process.argv[2];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

console.log('minting LOW-TIER (tier 1) identity for', addr);
await call('/generate_apass', {
  wallet: { chain: 'monad', address: addr },
  customerId: 'CERTUSLOWTIER' + Date.now(),
  expirationTime: 1900000000,
  tier: '1', subTier: 0, group: '', subGroup: '', countries: ['NG'],
}, { encrypted: true });

await sleep(5000);

console.log('\n--- query_apass: what tier did it actually get? ---');
const q = await call('/query_apass', { chain: 'monad', address: addr }, { encrypted: false });
console.log('  tier =', q.json?.data?.tier, '| status =', q.json?.data?.status);

console.log('\n--- verify_apass against aUSDC (min_tier 5) ---');
const v = await call('/verify_apass', { chain: 'monad', atoken: ATOKEN, address: addr }, { encrypted: false });

console.log('\n===== TIER PROBE RESULT =====');
console.log('registered tier :', q.json?.data?.tier);
console.log('verify data.code:', v.json?.data?.code);
console.log('verify envelope :', v.json?.code);
console.log('verify message  :', (v.json?.data?.message || v.json?.message || '').slice(0, 140));
