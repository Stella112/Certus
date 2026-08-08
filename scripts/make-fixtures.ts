import fs from 'node:fs';
import path from 'node:path';
import { generateIdentity, verifyEligibility, freezeIdentity } from '../src/lib/cleanverse/cvi';
import { assets } from '../src/lib/cleanverse/cva';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';

/**
 * Build chain-scoped fixtures for the live integration suite.
 *
 * The suite previously hardcoded Monad addresses, so moving to Base Sepolia broke it: those
 * identities hold no A-Pass on the new chain and every case collapsed to NO_CVI. A-Passes
 * are per (chain, address), so fixtures must be regenerated per chain rather than pinned.
 *
 * Produces data/test-fixtures.json:
 *   active  - a verified identity (the treasury, which we control and already registered)
 *   frozen  - a PURPOSE-BUILT identity we mint then freeze. Freezing is irreversible in UAT,
 *             so this identity is sacrificial by design and must never be a pool entry
 *             reserved for a demo rehearsal.
 *   noApass - a fixed address that has never held an A-Pass, valid on any chain
 */
const ASSETS = assets();
const CHAIN = ASSETS.chain;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const treasury = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`).address;

async function waitEligible(address: string, want: boolean, label: string): Promise<boolean> {
  for (let i = 0; i < 8; i++) {
    await sleep(5000);
    const v = await verifyEligibility({ chain: CHAIN, atoken: ASSETS.aToken, address });
    const ok = want ? v.signal === 'ALLOWED' : v.signal === 'APASS_NOT_ACTIVE';
    console.log(`  ${label} poll ${i + 1}: ${v.signal}`);
    if (ok) return true;
  }
  return false;
}

console.log(`Building integration fixtures on ${CHAIN}\n`);

// active
const act = await verifyEligibility({ chain: CHAIN, atoken: ASSETS.aToken, address: treasury });
if (act.signal !== 'ALLOWED') {
  console.error(`Treasury is not eligible on ${CHAIN}. Run: npx tsx --env-file=.env scripts/register-treasury.ts`);
  process.exit(1);
}
console.log(`active  : ${treasury} (verified)`);

// frozen: mint a sacrificial identity, then freeze it
const frozenAddr = privateKeyToAccount(generatePrivateKey()).address;
console.log(`\nMinting sacrificial identity to freeze: ${frozenAddr}`);
const gen = await generateIdentity({
  chain: CHAIN,
  address: frozenAddr,
  customerId: 'CERTUSFIXTURE' + Date.now(),
  expirationTime: 1_900_000_000,
});
if (!gen.ok) {
  console.error(`generate_apass failed: ${gen.detail}`);
  process.exit(1);
}
if (!(await waitEligible(frozenAddr, true, 'pre-freeze'))) {
  console.error('Fixture identity never became eligible.');
  process.exit(1);
}

console.log('\nFreezing it (irreversible in UAT, which is exactly why it is sacrificial)...');
const fr = await freezeIdentity({ chain: CHAIN, address: frozenAddr, reason: 'certus integration fixture' });
if (!fr.ok) {
  console.error(`freeze failed: ${fr.detail}`);
  process.exit(1);
}
console.log(`  freeze txHash: ${fr.txHash}`);
if (!(await waitEligible(frozenAddr, false, 'post-freeze'))) {
  console.error('Fixture never reported APassNotActive.');
  process.exit(1);
}

const fixtures = {
  chain: CHAIN,
  aToken: ASSETS.aToken,
  generatedAt: new Date().toISOString(),
  active: treasury,
  frozen: frozenAddr,
  noApass: '0x00000000000000000000000000000000DeaDBeeF',
  bogusAToken: '0x1111111111111111111111111111111111111111',
};
fs.mkdirSync(path.resolve(process.cwd(), 'data'), { recursive: true });
fs.writeFileSync(path.resolve(process.cwd(), 'data', 'test-fixtures.json'), JSON.stringify(fixtures, null, 2) + '\n');
console.log('\nWrote data/test-fixtures.json');
console.log(JSON.stringify(fixtures, null, 2));
