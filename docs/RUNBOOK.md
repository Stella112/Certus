# CERTUS RUNBOOK

Operational state, funding, and demo-day procedure. Updated as the build progresses.

## Wallets and balances

| Role | Address | Asset | Balance | Confirmed |
|---|---|---|---|---|
| Deployer (throwaway) | `0xdC646c197d0202FC2A0326af8ab55066A3549E2E` | MON (gas) | **5.0 MON** | 2026-08-08, `cast balance` |

Gas budget: contract deploys + redeploys after fixes + seeding + 3 rehearsals + live demo.
5 MON is ample for Monad testnet. Re-check before demo day with:

```bash
cast balance 0xdC646c197d0202FC2A0326af8ab55066A3549E2E --rpc-url https://testnet-rpc.monad.xyz
```

## Faucets — USE DELIBERATELY, ONCE. DO NOT LOOP.

- **MON (native gas):** https://faucet.monad.xyz — web UI, human-only (captcha/social login).
  The agent cannot use this. A human must fund the deployer.
- **Test USDC/USDT (Cleanverse):** `POST /faucet { chain, symbol, depositAddress, amount }`.
  **Rate-limited per api-id, hard.** The error returns seconds to wait (docs example ~86,396s
  ≈ 24 hours). NOT YET CALLED. When called: request once, for the exact wallet list only,
  record the result here. If it fails, READ the seconds-to-wait and report it. NEVER retry in
  a loop — a lockout costs a day of the build.

## Network

```
Chain      : Monad testnet, chainId 10143 (live-verified)
RPC        : https://testnet-rpc.monad.xyz   (fallbacks: rpc.ankr.com/monad_testnet,
                                              rpc-testnet.monadinfra.com)
Explorer   : https://testnet.monadscan.com
Native     : MON, 18 decimals
```

## Cleanverse sandbox

```
Base URL   : https://uatapi.cleanverse.com/api/cooperate
Auth       : api-id header. api-key is a LOCAL AES key, never transmitted.
Monad CVA  : origin USDC 0x534b2f3A21130d7a60830c2Df862319e593943A3 (6 dp)
             atoken aUSDC 0xaC0893567D43C3E7e6e35a72803df05416C1f20D (6 dp)
```

## Known sandbox limitations (design around these, do not fight them)

1. **A frozen A-Pass cannot be reactivated** (`update_status status=1` -> `[500]`).
   Every rehearsal needs a freshly minted freeze-target. The seed script handles this.
2. `atoken/rules` returns HTTP 500 if the field is named anything other than `atoken_address`.
3. `generate_apass` rejects past expirations (`[CV_504]`) and very short ones (`[CV_500]`).

## Spent test identities (frozen, unusable, do not reuse)

- `0x820350D47277784A26FF4D4cE08C12CAD6F19094` — Phase 0 freeze probe, frozen 2026-08-08.
