// Learn the /faucet contract WITHOUT consuming the rate limit.
// Validation failures should not dispense, so an empty body teaches us the required
// fields and, hopefully, the amount format (whole units vs base units) before we
// spend our single ~24h-limited call.
import { call } from './call.mjs';

console.log('--- faucet: empty body (expect a validation error listing fields) ---');
await call('/faucet', {}, { encrypted: false });

console.log('\n--- faucet: chain only ---');
await call('/faucet', { chain: 'monad' }, { encrypted: false });

console.log('\n--- faucet: chain + symbol, no address/amount ---');
await call('/faucet', { chain: 'monad', symbol: 'usdc' }, { encrypted: false });
