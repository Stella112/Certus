# Certus

## Verified payments for people and AI agents

Certus is a payment application that lets a person or an AI agent declare what they want to pay, then moves value only when the payment is still compliant.

**One sentence:** Certus turns a raw stablecoin transfer into a continuously verified payment with identity, asset, policy, and audit protection built in.

## Why this matters

Stablecoin payments are fast, but fast settlement creates a difficult question for businesses: what happens when the recipient is unverified, a credential is frozen, an asset is not the approved settlement asset, or an autonomous agent spends outside its mandate?

Certus answers before and during settlement. A payment is evaluated as a live intent rather than treated as an irreversible wallet action. A failed recipient does not have to fail an entire payroll run, and an agent can propose a payment without ever receiving the principal's private key.

## The product

See the full product overview in [`docs/CERTUS.md`](docs/CERTUS.md).

Certus is designed as a payment app first, with compliance operating underneath:

- **Send payment** — fund a protected one-stage payment and release it after a fresh decision.
- **Milestone escrow** — lock funds once and release them stage by stage; every release is checked again.
- **Clean payroll** — fund one aUSDC batch, screen each employee independently, release eligible rows, and isolate failed rows without reverting the rest.
- **Recurring payments** — fund a schedule up front and re-check the recipient, asset, and policy at every epoch.
- **Payment links** — create a shareable payment request with identity checks at checkout.
- **Agent payments** — register a bounded agent mandate, let the agent propose a payment, and require principal funding before settlement.
- **Activity and oversight** — inspect decisions, reason codes, provenance, freezes, and audit exports from one workspace.

The primary experience is simple: connect a wallet, choose a recipient and amount, fund the protected payment, and let Certus decide whether value can move.

## The four checks

Every settlement leg runs the same controls:

1. **Sender identity** — the payer has an eligible Cleanverse credential.
2. **Recipient identity** — the counterparty is eligible on the selected chain.
3. **Verified asset rules** — the payment uses the asset approved for that settlement route.
4. **Spending policy** — the amount, counterparty, mandate, and timing remain within policy.

The result is explicit: `PASS`, `ISOLATE`, `FREEZE`, or `REJECT`, with reason codes and an append-only audit event. A refusal preserves the funds; it does not silently fall through to an unprotected transfer.

## Integrations

### Cleanverse Cooperation API

Cleanverse supplies the compliance primitives that make Certus more than a wallet UI:

- **A-Pass identity** for chain-scoped eligibility instead of storing ordinary personal KYC data in Certus.
- **Live eligibility verification** before intent creation, milestone release, payroll rows, recurring epochs, and payment-link opens.
- **A-Token / aUSDC settlement assets** whose asset rules are bound to the exact chain and contract route.
- **Credential generation and freezing** so a revoked or frozen identity can stop future settlement.
- **Deposit-address onboarding** so a user can fund the correct wallet through the Circle Monad faucet path.
- **Fiat-ramp adapters** for Cleanverse quote, widget, and order flows where the provider supports an off-ramp.

Certus keeps the sensitive identity administration behind Cleanverse. Wallet addresses, eligibility outcomes, reason codes, and settlement evidence remain in the Certus audit model; personal identity details are not put on-chain.

### Monad Testnet

Monad is the live demonstration network. The current deployment uses:

- Chain ID: `10143`
- RPC: `https://testnet-rpc.monad.xyz`
- aUSDC: `0xaC0893567D43C3E7e6e35a72803df05416C1f20D`
- aUSDC escrow: `0x06bde498b5568cfb6fb89409ec2b2261576cc37f`
- aUSDC payroll batch: `0xc41d94866af513e4460cb334ea416c5f892c8e3a`

The batch contract uses an isolation-ring model: each row is released or isolated independently, and isolated value remains quarantined in the contract.

Optional testnet yield protection is deployed separately from the standard escrow:

- yield escrow: `0x2f6dc0ff82b22d30f034e7768c88ca7f19bb9145`
- MockYieldVault: `0x32e03df8fb317069c16fe0f5d5c296e35ca7fa11`
- historical contract-vault attempt: `0xf09d1b75162f33b35e2fda2cfcf1e1de01118f1d` (cannot custody canonical aUSDC without Cleanverse authorization)
- working custodial pilot: `0x5e38e163803a7d36d88b3d2656e93559f088dcb5`
- A-Pass custodian: `0xdC646c197d0202FC2A0326af8ab55066A3549E2E`

