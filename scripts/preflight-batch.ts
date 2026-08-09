import { assets, canonicalDepositAsset } from '../src/lib/cleanverse/cva';
import { chainConfig, defaultChain, deployment } from '../src/lib/chain/config';
import { verifyEligibility } from '../src/lib/cleanverse/cvi';
import { privateKeyToAccount } from 'viem/accounts';
import type { Hex } from 'viem';

const chain = defaultChain();
const configuredAsset = assets(chain);
const A = { ...configuredAsset, aToken: deployment(chain).batchAsset ?? configuredAsset.aToken };
const network = chainConfig(chain);
const pair = network.assetMode === 'canonical-deposit' ? await canonicalDepositAsset(A.chain, A.originToken) : null;
if (network.assetMode === 'canonical-deposit' && !pair) throw new Error(`NO_CANONICAL_PAIR: ${A.originToken} on ${A.chain}`);
const matches = network.assetMode === 'self-issued' || (!!pair && pair.atoken.address.toLowerCase() === A.aToken.toLowerCase() && pair.atoken.decimals === A.decimals);
const key = process.env.DEPLOYER_PRIVATE_KEY as Hex | undefined;
const treasury = key ? privateKeyToAccount(key).address : undefined;
const eligibility = treasury
  ? await verifyEligibility({ chain: A.chain, atoken: A.aToken, address: treasury })
  : undefined;

console.log(JSON.stringify({
  chain,
  configured: { address: A.aToken, decimals: A.decimals },
  assetMode: network.assetMode,
  canonical: pair ? { address: pair.atoken.address, decimals: pair.atoken.decimals } : null,
  matches,
  treasuryEligibility: eligibility?.signal ?? 'NOT_CHECKED',
  safeToDeploy: matches && eligibility?.signal === 'ALLOWED',
}, null, 2));

if (!matches || eligibility?.signal !== 'ALLOWED') process.exitCode = 1;
