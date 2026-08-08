// Step 4: read aUSDC compliance rules (AC-0.7) and learn generate_apass fields.
import { call } from './call.mjs';

const ATOKEN_AUSDC = '0xaC0893567D43C3E7e6e35a72803df05416C1f20D';

console.log('--- atoken/rules: empty body (learn fields) ---');
await call('/atoken/rules', {}, { encrypted: false });

console.log('\n--- atoken/rules: {chain, atoken} ---');
await call('/atoken/rules', { chain: 'monad', atoken: ATOKEN_AUSDC }, { encrypted: false, full: true, saveAs: 'atoken_rules_ausdc' });

console.log('\n--- generate_apass: empty AES body (learn required fields via error) ---');
await call('/generate_apass', {}, { encrypted: true });