The working pilot records positions in the controller while principal remains with the A-Pass-verified custodian EOA. The bonus is deployer-sponsored, bounded, and not separately audited, guaranteed, or a production APY product. The UI exposes principal, bonus preview, active/frozen state, custodian, and explorer links so the stop-and-quarantine behavior is verifiable.

The working flow is `CVI check -> approve aUSDC -> custodial pilot records principal -> sponsored bonus accrues -> withdraw principal + bonus`. A trustless contract vault remains blocked until Cleanverse authorizes a contract asset route.

### Wallets and agent runtime

Certus uses an EIP-1193 browser wallet such as MetaMask for principal approvals and network switching. The agent runtime is server-side and can use Anthropic Claude (the local demo is configured for a lower-cost Claude Haiku model). The agent signs a proposal; it cannot sign for or move the principal's funds.

The live demo agent is:

`0x18cf55bfFD69578FA792f7AA11C811663600bf33`

The active mandate model limits per-payment amount, rolling daily budget, policy, chain, expiry, and principal. A principal must still approve and fund the scoped escrow before release.

## Multi-chain direction

The payment model is chain-aware today. Typed network configuration exists for Monad, Polygon, BNB Chain, Ethereum, and Base; each payment carries its chain, asset, RPC, explorer, and identity context.

This means a Monad identity is not silently treated as verified on Polygon. Independent settlement on each configured chain is supported by the architecture.

Certus does **not** currently claim that it bridges a payment from one chain to another. A true cross-chain route still requires an audited bridge or messaging adapter, destination liquidity, and a second chain-specific compliance check. That is a clear product extension rather than a misleading frontend promise.

## Privacy, honestly described

Certus is privacy-aware, not a shielded payment network. Cleanverse API requests can protect sensitive identity administration, and Certus can keep payment metadata limited to authorized audit views. Sender, recipient, amount, and contract events remain visible on the public chain.

The current product does not hide transaction amounts or addresses, use zero-knowledge identity proofs, or provide confidential smart-contract state. A future shielded settlement adapter can add that capability without changing the intent and policy model.

## Business model

Certus can monetize the compliance layer that payment operators already need:

- per-payment and per-payroll settlement fees;
- team and compliance-operator seats;
- API access for marketplaces and agent platforms;
- premium audit, provenance, and reporting exports;
- optional revenue share from compliant escrow and yield venues.

The initial customers are Web3 companies paying contractors, marketplaces settling merchants, DAOs running payroll, and platforms deploying autonomous purchasing or treasury agents. They already have stablecoin liquidity; Certus gives them a safer, explainable way to let that liquidity move.

## Live demo flow

Use Monad Testnet and the deployment wallet below:

```text
Principal wallet: 0xdC646c197d0202FC2A0326af8ab55066A3549E2E
Verified recipient: 0x8FD349B2b66a03ce140c8E2e14Dc6c0e542D8384
Refusal recipient: 0x00000000000000000000000000000000deadbeef
```

1. Send `0.10 aUSDC` to the verified recipient and release it from Milestone escrow.
2. Send `0.10 aUSDC` to the refusal recipient; the payment remains held after `NO_CVI`.
3. Create a two-row Clean payroll batch: one verified recipient and one refusal recipient. Execute it and observe one release plus one isolation.
4. Open Agents & policy, select the existing mandate, and ask the agent to pay `0.50 aUSDC` to the verified recipient. The principal funds the scoped escrow; Certus performs the final release.
5. Open Yield protection, connect the funded Monad wallet, deposit a small aUSDC amount, wait for the bonus preview to accrue, and withdraw principal plus the bounded sponsor bonus. If the identity check fails, the UI shows the reason code and the position remains quarantined.

The local app runs at [http://localhost:3000](http://localhost:3000). Contract and deployment details are recorded in [`deployments/monad.json`](./deployments/monad.json).

Submission resources:

- [Full demo video script](./docs/DEMO-VIDEO-SCRIPT.md)
- [Verified live demo evidence](./docs/DEMO-RUN.md)
- [Vercel deployment guide](./docs/VERCEL-DEPLOY.md)
- [Product and integration documentation](./docs/CERTUS.md)
- [SDK reference](./docs/SDK.md)

## Product boundary

The strongest claim Certus can make today is precise:

> Public settlement proof, private identity administration, and continuous compliance decisions for human and agent payments.

That boundary is intentional. It makes the live demo verifiable now while leaving clear adapter work for shielded payments, production off-ramp partners, and true cross-chain transport.
