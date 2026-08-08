import fs from 'node:fs';
import path from 'node:path';

/**
 * Pre-minted freeze-target pool (DECISIONS.md D7).
 *
 * generate_apass proved intermittent, so nothing on a demo or rehearsal path may mint an
 * identity live. mint-pool.ts fills this file whenever the endpoint happens to be up;
 * seed.ts consumes from it. Freezing is irreversible in UAT, so each rehearsal burns one.
 *
 * No private keys are stored: Cleanverse signs identity operations, so an address is all
 * we need. Keeping keys out of the file removes an entire class of leak.
 */

export interface PoolEntry {
  address: string;
  customerId: string;
  cvRecordId: string;
  mintedAt: string;
  /** set when a seed run has burned this identity as its freeze target */
  consumedAt?: string;
  consumedBy?: string;
}

const POOL_PATH = path.resolve(process.cwd(), 'data', 'identity-pool.json');

export function readPool(): PoolEntry[] {
  if (!fs.existsSync(POOL_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(POOL_PATH, 'utf8')) as PoolEntry[];
  } catch {
    return [];
  }
}

export function writePool(entries: PoolEntry[]): void {
  fs.mkdirSync(path.dirname(POOL_PATH), { recursive: true });
  fs.writeFileSync(POOL_PATH, JSON.stringify(entries, null, 2) + '\n');
}

export function appendToPool(entry: PoolEntry): void {
  writePool([...readPool(), entry]);
}

export function availableCount(): number {
  return readPool().filter((e) => !e.consumedAt).length;
}

/** Take the oldest unconsumed identity. Deterministic: always the earliest minted. */
export function consumeFromPool(consumer: string): PoolEntry | null {
  const pool = readPool();
  const idx = pool.findIndex((e) => !e.consumedAt);
  if (idx === -1) return null;
  pool[idx] = { ...pool[idx], consumedAt: new Date().toISOString(), consumedBy: consumer };
  writePool(pool);
  return pool[idx];
}

export const POOL_FILE = POOL_PATH;
