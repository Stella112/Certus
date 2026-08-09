# AUDIT LOG

Appended after every phase. Format per PART VII.

---

## PHASE 6 AUDIT: 2026-08-08T22:46:00+01:00

### 1. Spec compliance
| Requirement (quoted from spec) | Implemented? | File:line | Evidence |
|---|---|---|---|
| Operator console with live pre-flight panel | YES | `src/app/dashboard/page.tsx` | Four fresh-check indicators and real DB statistics render. |
| Oversight dashboard with SSE stream, lineage graph, freeze controls | YES | `src/app/components/LiveOversight.tsx`; `src/app/api/events/stream/route.ts`; `src/app/api/freeze/route.ts` | SSE emits 500ms heartbeats; lineage and active-counterparty control render from DB. |
| Point-in-time report export (PDF) | YES | `src/lib/audit/pdf.ts`; `src/app/api/audit/export/route.ts` | Route produced a 9,338-byte PDF; five rendered pages visually inspected. |
| Freeze reflected within 2 seconds without refresh | PARTIAL | browser audit | Endpoint cadence is 500ms, but the in-app browser did not hydrate any client component. |

### 2. Execution proof
```text
$ npm.cmd run typecheck
> tsc --noEmit
[exit 0]

$ npm.cmd test -- --run test/unit
Test Files  10 passed (10)
Tests       46 passed (46)

$ npm.cmd run build
✓ Compiled successfully
✓ Generating static pages (10/10)
/api/audit/export, /api/events/stream, /api/freeze emitted

$ curl.exe -N --max-time 3 http://localhost:3000/api/events/stream?chain=monad
retry: 500
: heartbeat 1786224956414

$ Invoke-WebRequest http://localhost:3000/api/audit/export?chain=monad
certus-audit-monad-route.pdf: 9338 bytes
```

### 3. Hallucination sweep
- [x] Every Cleanverse call traced to an API-TRUTH.md section
- [x] Zero invented endpoints, params, or response fields
- [x] Every `VERIFIED: ASSUMED` adapter listed below
Assumed adapters: NONE. Freeze uses the existing verified `freezeIdentity` adapter.

### 4. Pipeline integrity
- [x] `grep` for settlement paths bypassing `evaluate()` → freeze route changes credential status, then invokes the existing watcher cascade; it does not release value.
- [x] All four checks actually execute (not short-circuited)
- [x] Audit events written for every evaluation

### 5. Money safety
- [x] No float arithmetic on amounts (grep result: none in Phase 6)
- [x] Decimals handled per token

### 6. Findings
| Severity | Finding | Location | Fix required before next phase? |
|---|---|---|---|
| HIGH (FIXED) | PDFKit failed when bundled by Next.js, causing export HTTP 500. | `next.config.mjs` | YES; fixed by server externalization. |
| LOW (FIXED) | PDF footer created a blank sixth page. | `src/lib/audit/pdf.ts` | YES; fixed and visually re-rendered. |
| MEDIUM | In-app browser rendered server state but did not hydrate client controls, including existing controls. | browser runtime | NO for Phase 7; YES before final rehearsal. |

### 7. Line-by-line review
Files read in full this phase: dashboard overview and audit pages, `LiveOversight.tsx`, SSE,
freeze and PDF routes, PDF builder, revocation watcher, dashboard primitives and navigation.
Specific concerns by line: no open code finding; browser-runtime debt recorded above.

### 8. VERDICT: PASS WITH DEBT
Debt carried forward: Phase 7 Playwright must perform a real freeze in a freshly hydrated
browser and assert the FREEZE event appears within 2 seconds without reload.

---

## PHASE 5 AUDIT: 2026-08-08T22:18:31.1309867+01:00

### 1. Spec compliance

| Requirement (quoted from spec) | Implemented? | File:line | Evidence |
|---|---|---|---|
| Subscription schedule with epoch boundary re-evaluation | YES | `src/lib/settlement/recurring.ts:34,63` | Due-only processor calls `evaluate()` with `SUBSCRIPTION_EPOCH` before settlement. |
| Payment link generation + inline CVI check on open, unverified → attestation flow | YES | `src/lib/settlement/payment-links.ts:18,55`; `src/app/api/links/[slug]/attest/route.ts:22-27` | Open is fail-closed; `NO_CVI` exposes an active-link-bound A-Pass flow. |
| QR encoding | YES | `src/lib/settlement/payment-links.ts:40` | `qrcode` produces an SVG at the canonical payment URL. |
| Subscription halts at next epoch after revocation | YES (LOCAL), LIVE DEBT | `src/lib/settlement/recurring.ts:82`; `test/unit/recurring-subscription.test.ts` | Regression proves halt executes and settlement never runs. Live sandbox was unavailable during audit. |

