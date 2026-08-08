import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import * as auditModule from '../../src/lib/audit/record';

/**
 * AC-1.2 requires append-only to be proven by a TEST, not by a one-off grep. Phase 1 audit
 * F1-03 found the test missing, so nothing stopped a later phase adding a mutation.
 *
 * The audit trail IS the compliance record. Losing or mutating it is a CRITICAL failure
 * (PART VII), so this is enforced two ways: the exported API surface must contain no
 * mutator, and the source itself must contain no mutating Prisma call.
 */

const AUDIT_DIR = path.resolve(process.cwd(), 'src/lib/audit');

function auditSources(): { file: string; source: string }[] {
  return fs
    .readdirSync(AUDIT_DIR)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => ({ file: f, source: fs.readFileSync(path.join(AUDIT_DIR, f), 'utf8') }));
}

describe('audit store is append-only', () => {
  it('exports no function whose name implies mutation', () => {
    const mutators = Object.keys(auditModule).filter((k) => /update|delete|remove|mutate|edit|purge/i.test(k));
    expect(mutators).toEqual([]);
  });

  it('still exports the create and read API it is supposed to', () => {
    expect(typeof auditModule.recordEvent).toBe('function');
    expect(typeof auditModule.eventsAsOf).toBe('function');
  });

  it('contains no mutating Prisma call against auditEvent anywhere in src/lib/audit', () => {
    const offenders: string[] = [];
    for (const { file, source } of auditSources()) {
      // strip comments so prose about "no update path" cannot trip the check
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      for (const op of ['update', 'updateMany', 'delete', 'deleteMany', 'upsert']) {
        if (new RegExp(`auditEvent\\s*\\.\\s*${op}\\s*\\(`).test(code)) {
          offenders.push(`${file}: auditEvent.${op}()`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('writes amounts as strings so a bigint can never become a float in the record', async () => {
    let captured: any = null;
    // Exercise the real serialiser via a stubbed prisma boundary.
    const { recordEvent } = auditModule;
    const original = (await import('../../src/lib/db')).prisma.auditEvent.create;
    (await import('../../src/lib/db')).prisma.auditEvent.create = (async (arg: any) => {
      captured = arg;
      return {};
    }) as any;

    await recordEvent({
      eventType: 'CHECK_RUN',
      checkResults: [],
      payload: { amount: 25_000_000_000n },
    });

    (await import('../../src/lib/db')).prisma.auditEvent.create = original;

    expect(typeof captured.data.payload).toBe('string');
    expect(JSON.parse(captured.data.payload).amount).toBe('25000000000');
  });
});
