// Throwaway Phase-0 probe helper. NOT the production adapter.
// Cleanverse AES scheme (from PART XI):
//   Algorithm: AES / CBC / PKCS5Padding (PKCS7 in Node terms)
//   IV:        16 zero bytes (fixed, not random)
//   Key:       Base64-decode(CLEANVERSE_API_KEY) -> raw bytes used as AES key
//   Encoding:  Base64 the ciphertext, sent as {"data":"<ciphertext>"}
import crypto from 'node:crypto';

const IV = Buffer.alloc(16, 0); // 16 zero bytes

function keyBytes() {
  const b = process.env.CLEANVERSE_API_KEY;
  if (!b) throw new Error('CLEANVERSE_API_KEY missing from env');
  return Buffer.from(b, 'base64');
}

function algoFor(key) {
  if (key.length === 16) return 'aes-128-cbc';
  if (key.length === 24) return 'aes-192-cbc';
  if (key.length === 32) return 'aes-256-cbc';
  throw new Error(`Unexpected AES key length ${key.length} bytes (expected 16/24/32)`);
}

export function encryptBody(plaintextJson) {
  const key = keyBytes();
  const cipher = crypto.createCipheriv(algoFor(key), key, IV);
  const enc = Buffer.concat([cipher.update(Buffer.from(plaintextJson, 'utf8')), cipher.final()]);
  return enc.toString('base64');
}

export function decryptBody(ciphertextB64) {
  const key = keyBytes();
  const decipher = crypto.createDecipheriv(algoFor(key), key, IV);
  const dec = Buffer.concat([decipher.update(Buffer.from(ciphertextB64, 'base64')), decipher.final()]);
  return dec.toString('utf8');
}

export function keyInfo() {
  const key = keyBytes();
  return { bytes: key.length, algo: algoFor(key) };
}
