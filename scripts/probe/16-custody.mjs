// AC-2.0: how does value reach a recipient AS a verified asset?
// Q1: is depositUSDCWallet per-identity or shared across all identities?
//     If shared, sending USDC there credits whoever Cleanverse attributes it to,
//     which would NOT be our recipient, and the release design must change.
// Q2: what does the aUSDC proxy point at, and does it expose a wrap/mint entry point?
import { call } from './call.mjs';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';

const mint = async (label) => {
  const address = privateKeyToAccount(generatePrivateKey()).address;
  const r = await call(
    '/generate_apass',
    {
      wallet: { chain: 'monad', address },
      customerId: 'CERTUSCUSTODY' + Date.now() + label,
      expirationTime: 1900000000,
      tier: '50',
      subTier: 0,
      group: '',
      subGroup: '',
      countries: ['NG'],
    },
    { encrypted: true }
  );
  const w = r.json?.data?.wallet;
  return { label, address, depositUSDC: w?.depositUSDCWallet, depositUSDT: w?.depositUSDTWallet, apass: w?.apassAddress };
};

console.log('Minting two fresh identities to compare their deposit routes...\n');
const a = await mint('A');
const b = await mint('B');

console.log('\n===== DEPOSIT ROUTE COMPARISON =====');
for (const x of [a, b]) {
  console.log(`  identity ${x.label}: ${x.address}`);
  console.log(`    depositUSDCWallet: ${x.depositUSDC}`);
  console.log(`    apassAddress     : "${x.apass}"`);
}
console.log('');
if (a.depositUSDC && a.depositUSDC === b.depositUSDC) {
  console.log('  => SHARED deposit wallet across identities.');
  console.log('     Sending origin USDC there does NOT credit a specific recipient on chain.');
  console.log('     Release must therefore be a DIRECT on-chain transfer, not a deposit-route wrap.');
} else if (a.depositUSDC && b.depositUSDC) {
  console.log('  => PER-IDENTITY deposit wallets. A deposit-route wrap is viable.');
} else {
  console.log('  => No deposit wallet returned; inspect the raw responses above.');
}
