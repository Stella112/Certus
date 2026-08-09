# Certus demo video script

Target length: 5 minutes 30 seconds

Tone: calm, ambitious, technically credible. Speak as if Certus is already the beginning of a new financial primitive, while keeping every claim inside what the demo proves.

## Before recording

- Open the landing page in one tab and the dashboard in a second tab.
- Connect `0xdC646c197d0202FC2A0326af8ab55066A3549E2E` on Monad Testnet.
- Keep the wallet popup unlocked and positioned where it will not cover the main form.
- Use `0x8FD349B2b66a03ce140c8E2e14Dc6c0e542D8384` as the verified recipient.
- Use `0x00000000000000000000000000000000DeaDBeef` as the refusal recipient.
- Use small amounts: `0.10 USDC` for a payment and `0.10 aUSDC` for yield.
- Pre-open the Activity, Agents & policy, Batch disbursal, Yield protection, and Oversight & audit pages.
- Do not wait silently for wallet confirmations. Continue explaining what Certus is checking.

## 0:00–0:25 — Cold open

### On screen

Start on the Certus landing page. Scroll slowly from the hero to the product overview.

### Voiceover

“The next financial system will not be operated only by people. It will be operated by software, autonomous agents, global teams, and businesses that move value continuously across digital networks.

But money cannot become autonomous until trust becomes programmable.

This is Certus: the verified settlement layer for people, businesses, and AI agents.”

## 0:25–0:55 — The problem and the idea

### On screen

Pause on the section showing verified payments, agents, escrow, and policy controls. Then select **Open dashboard**.

### Voiceover

“Today, stablecoin payments are fast, but they are still missing context. A wallet address does not tell you who is allowed to receive funds, whether an asset is permitted, why the payment exists, or whether an AI agent has authority to spend.

Certus changes the unit of finance from a blind transaction into a verified intent.

Before value moves, Certus verifies the sender, the recipient, the asset, and the policy governing the payment.”

## 0:55–1:20 — Connect and orient the dashboard

### On screen

Show the connected Monad wallet and the dashboard home. Briefly point to Send payment, Milestone escrow, Batch disbursal, Recurring, Agents & policy, Activity, and Oversight & audit.

### Voiceover

“This wallet has an active Cleanverse A-Pass on Monad. Certus uses that credential to make live eligibility decisions without placing personal identity details inside the application or on-chain.

The product feels like a payment application. Compliance, policy, provenance, and containment run underneath every action.”

## 1:20–2:05 — Successful verified payment

### On screen

Open **Send payment**.

1. Select USDC as the user payment asset.
2. Keep Monad Testnet as both the source and destination network.
3. Paste the verified recipient: `0x8FD349B2b66a03ce140c8E2e14Dc6c0e542D8384`.
4. Enter `0.10`.
5. Select a purpose such as **Invoice** and enter `CERTUS-DEMO-001`.
6. Run the preflight or create the payment intent.
7. Show the four checks passing.

### Voiceover

“I am sending ten cents of USDC to a verified recipient. But this is more than an address and an amount.

I bind the payment to its purpose, create the intent, and Certus runs four independent checks: sender identity, recipient identity, verified asset rules, and spending policy.

All four pass. The payment can now enter protected settlement.

The important idea is simple: Certus does not ask whether a transaction looks valid after the money has moved. It decides whether value is allowed to move at all.”

### While the wallet confirms

“The wallet still authorizes custody of the funds. Certus never silently controls the principal.”

## 2:05–2:40 — Show the refusal

### On screen

Open the prepared failed intent in **Activity**, or create a second `0.10 USDC` intent using `0x00000000000000000000000000000000DeaDBeef`. Show the `NO_CVI` reason and held amount.

### Voiceover

“Now I use an unverified recipient.

The recipient has no active A-Pass, so Certus returns `NO_CVI`. There is no release transaction. The value remains held, the reason is visible, and the rest of the system continues operating.

This is fail-closed settlement: uncertainty never becomes permission.”

## 2:40–3:15 — Clean payroll and isolation

### On screen

Open **Batch disbursal**. Show a batch containing the verified recipient and the refusal address. Then show the completed record with one released row and one held row. Expand or point to the held reason.

### Voiceover

“The same protection scales to payroll and mass payouts.

Certus evaluates every employee independently. The verified employee is paid. The unverified employee is isolated with a reason code. One failed row cannot collapse the entire batch.

