# DECISIONS LOG

Every deviation and design decision, dated. Judges may ask; this is the paper trail.

---

## 2026-08-08 — D16: dedicated batch isolation, Phase 3 remains open

The master spec explicitly requires `CertusBatch.sol`; reusing `CertusEscrow.freezeIntent`
would freeze every residual row and cannot represent independent isolation. The dedicated
contract therefore exposes terminal `releaseRow` and `isolateRow` actions. Isolated value
has no exit path, while every other pending row remains independently processable.

Every released row also produces a signed `certus.provenance.v1` EIP-712 artifact. This is
the Certus-signed payroll attestation; the Cleanverse `download_travel_rule` PDF remains the
separate official transaction report when that endpoint is available.

Phase 3 is not declared complete until the live 9-green/1-red run produces nine artifacts.
Cleanverse's current Monad pair inconsistency is recorded as an external blocker, not waived.

---

## 2026-08-08 — D15 supersedes D1: active escrow custodies aUSDC

Cleanverse `query_deposit_address` returned the treasury's institution-routed deposit address.
Sending Circle Faucet Monad USDC there minted 20 aUSDC to the same eligible treasury wallet.
Certus then deployed an aUSDC-configured escrow at
`0x06bde498b5568cfb6fb89409ec2b2261576cc37f` and issued the contract an A-Pass.

Live proof:
- escrow eligibility returned code 4;
- funding the escrow with aUSDC succeeded;
- release to the eligible treasury succeeded in tx
  `0x7058a447ea7fbb192f14b1d6b4a1b0a64e3d195dcd0ab53a60495d0f4c7bea0b`;
- release to `0x00000000000000000000000000000000deadbeef` (no A-Pass) reverted at
  the A-Token layer;
- the blocked 0.1 aUSDC intent was quarantined in tx
  `0xff3c99a488f479ffbf320c04af275d042b023201345e220b61f9f4b5cc1c1d63`.

D1 is retained below as historical reasoning but is no longer the active custody design.

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

## 2026-08-08 — Phase 1 audit remediation

**D8. `Decision` extends the PART IV shape with `checks: CheckResult[]`.** (Audit F1-08.)
PART IV specifies `{ verdict: 'PASS' }` etc. Certus adds the array of all four individual
check outcomes. This is an EXTENSION, never a reduction: the oversight dashboard is required
to show each check with its own reason code (PART V), which is impossible if the verdict
discards them. Logged so the deviation is deliberate and visible.

**D9. Seed determinism is intentionally partial.** (Audit F1-05.)
Intent IDs, leg IDs, the sender, the recipient list, and the historical event set are
byte-identical across runs. `freezeTarget` deliberately differs every run, because freezing
an A-Pass is irreversible in UAT (D6) so each rehearsal must burn a fresh identity.
**Binding on Phase 7:** every demo script and Playwright spec MUST read the freeze target
from `data/seed-manifest.json`. Hardcoding it will pass once and fail every rehearsal after.

**D10. NO RECORD, NO SETTLEMENT.** (Audit F1-01, the critical finding.)
`evaluate()` now guarantees three things: it never throws, a check that throws becomes an
explicit `SYSTEM_ERROR` failure rather than being lost, and if the audit event cannot be
written the verdict is downgraded to `FAIL(AUDIT_WRITE_FAILED)`. The last one is the
important principle: a settlement with no compliance record is the single outcome this
product may never produce, so an unwritable audit trail must block settlement rather than be
logged and ignored. Pinned by `test/unit/evaluate.resilience.test.ts`.

---

## 2026-08-08 — SCOPE DEVIATION: settlement chain Monad -> Base Sepolia

**D11. SUPERSEDED on the same day by D13. Kept for the paper trail, not as guidance.**

> **Two errors in this entry, corrected below.**
> 1. It claims Base is permitted. **It is not.** The announcement lists Ethereum, Arbitrum,
>    Polygon, Avalanche, BNB Chain, Monad. Base is absent. I read the list, then wrote the
>    opposite, and deployed on an ineligible chain.
> 2. The premise "Monad has no obtainable USDC" was also wrong. Monad's origin token is
>    Circle FiatToken, so USDC comes from faucet.circle.com, not the Cleanverse faucet.
>    The Cleanverse faucet being dry was never the binding constraint.
>
> The deeper mistake: moving chain to fix an asset-level problem. aUSDC's institutional
> whitelist blocks third-party minting on EVERY chain, so no chain would have fixed it.
> See D12.

**D11 (original). The demo deploys on Base Sepolia (chainId 84532), not Monad.**

