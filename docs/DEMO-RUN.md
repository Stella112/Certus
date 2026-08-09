# Certus live demo run — Monad testnet

Recorded 2026-08-09 from the local Certus app using the deployment wallet.

## Demo wallet

- Wallet: `0xdC646c197d0202FC2A0326af8ab55066A3549E2E`
- Monad A-Pass: active (`verify_apass` code `4`)
- USDC balance at rehearsal: `58.2`
- aUSDC balance at rehearsal: `19.9`
- Monad deposit wallet: `0xAdC2Ff4eac467fbbeB58a926B7420508017cEA39`

## Flow A — USDC payment passes

1. Certus created intent `cmsluswlz0000lhdurpcmdcjg` for `1 USDC` to verified recipient
   `0x8FD349B2b66a03ce140c8E2e14Dc6c0e542D8384`.
2. Origin-USDC escrow: `0xb327709Ec4f0830722776746b1da42F98d51868e`.
3. Funding tx: `0x2ad605dc0e7466b2b9ff6e8b1bd8fc63379b50ccf4eeae9f9d35fa297fcbb174`.
4. Release verdict: `PASS` after sender identity, recipient identity, asset, and policy checks.
5. Release tx: `0x7eb84230d4b06282ca3ff051ddfaa96edb7939d4d505a0ff8ecbb10acb271348`.
6. Audit reference: `0x0a5b70fa1e4adce1450b6fdbe6d750fddcae2aec7b20dc6359877392e9745f4a`.

## Flow B — unverified recipient is held

1. Certus created and funded a `1 USDC` intent to `0x00000000000000000000000000000000deadbeef`.
2. Funding tx: `0x75c2163f848cb029b96aba7687fff284f0ab17608c719943807a4026c9480e9b`.
3. Release verdict: `FAIL / NO_CVI` (`apass not exist`).
4. No release transaction was signed; the funded value remains in escrow.

## Flow C — agent mandate and principal funding

1. Mandate `cmslv9zhi000e10zn96ig2qh8` registered for `Certus Demo Agent`.
2. Request `0.5 aUSDC`, within the mandate's `1 aUSDC` per-transaction and `2 aUSDC`
   daily limits, returned `PASS` and `AWAITING_PRINCIPAL_FUNDING`.
3. Principal funded the scoped aUSDC escrow; funding tx:
   `0x99647476b6fceda646830e1489b7a308ee3ba3d80061552a94d81c1de146cdd1`.
4. Release tx:
   `0xa19a2bd3cfcae6c4990b4a271d88a5bf7a95a60e73fd5563a26999cf41124caa`.
5. Audit reference: `0x96e28283dcf842717b7c24ffbfbe1d894b911338e1a4b64aab6d8abf0e3cc32`.

These are live testnet observations, not simulated UI rows.

## Flow D — custodial aUSDC yield pilot

Canonical aUSDC rejects arbitrary contract holders, so the working testnet pilot uses the
same A-Pass-verified deployer EOA as custodian. This is custodial and sponsor-funded, not
protocol-generated yield or an APY promise.

- Pilot controller: `0x5e38e163803a7d36d88b3d2656e93559f088dcb5`
- Custodian: `0xdC646c197d0202FC2A0326af8ab55066A3549E2E`
- Asset: aUSDC `0xaC0893567D43C3E7e6e35a72803df05416C1f20D`
- Custodian allowance: `10 aUSDC` (`0xe45a6725707d4b21d5500bb862f6a568b5e6f92dd8fad6ae1acd66761abf36d2`)
- Deposit rehearsal: `1 aUSDC`, tx `0xe4242806b1a079e01c31465879831954657234add84766e6925921c8cf921fe3`
- Withdrawal rehearsal: principal plus bounded bonus, tx `0x5c5f403ed50d7ed6acd4753ed4c44ffbe43a12aad849112040436859fb038970`
- Final position: `0` principal, `0` bonus, no active position.

For the submission demo, show the live yield page, connect the funded wallet, deposit a
small amount, wait for the bonus preview to change, and withdraw. Explain that a production
trustless vault requires Cleanverse to authorize a contract asset route.