For a global company, this means payroll becomes both programmable and explainable.”

## 3:15–4:00 — The agent economy

### On screen

Open **Agents & policy**. Show an existing mandate, its principal wallet, agent identity, per-transaction limit, daily limit, purpose, expiry, and funding state. Run or open the prepared `0.50 aUSDC` agent request and show `AWAITING_PRINCIPAL_FUNDING`, then its audit record.

### Voiceover

“Now we move from payments to financial autonomy.

This agent does not receive an unrestricted wallet. It receives a mandate: a spending ceiling, an approved purpose, permitted counterparties, an expiry, and a principal who remains in control of the funds.

The agent proposes a payment. Certus verifies that the request fits the mandate, then waits for principal funding before settlement.

This is what agentic finance needs: not unlimited access to money, but verifiable, revocable authority.”

## 4:00–4:35 — Yield protection

### On screen

Open **Yield protection**. Show the aUSDC asset, A-Pass custodian, reserve, and controller address. Deposit `0.10 aUSDC`, wait for the bonus preview to appear, then withdraw principal plus bonus. If recording time is tight, show the previously verified deposit and withdrawal transactions instead.

### Voiceover

“Certus also demonstrates protected capital growth.

I deposit aUSDC after a fresh identity check. The position accrues a bounded, deployer-sponsored testnet bonus and can be withdrawn while trust remains valid.

This pilot is intentionally precise: it is custodial, sponsor-funded, and not a production APY promise. A production version can connect the same trust controls to audited yield venues.

The larger idea is powerful: capital can remain productive while trust is valid, and stop the moment trust fails.”

## 4:35–5:05 — Audit and provenance

### On screen

Open **Oversight & audit** or **Provenance & activity**. Show the payment purpose, four checks, reason codes, transaction hashes, explorer links, agent mandate, and downloadable report.

### Voiceover

“Every decision leaves an evidence trail: what was requested, who authorized it, which policy version was applied, which checks passed or failed, and which transaction finally moved value.

Operators can inspect it. Auditors can export it. Agents can query it through the Certus API.

Identity administration stays protected, while settlement proof remains publicly verifiable.”

## 5:05–5:30 — Closing vision

### On screen

Return to the landing-page hero or dashboard home. End on the Certus logo and the line **Value, verified**.

### Voiceover

“Certus is not another wallet, and it is not another compliance dashboard.

It is the control plane between intent and settlement.

People can pay. Businesses can automate. Agents can act. But value moves only when identity, assets, purpose, and authority agree.

The future of money is autonomous. Certus makes it accountable.

Certus. Value, verified.”

## Optional 20-second technical proof montage

Use this only if the submission permits a longer video.

### On screen

Quick cuts of Monad explorer transactions, the Cleanverse A-Pass result, contract addresses, the simulation screen, SDK method names, and the audit PDF.

### Voiceover

“The demo runs on Monad Testnet, uses Cleanverse A-Pass and A-Token infrastructure, settles through deployed smart contracts, isolates failed batch rows, enforces agent mandates, binds proof of purpose, exposes typed APIs, and produces downloadable audit evidence.”

## Three-minute cut

If the hackathon limit is three minutes, keep these sections:

1. Cold open — 15 seconds.
2. Product idea — 20 seconds.
3. Successful payment — 40 seconds.
4. Refusal — 25 seconds.
5. Agent mandate — 35 seconds.
6. Payroll isolation — 25 seconds.
7. Audit evidence — 20 seconds.
8. Closing vision — 20 seconds.

Mention yield in one sentence during the closing montage instead of performing it live.

## Claims to use exactly

- “Privacy-aware identity administration,” not “private on-chain payments.”
- “Multi-chain policy architecture,” not “live cross-chain bridging.”
- “Sponsored custodial testnet bonus,” not “guaranteed yield” or “APY.”
- “Agent mandate and principal-controlled funding,” not “the AI owns the wallet.”
- “Verified settlement on Monad Testnet,” not “production mainnet settlement.”

## Recovery lines for live-demo delays

- Wallet delay: “The wallet retains final custody authorization; Certus never bypasses the principal.”
- Cleanverse delay: “The integration fails closed, so an unavailable identity provider cannot become an approval.”
- Transaction delay: “The intent and policy decision are already recorded; settlement completes only after chain confirmation.”
- Yield delay: “The verified rehearsal transactions are linked in the repository and visible on Monad Explorer.”
