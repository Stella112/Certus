// AUDITOR probes: independently test claims API-TRUTH.md marks unconfirmed.
// (1) Does verify_apass really return data.code 1 for a bogus A-Token?
// (2) Does data.code 3 exist at all — e.g. for an EXPIRED (not frozen) A-Pass?
//     PART XI claims 3 = "expired OR frozen". We proved frozen => APassNotActive.
//     If expired also => APassNotActive, then code 3 is unreachable and the pipeline
//     must not branch on it. Resolves OPEN QUESTION #2.
import { call } from './call.mjs';

const ATOKEN = '0xaC0893567D43C3E7e6e35a72803df05416C1f20D';
const REAL_ACTIVE = '0x2e2BA14F6784B72fE9874b41811193B5B0bdd0cA';
const BOGUS_ATOKEN = '0x1111111111111111111111111111111111111111';

console.log('=== (1) verify_apass with BOGUS atoken (expect data.code 1?) ===');
await call('/verify_apass', { chain: 'monad', atoken: BOGUS_ATOKEN, address: REAL_ACTIVE }, { encrypted: false });

console.log('\n=== (2) register an EXPIRED A-Pass, then verify it ===');
const expiredAddr = process.argv[2];
if (!expiredAddr) { console.error('pass an address as argv[2]'); process.exit(1); }
const customerId = 'CERTUSEXPIRED' + Date.now();
await call('/generate_apass', {
  wallet: { chain: 'monad', address: expiredAddr },
  customerId,
  expirationTime: 1700000000, // Nov 2023 — in the past
  tier: '50', subTier: 0, group: '', subGroup: '', countries: ['NG'],
}, { encrypted: true });

await new Promise(r => setTimeout(r, 4000));
console.log('\n--- verify the expired identity ---');
const r = await call('/verify_apass', { chain: 'monad', atoken: ATOKEN, address: expiredAddr }, { encrypted: false });
console.log('\nRESULT: data.code =', r.json?.data?.code, '| envelope =', r.json?.code, '| msg =', (r.json?.message||'').slice(0,120));
