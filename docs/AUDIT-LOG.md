# AUDIT LOG

Appended after every phase. Format per PART VII.

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