### 2. Execution proof

Commands run and their real output:

```text
$ npm.cmd run typecheck
> tsc --noEmit
[exit 0]

$ npm.cmd test -- --run test/unit
Test Files  10 passed (10)
Tests       46 passed (46)

$ npm.cmd run build
✓ Compiled successfully
✓ Generating static pages (10/10)
/api/links, /api/links/[slug]/attest, /open, /qr,
/api/subscriptions, /api/subscriptions/run, and /pay/[slug] emitted.

$ node.exe --env-file=.env node_modules/vitest/vitest.mjs run test/integration/evaluate.live.test.ts -t "CASE 3" --reporter=verbose
Expected: "FREEZE"
Received: "FAIL"
Test Files  1 failed (1)
Tests       1 failed | 6 skipped (7)
```

The live failure was fail-closed `CVI_UNAVAILABLE`; no value moved and no cached success was
used. This is external verification debt, not a passing live exit run.

### 3. Hallucination sweep

- [x] Every Cleanverse call traced to an API-TRUTH.md section
- [x] Zero invented endpoints, params, or response fields
- [x] Every `VERIFIED: ASSUMED` adapter listed below

Assumed adapters: NONE. Attestation uses the existing sandbox-confirmed `generateIdentity` adapter.

### 4. Pipeline integrity

- [x] `grep` for settlement paths bypassing `evaluate()` → recurring delegates to `releaseMilestone`, which re-evaluates again before signing; payment-link open calls `evaluate()` directly. Contract-only transfer surfaces remain releaser-gated and were justified in earlier audits.
- [x] All four checks actually execute (not short-circuited)
- [x] Audit events written for every evaluation

### 5. Money safety

- [x] No float arithmetic on amounts (grep result: no `parseFloat`, fractional amount literal, or `Number(amount)` in Phase 5 paths)
- [x] Decimals handled per token; Phase 5 persists decimal base-unit strings and converts only with `BigInt`

Subscription registration additionally reads the on-chain escrow and rejects missing,
inactive, already-released, or total-mismatched positions before creating an active schedule.

### 6. Findings

| Severity | Finding | Location | Fix required before next phase? |
|---|---|---|---|
| HIGH (FIXED) | Initial route created an active but unfunded recurring intent. | `src/app/api/subscriptions/route.ts` | YES, fixed with live on-chain registration checks. |
| HIGH (FIXED) | Initial attestation route was not bound to its payment link. | `src/app/api/links/[slug]/attest/route.ts` | YES, fixed; chain now derives from active stored link. |
| MEDIUM | Cleanverse sandbox unavailable prevented the required live subscription-revocation exit rehearsal. | external UAT | NO for Phase 6 implementation; YES before final demo rehearsal. |

### 7. Line-by-line review

Files read in full this phase: `prisma/schema.prisma`, migration SQL,
`src/lib/settlement/recurring.ts`, `src/lib/settlement/payment-links.ts`, all Phase 5 route
handlers, `/pay/[slug]` page and client, both Phase 5 unit suites, shared dashboard layout.

Specific concerns by line: none open in code. Live exit debt recorded above and in DECISIONS.md.

### 8. VERDICT: PASS WITH DEBT

Debt carried forward: rerun a real Cleanverse revocation at a due `SUBSCRIPTION_EPOCH` and
capture the resulting `HALTED` subscription before Phase 7/demo rehearsal.

---

## PHASE 0 AUDIT: 2026-08-08T01:40Z

Auditor read from disk, did not rely on Builder's narration. All verification calls
below were re-run independently by the Auditor, not copied from the Builder's session.

### 1. Spec compliance

