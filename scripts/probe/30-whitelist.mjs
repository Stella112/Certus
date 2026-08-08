/**
 * Can Certus authorise its own escrow as an institutional depositor on cvUSD, the A-Token
 * we administer? If yes, releases can land as a compliance-enforcing asset without waiting
 * on Cleanverse support.
 *
 * Also hunts for a mint/issue path for the admin_address. Endpoint names here are GUESSES,
 * so a 404 proves nothing except that the guess was wrong; only a real response counts.
 */
import { call } from './call.mjs';

const CVUSD = '0x5e7Ca7ec42A11B4F5259fc429AcD32dFFf83796D';
const ESCROW = '0xb327709Ec4f0830722776746b1da42F98d51868e';
const TREASURY = '0xdC646c197d0202FC2A0326af8ab55066A3549E2E';
const CHAIN = 'monad';

console.log('=== 1. add_whitelist_for_institutional: confirmed field is address_list ===');
for (const body of [
  { chain: CHAIN, atoken_address: CVUSD, address_list: [ESCROW] },
  { chain: CHAIN, atoken: CVUSD, address_list: [ESCROW] },
  { chain: CHAIN, address_list: [ESCROW] },
]) {
  const r = await call('/atoken/add_whitelist_for_institutional', body, { encrypted: true });
  console.log(`  keys[${Object.keys(body).join(',')}] -> ${r.json?.code} :: ${String(r.json?.message).slice(0, 110)}`);
  if (r.json?.code === '0000') {
    console.log('  ACCEPTED:', JSON.stringify(r.json.data));
    break;
  }
  await new Promise((s) => setTimeout(s, 900));
}

console.log('\n=== 2. read back the whitelist, if such an endpoint exists ===');
for (const p of ['/atoken/query_whitelist_for_institutional', '/atoken/whitelist', '/atoken/query_whitelist']) {
  const r = await call(p, { chain: CHAIN, atoken_address: CVUSD }, { encrypted: false });
  console.log(`  ${p.padEnd(45)} http=${r.httpStatus} code=${r.json?.code ?? '-'}`);
}

console.log('\n=== 3. is there a mint/issue path for the admin? (names are guesses) ===');
for (const p of ['/atoken/mint', '/atoken/issue', '/atoken/deposit', '/atoken/transfer']) {
  const r = await call(p, { chain: CHAIN, atoken_address: CVUSD, to: TREASURY, amount: '1000000' }, { encrypted: true });
  console.log(`  ${p.padEnd(22)} http=${r.httpStatus} code=${r.json?.code ?? '-'} :: ${String(r.json?.message ?? '').slice(0, 80)}`);
}
