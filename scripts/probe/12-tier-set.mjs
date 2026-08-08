// Which tier values does generate_apass actually accept?
// Needed for (a) the seed script, (b) whether a below-min_tier identity is even
// constructible in this sandbox (aUSDC min_tier = 5).
import { call } from './call.mjs';

const tiers = process.argv.slice(2); // pairs: tier,address tier,address ...
const results = [];

for (const pair of tiers) {
  const [tier, addr] = pair.split(',');
  const r = await call('/generate_apass', {
    wallet: { chain: 'monad', address: addr },
    customerId: 'CERTUSTIER' + tier + 'X' + Date.now(),
    expirationTime: 1900000000,
    tier, subTier: 0, group: '', subGroup: '', countries: ['NG'],
  }, { encrypted: true });
  const ok = r.json?.code === '0000';
  results.push({ tier, addr, ok, msg: (r.json?.message || '').slice(0, 60) });
  await new Promise(res => setTimeout(res, 1500));
}

console.log('\n===== TIER ACCEPTANCE =====');
for (const r of results) console.log(`tier ${String(r.tier).padStart(3)} : ${r.ok ? 'ACCEPTED' : 'REJECTED'}  ${r.msg}`);
console.log('\nAccepted addresses (for follow-up verify):');
for (const r of results) if (r.ok) console.log(`  tier ${r.tier} -> ${r.addr}`);