| Requirement (quoted from spec / Phase 0 plan) | Implemented? | File:line | Evidence |
|---|---|---|---|
| AC-0.1 `.env` loads, non-empty API_ID/API_KEY, never printed | YES | `.env`, presence-check script | awk check printed name/len only: API_ID len=23, API_KEY len=44 (32-byte AES key), no quotes/spaces |
| AC-0.2 AES round-trip proven before dependence | YES | `scripts/probe/aes.mjs:24-36` | Local round-trip PASS; **server-side proof**: encrypted `generate_apass` returned business response, not 403 |
| AC-0.3 real `query_apass` response pasted | YES | `docs/API-TRUTH.md:59-66` | Full dump `scripts/probe/out/query_apass_address.json` (257 B) |
| AC-0.4 `verify_apass` code space confirmed vs PART XI | YES, **with correction** | `docs/API-TRUTH.md:68-97` | code 4 & 2 confirmed by Builder; **code 1 confirmed by Auditor** this pass; code 3 see F-06 |
| AC-0.5 escrow-custody probe, evidence pasted | PARTIAL | `docs/API-TRUTH.md:155-163` | Inferential, not a live transfer test. See finding F-05 |
| AC-0.6 freeze cycle 4→3→4, **restore confirmed before declaring done** | **NO** (freeze half YES, restore NO) | `scripts/probe/06,07` | Freeze proven on-chain (txHash `0xd85e…82f4`); restore returned `[500] System Error` × 6. See F-01 |
| AC-0.7 `atoken/rules` pasted | YES | `docs/API-TRUTH.md:142-151` | `min_tier:5`, no country/group/blacklist; origin USDC rules `[]` |
| AC-0.8 Monad values from official docs, surfaced for confirmation | YES, **upgraded** | `docs/API-TRUTH.md:167-177` | Doc-sourced AND live-verified by Auditor: `cast chain-id` → `10143` |
| AC-0.9 `DECISIONS.md` seeded with 4 locked decisions | YES | `docs/DECISIONS.md:7-33` | D1–D5 present, dated 2026-08-08 |
| AC-0.10 OPEN QUESTIONS listed | YES | `docs/API-TRUTH.md:194-202` | 3 questions, incl. the reactivation failure |
| PART IV: record revocation mechanism (push vs poll) in API-TRUTH.md | **NO** | — | Not stated anywhere. See F-04 |
| PART VIII r5: commit after every phase | **NO** | — | Not a git repository. See F-02 |
| Phase 0 plan: fund deployer + demo wallets early | **NO** | — | Deployer balance = 0 wei. See F-03 |

### 2. Execution proof

Commands run by the Auditor and their real output:

```
$ ls scripts/probe/out/
atoken_list_monad.json  atoken_rules_ausdc.json  generate_apass_try.json
origin_rules.json  query_apass_address.json  query_apass_single.json
verify_apass_active.json  verify_no_apass.json
```

```
$ git rev-parse --is-inside-work-tree
fatal: not a git repository (or any of the parent directories): .git
```

```
$ cast chain-id --rpc-url https://testnet-rpc.monad.xyz
10143
```

```
$ cast balance 0xdC646c197d0202FC2A0326af8ab55066A3549E2E --rpc-url https://testnet-rpc.monad.xyz
0
```

Auditor's independent API probe — verify_apass with a bogus A-Token (confirms code 1,
previously DOC-ONLY):
```
$ node --env-file=.env scripts/probe/09-audit-verify.mjs
{"code":"0000","message":"ok","data":{"chain":"monad","atoken":"0x1111111111111111111111111111111111111111","address":"0x2e2BA14F6784B72fE9874b41811193B5B0bdd0cA","code":1,"message":"atoken not exist","magickLink":"https://test-magiclink.cleanverse.com/"}}
```

Auditor probe — attempt to register an already-expired A-Pass (rejected by API):
```
{"code":"0002","message":"[CV_504]The 'expirationTime' time has expired","data":"{}"}
```

### 3. Hallucination sweep

- [x] Every Cleanverse claim in API-TRUTH.md traced to a pasted response or an explicit
      DOC-ONLY label. Cross-checked each CONFIRMED claim against `scripts/probe/out/*.json`.
- [x] Zero invented endpoints, parameters, or response fields. Every field name in the doc
      was derived from an observed error message or an observed success body. Notably the
      Builder did NOT guess field names: it probed empty bodies and read the API's own
      validation errors (`address` not `walletAddress`; `atoken_address` not `atoken`).