The build spec pinned Monad and asserted "Monad is the chain sponsor". That premise was
wrong. The actual hackathon announcement (Cleanverse Build: Trusted Assets, 48h sprint
Aug 8-9) names **Cleanverse** as host and permits Ethereum, Arbitrum, Polygon, Avalanche,
BNB Chain, **or** Monad. Chain choice therefore carries no sponsor-alignment cost.

Forcing evidence, all verified live:
- Monad USDC faucet reservoir is EMPTY: `ERC20: transfer amount exceeds balance` on the
  source. Not a rate limit, not a parameter error.
- Origin USDC on Monad is Circle FiatToken; `mint()` reverts `caller is not a minter`.
- Base faucet DISPENSED on the first call: tx
  `0xcc76b7ce3f3ff3d6ba6598e462b1d213abb1afb924910e18f3d5b028b4454ca5`,
  block 45210224, and the treasury now holds 1.000000 USDC on chain.
- Cleanverse "base" resolves to **Base Sepolia, chainId 84532** (tx present there, absent on
  Base mainnet 8453).

Why this is the right call rather than the convenient one: the alternative was deploying a
second mock token, which would have broken the single-mock rule (D4) AND cost two real
claims, settlement landing as a verified aUSDC asset and the bank-presentable travel-rule
PDF. Moving chain preserves both. Base is also visibly Cleanverse's primary sandbox: it
carries dozens of A-Token pairs versus Monad's one.

Base Sepolia parameters (live-verified):
```
chainId  : 84532
RPC      : https://base-sepolia-rpc.publicnode.com  (fallback https://base-sepolia.drpc.org)
           NOTE: https://sepolia.base.org was unreachable from this environment
explorer : https://sepolia.basescan.org
origin   : usdc  0x543b96420d072BF587B63C41C0B0922762E986Ce (6 dp)
atoken   : ausdc 0xaC0893567D43C3E7e6e35a72803df05416C1f20D (6 dp)
accesscore: 0x8F118338a1fa41E7Fa86Be19A4e8B99Ed58A6EcC
apass reg : 0xbA82D189540CaC9DC6FF46B6837CaC1BFdEC58B9
```

**Migration cost, accepted:** A-Passes are registered per (chain, address), so the identity
pool and seed identities must be re-minted on `base`. `generate_apass` works, so this is
mechanical. The Monad work is not wasted: every pipeline fact (verify codes, the
APassNotActive freeze signal, rules shape, AES, concurrency behaviour) is chain-independent
and already proven.

**Open blocker:** the treasury holds 0 native ETH on Base Sepolia, so nothing can deploy
yet. Base Sepolia gas requires a browser faucet with a captcha, which the agent must not
attempt. The user funds it.

---

## Throwaway artifacts (not part of the product)

