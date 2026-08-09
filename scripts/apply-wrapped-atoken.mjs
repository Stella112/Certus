/** Submit the documented Cleanverse Wrapped A-Token application. Dry-run by default. */
import { call } from './probe/call.mjs';

const CONFIRMATION = 'SUBMIT_ACERTUS_USD_APPLICATION';
const origin = process.env.CERTUS_ORIGIN_TOKEN_ADDRESS;
const admin = process.env.CERTUS_ADMIN_ADDRESS;
if (!origin || !/^0x[0-9a-fA-F]{40}$/.test(origin)) throw new Error('CERTUS_ORIGIN_TOKEN_ADDRESS missing/invalid');
if (!admin || !/^0x[0-9a-fA-F]{40}$/.test(admin)) throw new Error('CERTUS_ADMIN_ADDRESS missing/invalid');

const body = {
  chain: 'monad',
  token_name: 'Certus Verified USD',
  token_symbol: 'aCertusUSD',
  decimals: 6,
  admin_address: admin,
  rule: {
    allowed_group: '',
    allowed_sub_group: '',
    min_tier: 5,
    min_sub_tier: 0,
    is_black_list: false,
    countries: [],
  },
  origin_token_address: origin,
  origin_token_icon: 'https://images.cleanverse.com/app/token_icon/USDC.svg',
  icon: 'https://images.cleanverse.com/app/token_icon/USDC.svg',
};

console.log('Prepared /atoken/launch_wrapped_atoken request:');
console.log(JSON.stringify(body, null, 2));
if (process.env.CONFIRM_WRAPPED_APPLICATION !== CONFIRMATION) {
  console.log(`\nDRY RUN ONLY. Set CONFIRM_WRAPPED_APPLICATION=${CONFIRMATION} after explicit approval.`);
  process.exit(0);
}

const result = await call('/atoken/launch_wrapped_atoken', body, { encrypted: true, full: true });
if (result.json?.code !== '0000') throw new Error(`Application rejected: ${result.json?.code} ${result.json?.message}`);
console.log(`Record requestId=${result.json.data?.requestId}; do not continue until query_apply_status reports ISSUED.`);
