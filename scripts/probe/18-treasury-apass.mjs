// Register an A-Pass for the DEPLOYER address so it can act as the demo treasury sender.
// Why the deployer: it is the one Monad address whose private key we hold (mint-pool
// deliberately discards keys), it already holds MON for gas, and the faucet target must be
// an address we control. Giving it an A-Pass also makes it a valid holder if the faucet
// happens to dispense the gated aUSDC rather than the ungated origin token.
import { call } from './call.mjs';

const DEPLOYER = '0xdC646c197d0202FC2A0326af8ab55066A3549E2E';

console.log('Registering A-Pass for the deployer/treasury address', DEPLOYER);
const r = await call(
  '/generate_apass',
  {
    wallet: { chain: 'monad', address: DEPLOYER },
    customerId: 'CERTUSTREASURY' + Date.now(),
    expirationTime: 1900000000,
    tier: '50',
    subTier: 0,
    group: '',
    subGroup: '',
    countries: ['NG'],
  },
  { encrypted: true }
);

console.log('\ndepositUSDCWallet for treasury:', r.json?.data?.wallet?.depositUSDCWallet);

console.log('\n--- verify the treasury is now eligible against aUSDC ---');
const v = await call(
  '/verify_apass',
  { chain: 'monad', atoken: '0xaC0893567D43C3E7e6e35a72803df05416C1f20D', address: DEPLOYER },
  { encrypted: false }
);
console.log('  verify data.code =', v.json?.data?.code, '(4 = eligible)');
