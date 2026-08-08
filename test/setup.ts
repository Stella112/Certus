import fs from 'node:fs';
import path from 'node:path';

/**
 * Load .env into process.env for tests without adding a dependency.
 * Values are never logged. Missing files are tolerated so unit tests still run.
 */
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    // strip inline comments on unquoted values, then surrounding quotes
    if (!value.startsWith('"') && !value.startsWith("'")) value = value.split(/\s+#/)[0].trim();
    value = value.replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
}
