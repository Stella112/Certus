import { call } from './call.mjs';

const CHAIN = process.env.CHAIN_NAME ?? 'monad';
const ADMIN = '0xdC646c197d0202FC2A0326af8ab55066A3549E2E';

const rule = {
  allowed_group: '',
  allowed_sub_group: '',
  min_tier: 5,
  min_sub_tier: 0,
  is_black_list: false,
  countries: [],
};

// Fields confirmed required by the server, one complaint at a time:
// admin_address -> icon -> decimals -> (rule) ...
const body = {
  chain: CHAIN,
  admin_address: ADMIN,
  rule,
  decimals: 6,
  icon: 'https://images.cleanverse.com/app/token_icon/USDC.svg',
  name: 'Certus Verified USD',
  symbol: 'cvUSD',
};

console.log('Attempting self-issued A-Token launch with the confirmed field set...');
const r = await call('/atoken/launch', body, { encrypted: true });

if (r.json?.code === '0000') {
  console.log('\nACCEPTED. data:', JSON.stringify(r.json.data));
  const requestId = r.json.data?.requestId ?? r.json.data?.request_id;
  if (requestId) {
    console.log(`\nIssuance is ASYNC. Polling query_apply_status/${requestId} ...`);
    for (let i = 0; i < 5; i++) {
      await new Promise((res) => setTimeout(res, 6000));
      const s = await call(`/atoken/query_apply_status/${requestId}`, {}, { encrypted: false });
      console.log(`  poll ${i + 1}: ${JSON.stringify(s.json?.data ?? s.json?.message)}`);
    }
  }
} else {
  console.log(`\nREJECTED code=${r.json?.code} :: ${r.json?.message}`);
}
