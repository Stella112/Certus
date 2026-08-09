# Certus

## Verified payments for people and AI agents

Certus is a policy-controlled payment application. A person or AI agent declares an intended payment, Certus verifies the participants and rules, and only then does the principal wallet fund and release value.

> Certus turns a raw stablecoin transfer into a continuously verified payment with identity, asset, purpose, policy, and audit protection.

## The core flow

```text
Declare intent
    ↓
Attach purpose evidence
    ↓
Run a dry-run simulation
    ↓
Connect the principal wallet
    ↓
Fund protected escrow
    ↓
Re-run live checks before release
    ↓
Release, isolate, or freeze with an audit record
```

The simulation step does not move funds. It shows the expected verdict, every individual check, and the reason code that would hold the payment.

## The four settlement checks

Every payment leg is evaluated independently:

1. **Sender identity** — the payer has an eligible Cleanverse A‑Pass/CVI.
2. **Recipient identity** — the counterparty is eligible on the selected chain.
3. **Verified asset rules** — the payment uses the approved asset and satisfies its transfer rules.
4. **Spending policy** — amount, budget, recipient, mandate, and timing are within policy.

Certus returns an explicit `PASS`, `FAIL`, `ISOLATE`, or `FREEZE` decision. A refusal does not silently become an unprotected transfer; the principal remains held with its reason code and amount visible.

## Proof of purpose

Certus validates not only who is involved, but why the payment exists. An intent can include:

- invoice
- purchase order
- contract
- milestone
- payroll record
- other business reference

Documents remain off-chain. Certus stores the purpose type, a human reference, and optionally a cryptographic hash so an auditor can prove that the evidence has not changed without exposing the document itself.

## Agent payments

An agent does not receive the principal wallet’s private key. The principal signs a bounded mandate that defines:

- permitted chain
- policy
- per-payment limit
- rolling daily limit
- expiry
- principal address

The agent proposes a payment. The principal funds the scoped escrow. Certus runs the final checks and records the full mandate, request, funding, and release lineage.

## Payment products

Certus currently supports:

- protected one-stage payments
- milestone escrow
- recurring payments with a fresh check at every epoch
- payment links
- independent payroll/batch disbursement with row-level isolation
- agent-initiated payments under a mandate
- fiat-ramp adapters where a provider is configured

These are different payment experiences over the same intent, policy, and audit model.

## Cleanverse integration

Cleanverse provides the identity and asset primitives:

- A‑Pass/CVI issuance and eligibility checks
- chain-scoped identity verification
- A‑Token/aUSDC asset rules
- credential freezing and reactivation
- deposit-address onboarding
- ramp and off-ramp adapter surfaces

Certus does not store ordinary personal KYC details on-chain. It stores wallet addresses, eligibility outcomes, reason codes, purpose evidence, and settlement lineage.

## Privacy and cross-chain boundaries

Certus is privacy-aware, not a shielded payment network. Identity administration and selected off-chain metadata can be protected, but sender addresses, recipient addresses, amounts, and contract events remain visible on public blockchains.

Certus is multi-chain in its configuration and policy model. Monad, Polygon, BNB Chain, Ethereum, and Base have independent chain contexts, assets, RPCs, explorers, and identity registries. Certus does not currently claim to bridge value between chains. A true cross-chain transfer requires an audited bridge or messaging adapter, destination liquidity, and a second compliance check.

## Yield status (custodial testnet pilot)

The working Monad yield demo uses the A-Pass-verified deployer EOA as custodian because canonical aUSDC rejects arbitrary smart-contract holders. The pilot records positions on-chain, checks eligibility before deposit, and pays a bounded deployer-sponsored bonus on withdrawal. It is custodial, testnet-only, and not protocol-generated yield or a production APY. Current pilot: `0x5e38e163803a7d36d88b3d2656e93559f088dcb5`; custodian: `0xdC646c197d0202FC2A0326af8ab55066A3549E2E`.

The earlier contract-vault paragraph below is historical evidence; a trustless aUSDC vault remains blocked until Cleanverse authorizes a contract asset route.

The standalone yield surface is a sponsored testnet demonstration:

```text
CVI check → deposit aUSDC → sponsored bonus accrues → withdraw principal + bonus
```

The bonus is funded by a deployer reserve. It is not protocol-generated yield, an audited strategy, or a guaranteed APY. Deposits remain paused until the vault has an active Cleanverse A‑Pass and the reserve is funded. If a position is frozen, principal and bonus are quarantined together.

Important Cleanverse constraint: the deployer wallet's A‑Pass does not transfer to a smart-contract vault. aUSDC also has an institutional deposit whitelist that third parties cannot self-manage. The deployer wallet is currently A‑Pass eligible; the new vault contract still requires an authorized asset route before it can custody aUSDC.

## Integration surface

Applications and agents can use the typed Certus client:

```ts
const preview = await certus.simulateIntent(request);

if (preview.decision.verdict === 'PASS') {
  const intent = await certus.createIntent(request);
  // The caller's wallet signs approval and funding.
}
```

The integration layer is deliberately non-custodial: Certus decides whether a payment is authorized, while the principal wallet remains responsible for signing value-moving transactions.

## Product boundary

The strongest accurate claim today is:

> Certus provides public settlement proof, protected identity administration, purpose-aware policy decisions, and continuous compliance controls for human and agent payments.

The next major extensions are a production yield venue, shielded settlement adapter, and audited cross-chain transport.
