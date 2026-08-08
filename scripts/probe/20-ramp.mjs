// Last real avenue for obtaining origin USDC before escalating: the Fiat Ramp.
// PART XI lists Monad as supported across generate_apass/query_apass/update_status/
// verify_apass/download_travel_rule/faucet/ramp. Probe with empty bodies to learn the
// shapes; no side effects from a validation error.
import { call } from './call.mjs';

const paths = [
  '/ramp/query_quote',
  '/ramp/create_order',
  '/ramp/query_order',
  '/ramp/onramp',
  '/ramp/config',
  '/query_institution_balance',
  '/query_balance',
];

for (const p of paths) {
  const r = await call(p, {}, { encrypted: false });
  const msg = (r.json?.message ?? r.text ?? '').slice(0, 160);
  console.log(`  ${p.padEnd(30)} http=${r.httpStatus} code=${r.json?.code ?? '-'} :: ${msg}`);
}
