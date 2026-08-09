/**
 * Can a CONTRACT address hold an A-Pass, and would that let the escrow custody aUSDC?
 *
 * This reopens custody option (b), rejected in D1 because a frozen escrow credential would
 * have bricked custody permanently. Un-freeze now works (D14), so that failure mode is
 * recoverable and the objection is weaker. Worth re-testing rather than assuming.
 *
 * If a contract CAN hold an A-Pass, Certus settles in aUSDC itself, which is Cleanverse's
 * flagship asset, with no self-issued token and no whitelist needed.
 */
import { call } from './call.mjs';

const ESCROW = '0xb327709Ec4f0830722776746b1da42F98d51868e';
const AUSDC = '0xaC0893567D43C3E7e6e35a72803df05416C1f20D';
const CHAIN = 'monad';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('1. Escrow eligibility BEFORE registering (expect code 2, no A-Pass)');
const before = await call('/verify_apass', { chain: CHAIN, atoken: AUSDC, address: ESCROW }, { encrypted: false });
console.log('   data.code =', before.json?.data?.code);

console.log('\n2. Register an A-Pass for the CONTRACT address');
const gen = await call(
  '/generate_apass',
  {
    wallet: { chain: CHAIN, address: ESCROW },
    customerId: 'CERTUSESCROWCONTRACT' + Date.now(),
    expirationTime: 1900000000,
    tier: '50',
    subTier: 0,
  },
  { encrypted: true }
);
console.log('   ->', gen.json?.code, gen.json?.message);
if (gen.json?.code !== '0000') {
  console.log('\n   A contract address CANNOT be registered. Option (b) stays closed.');
  process.exit(0);
}

console.log('\n3. Poll until eligible (registration is async)');
let ok = false;
for (let i = 0; i < 8 && !ok; i++) {
  await sleep(5000);
  const v = await call('/verify_apass', { chain: CHAIN, atoken: AUSDC, address: ESCROW }, { encrypted: false });
  ok = v.json?.data?.code === 4;
  console.log(`   poll ${i + 1}: data.code = ${v.json?.data?.code ?? '-'}`);
}

console.log(
  ok
    ? '\n   *** ESCROW CONTRACT IS AN ELIGIBLE aUSDC HOLDER ***\n' +
      '   Certus can custody and settle in aUSDC directly: no self-issued token,\n' +
      '   no wrapped asset, no institutional whitelist required.'
    : '\n   Registered but never became eligible. Investigate before relying on it.'
);
