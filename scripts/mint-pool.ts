import { generateIdentity } from '../src/lib/cleanverse/cvi';
import { assets } from '../src/lib/cleanverse/cva';
import { appendToPool, availableCount, POOL_FILE } from './identityPool';
import { privateKeyToAccount } from 'viem/accounts';
import { generatePrivateKey } from 'viem/accounts';

// A-Passes are registered per (chain, address), so the pool is chain-scoped.
// After the Monad -> Base Sepolia move (D11), Monad-minted entries are unusable here.
const CHAIN = assets().chain;

/**
 * Opportunistically mint freeze-target identities into the pool.
 *
 * Run this whenever generate_apass is up. It is deliberately NOT part of seed or the demo
 * path: generate_apass is intermittent (API-TRUTH.md), and a demo must never depend on it.
 *
 *   npm run mint-pool -- 5      # try to mint 5
 */

const want = Number(process.argv[2] ?? 3);
const EXPIRY = 1_900_000_000; // year 2030, comfortably future (near-future values are rejected)

console.log(`Pool before: ${availableCount(CHAIN)} available (${POOL_FILE})`);
console.log(`Attempting to mint ${want} freeze-target identities...\n`);

let minted = 0;
for (let i = 0; i < want; i++) {
  // Throwaway address. The private key is generated, used to derive the address, and
  // discarded: Cleanverse signs identity operations, so we never need it again.
  const address = privateKeyToAccount(generatePrivateKey()).address;
  const customerId = `CERTUSPOOL${Date.now()}${i}`; // >=12 chars, alphanumeric only

  const res = await generateIdentity({
    chain: CHAIN,
    address,
    customerId,
    expirationTime: EXPIRY,
  });

  if (res.ok) {
    appendToPool({ address, customerId, cvRecordId: res.cvRecordId, chain: CHAIN, mintedAt: new Date().toISOString() });
    minted++;
    console.log(`  OK   ${address}  cvRecordId=${res.cvRecordId}`);
  } else {
    console.log(`  FAIL ${address}  ${res.detail}`);
  }
  await new Promise((r) => setTimeout(r, 2000)); // be gentle with the sandbox
}

console.log(`\nMinted ${minted}/${want}. Pool now: ${availableCount(CHAIN)} available.`);
if (minted === 0) {
  console.log(
    '\ngenerate_apass appears to be down again (see the reliability warning in\n' +
      'docs/API-TRUTH.md). This is expected to be intermittent. Re-run later; the pool\n' +
      'exists precisely so this outage cannot reach the demo.'
  );
}
