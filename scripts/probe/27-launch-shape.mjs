// Discover /atoken/launch's schema by adding one field at a time and reading the API's own
// complaint. Never guessing a field name and moving on: each step is confirmed by the server.
import { call } from './call.mjs';

const CHAIN = process.env.CHAIN_NAME ?? 'monad';
const ORIGIN = process.env.ORIGIN_TOKEN;
const ADMIN = '0xdC646c197d0202FC2A0326af8ab55066A3549E2E'; // treasury, which we control

const rule = {
  allowed_group: '',
  allowed_sub_group: '',
  min_tier: 5,
  min_sub_tier: 0,
  is_black_list: false,
  countries: [],
};

const attempts = [
  { label: 'chain + admin_address', body: { chain: CHAIN, admin_address: ADMIN } },
  { label: '+ rule', body: { chain: CHAIN, admin_address: ADMIN, rule } },
  { label: '+ origin_token', body: { chain: CHAIN, admin_address: ADMIN, rule, origin_token: ORIGIN } },
  {
    label: '+ name/symbol',
    body: { chain: CHAIN, admin_address: ADMIN, rule, origin_token: ORIGIN, name: 'Certus Verified USDC', symbol: 'cvUSDC' },
  },
  {
    label: '+ decimals',
    body: {
      chain: CHAIN,
      admin_address: ADMIN,
      rule,
      origin_token: ORIGIN,
      name: 'Certus Verified USDC',
      symbol: 'cvUSDC',
      decimals: 6,
    },
  },
];

for (const a of attempts) {
  const r = await call('/atoken/launch', a.body, { encrypted: true });
  const code = r.json?.code;
  const msg = String(r.json?.message ?? '').slice(0, 120);
  console.log(`  ${a.label.padEnd(24)} code=${code} :: ${msg}`);
  if (code === '0000') {
    console.log('\n  LAUNCH ACCEPTED. data:', JSON.stringify(r.json.data));
    break;
  }
  await new Promise((res) => setTimeout(res, 1200));
}
