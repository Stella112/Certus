import crypto from 'node:crypto';

/**
 * SOURCE: API-TRUTH.md § AES encryption (ultimately PART XI § AES)
 * VERIFIED: SANDBOX: confirmed by real call on 2026-08-08. The server accepted our
 *           encrypted bodies on generate_apass and update_status (business responses,
 *           not 403 decryption errors), which proves the scheme end to end.
 * ENCRYPTED: n/a (this IS the encryption layer)
 * FALLBACK:  none. A wrong key or IV fails as a silent 403; we hard-fail at startup
 *            instead, so it can never be mistaken for a compliance outcome at runtime.
 *
 * Scheme: AES-256-CBC, PKCS7(=PKCS5) padding, FIXED 16 zero-byte IV, key is the
 * Base64-decoded CLEANVERSE_API_KEY, ciphertext Base64, sent as {"data": "<ct>"}.
 *
 * NOTE TO FUTURE READERS: the all-zero IV is NOT an oversight and must not be
 * "fixed" into a random IV. It is Cleanverse's specification. Changing it breaks
 * every encrypted endpoint with an opaque 403.
 */

const IV = Buffer.alloc(16, 0);
const ALGO = 'aes-256-cbc';

let cachedKey: Buffer | null = null;

/** Pinned to AES-256. Any other key length is a configuration error, not a fallback. */
function key(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.CLEANVERSE_API_KEY;
  if (!raw || raw.trim() === '') {
    throw new Error(
      'CLEANVERSE_API_KEY is missing. Populate it in .env (Base64 AES key from the Cleanverse onboarding email).'
    );
  }
  const buf = Buffer.from(raw.trim(), 'base64');
  if (buf.length !== 32) {
    throw new Error(
      `CLEANVERSE_API_KEY must Base64-decode to exactly 32 bytes for ${ALGO}; got ${buf.length}. ` +
        'Check for stray whitespace or a truncated paste in .env.'
    );
  }
  cachedKey = buf;
  return buf;
}

export function encryptBody(plaintextJson: string): string {
  const cipher = crypto.createCipheriv(ALGO, key(), IV);
  return Buffer.concat([cipher.update(Buffer.from(plaintextJson, 'utf8')), cipher.final()]).toString('base64');
}

export function decryptBody(ciphertextB64: string): string {
  const decipher = crypto.createDecipheriv(ALGO, key(), IV);
  return Buffer.concat([decipher.update(Buffer.from(ciphertextB64, 'base64')), decipher.final()]).toString('utf8');
}

/** Startup assertion. Call once at boot so misconfiguration fails loudly and early. */
export function assertAesConfigured(): void {
  const probe = JSON.stringify({ certus: 'aes-selftest' });
  if (decryptBody(encryptBody(probe)) !== probe) {
    throw new Error('AES self-test failed: encrypt/decrypt round-trip mismatch.');
  }
}
