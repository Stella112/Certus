// Step 3: nail query_apass wallet field name + verify_apass shape and code space.
import { call } from './call.mjs';

const MONAD_ADDR = '0x2e2BA14F6784B72fE9874b41811193B5B0bdd0cA'; // active (status 1) monad identity
const ATOKEN_AUSDC = '0xaC0893567D43C3E7e6e35a72803df05416C1f20D'; // monad aUSDC

console.log('--- query_apass: try field "address" ---');
await call('/query_apass', { chain: 'monad', address: MONAD_ADDR }, { encrypted: false, full: true, saveAs: 'query_apass_address' });

console.log('\n--- query_apass: try field "wallet" ---');
await call('/query_apass', { chain: 'monad', wallet: MONAD_ADDR }, { encrypted: false });

console.log('\n--- verify_apass: empty body (learn fields) ---');
await call('/verify_apass', {}, { encrypted: false });

console.log('\n--- verify_apass: {chain, atoken, address} ---');
await call('/verify_apass', { chain: 'monad', atoken: ATOKEN_AUSDC, address: MONAD_ADDR }, { encrypted: false, full: true, saveAs: 'verify_apass_active' });
