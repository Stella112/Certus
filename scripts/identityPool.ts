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
  /**
   * Chain the A-Pass was registered on. A-Passes are per (chain, address), so an entry
   * minted on one chain is useless on another. Entries written before the Monad -> Base
   * move (D11) have no chain field and are treated as 'monad'.
   */
  chain?: string;
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

const chainOf = (e: PoolEntry) => e.chain ?? 'monad';

export function availableCount(chain: string): number {
  return readPool().filter((e) => !e.consumedAt && chainOf(e) === chain).length;
}

/**
 * Take the oldest unconsumed identity ON THIS CHAIN. Deterministic: always the earliest
 * minted. Chain filtering matters: consuming a Monad entry while settling on Base would
 * hand the demo a freeze target that does not exist on the settlement chain.
 */
export function consumeFromPool(consumer: string, chain: string): PoolEntry | null {
  const pool = readPool();
  const idx = pool.findIndex((e) => !e.consumedAt && chainOf(e) === chain);
  if (idx === -1) return null;
  pool[idx] = { ...pool[idx], consumedAt: new Date().toISOString(), consumedBy: consumer };
  writePool(pool);
  return pool[idx];
}

export const POOL_FILE = POOL_PATH;
