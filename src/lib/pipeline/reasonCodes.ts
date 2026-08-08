/**
 * Closed enum of reason codes. Cleanverse messages are MAPPED into this set and never
 * passed through as free text. A judge, an auditor, and the UI all read the same vocabulary.
 */
export const ReasonCode = {
  // --- Identity (checks 1 & 2) ---
  NO_CVI: 'NO_CVI',
  ATOKEN_NOT_FOUND: 'ATOKEN_NOT_FOUND',
  CVI_REVOKED_OR_EXPIRED: 'CVI_REVOKED_OR_EXPIRED',
  CVI_UNAVAILABLE: 'CVI_UNAVAILABLE',

  // --- Asset rules (check 3) ---
  ASSET_RULE_TIER: 'ASSET_RULE_TIER',
  ASSET_RULE_COUNTRY: 'ASSET_RULE_COUNTRY',
  ASSET_RULE_GROUP: 'ASSET_RULE_GROUP',
  ASSET_RULE_BLACKLIST: 'ASSET_RULE_BLACKLIST',
  ASSET_RULES_UNAVAILABLE: 'ASSET_RULES_UNAVAILABLE',

  // --- Policy (check 4) ---
  POLICY_AMOUNT_LIMIT: 'POLICY_AMOUNT_LIMIT',
  POLICY_BUDGET_EXCEEDED: 'POLICY_BUDGET_EXCEEDED',
  POLICY_RECIPIENT_NOT_ALLOWED: 'POLICY_RECIPIENT_NOT_ALLOWED',
  POLICY_WINDOW_CLOSED: 'POLICY_WINDOW_CLOSED',
} as const;

export type ReasonCode = (typeof ReasonCode)[keyof typeof ReasonCode];

/** Human-readable strings for the UI. No em-dashes (PART VIII rule 8). */
export const ReasonText: Record<ReasonCode, string> = {
  NO_CVI: 'Counterparty holds no verified identity',
  ATOKEN_NOT_FOUND: 'Asset is not a recognised verified asset',
  CVI_REVOKED_OR_EXPIRED: 'Verified identity revoked or expired',
  CVI_UNAVAILABLE: 'Identity service unreachable, settlement held',
  ASSET_RULE_TIER: 'Identity tier below the asset minimum',
  ASSET_RULE_COUNTRY: 'Counterparty country not permitted for this asset',
  ASSET_RULE_GROUP: 'Counterparty group not permitted for this asset',
  ASSET_RULE_BLACKLIST: 'Counterparty is denied by asset rule',
  ASSET_RULES_UNAVAILABLE: 'Asset rules unreadable, settlement held',
  POLICY_AMOUNT_LIMIT: 'Amount exceeds the per payment limit',
  POLICY_BUDGET_EXCEEDED: 'Spending budget exhausted for this period',
  POLICY_RECIPIENT_NOT_ALLOWED: 'Recipient is not on the approved list',
  POLICY_WINDOW_CLOSED: 'Outside the permitted settlement window',
};
