import fs from 'node:fs';
import path from 'node:path';
import { assets } from '../src/lib/cleanverse/cva';
import { generateIdentity, verifyEligibility } from '../src/lib/cleanverse/cvi';
import { defaultChain } from '../src/lib/chain/config';

const chain = defaultChain();
if (chain !== 'monad') throw new Error('Sponsored yield demo is pinned to Monad testnet');
const file = path.resolve('deployments', `${chain}.json`);
const deployment = JSON.parse(fs.readFileSync(file, 'utf8'));
const vault = deployment.contracts?.CertusSponsoredYieldVault?.address as string | undefined;
if (!vault) throw new Error('Standalone sponsored vault is not deployed');
const identity = await generateIdentity({ chain: assets(chain).chain, address: vault, customerId: `CERTUSSV${Date.now()}`, expirationTime: 1_900_000_000, tier: '50' });
if (!identity.ok) throw new Error(`Vault A-Pass registration failed: ${identity.detail}`);
let eligible = 'PENDING';
for (let attempt = 1; attempt <= 12; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 5_000));
  const result = await verifyEligibility({ chain: assets(chain).chain, atoken: assets(chain).aToken, address: vault });
  eligible = result.signal;
  console.log(`vault eligibility ${attempt}: ${eligible}`);
  if (eligible === 'ALLOWED') break;
}
if (eligible !== 'ALLOWED') throw new Error(`Vault did not become eligible: ${eligible}`);
deployment.contracts.CertusSponsoredYieldVault.aPassTx = identity.txHash;
deployment.contracts.CertusSponsoredYieldVault.status = 'testnet-only sponsored reserve; A-Pass active; not protocol-generated yield';
fs.writeFileSync(file, `${JSON.stringify(deployment, null, 2)}\n`);
console.log(`Vault A-Pass tx: ${identity.txHash}`);
