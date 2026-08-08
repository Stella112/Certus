# DECISIONS LOG

Every deviation and design decision, dated. Judges may ask; this is the paper trail.

---

## 2026-08-08 — Phase 0 locked decisions (from user)

**D1. Escrow custody = fallback (c): custody the origin token.**
CertusEscrow holds ungated origin USDC (0x534b...43A3). The four-check pipeline runs at
every release; aUSDC (0xaC08...f20D) moves to the recipient only on PASS. Provenance PDF via
download_travel_rule on the release txHash preserves lineage, so (c) stands.
Fallback (a) Validator-pool registration is NOT used. Fallback (b) issuing the escrow its own
A-Pass is FORBIDDEN (tying custody to a freezable credential is an unwanted failure mode).
Evidence: AC-0.5 probe — no-A-Pass address => verify code 2; origin USDC rules []. See API-TRUTH.md.

**D2. Policy engine = local layer for the 48h.**
Check #4 (budget/allowlist/time-window/role) is enforced in Certus's own policy layer.
Three named sets seeded: PERMISSIVE, STANDARD, STRICT. Demo default STANDARD.
Validator-pool on-chain enforcement is Phase 8 stretch only.

**D3. Build root = C:\certus** (plain local path, not a synced folder).

**D4. Single-mock rule.** MockYieldVault is the ONLY simulated component in the entire build.
It must be labelled IS_MOCK in code (a constant) and in the UI. Any second mock is a
STOP-and-escalate event, not a unilateral decision.

**D5. Monad testnet values** sourced from official docs (docs.monad.xyz), pending final user
confirmation: chainId 10143, RPC https://testnet-rpc.monad.xyz, explorer
https://testnet.monadscan.com, native MON/18, faucet https://faucet.monad.xyz. See API-TRUTH.md.

**D6. Un-freeze deviation ACCEPTED by user (2026-08-08).**
`update_status status=1` fails ([500]) in UAT, so no A-Pass can be reactivated. User accepted.
Consequences, binding on all later phases:
  - Quarantine is TERMINAL in the demo: funds held in escrow with provenance lineage intact,
    released only by an explicit compliance-officer/arbiter action in Certus. There is no
    API un-freeze path and we must not imply one, in UI copy, README, or on stage.
  - The seed/reset script MUST mint a fresh freeze-target A-Pass on every run (see F2).
  - Moment B is unaffected: it depends on freezing, which is fully proven.

---

## 2026-08-08 — Phase 0 findings that change the build

**F1. Freeze signal is `APassNotActive`, not `data.code == 3`. (Corrects PART XI.)**
A frozen A-Pass makes verify_apass return envelope `code:"0002"` with message containing
`APassNotActive`, not a `data.code:3`. The pipeline treats eligibility as `data.code === 4`
ONLY; `APassNotActive` maps to reason CVI_REVOKED_OR_EXPIRED -> FREEZE. Sandbox overrides doc.
Evidence: AC-0.6 freeze cycle, scripts/probe/06-freeze-cycle.mjs.

**F2. update_status status=1 (reactivate) fails ([500] System Error) in UAT.**
Consequences:
  (a) Moment B does NOT depend on reactivation — the freeze cascade is the demo. Unaffected.
  (b) Quarantine is TERMINAL in the demo: funds held with lineage, arbiter-release only.
      Do not build/promise an API un-freeze path.
  (c) SEED/RESET DESIGN: because a frozen identity cannot be reactivated, the freeze-target
      identity must be freshly minted via generate_apass on EVERY seed/reset, so the two-moment
      demo is repeatable across rehearsals. This is a Phase 1 seed-script requirement.
Raised as OPEN QUESTION #1 in API-TRUTH.md.

**F3. Use the pre-issued Monad aUSDC pair; do not launch a new A-Token.**
query_deposit_atoken_list returns a ready aUSDC/USDC pair on Monad, avoiding async
atoken/launch approval latency. See API-TRUTH.md.

**F4. Exact Cleanverse field names (deviations from intuition), locked:**
  - query_apass wallet field is `address` (not walletAddress).
  - verify_apass requires `chain, atoken, address`.
  - atoken/rules field is `atoken_address` (wrong name => HTTP 500).
  - update_status/generate_apass wallet is an object `{chain, address}`; both AES-encrypted.

---

## 2026-08-08 — Phase 1 findings

**D7. Freeze-targets come from a PRE-MINTED POOL, never live minting.**
`generate_apass` proved intermittent (see API-TRUTH.md reliability warning): one success then
~10 consecutive `[CV_500]` failures over 30 min while reads stayed healthy. Since D6/F2 requires
a fresh freeze-target per reset, and a demo cannot depend on a flaky write, the design is:
  - `scripts/mint-pool.ts` mints freeze-target identities opportunistically whenever the
    endpoint is up, and appends them to `data/identity-pool.json` (gitignored, holds no secrets
    beyond throwaway test addresses).
  - `scripts/seed.ts` CONSUMES an unused identity from the pool. It never calls generate_apass
    on the demo path.
  - If the pool is empty, seed fails LOUDLY with instructions, rather than silently producing
    a demo that cannot perform Moment B.
This also removes a live API write from the rehearsal path, which is better design regardless.

**F5. Tier enforcement semantics unresolved**, blocked by the same outage. Check 3 evaluates
tier locally (`query_apass.tier` vs `atoken/rules.min_tier`); its failing branch is covered by
a unit-test double. Re-probe when writes recover. Note the falsified hypothesis: "only tier 50
is valid" was disproven when tier 50 itself failed during the outage — a reminder to always
run a control case before recording a constraint as truth.

---

## Throwaway artifacts (not part of the product)

- scripts/probe/* : Phase 0 probes. Scrappy by design. Superseded by src/lib/cleanverse in Phase 1.
- Throwaway freeze-test identity 0x820350D47277784A26FF4D4cE08C12CAD6F19094 is now frozen and
  cannot be reactivated (F2). Disposable, unused elsewhere, will not be reused.
