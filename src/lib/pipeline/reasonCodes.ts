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

  // --- Purpose evidence ---
  PURPOSE_REQUIRED: 'PURPOSE_REQUIRED',
  PURPOSE_HASH_INVALID: 'PURPOSE_HASH_INVALID',

  // --- System integrity (Phase 1 audit F1-01) ---
  /** A check threw instead of returning a result. Never allowed to become a PASS. */
  SYSTEM_ERROR: 'SYSTEM_ERROR',
  /** The compliance record could not be written. No record, no settlement. */
  AUDIT_WRITE_FAILED: 'AUDIT_WRITE_FAILED',
  /** A Cleanverse response did not match its schema at the adapter boundary. */
  MALFORMED_RESPONSE: 'MALFORMED_RESPONSE',
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
  PURPOSE_REQUIRED: 'Proof of purpose is required for this payment',
  PURPOSE_HASH_INVALID: 'Proof-of-purpose hash is invalid',
  SYSTEM_ERROR: 'Compliance check failed to complete, settlement held',
  AUDIT_WRITE_FAILED: 'Compliance record could not be written, settlement held',
  MALFORMED_RESPONSE: 'Identity service returned an unrecognised response, settlement held',
};
