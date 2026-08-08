// Recover the throwaway identity: retry update_status status=1 with delays
// and a couple of body shapes, verifying after each. The [500] on the first
// attempt may be transient (freeze tx still settling) or a shape issue.
import { call } from './call.mjs';

const ADDR = '0x820350D47277784A26FF4D4cE08C12CAD6F19094';
const ATOKEN = '0xaC0893567D43C3E7e6e35a72803df05416C1f20D';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function verifyState() {
  const r = await call('/verify_apass', { chain: 'monad', atoken: ATOKEN, address: ADDR }, { encrypted: false });
  const code = r.json?.data?.code;
  const msg = r.json?.message || '';
  const active = code === 4;
  console.log(`  verify: data.code=${code} active=${active} msg="${msg.slice(0, 60)}"`);
  return active;
}

const shapes = [
  { status: 1, wallet: { chain: 'monad', address: ADDR } },
  { status: 1, wallet: { chain: 'monad', address: ADDR }, blacklistReason: '' },
];

let restored = false;
for (let attempt = 1; attempt <= 6 && !restored; attempt++) {
  const shape = shapes[(attempt - 1) % shapes.length];
  console.log(`\nRestore attempt ${attempt} with shape keys [${Object.keys(shape).join(', ')}]`);
  const re = await call('/update_status', shape, { encrypted: true });
  console.log('  update_status envelope:', re.json?.code, re.json?.message);
  await sleep(3000);
  restored = await verifyState();
  if (!restored) await sleep(3000);
}

console.log('\n===== RESTORE RESULT =====');
console.log(restored ? 'RESTORED: identity active again (code 4). Sandbox clean.'
                     : 'STILL FROZEN: throwaway identity 0x8203..9094 could not be re-activated. It is disposable and unused elsewhere; will not be reused. update_status status=1 needs investigation (possible sandbox limitation).');
