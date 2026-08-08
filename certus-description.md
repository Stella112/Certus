# Certus

**Policy-Gated Intent Settlement for Verified Finance**

*Certus* is Latin for settled, assured, beyond question: the state a payment should be in before it moves.

**Track:** Compliant DeFi · **Chain:** Monad

## One line

Certus is a policy-gated payment layer where humans and AI agents declare payment intents instead of signing raw transactions. Every intent is validated against verified identity, verified-asset rules, and institutional spending policy before value moves, and re-validated for as long as it keeps moving.

## The problem

On-chain payments face four structural barriers that keep institutions and autonomous agents on the sidelines. Payments execute instantly with no check on whether the recipient is sanctioned, unverified, or out of policy, so liability lands after the money is gone. Stablecoin payouts get frozen at the recipient's bank because there is no proof of where the funds came from. Batch disbursals either fail wholesale on one bad address or let it through unscreened. And AI agents gaining spending power have no native guardrails capping budgets or restricting counterparties to verified identities.

The missing primitive is simple: no value moves until identity, asset provenance, and policy have all said yes, and they keep getting asked for the life of the payment.

## How it works

Certus replaces raw transactions with validated payment intents. A human or agent declares what they want to pay, and the intent settles only after clearing four live checks: the sender's verified identity, the recipient's verified identity, the asset's compliance rules, and the institutional policy engine. Compliance is continuous rather than a gate at the door. Every settlement leg re-runs all four checks, so a single payment relationship triggers the pipeline dozens of times across its life.

On Cleanverse's stack these checks are real: identity is an A-Pass credential, assets are compliance-enforcing A-Tokens, eligibility is verified live before every move, and a frozen credential is detected the instant it happens.

## The product suite

**Intent engine.** Declarative intents for humans and AI agents, where agents execute autonomously inside spending boundaries and the engine blocks any transfer to an unverified or out-of-policy counterparty before it reaches the chain.

**Milestone escrow.** Funds lock as verified assets and release in stages, with all four checks re-run at every release. A credential revoked mid-contract freezes the remaining milestones automatically and quarantines funds in escrow with provenance intact.

**Batch disbursal with isolation ring.** Hundreds of payouts in one intent, each address screened independently, so ninety-nine clean recipients settle while a single failure isolates with a reason code instead of reverting the whole batch.

**Payroll provenance attestations.** Each disbursal attaches provenance metadata and a signed, bank-presentable source-of-funds report, directly addressing the off-ramp freeze problem that keeps stablecoin salaries out of traditional banking.

**Recurring payments with epoch re-checks.** Subscriptions and streams where identity and asset status are re-evaluated at every billing cycle, so eligibility lapsing mid-subscription stops the next payment.

**Compliant payment links and QR codes.** Shareable checkout links that evaluate a payer's identity inline before generating a payload, routing unverified payers to a verification flow instead.

**Identity-based credit foundation.** Completed intents build a payment track record against the counterparty's identity, the basis for differentiated settlement terms and eventually credit inside the verified perimeter.

**Yield on escrowed capital.** Idle escrow balances earn in a permissioned yield venue, with the rule that makes it native to Certus: accrual stops when an intent freezes, and accrued yield quarantines alongside the principal, never settling to a counterparty whose credential has lapsed.

**Oversight dashboard and audit export.** A live compliance-officer view of every intent, every check result with reason codes, full transfer lineage, freeze controls, and one-click export of an audit-ready report for any point in time.

## Why Cleanverse is essential

Delete either primitive and the product is impossible, not merely degraded. Verified identity makes a counterparty a screenable, revocable person rather than an address, and revocability is exactly what makes mid-lifecycle enforcement real. Verified assets let escrow itself carry rules and provenance, so isolated or frozen funds never lose clean lineage, and that is what makes an off-ramp attestation meaningful. Every intent, in every payment type, exercises both primitives together, for its entire life.

## Business potential

Three pilot-ready segments are each already blocked by exactly what Certus solves: Web3 enterprises and DAOs running cross-border payroll that needs audit-ready provenance for off-ramping; merchants and service providers needing compliant invoicing with identity checks at the point of payment; and agentic commerce platforms whose autonomous agents must spend inside hard policy and counterparty limits. Revenue comes from transaction fees, enterprise seats, and a share of yield on capital held in compliance-gated escrow. Every pilot expands the set of institutions holding verified identities and transacting in verified assets, so Certus grows the Cleanverse perimeter as it grows.
