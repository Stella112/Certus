import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../src/lib/db';
import { listIdentities, verifyEligibility } from '../src/lib/cleanverse/cvi';
import { MONAD_ASSETS } from '../src/lib/cleanverse/cva';
import { consumeFromPool, availableCount } from './identityPool';

/**
 * Deterministic demo seed. Same seed, same IDs, same ordering, every run (PART IV).
 *
 * Identity sourcing, and why it is split three ways:
 *  - 10 clean recipients: DISCOVERED from the sandbox's existing verified identities and
 *    each re-verified live. No minting, so the intermittent generate_apass cannot block a
 *    rehearsal.
 *  - 1 unverified recipient: a fixed address that has never held an A-Pass. This is the
 *    red row in Moment A.
 *  - 1 freeze target: CONSUMED from our pre-minted pool, because we must own any identity
 *    we freeze, and freezing is irreversible in UAT (DECISIONS.md D6/D7).
 */

const UNVERIFIED_RECIPIENT = '0x00000000000000000000000000000000DeaDBeeF'; // verify -> code 2
const USDC = (whole: number) => (BigInt(whole) * 1_000_000n).toString(); // 6 decimals, as string

console.log('Seeding Certus demo state...\n');

// --- 1. Discover clean, currently-verified recipients -------------------------------
console.log('Discovering verified Monad identities from the sandbox...');
const listed = await listIdentities({ page: 1, pageSize: 100 });
const monadCandidates = listed
  .filter((i) => i.chain?.toLowerCase() === 'monad' && i.walletAddress)
  .map((i) => i.walletAddress)
  .filter((a, idx, arr) => arr.indexOf(a) === idx)
  .sort(); // deterministic ordering

const verified: string[] = [];
for (const address of monadCandidates) {
  if (verified.length >= 10) break;
  const outcome = await verifyEligibility({ chain: 'monad', atoken: MONAD_ASSETS.aToken, address });
  if (outcome.signal === 'ALLOWED') verified.push(address);
}
console.log(`  found ${verified.length} verified recipients (of ${monadCandidates.length} Monad candidates)`);

if (verified.length < 3) {
  console.error(
    '\nFATAL: fewer than 3 verified recipients available. The batch moment needs clean rows.\n' +
      'The sandbox may be degraded. Re-run when verify_apass is healthy.'
  );
  process.exit(1);
}

// --- 2. Claim a freeze target from the pre-minted pool ------------------------------
const freezeTarget = consumeFromPool('seed');
if (!freezeTarget) {
  console.error(
    '\nFATAL: the freeze-target pool is empty.\n' +
      '  Moment B needs an identity WE own, because freezing is irreversible in UAT.\n' +
      '  Fix: run `npm run mint-pool -- 3` while generate_apass is up, then seed again.\n' +
      '  Failing loudly here is deliberate: a silent seed would produce a demo that cannot\n' +
      '  perform its headline moment.'
  );
  process.exit(1);
}
console.log(`  freeze target claimed from pool: ${freezeTarget.address}`);

// --- 3. Build deterministic demo state ----------------------------------------------
const SENDER_ACME = verified[0];

await prisma.auditEvent.deleteMany({});
await prisma.leg.deleteMany({});
await prisma.intent.deleteMany({});

// Milestone intent whose later legs are the freeze cascade in Moment B
const milestone = await prisma.intent.create({
  data: {
    id: 'intent-milestone-001',
    type: 'MILESTONE',
    senderCvi: SENDER_ACME,
    asset: MONAD_ASSETS.aToken,
    amount: USDC(30_000),
    status: 'ACTIVE',
    policyId: 'STANDARD',
    legs: {
      create: [
        { id: 'leg-ms-1', recipientCvi: freezeTarget.address, amount: USDC(10_000), sequence: 1, status: 'RELEASED', releasedAt: new Date() },
        { id: 'leg-ms-2', recipientCvi: freezeTarget.address, amount: USDC(10_000), sequence: 2, status: 'PENDING' },
        { id: 'leg-ms-3', recipientCvi: freezeTarget.address, amount: USDC(10_000), sequence: 3, status: 'PENDING' },
      ],
    },
  },
});

// Recurring intent to the SAME identity, so one revocation visibly cascades into both
const recurring = await prisma.intent.create({
  data: {
    id: 'intent-recurring-001',
    type: 'RECURRING',
    senderCvi: SENDER_ACME,
    asset: MONAD_ASSETS.aToken,
    amount: USDC(2_000),
    status: 'ACTIVE',
    policyId: 'STANDARD',
    legs: {
      create: [
        { id: 'leg-rec-1', recipientCvi: freezeTarget.address, amount: USDC(2_000), sequence: 1, status: 'RELEASED', releasedAt: new Date() },
        { id: 'leg-rec-2', recipientCvi: freezeTarget.address, amount: USDC(2_000), sequence: 2, status: 'PENDING' },
      ],
    },
  },
});

// Historical audit events so the dashboard is populated on load, never empty.
const base = Date.now() - 20 * 60 * 60 * 1000;
for (let i = 0; i < 20; i++) {
  await prisma.auditEvent.create({
    data: {
      id: `seed-event-${String(i).padStart(3, '0')}`,
      intentId: i % 2 === 0 ? milestone.id : recurring.id,
      eventType: 'CHECK_RUN',
      trigger: i % 2 === 0 ? 'MILESTONE_RELEASE' : 'SUBSCRIPTION_EPOCH',
      verdict: 'PASS',
      reasonCode: null,
      checkResults: JSON.stringify([
        { check: 'SENDER_CVI', passed: true, detail: 'apass verify success' },
        { check: 'RECIPIENT_CVI', passed: true, detail: 'apass verify success' },
        { check: 'ASSET_RULES', passed: true, detail: 'Both parties satisfy all asset rules' },
        { check: 'POLICY', passed: true, detail: 'Within Standard limits' },
      ]),
      payload: JSON.stringify({ seeded: true, sender: SENDER_ACME }),
      occurredAt: new Date(base + i * 45 * 60 * 1000),
    },
  });
}

// --- 4. Manifest the demo will read --------------------------------------------------
const manifest = {
  generatedAt: new Date().toISOString(),
  chain: 'monad',
  asset: MONAD_ASSETS,
  sender: SENDER_ACME,
  cleanRecipients: verified,
  unverifiedRecipient: UNVERIFIED_RECIPIENT,
  freezeTarget: freezeTarget.address,
  intents: [milestone.id, recurring.id],
};
fs.mkdirSync(path.resolve(process.cwd(), 'data'), { recursive: true });
fs.writeFileSync(path.resolve(process.cwd(), 'data', 'seed-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

console.log('\nSeed complete.');
console.log(`  sender            : ${SENDER_ACME}`);
console.log(`  clean recipients  : ${verified.length}`);
console.log(`  unverified (red)  : ${UNVERIFIED_RECIPIENT}`);
console.log(`  freeze target     : ${freezeTarget.address}`);
console.log(`  intents           : 2 mid-lifecycle, 20 historical audit events`);
console.log(`  pool remaining    : ${availableCount()} freeze targets`);

await prisma.$disconnect();