- scripts/probe/* : Phase 0 probes. Scrappy by design. Superseded by src/lib/cleanverse in Phase 1.
- Throwaway freeze-test identity 0x820350D47277784A26FF4D4cE08C12CAD6F19094 is now frozen and
  cannot be reactivated (F2). Disposable, unused elsewhere, will not be reused.

---

## 2026-08-08 — D12: Certus issues its own A-Token (cvUSD)

**Problem.** aUSDC carries an institutional deposit whitelist that third parties cannot join
(confirmed by Cleanverse support). Circle's faucet is whitelisted; our escrow never can be.
So no contract we write can cause aUSDC to be minted, and "settlement lands as a verified
asset" was unprovable with aUSDC. Testing on two chains produced identical behaviour, which
is what showed the constraint is the ASSET, not the chain. Hopping chains was the wrong
diagnosis and cost time.

**Decision.** Certus issues and governs its own A-Token: **cvUSD**,
`0x5e7Ca7ec42A11B4F5259fc429AcD32dFFf83796D` on Monad, 6dp, admin = our treasury,
rule `min_tier: 5`. Issued via POST /atoken/launch, confirmed ISSUED in seconds.

**Why this is better than a workaround.** It is strictly stronger than borrowing aUSDC: the
product claim becomes "Certus defines the compliance rules on its own verified asset and
enforces them on every settlement", instead of depending on an asset whose rules and whitelist
belong to someone else. Verified live: an active identity returns 4, a frozen identity returns
APassNotActive, an unverified address returns 2, and the rules read back as ours.

**Not yet proven, so not yet claimed.** How holders actually receive cvUSD.
`add_whitelist_for_institutional` requires `address_list`, and no mint/distribute path is
confirmed. Until it is, escrow releases settle in the origin token and we say "settlement to
verified counterparties", not "settlement in verified assets".

---

## 2026-08-08 — D13: multi-chain by construction, settling on Monad

**Supersedes D11.** Certus is multi-chain, so chain is a per-intent property, not a global
mode. The earlier single-chain singleton in .env is what forced the build to be flipped
between chains one at a time, which was churn and produced a deployment on an ineligible one.

**Registry.** `config/chains.json` holds every chain, checked in because none of it is secret
and a fresh clone should not rediscover it. `hackathonEligible` is explicit, and
`assertEligible()` throws before any deploy, so the Base mistake cannot repeat silently.

Eligible AND supported by Cleanverse (the real target set):
| chain | chainId (live-verified) | status |
|---|---|---|
| monad | 10143 | **primary.** Funded (20 USDC + 5 MON), escrow deployed, cvUSD issued |
| polygon | 80002 | second Circle-faucet chain, natural cross-chain pair. Not funded |
| bsc | 97 | usable but **18 decimals and a different aToken**. Not funded |
| ethereum | 11155111 | which network Cleanverse means is UNCONFIRMED. Sepolia gas is scarce |

Eligible but unusable: Arbitrum, Avalanche return NO A-Token pairs.
Usable but ineligible: Base. Retained as a test chain only; the submission must not rely on it.

**Deployments.** CertusEscrow is live on both monad and base at
`0xb327709Ec4f0830722776746b1da42F98d51868e` (same deployer + nonce gives the same CREATE
address). Recorded per chain in `deployments/<chain>.json`.

**Scope honesty on "cross-chain".** Certus does NOT bridge value and will not pretend to.
Its cross-chain contribution is the dual-registry check: an A-Pass is scoped to
(chain, address), so a counterparty verified on one chain is NOT thereby verified on another,
and a payment spanning chains must satisfy both registries. That is a compliance claim we can
actually implement and defend. Building a bridge is out of scope for 48 hours.

---

## 2026-08-08 — D14: CORRECTION. Un-freeze works. D6/F2 were wrong, and it was our bug.

**What we claimed:** `update_status status=1` returns `[500] System Error`, so a frozen
A-Pass is unrecoverable in UAT. Recorded as D6/F2, reported to the user, and offered to
Cleanverse as a bug report.

**What is actually true:** the API reference specifies `status` as a **STRING** ("1"
activate, "2" freeze). We sent the integer `1`. The API tolerates the integer `2` for freeze,
which is why freezing always worked and hid the type error. Sending `"1"` reactivates
correctly: txHash `0xf31673e2…8dfc`, and the identity frozen since Phase 0
(`0x820350D4…9094`) went straight back to `verify_apass` code 4.

**Why this matters more than a type fix.** A wrong reading of one failure propagated into
three design decisions:
- D6 declared quarantine terminal and told us never to imply an un-freeze path exists.
- F2 made every seed mint a fresh freeze-target.
- D7 built the pre-minted identity pool partly around that assumption.

None of that was necessary. The lesson is specific: when an API returns a 500 rather than a
validation error, suspect our own request shape before concluding the service is broken. We
never checked the documented type of the one field we were changing.

**Corrections now in force:**
- `freezeIdentity` and `reactivateIdentity` both send `status` as a string.
- Quarantine is NOT terminal. Funds can be released after reactivation and compliance review,
  which is a materially better demo: freeze, review, release.
- Freeze-target identities are REUSABLE. The pool still has value (it removes a live write
  from the rehearsal path) but it is no longer burn-per-run.
- The bug report to Cleanverse about un-freeze should be retracted. It was our error.

## D14 — Phase 5 live exit verification deferred by Cleanverse outage (2026-08-08)

Phase 5 recurring and payment-link implementation is locally complete and fail-closed. The
Auditor reran the live revocation case with `.env` loaded, but Cleanverse returned an
unavailable eligibility result, so the sandbox assertion could not reproduce the previously
confirmed revocation signal. No fallback or cached eligibility was introduced. Before the
demo, rerun the live `SUBSCRIPTION_EPOCH` scenario and record a halted subscription. Until
then Phase 5 carries explicit external verification debt.

## D15 — Phase 6 live dashboard audit debt (2026-08-08)

The SSE endpoint was confirmed streaming 500ms heartbeats and the JSON compatibility snapshot
returns current events. The production build and PDF export pass. The Codex in-app browser
rendered the new server state but did not hydrate any client component, including the
pre-existing theme toggle, so an actual click-to-freeze and sub-two-second visual transition
could not be certified in that browser. Carry this into the Phase 7 Playwright rehearsal on a
fresh browser runtime; do not claim the two-second exit until it passes there.
