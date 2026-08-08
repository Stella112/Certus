import { generateIdentity, verifyEligibility, queryIdentity } from '../src/lib/cleanverse/cvi';
import { assets } from '../src/lib/cleanverse/cva';
import { privateKeyToAccount } from 'viem/accounts';

/**
 * Register an A-Pass for the treasury (deployer) address on the ACTIVE settlement chain.
 *
 * A-Passes are scoped to (chain, address), so the Monad registration does not carry over to
 * Base Sepolia. The treasury is the one address whose private key we hold, it funds the
 * escrow, and it must be a verified sender for check 1 to pass.
 *
 * Idempotent: if the A-Pass already exists it reports and exits without re-registering.
 */
const ASSETS = assets();
const CHAIN = ASSETS.chain;

const key = process.env.DEPLOYER_PRIVATE_KEY;
if (!key) throw new Error('DEPLOYER_PRIVATE_KEY missing from .env');
const treasury = privateKeyToAccount(key as `0x${string}`).address;

console.log(`Treasury address : ${treasury}`);
console.log(`Settlement chain : ${CHAIN}\n`);

const existing = await verifyEligibility({ chain: CHAIN, atoken: ASSETS.aToken, address: treasury });
if (existing.signal === 'ALLOWED') {
  const attrs = await queryIdentity({ chain: CHAIN, address: treasury });
  console.log(`Already eligible on ${CHAIN} (verify code 4). tier=${attrs?.tier} status=${attrs?.status}`);
  console.log('Nothing to do.');
} else {
  console.log(`Not yet eligible on ${CHAIN} (${existing.signal}). Registering...`);
  const res = await generateIdentity({
    chain: CHAIN,
    address: treasury,
    customerId: 'CERTUSTREASURY' + Date.now(),
    expirationTime: 1_900_000_000,
  });
  if (!res.ok) {
    console.error(`FAILED: ${res.detail}`);
    process.exit(1);
  }
  console.log(`Registered. cvRecordId=${res.cvRecordId} txHash=${res.txHash ?? 'n/a'}`);

  /*
   * A-Pass registration is ASYNCHRONOUS: generate_apass returns success immediately, but
   * eligibility only becomes true once the on-chain registration tx confirms. Verifying
   * straight away produces a false NO_APASS. Poll instead of trusting the first read.
   */
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let eligible = false;
  for (let attempt = 1; attempt <= 6 && !eligible; attempt++) {
    await sleep(5000);
    const after = await verifyEligibility({ chain: CHAIN, atoken: ASSETS.aToken, address: treasury });
    eligible = after.signal === 'ALLOWED';
    console.log(`  poll ${attempt}: ${after.signal}${eligible ? ' (code 4)' : ''}`);
  }
  if (!eligible) {
    console.error('Treasury still not eligible after ~30s. Investigate before deploying.');
    process.exit(1);
  }
  console.log('Treasury is a verified sender.');
}
