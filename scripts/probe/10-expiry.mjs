// Resolve OPEN QUESTION #2 definitively: does data.code 3 exist for a pass that
// expires WHILE LIVE? Register with expiry ~120s out, verify (expect 4), wait, re-verify.
import { call } from './call.mjs';

const ATOKEN = '0xaC0893567D43C3E7e6e35a72803df05416C1f20D';
const addr = process.argv[2];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const expiry = Math.floor(Date.now() / 1000) + 150;
console.log('registering with expirationTime', expiry, '(~150s out) for', addr);
await call('/generate_apass', {
  wallet: { chain: 'monad', address: addr },
  customerId: 'CERTUSEXP' + Date.now(),
  expirationTime: expiry,
  tier: '50', subTier: 0, group: '', subGroup: '', countries: ['NG'],
}, { encrypted: true });

await sleep(5000);
console.log('\n--- verify BEFORE expiry (expect data.code 4) ---');
const before = await call('/verify_apass', { chain: 'monad', atoken: ATOKEN, address: addr }, { encrypted: false });
console.log('  before: data.code =', before.json?.data?.code);

console.log('\n--- waiting 165s for natural expiry ---');
await sleep(165000);

console.log('\n--- verify AFTER expiry ---');
const after = await call('/verify_apass', { chain: 'monad', atoken: ATOKEN, address: addr }, { encrypted: false });
console.log('\n===== EXPIRY RESULT =====');
console.log('before expiry: data.code =', before.json?.data?.code);
console.log('after  expiry: data.code =', after.json?.data?.code, '| envelope =', after.json?.code);
console.log('after  msg   :', (after.json?.message || '').slice(0, 140));
const ac = after.json?.data?.code;
if (ac === 3) console.log('=> CODE 3 EXISTS, and means EXPIRED. Distinguish CVI_EXPIRED from CVI_REVOKED.');
else if ((after.json?.message || '').includes('APassNotActive')) console.log('=> Expired ALSO surfaces as APassNotActive. Code 3 unreachable; single reason code.');
else console.log('=> Other behavior, record verbatim.');
