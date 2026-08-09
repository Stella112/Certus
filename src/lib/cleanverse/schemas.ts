import { z } from 'zod';

/**
 * Zod schemas for every Cleanverse response Certus consumes (PART IV: "zod on every
 * boundary"). Added in response to Phase 1 audit F1-02.
 *
 * These are derived from REAL responses recorded in docs/API-TRUTH.md, not from the vendor
 * docs and not from memory. Where the sandbox returns a field we do not rely on, the schema
 * stays permissive (passthrough) so a harmless upstream addition cannot break settlement.
 * Where we DO rely on a field, it is required and typed.
 *
 * Failing a schema is a compliance event, not a parse nuisance: an unrecognised response
 * means we cannot assert eligibility, so the pipeline fails closed with MALFORMED_RESPONSE.
 */

/** verify_apass -> data. `code` is the compliance outcome and must be present. */
export const VerifyApassSchema = z
  .object({
    chain: z.string(),
    atoken: z.string(),
    address: z.string(),
    code: z.number().int(),
    message: z.string().optional().default(''),
  })
  .passthrough();

/**
 * query_apass -> data. `tier` arrives as a STRING ("50") in the sandbox, not a number.
 * `status` has been observed as both 1 and null, so null is permitted explicitly.
 */
export const QueryApassSchema = z
  .object({
    cvRecordId: z.string().optional().default(''),
    tier: z.string(),
    subTier: z.number().int(),
    group: z.string().optional().default(''),
    subGroup: z.string().optional().default(''),
    countries: z.array(z.string()).optional().default([]),
    expirationTime: z.number().optional().default(0),
    status: z.number().nullable().optional().default(null),
    currentKycHash: z.string().optional(),
  })
  .passthrough();

/** One compliance rule inside an A-Token contract. */
export const ATokenRuleSchema = z
  .object({
    allowed_group: z.string().optional().default(''),
    allowed_sub_group: z.string().optional().default(''),
    min_tier: z.number().int(),
    min_sub_tier: z.number().int(),
    is_black_list: z.boolean(),
    countries: z.array(z.string()).optional().default([]),
  })
  .passthrough();

/** atoken/rules -> data. An empty `rules` array is valid and means "ungated". */
export const ATokenRulesSchema = z
  .object({
    chain: z.string().optional().default(''),
    atoken_address: z.string().optional().default(''),
    rules: z.array(ATokenRuleSchema),
  })
  .passthrough();

/** query_apass_list -> data. Used for dashboard population and seed discovery. */
export const IdentityListSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            cvRecordId: z.string().optional().default(''),
            customerId: z.string().optional().default(''),
            chain: z.string().optional().default(''),
            walletAddress: z.string().optional().default(''),
            status: z.number().nullable().optional().default(null),
            tier: z.string().optional().default(''),
            countries: z.array(z.string()).optional().default([]),
            expirationTime: z.number().optional().default(0),
            registeredAt: z.string().optional().default(''),
          })
          .passthrough()
      )
      .optional()
      .default([]),
  })
  .passthrough();

/** update_status / generate_apass write responses. */
export const TxHashSchema = z.object({ txHash: z.string() }).passthrough();

export const GenerateApassSchema = z
  .object({
    cvRecordId: z.string(),
    customerId: z.string().optional().default(''),
    wallet: z.object({ txHash: z.string().optional() }).passthrough().optional(),
  })
  .passthrough();

/** download_travel_rule -> data. Both fields are required for a usable artifact. */
export const TravelRuleReportSchema = z
  .object({
    downloadUrl: z.string().url(),
    // UAT returned null for a valid transaction-report URL on 2026-08-08. The URL is the
    // load-bearing artifact; callers create a deterministic fallback filename.
    fileName: z.string().min(1).nullable(),
  })
  .passthrough();

const DepositTokenSchema = z.object({
  address: z.string(),
  symbol: z.string(),
  decimals: z.number().int().min(0).max(36),
}).passthrough();

export const DepositAssetListSchema = z.object({
  chain: z.string(),
  tokens: z.array(z.object({
    origin_token: DepositTokenSchema,
    atoken: DepositTokenSchema,
    accesscore_address: z.string(),
    apass_address: z.string(),
  }).passthrough()).nullable(),
}).passthrough();

/**
 * Parse helper. Returns the typed value or null; callers translate null into a closed
 * reason code. Deliberately does NOT throw: throwing is what caused F1-01.
 */
export function parseOrNull<T>(schema: z.ZodType<T>, data: unknown): T | null {
  const result = schema.safeParse(data);
  return result.success ? result.data : null;
}
