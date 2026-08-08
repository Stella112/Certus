// Local round-trip proof: encrypt -> decrypt -> must equal original.
// No network. Proves our AES config is internally consistent before any
// encrypted API call depends on it. Server-side proof comes when
// generate_apass / update_status accept our encrypted body.
import { encryptBody, decryptBody, keyInfo } from './aes.mjs';

const info = keyInfo();
console.log(`AES key: ${info.bytes} bytes -> ${info.algo}`);

const original = JSON.stringify({ hello: 'certus', n: 42, nested: { ok: true } });
const ct = encryptBody(original);
const back = decryptBody(ct);

console.log('plaintext in :', original);
console.log('ciphertext   :', ct);
console.log('decrypted out:', back);
console.log(back === original ? 'ROUND-TRIP: PASS' : 'ROUND-TRIP: FAIL');
process.exit(back === original ? 0 : 1);
