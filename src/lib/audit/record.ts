import { prisma } from '../db';

/**
 * APPEND-ONLY audit writer. This module exports CREATE and READ only.
 * There is deliberately no update and no delete function anywhere in src/lib/audit/.
 * The audit trail is the compliance record, not logging. Losing or mutating it is a
 * CRITICAL failure (PART VII).
 */

export type EventType =
  | 'CHECK_RUN'
  | 'RELEASE'
  | 'FREEZE'
  | 'ISOLATE'
  | 'REVOCATION'
  | 'YIELD_ACCRUAL';

export interface AuditInput {
  intentId?: string | null;
  legId?: string | null;
  eventType: EventType;
  trigger?: string | null;
  verdict?: string | null;
  reasonCode?: string | null;
  /** All four check outcomes, individually. */
  checkResults: unknown;
  payload: unknown;
}

/**
 * bigint is not JSON-serialisable. Amounts are converted to decimal STRINGS so the
 * stored record never silently becomes a float.
 */
function serialise(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
}

export async function recordEvent(input: AuditInput) {
  return prisma.auditEvent.create({
    data: {
      intentId: input.intentId ?? null,
      legId: input.legId ?? null,
      eventType: input.eventType,
      trigger: input.trigger ?? null,
      verdict: input.verdict ?? null,
      reasonCode: input.reasonCode ?? null,
      checkResults: serialise(input.checkResults),
      payload: serialise(input.payload),
    },
  });
}

/** Point-in-time replay: every event up to and including T, in occurrence order. */
export async function eventsAsOf(t: Date, intentId?: string) {
  return prisma.auditEvent.findMany({
    where: { occurredAt: { lte: t }, ...(intentId ? { intentId } : {}) },
    orderBy: { occurredAt: 'asc' },
  });
}

export function parseCheckResults(raw: string): unknown {
  return JSON.parse(raw);
}
