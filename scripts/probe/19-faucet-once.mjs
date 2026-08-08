/**
 * THE ONE FAUCET CALL. Rate-limited to roughly 24h per api-id.
 *
 * Rules being followed (user instruction + RUNBOOK):
 *  - exactly one attempt, no retry loop
 *  - if it fails, READ the seconds-to-wait and report it, do not call again
 *  - record the outcome in RUNBOOK.md either way
 *
 * Target is the deployer/treasury plain address: we hold its key, it now carries an
 * A-Pass (verify code 4), and it already holds MON for gas.
 */
import { call } from './call.mjs';

const TREASURY = '0xdC646c197d0202FC2A0326af8ab55066A3549E2E';

console.log('Requesting test USDC on Monad for the treasury address.');
console.log('  chain          : monad');
console.log('  symbol         : usdc');
console.log('  depositAddress :', TREASURY);
console.log('\nMaking the single call now...\n');

const res = await call(
  '/faucet',
  { chain: 'monad', symbol: 'usdc', depositAddress: TREASURY },
  { encrypted: false }
);

console.log('\n===== FAUCET RESULT =====');
if (res.json?.code === '0000') {
  console.log('  SUCCESS. Response data:', JSON.stringify(res.json.data));
} else {
  const msg = res.json?.message ?? res.text;
  console.log('  NOT DISPENSED. Message:', msg);
  const seconds = String(msg).match(/(\d{3,})/);
  if (seconds) {
    const s = Number(seconds[1]);
    console.log(`  Rate limited. Wait ~${s}s (${(s / 3600).toFixed(1)} hours) before the next attempt.`);
  }
  console.log('  NOT retrying, per the once-only rule.');
}
