/**
 * Which chain's faucet reservoir is actually stocked?
 *
 * Monad returned "ERC20: transfer amount exceeds balance", i.e. an empty SOURCE. That is a
 * per-chain reservoir problem, not a rate limit and not a parameter problem. This walks the
 * candidate chains and STOPS at the first success, so we never dispense more than once.
 *
 * Interpreting the outcomes:
 *   success                        -> reservoir stocked, we have tokens on that chain
 *   "exceeds balance"              -> reservoir empty for that chain
 *   seconds-to-wait / rate limited -> we have already been served; stop entirely
 */
import { call } from './call.mjs';

const TREASURY = '0xdC646c197d0202FC2A0326af8ab55066A3549E2E';
// Ordered by hackathon eligibility and how easily we can obtain native gas afterwards.
const chains = ['base', 'polygon', 'ethereum', 'bsc'];

for (const chain of chains) {
  const res = await call('/faucet', { chain, symbol: 'usdc', depositAddress: TREASURY }, { encrypted: false });
  const code = res.json?.code;
  const msg = String(res.json?.message ?? res.text ?? '');

  if (code === '0000') {
    console.log(`\n*** ${chain.toUpperCase()}: DISPENSED. data=${JSON.stringify(res.json.data)}`);
    console.log('Stopping: we have tokens, no further faucet calls needed.');
    break;
  }

  const dry = /exceeds balance/i.test(msg);
  const limited = /\d{4,}/.test(msg) && /wait|limit|second/i.test(msg);
  console.log(`  ${chain.padEnd(9)} -> ${dry ? 'RESERVOIR EMPTY' : limited ? 'RATE LIMITED' : 'OTHER'} :: ${msg.slice(0, 130)}`);

  if (limited) {
    console.log('  Rate limited. Stopping entirely, per the once-only rule.');
    break;
  }
}
