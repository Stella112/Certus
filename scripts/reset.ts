import { prisma } from '../src/lib/db';

/**
 * Wipe the local audit store back to empty. Does NOT touch Cleanverse: identities and
 * freezes there are permanent (a frozen A-Pass cannot be reactivated, DECISIONS.md D6),
 * which is exactly why the freeze-target pool exists.
 *
 * Deleting the local store is not a violation of the append-only rule: append-only governs
 * the RUNNING system, where no code path may mutate or remove an event. A deliberate
 * operator reset between rehearsals is a different act, and it is the only one.
 */

const counts = {
  events: await prisma.auditEvent.deleteMany({}),
  legs: await prisma.leg.deleteMany({}),
  intents: await prisma.intent.deleteMany({}),
};

console.log('Local audit store reset:');
console.log(`  audit events deleted : ${counts.events.count}`);
console.log(`  legs deleted         : ${counts.legs.count}`);
console.log(`  intents deleted      : ${counts.intents.count}`);
console.log('\nRun `npm run seed` to rebuild the demo state.');

await prisma.$disconnect();