- [x] The one place the spec itself was wrong (PART XI's `data.code == 3` freeze signal) was
      caught and corrected in favour of observed behaviour. This is the contract working.
- Adapters above `DOC-ONLY` not yet sandbox-confirmed: `download_travel_rule`, `query_txs`,
  `query_institution_txs`, `faucet`. All correctly labelled DOC-ONLY; none is relied on yet.
- Assumed adapters (`VERIFIED: ASSUMED`): NONE.

### 4. Pipeline integrity

N/A this phase — `evaluate()` does not exist yet (correctly; it is Phase 1). No settlement
paths exist. Grep for settlement bypass deferred to Phase 1 audit.

Forward-looking note the Phase 1 Builder must honour: the eligibility rule established here
is an **allowlist** — eligible IFF `data.code === 4`. Every other outcome (1, 2, an
unreachable 3, `APassNotActive`, a transport failure) is not-eligible. This is fail-closed by
construction and is the correct shape.

### 5. Money safety

N/A this phase — no amount handling exists. No `parseFloat`/`Number(` on amounts anywhere
(no such code yet). Noted for Phase 1: aUSDC/USDC are **6 decimals** on Monad, not 18.
Recorded in API-TRUTH.md:135-136.

### 6. Findings

| Severity | Finding | Location | Fix required before next phase? |
|---|---|---|---|
| HIGH | **F-01. AC-0.6 not met as written.** User instruction was explicit: "Confirm the restore succeeded before declaring AC-0.6 done." `update_status status=1` fails with `[500] System Error` reproducibly (6 attempts, 2 body shapes). The *freeze* half is fully proven and Moment B is safe, but the AC cannot be honestly marked met. Root cause is a sandbox limitation, not Builder error; the `finally` block was correctly implemented and did run — the endpoint itself failed. | `scripts/probe/06,07` | NO for Phase 1 (Moment B unaffected), but must be **user-accepted as a deviation** and surfaced to Cleanverse. Seed script MUST mint a fresh freeze-target per reset (already captured as DECISIONS F2). |
| HIGH | **F-02. Not a git repository.** PART VIII rule 5 (commit per phase) is unfulfillable, and `.gitignore` is inert — `.env` holds a real API key and a real private key with **no protection**. | repo root | **YES** |
| HIGH | **F-03. Deployer unfunded (0 wei).** Phase 0 plan required funding early precisely because faucets rate-limit ~24h. Phase 2 deploy, redeploys, seeding, and 3 rehearsals all need gas. Starting this at Phase 2 risks a 24h lockout at the worst moment. | `0xdC64…9E2E` | **YES — start immediately** |
| MEDIUM | **F-04. Revocation detection mechanism not recorded.** PART IV's DATA SOURCES table requires API-TRUTH.md to state push vs poll. No webhook for A-Pass status was found in the docs surface used; the observed mechanism is poll-by-re-verify. Must be stated explicitly with the interval. | `docs/API-TRUTH.md` | YES (one-line doc fix) |
| MEDIUM | **F-05. Custody conclusion is inferential.** Builder proved a no-A-Pass address returns code 2 and *inferred* a bare escrow contract cannot custody aUSDC. No contract was deployed and no aUSDC transfer was attempted. The inference is sound (the gate is address-eligibility, and a contract address has no A-Pass) and design (c) sidesteps it by custodying ungated origin USDC — so risk is contained, not eliminated. | `docs/API-TRUTH.md:155-163` | NO — but Phase 2 must **directly** verify (i) CertusEscrow holds origin USDC, (ii) aUSDC reaches a verified recipient on release. Label the claim as inference until then. |
| ~~MEDIUM~~ **RESOLVED** | **F-06. `data.code == 3` is unreachable in this sandbox.** Three routes tested, all closed: frozen ⇒ `APassNotActive`; already-expired registration ⇒ `[CV_504]The 'expirationTime' time has expired`; short-expiry (150s) registration ⇒ `[CV_500]CV System error` (identity never created, confirmed by follow-up verify returning code 2 "apass not exist"). **Product impact: none.** The allowlist rule (eligible IFF 4) is safe regardless, and the spec's own reason code `CVI_REVOKED_OR_EXPIRED` already merges both cases, so no fidelity is lost. Phase 1 may freeze the enum without a distinct EXPIRED code. | `scripts/probe/09,10` | NO — closed |
| LOW | F-07. Pasted responses in API-TRUTH.md truncate long hashes (`0x8e3e…5f4e`). Spec says paste actual output. Full untruncated dumps do exist in `scripts/probe/out/*.json`, so evidence is intact; readability tradeoff accepted, cross-reference added. | `docs/API-TRUTH.md` | NO |
| LOW | F-08. `.gitignore` references `!.env.example` but no `.env.example` exists. Harmless, but a fresh clone has no template. | `.gitignore:4` | NO |

No CRITICAL findings. Specifically checked for and did not find: fabricated API usage,
settlement bypassing `evaluate()`, float money handling, or a broken demo moment.

### 7. Line-by-line review

Files read in full this phase: `docs/API-TRUTH.md`, `docs/DECISIONS.md`,
`scripts/probe/aes.mjs`, `scripts/probe/call.mjs`, `.gitignore`, `.env` (presence/shape only,
values never read into the transcript).

Specific concerns by line:
- `scripts/probe/aes.mjs:17-22` — `algoFor()` selects the cipher from key length. Correct and
  defensive, but the production adapter should **pin** `aes-256-cbc` and hard-fail on any
  other length, rather than silently accepting a 16/24-byte key. Carry to Phase 1.
- `scripts/probe/aes.mjs:9` — fixed zero IV is correct per PART XI. It is cryptographically
  weak in general; it is Cleanverse's specification, not our choice. Note it in the adapter
  header comment so no future reader "fixes" it into a random IV and breaks every call.
- `scripts/probe/call.mjs` — no timeout on `fetch`. A hung Cleanverse call would hang the
  pipeline. Production adapter needs an AbortController timeout + fail-closed. Phase 1.
- `docs/API-TRUTH.md:76` — code-1 row was labelled `(PART XI)` i.e. unconfirmed while sitting
  in a CONFIRMED section. Auditor has now confirmed it live; doc to be updated.
- `docs/API-TRUTH.md:107-108` — `depositUSDCWallet` is noted as "relevant to the release path"
  but its exact role is not yet verified. Do not build on it until Phase 2 tests it.

### 8. VERDICT: PASS WITH DEBT

Phase 0's purpose was to replace assumption with evidence, and it did: every load-bearing
Cleanverse fact is now backed by a real response, the one place the spec was wrong was caught
and corrected, and the two riskiest unknowns (freeze detection, escrow custody) are resolved
well enough to design against. That is a genuine pass.

It is not a clean pass. Three operational gaps (F-01 acceptance, F-02 git, F-03 funding) and
one doc gap (F-04) are carried as debt, two of them blocking.

**Debt carried forward:**
1. F-02 — `git init` + first commit `Phase 0: truth`. **Blocking Phase 1.**
2. F-03 — fund deployer + demo wallets via faucet, deliberately and once. **Blocking Phase 2,
   must be started now given ~24h rate limits.**
3. F-04 — record revocation mechanism (poll, 5s, fail-closed) in API-TRUTH.md. Blocking Phase 1.
4. F-01 — user acceptance of the reactivation deviation; raise with Cleanverse.
5. F-05 — Phase 2 must directly verify escrow custody rather than inheriting the inference.
6. F-06 — close the code-3 question before freezing the reason-code enum in Phase 1.
7. F-07/F-08 — cosmetic, no phase gate.

Phase 1 may begin once items 1 and 3 are cleared and item 2 is in flight.

---

## PHASE 1 AUDIT: 2026-08-08T02:55Z

Auditor read the files from disk and re-ran every verification independently. One claim in
the Builder's own commit message was tested directly and found to be false.

### 1. Spec compliance

| Requirement (quoted from spec / Phase 1 plan) | Implemented? | File:line | Evidence |
|---|---|---|---|
| AC-1.1 Scaffold builds and migrates | YES | `package.json`, `prisma/migrations/` | `next build` succeeded (4 routes); `prisma migrate dev` applied `20260808011634_phase1_spine`. `npm run dev` NOT separately exercised; build success taken as stronger evidence |
| AC-1.2 Data model migrated, AuditEvent append-only | PARTIAL | `prisma/schema.prisma` | Schema correct; grep confirms zero `auditEvent.update/delete/upsert` in `src/`. **But the required TEST does not exist.** See F1-03 |
| AC-1.3 Cleanverse calls only in the adapter boundary, PART II headers | YES | `src/lib/cleanverse/*` | Boundary grep clean (only comment hits). Headers: cvi 5/5, cva 2/2, client 1/1. aes 1 module header for 3 exports, see F1-07 |
| AC-1.4 AES pinned to aes-256-cbc, hard-fail on wrong length | YES | `src/lib/cleanverse/aes.ts:22-42` | Throws on non-32-byte key with an actionable message |
| AC-1.5 Transport fail-closed with timeout | PARTIAL | `src/lib/cleanverse/client.ts:85-137` | Timeouts/network/http/parse all map to `unavailable`. **But throws bypass it entirely.** See F1-01 |
| AC-1.6 `evaluate()` single chokepoint, Decision shape | YES, extended | `src/lib/pipeline/evaluate.ts:200` | Shape matches PART IV plus a `checks[]` array. Undocumented deviation, see F1-08 |
| AC-1.7 Audit event written inside `evaluate()` | **NO, claim falsified** | `src/lib/pipeline/evaluate.ts:229` | Holds on the happy path and on returned failures. Does NOT hold when anything throws. See F1-01 |
| AC-1.8 Closed reason-code enum, no free text | YES | `src/lib/pipeline/reasonCodes.ts` | 13 codes, all mapped; no Cleanverse message reaches a verdict |
| AC-1.9 Unit tests plus 5 or more live cases | YES | `test/` | Auditor ran the suite: 25 passed (18 unit, 7 live). Live cases include FREEZE and ISOLATE |
| AC-1.10 Seed + reset, fresh freeze target, deterministic | PARTIAL | `scripts/seed.ts` | IDs/recipients/sender identical across two runs; freezeTarget differs by design. See F1-05. Also F1-04 |
| PART IV: "Validation: zod on every boundary" | **NO** | n/a | zod is a dependency but is never imported anywhere. See F1-02 |
| PART VIII r1: no TODO/stub in demo paths | YES | n/a | grep clean |
| PART VIII r8: no em-dashes in user-facing copy | YES | n/a | 3 hits, all in code comments, none in `ReasonText` or UI strings |

### 2. Execution proof

```
$ npx vitest run
 Test Files  2 passed (2)
      Tests  25 passed (25)

$ npx tsc --noEmit
(clean)

$ npx tsx scripts/probe/15-audit-resilience.ts
AUDIT PROBE: does evaluate() fail closed when an adapter THROWS?
  A. identity adapter throws (simulates bad AES key / missing env)
    -> THREW: CLEANVERSE_API_KEY must Base64-decode to exactly 32 bytes  auditEventsWritten=0
       *** no verdict, no compliance record ***
  B. asset-rules adapter throws
    -> THREW: boom  auditEventsWritten=0
  C. policy check throws (simulates database unavailable)
    -> THREW: SQLITE_CANTOPEN: unable to open database file  auditEventsWritten=0
  D. audit writer itself throws (database down at record time)
    -> THREW: SQLITE_CANTOPEN  auditEventsWritten=0
  E. healthy
    -> returned verdict=PASS  auditEventsWritten=1
```

Seed determinism, two consecutive runs (substantive fields only):

```
intent ids  : intent-milestone-001, intent-recurring-001   (identical)
leg ids     : leg-ms-1..3, leg-rec-1..2                    (identical)
sender      : 0x...00bb                                    (identical)
recipients  : 10 addresses                                 (identical)
freezeTarget: 0x9Ca6...2801  vs  0xA7D8...04f5             (DIFFERS)
audit events: 20                                           (identical)
```

### 3. Hallucination sweep

- [x] Every adapter traced to an API-TRUTH.md section.
- [x] Zero invented endpoints, params, or fields. All 12 `VERIFIED:` tags read `SANDBOX`.
- [x] Assumed adapters: NONE. Doc-only adapters (`download_travel_rule`, `query_txs`,
      `faucet`) were correctly NOT implemented rather than written speculatively.
- [x] The Builder corrected its own earlier false claim about short expirations rather than
      leaving it standing. Verified present in API-TRUTH.md.

### 4. Pipeline integrity

- [x] Settlement-bypass grep: no settlement paths exist yet (no contracts). All grep hits are
      the semaphore's `releaseSlot`, comments, or reason-code strings. Correct for Phase 1.
- [x] All four checks execute with no short-circuit: verified by a test that fails the first
      check and asserts `getAssetRules` and `checkPolicy` were still called.
- [x] Verdict x trigger matrix covered by 6 explicit unit cases plus 2 live cases.
- [ ] **Audit events written for every evaluation: FALSE under exceptions.** F1-01.

### 5. Money safety

- [x] No `parseFloat`, no `Number()` on amounts, no float arithmetic. Grep clean.
- [x] Amounts are `bigint` in memory, decimal strings in the DB, and serialised via a
      bigint-aware replacer so they cannot silently become floats.
- [x] 6-decimal handling correct in `policies.ts` and `MONAD_ASSETS`.

### 6. Findings

| Severity | Finding | Location | Fix required before next phase? |
|---|---|---|---|
| CRITICAL | **F1-01. `evaluate()` is not exception-safe, falsifying its central claim.** The commit message and the function's own doc state it is "structurally impossible to evaluate without leaving a compliance record" and "fail-closed throughout". Both are false when an adapter throws rather than returning `unavailable`. Proven empirically for four realistic causes: bad AES key (`encryptBody` runs BEFORE the try block at `client.ts:90`), any adapter throw, database unavailable during the policy check, and the audit writer itself failing. All four produce zero audit events and no verdict. Consequence for the demo: a Cleanverse hiccup during Moment B crashes the flow instead of showing a held, recorded state, which is precisely the behaviour the product claims to prevent. | `evaluate.ts` (no try/catch), `client.ts:90` | **YES** |
| HIGH | **F1-02. zod is never used.** PART IV mandates "zod on every boundary". It is installed and never imported. Cleanverse responses are cast with `as T` and trusted structurally; a shape change would surface as `undefined` deep in the pipeline rather than as a clean boundary rejection. | `src/lib/cleanverse/*` | YES |
| MEDIUM | **F1-03. The append-only test required by AC-1.2 does not exist.** Append-only is currently enforced by convention plus an Auditor grep, not by a committed regression test. Nothing stops a future phase adding a mutation. | `test/` | YES (cheap) |
| MEDIUM | **F1-04. Seed makes the sender its own recipient.** `sender = verified[0]` and that same address remains in `cleanRecipients`, so the batch demo would show a payment from an address to itself. Cosmetically wrong on a projector and analytically wrong for the budget check. | `scripts/seed.ts` | YES (cheap) |
| MEDIUM | **F1-05. Seed determinism is partial.** All IDs, the sender, and the recipient list are byte-identical across runs, but `freezeTarget` necessarily differs because each run consumes a pool identity (freezing is irreversible). This is a justified deviation from AC-1.10, not a defect, but it is currently undocumented, and any demo script or Playwright spec MUST read the target from `data/seed-manifest.json` and never hardcode it. | `scripts/seed.ts` | Document now; binding on Phase 7 |
| LOW | F1-06. The concurrency slot is released when `fetch` resolves, but the response body is read afterwards, so in-flight work is slightly under-counted and real concurrency can exceed the limit. Harmless at current volumes; worth tightening before the 10-recipient batch. | `client.ts:113-127` | NO |
| LOW | F1-07. `aes.ts` carries one module-level PART II header for three exports. The header genuinely covers the whole encryption layer, so this is a documentation nit, not a traceability gap. | `aes.ts` | NO |
| LOW | F1-08. The `Decision` type extends PART IV's shape with `checks: CheckResult[]`. The addition is necessary (the dashboard must show all four outcomes individually) and is an extension rather than a reduction, but it is an undocumented deviation. | `pipeline/types.ts` | Log in DECISIONS.md |

### 7. Line-by-line review

Files read in full: `client.ts`, `evaluate.ts`, `aes.ts`, `cvi.ts`, `cva.ts`, `policy.ts`,
`policies.ts`, `reasonCodes.ts`, `types.ts`, `record.ts`, `seed.ts`, `schema.prisma`,
both test files.

- `client.ts:90` — `encryptBody()` sits outside the try block. This is the concrete origin of
  F1-01 for the AES case. Moving it inside the try would convert a crash into a clean
  `unavailable`, which is the correct shape.
- `client.ts:61-77` — the semaphore arithmetic is correct: on release with a waiter, the
  decrement and the waiter's increment cancel, so `active` never drifts. Verified by reading,
  and indirectly by 25 tests passing under real concurrency.
- `evaluate.ts:212-218` — `Promise.all` means one rejecting adapter discards the results of
  the other three. Even after F1-01 is fixed, prefer `Promise.allSettled` so a single failing
  check still yields three real outcomes for the dashboard rather than four unknowns.
- `policy.ts:22` — `BigInt(l.amount)` on a DB string is correct and float-free. Note it throws
  on a malformed string, which is another F1-01 path.
- `seed.ts` — deleting rows here is legitimate (an operator reset between rehearsals) and is
  correctly distinguished from the running system's append-only guarantee.

### 8. VERDICT: FAIL

The engineering quality is high and the two demo moments are genuinely proven against the
live sandbox, which is the hard part and it is done. The verdict is FAIL for one reason: the
Builder asserted a specific safety property in writing, that property is the product's central
claim, and testing it directly showed it does not hold. A compliance product whose audit trail
disappears exactly when its dependencies fail is unsound, and shipping it on the strength of an
unverified claim is the failure mode this whole protocol exists to catch.

This is a narrow, well-understood defect with an obvious fix, not a design problem.

**Blocking before Phase 2:** F1-01, F1-02, F1-03, F1-04.

**Document now:** F1-05, F1-08.

**Carried debt:** about 5s per evaluation against the 2s UI target (Phase 6 needs per-check
spinners and progressive row rendering); F1-05 binds Phase 7; escrow custody remains an
inference until Phase 2 proves it with a real transfer (Phase 0 F-05); the freeze-target pool
is down to 3 after this audit consumed 2, so top up before rehearsals.
# PHASE 3 IMPLEMENTATION AUDIT — 2026-08-08

## Scope

Dedicated batch isolation contract, per-row settlement service, signed provenance artifacts,
API/UI integration, and the one-command Moment A runner.

## Execution proof

- Foundry: 17/17 pass, including `test_momentA_nineSettleOneIsolatesAndBatchCompletes`.
- Vitest: 33/33 pass, including continuation after an isolated row, chain-failure
  containment, post-settlement projection safety, and EIP-712 signature verification.
- TypeScript: `tsc --noEmit` passes.
- Next production build passes with the batch and provenance routes.
- Cleanverse `download_travel_rule` LIVE-CONFIRMED against release tx
  `0x7058a447ea7fbb192f14b1d6b4a1b0a64e3d195dcd0ab53a60495d0f4c7bea0b`:
  HTTP 200 artifact, `application/pdf`, 2,550 bytes, `%PDF-` signature. UAT returned a
  valid URL with `fileName:null`; the adapter supplies a deterministic fallback filename.

## Safety findings

- PASS: only releasers can release or isolate rows.
- PASS: one row's isolation is terminal and cannot affect later clean rows.
- PASS: quarantined value has no refund, rescue, sweep, or withdrawal path.
- PASS: a chain failure is contained to its row and later rows continue.
- PASS after remediation: a failure after a confirmed transfer halts reconciliation and can
  never reclassify that paid row as isolated.
- PASS: every successful row receives an EIP-712 artifact bound to the batch contract,
  batch id, leg id, sender, recipient, asset, amount, tx hash, audit hash, timestamp, and signer.
- PASS: `preflight:batch` is read-only and blocks deployment when the pinned pair differs
  from Cleanverse's live canonical metadata or the treasury is not eligible. Current result:
  configured `0xaC08…f20D/6dp`, reported `0xfa96…1026/18dp`, `safeToDeploy:false`.
- PASS: `audit:moment-a` is an independent read-only exit checker. It requires exactly ten
  DB rows, nine successful Monad receipts, one isolated row, matching `CertusBatch` totals
  and row states, and nine cryptographically valid provenance artifacts before writing a
  PASS evidence file. It cannot sign or move value.

## Exit-criterion status

**NOT YET MET.** The required live 10-recipient run and nine live attestations cannot execute
while Cleanverse's Monad supported-pair response points to an aUSDC that fails
`verify_apass`. The previous pair still holds real value but now returns `atoken not exist`.
The runner fails closed before funding. This is external debt, not permission to substitute
mock rows or skip the live Auditor run.

## Verdict

**IMPLEMENTATION PASS; PHASE 3 REMAINS OPEN pending live Cleanverse repair and Auditor run.**

---

# PHASE 3 LIVE EXIT AUDIT — 2026-08-08T20:43:17.977Z

## Spec compliance

| Requirement | Implemented? | Evidence |
|---|---|---|
| Ten-recipient verified-asset batch | YES | Intent `moment-a-1786221700534` on Monad |
| Nine eligible rows settle | YES | Nine successful Monad receipts and nine valid provenance signatures |
| One unverified row isolates | YES | Row 5, `NO_CVI`, 10,000 base units quarantined |
| Batch continues after isolation | YES | Rows 6 through 10 released after row 5 isolated |
| On-chain accounting matches database | YES | total 100,000; released 90,000; quarantined 10,000; processed 10 |
| Compliant settlement asset | YES | cvUSD `0x5e7Ca7ec42A11B4F5259fc429AcD32dFFf83796D`; treasury and batch A-Pass checks returned code 4 |

## Execution proof

- Batch contract: `0x840bfce4baebcb59c5b5d3bd8da7f67130fa47de`
- Deployment transaction: `0xb14b67cd0713e2e3eacc0b515b3391861f535e9a3279422e1f5cc28f409e9dc0`
- Funding transaction: `0xcf7bdee5330504dcf54b1b8090e6a6a24eb298a426e1556f312f2027117ada34`
- Independent audit command: `tsx --env-file=.env scripts/audit-moment-a.ts`
- Audit result: `PASS`, findings `[]`
- Provenance verification: 9 of 9 valid

## Findings

None. The earlier external asset blocker was resolved by activating the already-issued standard
cvUSD A-Token, granting documented mint authority, minting controlled testnet supply, and
verifying both treasury and batch custody eligibility through Cleanverse.

## VERDICT: PASS

Phase 3 exit criterion is met. Phase 4 may begin.

---

# PHASE 4 IMPLEMENTATION AUDIT — 2026-08-08

## Scope

Fixed-rate `MockYieldVault`, optional escrow custody integration, accrual ticks, vault-backed
milestone release, and terminal principal-plus-yield quarantine.

## Execution proof

- Foundry: 26/26 pass across all four suites.
- Required freeze assertion: `test_freezeStopsYieldAtExactFreezeBlock` accrues for 100 blocks,
  freezes, advances another 10,000 blocks, and proves both vault yield and escrow-recorded
  quarantined yield remain exactly unchanged.
- Compatibility assertion: all 12 pre-existing direct-custody escrow tests still pass.
- Vault-backed release assertion: idle principal leaves escrow custody for the vault and a
  compliant milestone release pays its recipient from that vault.
- Configuration assertion: vault selection is one-time and is rejected after any funding has
  begun, preventing old direct-custody intents from being rerouted.

## Safety findings

- PASS: the vault is explicitly labelled testnet-only and uses a fixed public rate.
- PASS: only the bound escrow can deposit, release, or freeze value.
- PASS: public `tick` changes accounting only and cannot transfer value.
- PASS: freeze accrues through the freeze block atomically, then makes the position inactive
  and permanently stops subsequent accrual.
- PASS: remaining principal and accrued yield stay inside a frozen vault position.
- PASS: neither escrow nor vault exposes refund, withdraw, sweep, rescue, or quarantine exit.
- PASS: escrow records per-intent and aggregate quarantined yield independently of principal.

## Findings

One non-blocking documentation mismatch naming the superseded aUSDC deployment was found and
corrected before the final audit run. No open findings remain.

## VERDICT: PASS

Phase 4 exit criterion is met. Phase 5 may begin.

---
