// Which chains does Cleanverse actually support, and what token pairs exist on each?
// Free, read-only, no rate limit. Driven by the user's point that Monad is not the only
// deployable chain.
import { call } from './call.mjs';

const r = await call('/query_deposit_atoken_list', {}, { encrypted: false, full: true });
const tokens = r.json?.data?.tokens ?? [];

const byChain = new Map();
for (const t of tokens) {
  // chain is not on each row when querying all chains; infer from address shape
  const addr = t.origin_token?.address ?? '';
  const evm = addr.startsWith('0x');
  const key = evm ? 'EVM' : 'non-EVM (Solana-style)';
  if (!byChain.has(key)) byChain.set(key, []);
  byChain.get(key).push(t);
}

console.log(`\nTotal token pairs across all chains: ${tokens.length}\n`);
for (const [kind, list] of byChain) {
  console.log(`${kind}: ${list.length} pairs`);
}

console.log('\n--- now enumerate per named chain ---');
const candidates = ['monad', 'base', 'ethereum', 'sepolia', 'polygon', 'arbitrum', 'bsc', 'solana', 'avalanche', 'optimism'];
for (const chain of candidates) {
  const res = await call('/query_deposit_atoken_list', { chain }, { encrypted: false });
  const list = res.json?.data?.tokens ?? [];
  if (list.length) {
    console.log(`\n  ${chain.toUpperCase()}: ${list.length} pair(s)`);
    for (const t of list) {
      console.log(
        `    ${t.origin_token?.symbol}(${t.origin_token?.decimals}dp) ${t.origin_token?.address}` +
          `  ->  ${t.atoken?.symbol} ${t.atoken?.address}`
      );
    }
  } else {
    console.log(`  ${chain}: none`);
  }
}
