# CLEANVERSE API: VERIFIED TRUTH

Source: PART XI of the build spec + live UAT sandbox calls
Date confirmed: 2026-08-08
Sandbox base URL: https://uatapi.cleanverse.com/api/cooperate
Auth: header `api-id: <CLEANVERSE_API_ID>` on every request. api-key is the local AES key, never sent.

> RULE: only facts in this file (backed by a pasted real response) or PART XI may be
> relied upon. Where the sandbox contradicts PART XI, the sandbox wins and the delta is
> flagged in CAPS. Everything below marked CONFIRMED has a real response pasted from a
> Phase 0 probe (scripts/probe/*, raw dumps in scripts/probe/out/).

---

## Envelope (all endpoints)

`{ "code": "0000", "message": "...", "data": {...} }`

- `code:"0000"` = API call succeeded (transport/parse level). NOT a compliance result.
- `code:"0002"` = business failure OR parameter validation failure (message carries detail,
  sometimes a bracketed sub-code like `[400]`, `[500]`).
- `code:"0001"` = bad parameter (not yet observed; PART XI).
- HTTP 500 body `{status:500,error:"Internal Server Error"}` = server crash on malformed input
  (observed when atoken/rules got the wrong field name).

**CRITICAL:** compliance outcome for verify_apass lives in `data.code` (an integer), never the
envelope `code`. Never treat envelope `0000` as compliance PASS.

---

## AES encryption — CONFIRMED working end to end

Scheme (PART XI), proven by round-trip locally AND by the server accepting encrypted bodies
(generate_apass + update_status returned business responses, not 403 decryption errors):

- Algorithm: AES-256-CBC (key is 32 bytes after Base64-decoding CLEANVERSE_API_KEY)
- Mode/padding: CBC / PKCS7 (PKCS5)
- IV: 16 zero bytes (fixed)
- Key: Base64-decode(CLEANVERSE_API_KEY)
- Envelope for encrypted endpoints: `{ "data": "<Base64 ciphertext>" }`

Implemented in scripts/probe/aes.mjs (throwaway). Production copy goes in src/lib/cleanverse.

Endpoints requiring AES body (CONFIRMED): `generate_apass`, `update_status`.
Plain JSON (CONFIRMED): `query_apass_list`, `query_apass`, `verify_apass`,
`query_deposit_atoken_list`, `atoken/rules`.

---

## Identity (A-Pass = CVI)

### POST /query_apass_list  (plain) — CONFIRMED
Request: `{}` works; optional `{ pageNo, pageSize }` (defaults page 1, size 20).
Response `data`: `{ total, pageSize, page, items:[ { cvRecordId, customerId, chain,
walletAddress, apassAddress, status(null|1), tier, subTier, group, subGroup, countries[],
expirationTime, txHash, registeredAt } ] }`. Sandbox already holds 865 identities.
Use for the dashboard population.

### POST /query_apass  (plain) — CONFIRMED
Request fields (EXACT): `{ chain, address }`.  <-- field is `address`, NOT `walletAddress`.
Empty body error (Chinese): "链类型不能为空, 钱包地址不能为空" (chain + wallet required).
Real response for an active identity:
```json
{"code":"0000","message":"success","data":{"subTier":0,"tier":"50","expirationTime":1801699801,"subGroup":"","cvRecordId":"1258","countries":["NG"],"currentKycHash":"0x8e3e...5f4e","group":"","status":1}}
```
`status`: 1 = active. (Frozen identities surface via verify_apass, see below.)

### POST /verify_apass  (plain) — CONFIRMED — THE CORE CHECK
Request fields (EXACT, all required): `{ chain, atoken, address }`.
Response `data.code` mapping:

| data.code | sandbox message | Certus verdict | reason |
|---|---|---|---|
| 4 | "apass verify success" | PASS | valid, transfer allowed |
| 2 | "apass not exist" | REJECT | NO_CVI (no A-Pass at address) |
| 1 | "atoken not exist" | REJECT | ATOKEN_NOT_FOUND |
| 3 | **UNREACHABLE in this sandbox** — see below | n/a | n/a |

All three of codes 4 / 2 / 1 are SANDBOX-CONFIRMED. Code-1 response (bogus atoken):
```json
{"code":"0000","message":"ok","data":{"chain":"monad","atoken":"0x1111111111111111111111111111111111111111","address":"0x2e2B...d0cA","code":1,"message":"atoken not exist"}}
```

**Code 3 is unreachable (three routes tested, all closed):**
- frozen A-Pass => envelope `0002` + `APassNotActive` (NOT code 3)
- register an already-expired pass => `[CV_504]The 'expirationTime' time has expired`
- register a short-expiry (150s) pass => `[CV_500]CV System error`, identity never created
Product impact: NONE. The pipeline uses an allowlist (eligible IFF `data.code === 4`), which is
fail-closed for any unforeseen code. The spec's reason code `CVI_REVOKED_OR_EXPIRED` already
merges revoked and expired, so no audit fidelity is lost. Phase 1 may freeze the enum.

Real code-4 response (active identity):
```json
{"code":"0000","message":"ok","data":{"chain":"monad","atoken":"0xaC08...f20D","address":"0x2e2B...d0cA","code":4,"message":"apass verify success"}}
```
Real code-2 response (address with no A-Pass):
```json
{"code":"0000","message":"ok","data":{"chain":"monad","atoken":"0xaC08...f20D","address":"0x0000...DeaDBeeF","code":2,"message":"apass not exist"}}
```

**>>> CRITICAL CORRECTION TO PART XI — THE FREEZE SIGNAL <<<**
PART XI predicted a frozen A-Pass yields `data.code: 3`. THE SANDBOX DOES NOT DO THIS.
A frozen A-Pass makes verify_apass return an ENVELOPE ERROR, not a data.code:
```json
{"code":"0002","message":"Failed to validate atoken: failed to check apass: custom err name APassNotActive, revert data: 0x322fde89...<address>","data":{"magickLink":"..."}}
```
So the revocation/freeze signal that Certus must detect is:
  envelope `code == "0002"` AND message contains `APassNotActive`
  -> map to reason `CVI_REVOKED_OR_EXPIRED` -> FREEZE.
The pipeline's rule is therefore: **eligible IFF `data.code === 4`. Anything else is
not-eligible; `APassNotActive` specifically means a live freeze/revocation.**

### REVOCATION DETECTION MECHANISM (required by PART IV DATA SOURCES) — POLL

No webhook/push channel for A-Pass status change exists on the Cooperate API surface
(the only webhook documented is the A-Token *apply* webhook, unrelated). Therefore:

```
MECHANISM   : POLL by re-calling verify_apass
INTERVAL    : 5s for identities with active intents (PART IV mandates <=5s staleness)
AT DECISION : ALWAYS re-called fresh at decision time, never read from cache/projection
FAIL MODE   : FAIL CLOSED. No response, timeout, or non-4 code => no settlement.
              Surface CVI_UNAVAILABLE in the UI. Never assume-valid-and-reconcile.
SIGNAL      : envelope 0002 + message contains "APassNotActive"
              => reason CVI_REVOKED_OR_EXPIRED => FREEZE cascade
```

### POST /generate_apass  (AES) — CONFIRMED
Request fields (observed working):
`{ wallet:{chain,address}, customerId, expirationTime, tier, subTier, group, subGroup, countries[] }`
Empty-body error listed required: wallet, expiration time, customer id.
Real success response:
```json
{"code":"0000","message":"success","data":{"customerId":"CERTUSFREEZE...","cvRecordId":"1271","tier":"50","wallet":{"operate":"insert","address":"0x8203...9094","chain":"monad","txHash":"0x219f...1ebd","depositUSDCWallet":"0x56CE...FBa4","depositUSDTWallet":"0x56CE...FBa4","apassAddress":""}}}
```
Registers a real on-chain A-Pass (txHash). Note `depositUSDCWallet`/`depositUSDTWallet`:
the per-identity deposit route that mints the A-Token to the holder (relevant to release path).
Seed script uses this to mint identities.

### POST /update_status  (AES) — PARTIALLY CONFIRMED
FREEZE (status=2): CONFIRMED WORKING.
Request: `{ status:2, wallet:{chain,address}, blacklistReason }`. Response:
```json
{"code":"0000","message":"success","data":{"txHash":"0xd85e...82f4"}}
```
This is Certus's revoke button and the Moment B trigger. Real, on-chain.

ACTIVATE (status=1): **FAILS in this sandbox.** Every attempt (2 body shapes, 6 tries)
returned `{"code":"0002","message":"[500]System Error","data":"{}"}`. See OPEN QUESTIONS.
CONSEQUENCE: a frozen sandbox identity cannot be reactivated. Do not build any demo path
that relies on un-freezing via the API. Each freeze demo uses a FRESH generate_apass identity.

---

## Assets (A-Token / CVA)

### POST /query_deposit_atoken_list  (plain) — CONFIRMED
Request: `{}` (all chains) or `{ chain }`. Response `data`:
`{ chain, tokens:[ { origin_token:{address,name,symbol,decimals,icon},
atoken:{address,name,symbol,decimals,icon}, accesscore_address, apass_address } ] }`.

**The Monad CVA asset (pre-issued, use this — do NOT launch a new one):**
```
origin USDC      : 0x534b2f3A21130d7a60830c2Df862319e593943A3  (decimals 6)
atoken  aUSDC    : 0xaC0893567D43C3E7e6e35a72803df05416C1f20D  (decimals 6)
accesscore_addr  : 0x8F118338a1fa41E7Fa86Be19A4e8B99Ed58A6EcC
apass_address    : 0xbA82D189540CaC9DC6FF46B6837CaC1BFdEC58B9
```
(A-Token issuance via /atoken/launch is async — NOT needed, the pair above already exists.)

### POST /atoken/rules  (plain) — CONFIRMED
Request field (EXACT): `{ chain, atoken_address }`.  <-- `atoken_address`, NOT `atoken`.
Wrong field name => HTTP 500 (server crash), not a clean error. Be exact.
aUSDC rules:
```json
{"code":"0000","message":"success","data":{"chain":"monad","rules":[{"allowed_group":"","allowed_sub_group":"","min_tier":5,"min_sub_tier":0,"is_black_list":false,"countries":[]}],"atoken_address":"0xac08...f20d"}}
```
=> aUSDC requires min_tier 5, no group/country/blacklist restriction. Our generated
identities (tier 50) pass while active.
Origin USDC rules: `[]` (empty) => ungated plain ERC20, custody-able by any contract.

---

## Escrow custody conclusion (AC-0.5) — RESOLVED, design (c)

- aUSDC transfers are gated on A-Pass eligibility (verify code 4). An address with no
  A-Pass gets code 2 and cannot receive aUSDC. A bare escrow contract has no A-Pass.
- Origin USDC is ungated (rules []), holdable by any contract.
- DESIGN: CertusEscrow custodies ORIGIN USDC; the four-check pipeline (evaluate()) runs at
  every release; aUSDC moves to the recipient only on PASS, where the A-Token's own on-chain
  gate is the backstop; provenance PDF via download_travel_rule on the release txHash.
- Fallback (a) Validator-pool registration NOT needed for the demo.

---

## Network — Monad testnet — official docs + LIVE-CONFIRMED

Chain ID independently verified against the live RPC by the Phase 0 Auditor:
`$ cast chain-id --rpc-url https://testnet-rpc.monad.xyz` -> `10143`. Not doc-only.
Deployer `0xdC646c197d0202FC2A0326af8ab55066A3549E2E` funded with 5 MON (confirmed on chain).

```
Chain ID      : 10143
Primary RPC   : https://testnet-rpc.monad.xyz      (QuickNode, WebSocket, 50 rps)
Fallback RPC  : https://rpc.ankr.com/monad_testnet ; https://rpc-testnet.monadinfra.com
Explorer      : https://testnet.monadscan.com  (also https://testnet.monadvision.com)
Native token  : MON, 18 decimals
Faucet        : https://faucet.monad.xyz   (also Cleanverse POST /faucet, rate-limited hard)
```
Testnet reset from genesis 2025-12-16, version v0.15.2. Cleanverse chain value: "monad".

---

## Audit (to confirm in Phase 2/6 when a real settlement txHash exists)

- POST /download_travel_rule { txHash, wallet } -> time-limited PDF URL. NOT yet called
  (needs a real settlement txHash). DOC-ONLY until Phase 2.
- POST /query_txs, POST /query_institution_txs -> indexed history for dashboard. DOC-ONLY.

## Faucet (to use in Phase 0 funding, deliberately, once)

- POST /faucet { chain, symbol, depositAddress, amount }. Rate-limited per api-id, error
  returns seconds to wait (example in docs ~86,396s ≈ 24h). NOT yet called.

---

## OPEN QUESTIONS FOR THE USER / CLEANVERSE

1. **update_status status=1 (reactivate) returns [500] System Error consistently.** Is there
   a different reactivation endpoint/shape, or is un-freeze simply unsupported in UAT?
   STATUS 2026-08-08: user ACCEPTED the deviation. Quarantine is terminal in the demo
   (compliance-officer release only). No demo path depends on un-freezing. Still worth
   raising with Cleanverse. See DECISIONS.md F2/D6.
2. ~~Freeze signal / code 3~~ **RESOLVED.** Signal is envelope 0002 + `APassNotActive`.
   Code 3 is unreachable (3 routes tested). See the verify_apass section.
3. **download_travel_rule** to be validated in Phase 2 against a real on-chain settlement tx.
4. **Escrow custody is currently an INFERENCE, not a live transfer test** (Phase 0 audit F-05).
   Phase 2 must directly prove: (i) CertusEscrow holds origin USDC, (ii) aUSDC reaches a
   verified recipient on release. Do not treat design (c) as proven until then.
