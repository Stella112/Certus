import { prisma } from '../src/lib/db';

const UPDATE_TRIGGER = `
  CREATE TRIGGER "AuditEvent_prevent_update"
  BEFORE UPDATE ON "AuditEvent"
  BEGIN
    SELECT RAISE(ABORT, 'AuditEvent is append-only');
  END
`;

const DELETE_TRIGGER = `
  CREATE TRIGGER "AuditEvent_prevent_delete"
  BEFORE DELETE ON "AuditEvent"
  BEGIN
    SELECT RAISE(ABORT, 'AuditEvent is append-only');
  END
`;

/**
 * Explicit rehearsal-only database reset. Runtime application code cannot reach this file.
 * The trigger removal, reset, and restoration share one SQLite transaction, so a failure
 * cannot leave the audit table mutable.
 */
export async function resetLocalStore() {
  if (!process.env.DATABASE_URL?.startsWith('file:')) {
    throw new Error('Refusing audit reset: DATABASE_URL is not an explicitly local SQLite file');
  }

  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('DROP TRIGGER IF EXISTS "AuditEvent_prevent_update"');
    await tx.$executeRawUnsafe('DROP TRIGGER IF EXISTS "AuditEvent_prevent_delete"');

    const events = await tx.auditEvent.deleteMany({});
    const legs = await tx.leg.deleteMany({});
    const intents = await tx.intent.deleteMany({});

    await tx.$executeRawUnsafe(UPDATE_TRIGGER);
    await tx.$executeRawUnsafe(DELETE_TRIGGER);
    return { events, legs, intents };
  });
}
