// Are the newly registered Base identities eligible yet? A-Pass registration is an
// on-chain tx, so eligibility may lag the API's success response. Poll a few times.
import { call } from './call.mjs';

const ATOKEN = process.env.ATOKEN;
const CHAIN = process.env.CHAIN_NAME;
const targets = {
  treasury: '0xdC646c197d0202FC2A0326af8ab55066A3549E2E',
  pool1: '0x215E6558ec0EC34b78b9c0add1816a8aE6e1e8da',
  pool2: '0x6C33FC583CAD8C2fAE21F57C9c852fe6B60dBD47',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (let attempt = 1; attempt <= 3; attempt++) {
  console.log(`\n--- attempt ${attempt} (chain=${CHAIN}) ---`);
  for (const [name, address] of Object.entries(targets)) {
    const r = await call('/verify_apass', { chain: CHAIN, atoken: ATOKEN, address }, { encrypted: false });
    const code = r.json?.data?.code;
    const msg = (r.json?.data?.message ?? r.json?.message ?? '').slice(0, 60);
    console.log(`  ${name.padEnd(9)} data.code=${code ?? '-'}  ${msg}`);
  }
  if (attempt < 3) await sleep(8000);
}

console.log('\n--- query_apass attributes for treasury ---');
await call('/query_apass', { chain: CHAIN, address: targets.treasury }, { encrypted: false });
