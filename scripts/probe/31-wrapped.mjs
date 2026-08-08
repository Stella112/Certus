/**
 * Per Cleanverse support, the real path to A-Token settlement:
 *   1. POST /atoken/launch_wrapped_atoken   (issue a Wrapped CVA around an existing ERC20)
 *   2. authorize Mint
 *   3. add_whitelist_for_institutional      (whitelist the sending address)
 *   4. transfers from that address to the deposit address auto-wrap into the CVA
 *
 * Learn every shape from the server's own complaints. No guessing past what it tells us.
 */
import { call } from './call.mjs';

const CHAIN = process.env.CHAIN_NAME ?? 'monad';
const ORIGIN = process.env.ORIGIN_TOKEN;
const ADMIN = '0xdC646c197d0202FC2A0326af8ab55066A3549E2E';

console.log('=== 1. launch_wrapped_atoken: empty body ===');
await call('/atoken/launch_wrapped_atoken', {}, { encrypted: true });

console.log('\n=== 2. progressive field discovery ===');
const rule = { allowed_group: '', allowed_sub_group: '', min_tier: 5, min_sub_tier: 0, is_black_list: false, countries: [] };
const steps = [
  ['chain+admin', { chain: CHAIN, admin_address: ADMIN }],
  ['+rule', { chain: CHAIN, admin_address: ADMIN, rule }],
  ['+decimals+icon', { chain: CHAIN, admin_address: ADMIN, rule, decimals: 6, icon: 'https://images.cleanverse.com/app/token_icon/USDC.svg' }],
  ['+token_name/symbol', { chain: CHAIN, admin_address: ADMIN, rule, decimals: 6, icon: 'https://images.cleanverse.com/app/token_icon/USDC.svg', token_name: 'Certus Wrapped USDC', token_symbol: 'cwUSDC' }],
  ['+origin_token', { chain: CHAIN, admin_address: ADMIN, rule, decimals: 6, icon: 'https://images.cleanverse.com/app/token_icon/USDC.svg', token_name: 'Certus Wrapped USDC', token_symbol: 'cwUSDC', origin_token: ORIGIN }],
  ['+origin_token_address', { chain: CHAIN, admin_address: ADMIN, rule, decimals: 6, icon: 'https://images.cleanverse.com/app/token_icon/USDC.svg', token_name: 'Certus Wrapped USDC', token_symbol: 'cwUSDC', origin_token_address: ORIGIN }],
];

for (const [label, body] of steps) {
  const r = await call('/atoken/launch_wrapped_atoken', body, { encrypted: true });
  console.log(`  ${label.padEnd(22)} => ${r.json?.code} :: ${String(r.json?.message).slice(0, 100)}`);
  if (r.json?.code === '0000') {
    console.log('  ACCEPTED:', JSON.stringify(r.json.data));
    break;
  }
  await new Promise((s) => setTimeout(s, 900));
}

console.log('\n=== 3. hunt for the mint-authorisation endpoint ===');
for (const p of ['/atoken/authorize_mint', '/atoken/mint_authorize', '/atoken/set_minter', '/atoken/add_minter', '/atoken/grant_mint']) {
  const r = await call(p, {}, { encrypted: true });
  console.log(`  ${p.padEnd(28)} http=${r.httpStatus} code=${r.json?.code ?? '-'} :: ${String(r.json?.message ?? '').slice(0, 70)}`);
}
