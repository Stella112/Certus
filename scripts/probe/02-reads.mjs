// Step 2: learn query_apass (single) and query_deposit_atoken_list shapes.
import { call } from './call.mjs';

// A real Monad identity observed in the list probe (status 1 = active).
const MONAD_ADDR = '0x2e2BA14F6784B72fE9874b41811193B5B0bdd0cA'; // CIRCUITLENDBORROWER01

console.log('--- query_apass: empty body (learn required fields) ---');
await call('/query_apass', {}, { encrypted: false });

console.log('\n--- query_apass: {chain, walletAddress} guess ---');
await call('/query_apass', { chain: 'monad', walletAddress: MONAD_ADDR }, { encrypted: false, full: true, saveAs: 'query_apass_single' });

console.log('\n--- query_deposit_atoken_list: empty body ---');
await call('/query_deposit_atoken_list', {}, { encrypted: false });

console.log('\n--- query_deposit_atoken_list: {chain:"monad"} guess ---');
await call('/query_deposit_atoken_list', { chain: 'monad' }, { encrypted: false, full: true, saveAs: 'atoken_list_monad' });
