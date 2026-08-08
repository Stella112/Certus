// Is the sandbox degraded, or is generate_apass rate-limited?
// 1. Are READ endpoints still healthy?
// 2. Does the EXACT payload shape that succeeded earlier still succeed?
import { call } from './call.mjs';

console.log('=== READ health: query_apass_list ===');
const l = await call('/query_apass_list', { pageNo: 1, pageSize: 2 }, { encrypted: false });
console.log('  read ok?', l.json?.code === '0000', '| total identities now:', l.json?.data?.total);

console.log('\n=== READ health: verify_apass on a known-good identity ===');
const v = await call('/verify_apass', {
  chain: 'monad',
  atoken: '0xaC0893567D43C3E7e6e35a72803df05416C1f20D',
  address: '0x2e2BA14F6784B72fE9874b41811193B5B0bdd0cA',
}, { encrypted: false });
console.log('  verify data.code =', v.json?.data?.code);

console.log('\n=== WRITE: replay the EXACT payload shape that worked at 01:29 ===');
const addr = process.argv[2];
const w = await call('/generate_apass', {
  wallet: { chain: 'monad', address: addr },
  customerId: 'CERTUSFREEZE' + Date.now(),
  expirationTime: 1900000000,
  tier: '50',
  subTier: 0,
  group: '',
  subGroup: '',
  countries: ['NG'],
}, { encrypted: true });
console.log('\n===== HEALTH RESULT =====');
console.log('reads healthy :', l.json?.code === '0000' && v.json?.data?.code === 4);
console.log('write result  :', w.json?.code, w.json?.message);
