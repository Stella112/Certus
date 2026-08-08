/**
 * Attempt to issue a SELF-ISSUED Wrapped CVA so Certus can whitelist its own escrow as an
 * institutional depositor, which is the only route to real A-Token settlement.
 *
 * Learn the request shape from validation errors first (no side effects), then launch.
 * Issuance is asynchronous: /atoken/launch returns a requestId and the asset is only real
 * when query_apply_status reports ISSUED.
 */
import { call } from './call.mjs';

const CHAIN = process.env.CHAIN_NAME ?? 'monad';
const ORIGIN = process.env.ORIGIN_TOKEN;

console.log('--- 1. atoken/launch with EMPTY body: learn required fields ---');
await call('/atoken/launch', {}, { encrypted: true });

console.log('\n--- 2. partial body: chain only ---');
await call('/atoken/launch', { chain: CHAIN }, { encrypted: true });

console.log('\n--- 3. add_whitelist_for_institutional, empty: learn its shape too ---');
await call('/atoken/add_whitelist_for_institutional', {}, { encrypted: true });

console.log('\n--- 4. plausible full launch body ---');
await call(
  '/atoken/launch',
  {
    chain: CHAIN,
    originToken: ORIGIN,
    name: 'Certus Verified USDC',
    symbol: 'cvUSDC',
    decimals: 6,
    rule: { allowed_group: '', allowed_sub_group: '', min_tier: 5, min_sub_tier: 0, is_black_list: false, countries: [] },
  },
  { encrypted: true }
);
