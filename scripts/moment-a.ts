import { isAddress, parseAbi, type Hex } from 'viem';
import { prisma } from '../src/lib/db';
import { listIdentities, verifyEligibility } from '../src/lib/cleanverse/cvi';
import { assets } from '../src/lib/cleanverse/cva';
import { defaultChain, deployment, txUrl } from '../src/lib/chain/config';
import { BATCH_ABI, batchAddress, publicClient, releaserClient } from '../src/lib/chain/escrow';
import { onChainIntentId } from '../src/lib/settlement/release';
import { releaseBatch } from '../src/lib/settlement/batch';

/**
 * Moment A: ten real verified-asset payouts, independently screened.
 * Nine eligible rows settle; one no-A-Pass row isolates without reverting the batch.
 */
const chain = defaultChain();
const configuredAsset = assets(chain);
const A = { ...configuredAsset, aToken: deployment(chain).batchAsset ?? configuredAsset.aToken };
const { client, account } = releaserClient(chain);
const batchContract = batchAddress(chain);
const NO_APASS = '0x00000000000000000000000000000000deadbeef' satisfies Hex;
const ROW_AMOUNT = 10_000n; // 0.01 settlement units at 6 decimals
const ROW_COUNT = 10;

console.log(`Moment A on ${chain}`);
console.log(`sender : ${account.address}`);
console.log(`batch  : ${batchContract}`);
console.log(`asset  : ${A.aToken}\n`);

const senderEligibility = await verifyEligibility({ chain: A.chain, atoken: A.aToken, address: account.address });
if (senderEligibility.signal !== 'ALLOWED') {
  throw new Error(`Treasury is not eligible: ${senderEligibility.signal} ${senderEligibility.detail}`);
}

const listed = await listIdentities({ page: 1, pageSize: 100 });
const candidates = [...new Set(
  listed
    .filter((identity) => identity.chain?.toLowerCase() === A.chain && identity.walletAddress)
    .map((identity) => identity.walletAddress)
    .filter((address) => address.toLowerCase() !== account.address.toLowerCase())
    .filter((address) => isAddress(address))
    .map((address) => address as Hex)
)].sort();

const recipients: Hex[] = [];
for (const address of candidates) {
  if (recipients.length === ROW_COUNT - 1) break;
  const eligibility = await verifyEligibility({ chain: A.chain, atoken: A.aToken, address });
  if (eligibility.signal === 'ALLOWED') recipients.push(address);
}
if (recipients.length !== ROW_COUNT - 1) {
  throw new Error(`Need 9 eligible recipients, found ${recipients.length}`);
}

// Put the red row in the middle. A later green settlement is the visible proof that the
// batch continued after isolation rather than merely stopping at the first failure.
recipients.splice(4, 0, NO_APASS);
const stamp = Date.now();
const intentId = `moment-a-${stamp}`;
const total = ROW_AMOUNT * BigInt(recipients.length);

console.log('Creating matching database and on-chain batch intents...');
await prisma.intent.create({
  data: {
    id: intentId,
    chain,
    type: 'BATCH',
    senderCvi: account.address,
    asset: A.aToken,
    amount: total.toString(),
    status: 'ACTIVE',
    policyId: 'STANDARD',
    legs: {
      create: recipients.map((recipientCvi, index) => ({
        id: `${intentId}-leg-${index + 1}`,
        recipientCvi,
        amount: ROW_AMOUNT.toString(),
        sequence: index + 1,
        status: 'PENDING',
      })),
    },
  },
});

const erc20 = parseAbi(['function approve(address spender,uint256 amount) returns (bool)']);
const approveHash = await client.writeContract({
  address: A.aToken as Hex,
  abi: erc20,
  functionName: 'approve',
  args: [batchContract, total],
  account,
  chain: null,
});
await publicClient(chain).waitForTransactionReceipt({ hash: approveHash });

const fundHash = await client.writeContract({
  address: batchContract,
  abi: BATCH_ABI,
  functionName: 'fundBatch',
  args: [onChainIntentId(intentId), recipients, recipients.map(() => ROW_AMOUNT)],
  account,
  chain: null,
});
await publicClient(chain).waitForTransactionReceipt({ hash: fundHash });
console.log(`funded : ${txUrl(fundHash, chain)}\n`);

const result = await releaseBatch({ intentId, chain });
console.log('MOMENT A RESULT');
for (const outcome of result.outcomes) {
  if (outcome.status === 'RELEASED') {
    console.log(`  ${outcome.sequence.toString().padStart(2, '0')} GREEN  ${outcome.recipient}  ${txUrl(outcome.txHash, chain)}`);
  } else {
    console.log(`  ${outcome.sequence.toString().padStart(2, '0')} RED    ${outcome.recipient}  ${outcome.reason}`);
  }
}
console.log(`\nsummary: ${result.released} released, ${result.isolated} isolated, ${result.total} total`);
if (result.isolationTxHash) console.log(`isolation quarantine: ${txUrl(result.isolationTxHash, chain)}`);

if (result.released !== 9 || result.isolated !== 1 || result.outcomes[4]?.status !== 'ISOLATED') {
  throw new Error(`Moment A exit criterion failed: ${JSON.stringify(result)}`);
}
console.log('\n*** MOMENT A EXIT CRITERION MET ***');
await prisma.$disconnect();
