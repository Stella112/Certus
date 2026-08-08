/**
 * AUDITOR probe (throwaway, not product code).
 *
 * Claim under test, from the Phase 1 commit message and evaluate()'s own doc comment:
 *   "an audit event is written INSIDE the function so it is structurally impossible
 *    to evaluate without leaving a compliance record"
 * and
 *   "Fail-closed throughout".
 *
 * Question: what happens when an adapter THROWS rather than returning an
 * 'unavailable' result? Real sources of throws: a bad AES key (encryptBody runs
 * before the try block in client.post), a missing env var, or the database being down.
 */
import { evaluate } from '../../src/lib/pipeline/evaluate';
import type { EvaluationContext } from '../../src/lib/pipeline/types';

const ctx: EvaluationContext = {
  trigger: 'MILESTONE_RELEASE',
  chain: 'monad',
  atoken: '0xaC0893567D43C3E7e6e35a72803df05416C1f20D',
  senderAddress: '0xSender',
  recipientAddress: '0xRecipient',
  amount: 1_000_000n,
  policyId: 'STANDARD',
};

const recorded: unknown[] = [];
const baseDeps = {
  verifyEligibility: async () => ({ signal: 'ALLOWED' as const, code: 4, detail: 'ok' }),
  queryIdentity: async () => ({
    cvRecordId: '1', tier: '50', subTier: 0, group: '', subGroup: '',
    countries: ['NG'], expirationTime: 1900000000, status: 1,
  }),
  getAssetRules: async () => [],
  checkPolicy: async () => ({ check: 'POLICY' as const, passed: true, detail: 'ok' }),
  recordEvent: async (e: unknown) => { recorded.push(e); return {} as never; },
};

async function scenario(name: string, deps: Record<string, unknown>) {
  recorded.length = 0;
  try {
    const d = await evaluate(ctx, { ...baseDeps, ...deps } as never);
    console.log(`  ${name}\n    -> returned verdict=${d.verdict}  auditEventsWritten=${recorded.length}`);
  } catch (err) {
    console.log(
      `  ${name}\n    -> THREW: ${(err as Error).message}  auditEventsWritten=${recorded.length}` +
        `\n       *** no verdict, no compliance record ***`
    );
  }
}

console.log('\nAUDIT PROBE: does evaluate() fail closed when an adapter THROWS?\n');

await scenario('A. identity adapter throws (simulates bad AES key / missing env)', {
  verifyEligibility: async () => {
    throw new Error('CLEANVERSE_API_KEY must Base64-decode to exactly 32 bytes');
  },
});

await scenario('B. asset-rules adapter throws', {
  getAssetRules: async () => {
    throw new Error('boom');
  },
});

await scenario('C. policy check throws (simulates database unavailable)', {
  checkPolicy: async () => {
    throw new Error('SQLITE_CANTOPEN: unable to open database file');
  },
});

await scenario('D. audit writer itself throws (database down at record time)', {
  recordEvent: async () => {
    throw new Error('SQLITE_CANTOPEN');
  },
});

console.log('\nControl: all adapters healthy');
await scenario('E. healthy', {});
