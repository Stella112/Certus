/** Add the treasury as an institutional cUSD sender. Dry-run by default. */
import { call } from './probe/call.mjs';

const CONFIRMATION = 'WHITELIST_CERTUS_ORIGIN_SENDER';
const origin = process.env.CERTUS_ORIGIN_TOKEN_ADDRESS;
const sender = process.env.CERTUS_ORIGIN_SENDER_ADDRESS;
if (!origin || !/^0x[0-9a-fA-F]{40}$/.test(origin)) throw new Error('CERTUS_ORIGIN_TOKEN_ADDRESS missing/invalid');
if (!sender || !/^0x[0-9a-fA-F]{40}$/.test(sender)) throw new Error('CERTUS_ORIGIN_SENDER_ADDRESS missing/invalid');

const body = {
  entityName: 'Certus',
  serviceName: 'Certus Verified Settlement',
  category: 'Institutional Settlement',
  license: 'Cleanverse UAT Hackathon',
  logoUrl: 'https://images.cleanverse.com/app/token_icon/USDC.svg',
  addressList: [{ chain: 'monad', symbol: 'cUSD', assetAddress: origin, walletAddresses: [sender] }],
};

console.log('Prepared /atoken/add_whitelist_for_institutional request:');
console.log(JSON.stringify(body, null, 2));
if (process.env.CONFIRM_ORIGIN_WHITELIST !== CONFIRMATION) {
  console.log(`\nDRY RUN ONLY. Set CONFIRM_ORIGIN_WHITELIST=${CONFIRMATION} after Wrapped A-Token issuance.`);
  process.exit(0);
}

const result = await call('/atoken/add_whitelist_for_institutional', body, { encrypted: true, full: true });
if (result.json?.code !== '0000') throw new Error(`Whitelist rejected: ${result.json?.code} ${result.json?.message}`);
