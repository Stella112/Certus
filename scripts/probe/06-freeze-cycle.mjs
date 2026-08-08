// AC-0.6: the 4 -> 3 -> 4 freeze cycle. This proves Moment B is real.
// HYGIENE: only touches the throwaway identity we just created.
// The status=1 restore runs in a finally block so a mid-cycle throw
// can never leave the sandbox identity frozen.
import { call } from './call.mjs';

const ADDR = '0x820350D47277784A26FF4D4cE08C12CAD6F19094'; // our throwaway A-Pass
const ATOKEN = '0xaC0893567D43C3E7e6e35a72803df05416C1f20D'; // monad aUSDC
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function verifyCode() {
  const r = await call('/verify_apass', { chain: 'monad', atoken: ATOKEN, address: ADDR }, { encrypted: false });
  return r.json?.data?.code;
}

async function waitForCode(expect, label, tries = 6) {
  for (let i = 0; i < tries; i++) {
    const c = await verifyCode();
    console.log(`  [${label}] attempt ${i + 1}: verify code = ${c} (want ${expect})`);
    if (c === expect) return c;
    await sleep(2500);
  }
  return null;
}

let ok = { active: null, frozen: null, restored: null };

try {
  console.log('STEP 1: confirm ACTIVE (expect 4)');
  ok.active = await waitForCode(4, 'active');

  console.log('\nSTEP 2: FREEZE (update_status status=2)');
  const fr = await call('/update_status', {
    status: 2,
    wallet: { chain: 'monad', address: ADDR },
    blacklistReason: 'certus phase0 freeze probe',
  }, { encrypted: true });
  console.log('  freeze envelope code:', fr.json?.code, fr.json?.message);

  console.log('\nSTEP 3: confirm FROZEN (expect 3 = CVI_REVOKED_OR_EXPIRED)');
  ok.frozen = await waitForCode(3, 'frozen');
} finally {
  console.log('\nFINALLY: RESTORE (update_status status=1) — always runs');
  const re = await call('/update_status', {
    status: 1,
    wallet: { chain: 'monad', address: ADDR },
  }, { encrypted: true });
  console.log('  restore envelope code:', re.json?.code, re.json?.message);
  ok.restored = await waitForCode(4, 'restored');
}

console.log('\n===== FREEZE CYCLE RESULT =====');
console.log('active  -> code 4 :', ok.active === 4 ? 'PASS' : 'FAIL');
console.log('frozen  -> code 3 :', ok.frozen === 3 ? 'PASS' : 'FAIL');
console.log('restore -> code 4 :', ok.restored === 4 ? 'PASS' : 'FAIL (MANUAL CHECK NEEDED)');
const allPass = ok.active === 4 && ok.frozen === 3 && ok.restored === 4;
console.log(allPass ? 'AC-0.6: PASS (Moment B mechanism is real end to end)' : 'AC-0.6: NEEDS ATTENTION');
