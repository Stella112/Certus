/**
 * Institutional spending policy (check 4). Local layer per DECISIONS.md D2.
 * Three named sets, visibly different in the UI, so the engine is demonstrably real
 * rather than hardcoded to one path.
 *
 * Amounts are base units (6 decimals for aUSDC) as bigint. Never floats.
 */

export type PolicyId = 'PERMISSIVE' | 'STANDARD' | 'STRICT';

export interface Policy {
  id: PolicyId;
  label: string;
  description: string;
  /** Max value of any single settlement leg. null = unlimited. */
  maxPerLeg: bigint | null;
  /** Max cumulative settled value per sender per rolling 24h. null = unlimited. */
  dailyBudget: bigint | null;
  /** If set, the recipient must appear here. null = any verified recipient. */
  allowlist: string[] | null;
  /** UTC hour window [startHour, endHour). null = always open. */
  windowUTC: { startHour: number; endHour: number } | null;
}

const USDC = (whole: number) => BigInt(whole) * 1_000_000n; // 6 decimals

export const POLICIES: Record<PolicyId, Policy> = {
  PERMISSIVE: {
    id: 'PERMISSIVE',
    label: 'Permissive',
    description: 'Identity and asset checks only. No institutional spending limits.',
    maxPerLeg: null,
    dailyBudget: null,
    allowlist: null,
    windowUTC: null,
  },
  STANDARD: {
    id: 'STANDARD',
    label: 'Standard',
    description: 'Per payment cap of 25,000 and a rolling 24 hour budget of 100,000.',
    maxPerLeg: USDC(25_000),
    dailyBudget: USDC(100_000),
    allowlist: null,
    windowUTC: null, // deliberately always open: the demo must work at any hour
  },
  STRICT: {
    id: 'STRICT',
    label: 'Strict',
    description: 'Per payment cap of 5,000, 24 hour budget of 20,000, settlement 08:00 to 18:00 UTC.',
    maxPerLeg: USDC(5_000),
    dailyBudget: USDC(20_000),
    allowlist: null,
    windowUTC: { startHour: 8, endHour: 18 },
  },
};

export function getPolicy(id: string): Policy {
  const p = POLICIES[id as PolicyId];
  if (!p) throw new Error(`Unknown policyId "${id}". Valid: ${Object.keys(POLICIES).join(', ')}`);
  return p;
}
