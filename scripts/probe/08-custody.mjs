// AC-0.5 custody probe. Question: can a plain contract address hold/move an
// A-Token, or must the holder itself carry an A-Pass?
// The A-Token gates transfers by A-Pass eligibility of the counterparties.
// So: an address with NO A-Pass must fail verify against aUSDC (expect code 2).
// If true -> our escrow contract (no A-Pass) cannot custody aUSDC directly ->
// use fallback (c): custody the ORIGIN token (plain ERC20), gate the A-Token
// movement at release through the pipeline.
import { call } from './call.mjs';

const ATOKEN = '0xaC0893567D43C3E7e6e35a72803df05416C1f20D';
const ORIGIN_USDC = '0x534b2f3A21130d7a60830c2Df862319e593943A3';
// A fresh random address that definitely holds no A-Pass (stand-in for a bare contract addr)
const NO_APASS_ADDR = '0x00000000000000000000000000000000DeaDBeeF';

console.log('--- verify_apass on an address with NO A-Pass (expect code 2 = NO_CVI) ---');
await call('/verify_apass', { chain: 'monad', atoken: ATOKEN, address: NO_APASS_ADDR }, { encrypted: false, full: true, saveAs: 'verify_no_apass' });

console.log('\n--- atoken/rules for ORIGIN token (is the origin token itself gated?) ---');
await call('/atoken/rules', { chain: 'monad', atoken_address: ORIGIN_USDC }, { encrypted: false, full: true, saveAs: 'origin_rules' });
