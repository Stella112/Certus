import { call } from './call.mjs';

const ATOKEN_AUSDC = '0xaC0893567D43C3E7e6e35a72803df05416C1f20D';
const TEST_ADDR = '0x820350D47277784A26FF4D4cE08C12CAD6F19094';

console.log('--- atoken/rules variant: atoken_address ---');
await call('/atoken/rules', { chain: 'monad', atoken_address: ATOKEN_AUSDC }, { encrypted: false });

console.log('\n--- atoken/rules variant: address ---');
await call('/atoken/rules', { chain: 'monad', address: ATOKEN_AUSDC }, { encrypted: false });

console.log('\n--- generate_apass: fuller body (AES) ---');
const customerId = 'CERTUSFREEZE' + Date.now();
await call('/generate_apass', {
  wallet: { chain: 'monad', address: TEST_ADDR },
  customerId,
  expirationTime: 1900000000,
  tier: '50',
  subTier: 0,
  group: '',
  subGroup: '',
  countries: ['NG'],
}, { encrypted: true, full: true, saveAs: 'generate_apass_try' });
console.log('\ncustomerId used:', customerId);
