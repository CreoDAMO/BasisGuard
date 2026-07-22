# BasisGuard

**Evidence Log & Tax Optimization Engine for Crypto Tax Compliance**

BasisGuard is a professional tax compliance platform that brings Circular 230 / IRC §6694 standards to every cryptocurrency transaction. Every position is classified with a cited IRS authority, a confidence tier, and a plain-language rationale — and nothing is ever classified without a real citation.

---

## Why BasisGuard

Crypto tax preparers face two problems that generic tools ignore:

1. **Defensibility** — When an IRS examiner asks "why did you classify this LP withdrawal as non-taxable?", the answer must cite a specific authority, not a software vendor's assumption. BasisGuard requires a citation for every position.

2. **Guidance gaps** — The IRS has not addressed dozens of common DeFi event types. BasisGuard makes the gap explicit: open-gap events are flagged, held for preparer review, and documented with the best available analogical authority — never silently classified as if guidance existed.

---

## Core Concepts

### Position Records

A Position Record is the atomic unit of the Evidence Log. Each one represents a single classified transaction and contains:

| Field | Description |
|-------|-------------|
| **Event type** | The economic nature of the transaction (spot trade, staking reward, LP deposit, etc.) |
| **Classification** | The tax treatment applied (taxable disposition, ordinary income, non-taxable transfer) |
| **Confidence tier** | The IRC §6694 / Circular 230 standard supporting the position (see table below) |
| **Rationale** | Plain-language explanation of the legal reasoning |
| **Cited authorities** | Specific IRS notices, Rev. Ruls., statutes, or cases that back the position |
| **Reviewer sign-off** | CPA/EA attestation with credential and timestamp |

Position Records are **immutable once signed**. When guidance changes or a position is upgraded, a superseding record is created that links back to the original — preserving the complete audit trail.

### Confidence Tiers (IRC §6694)

Tiers map directly to the preparer penalty standards under IRC §6694 and Circular 230:

| Tier | Standard | What it means |
|------|----------|---------------|
| 🟢 **Will Prevail** | >~80% likelihood | Multiple court-binding authorities directly on point |
| 🟡 **Should Prevail** | >~70% likelihood | At least one court-binding authority supports the position |
| 🟠 **More Likely Than Not** | >50% likelihood | IRS-binding authority (Notice, Rev. Rul.) directly supports the position |
| 🔵 **Substantial Authority** | ~40% likelihood | Weight of authority supports position; disclosure may be prudent |
| 🔴 **Reasonable Basis** | ~25% likelihood | Plausible legal argument exists; **Form 8275 disclosure required** |

No position can be assigned a higher tier than the weakest authority linked to it. The tier suggestion engine enforces this ceiling automatically.

### Tax Lot Inventory

The Lot Inventory tracks every currently-held tax lot — one row per acquired position — giving preparers a real-time ledger of cost basis and holding periods across all wallets and assets.

| Field | Description |
|-------|-------------|
| **Wallet / asset** | Which wallet holds the lot and what asset it represents |
| **Quantity** | Units held (or remaining after partial disposals) |
| **Cost basis** | Total and per-unit USD cost at acquisition |
| **Acquisition date** | Determines short-term vs. long-term holding period |
| **Status** | `open` (fully held), `partial` (partially disposed), `closed` (fully disposed) |
| **Realized gain/loss** | Populated on disposal; links back to the disposing position record |

Lots complement the Evidence Log: Position Records capture *what happened* (classified transactions), while the Lot Inventory captures *what is currently held* (basis and holding period ready for disposal matching). Accurate lot inventory is a prerequisite for specific-identification basis elections under Rev. Proc. 2024-28.

### Treatment Profiles

A Treatment Profile is a versioned ruleset that maps event types to default classifications and tiers. Profiles allow firms to standardize treatment across a client portfolio and run "what-if" delta analysis before switching to a new profile.

- **Active** profiles are applied automatically to new positions
- **Opt-in only** profiles require explicit client election and per-position preparer sign-off
- **Deprecated** profiles are retained for historical reference and audit trail integrity

### Authority Citations Library

Every classification must cite at least one authority from the library. Citations carry a strength rating:

- **Binding on courts** — Statutes (IRC), Treasury Decisions, Supreme Court cases
- **Binding on IRS only** — Notices, Revenue Rulings, Revenue Procedures
- **Non-binding persuasive** — Legislative history, academic commentary, non-acquiescence cases

The tier suggestion engine automatically computes the maximum defensible tier given the set of citations linked to a position.

---

## Workflows

### Standard classification flow

1. Transaction arrives → matched against active Treatment Profile rules
2. If a direct rule match exists and tier ≥ substantial_authority → auto-applied, no review required
3. If event type is an **open-gap** category (DeFi, NFTs, novel structures) → `requires_review = true`
4. CPA/EA reviews the position in the **Review Queue**, attests with credential, and signs off
5. Signed position is sealed in the Evidence Log

### Supersession flow (guidance changes)

When new IRS guidance modifies the correct treatment of a past event:

1. Open the existing Position Record
2. Click **Supersede** — enter the new classification, tier, rationale, and updated citations
3. A new record is created; the old one is marked `superseded_by` pointing to the new record
4. The **History** tab on any position shows the complete chain back to the original classification

### Export workflows

| Export type | Purpose | When to use |
|-------------|---------|-------------|
| **Audit Defense Package** | Complete evidence log with all citations for one tax year | IRS examination response |
| **Audit Package (Redacted)** | Same but wallet_id and tx_id masked | Third-party review without revealing client identifiers |
| **CPA Hand-off** | Summary + open action items + preparer checklist | Passing work to signing CPA before filing |
| **Comment Letter Prep** | Anonymized open-gap aggregate data | Drafting ABA/AICPA comments on IRS proposed guidance |

---

## Tax Optimizer (Tier 3)

`/tax-optimizer` — three tools in one page, all backed by the live lot inventory.

### What-If Sale Simulator

`GET /api/tax-optimizer/simulate?asset_symbol=BTC&quantity=0.5&wallet_id=optional`

Runs all four lot-selection strategies against your open lot inventory and ranks them by total tax impact, so you can choose the most advantageous method before executing a sale.

| Strategy | Description |
|---|---|
| **FIFO** | First In, First Out — IRS default under Rev. Proc. 2024-28 |
| **LIFO** | Last In, First Out |
| **HIFO** | Highest Cost First — minimizes realized gain |
| **Min Tax** | Long-term lots first (to preserve long-term treatment), then HIFO within each period |

Each strategy result shows short-term gain, long-term gain, total gain, and a full lot-by-lot breakdown. The ranked comparison table highlights the optimal strategy. All responses include an IRC §6694 / Rev. Proc. 2024-28 disclaimer.

### Unrealized-Loss Harvest Candidates

`GET /api/tax-optimizer/harvest?min_loss_usd=0&wallet_id=optional`

Scans open lots with unrealized losses and ranks them by magnitude — a **forward-looking** scanner distinct from the Realized-Loss Review page (which covers already-closed dispositions). Each candidate is annotated with wash-sale risk (conservative practitioner flag; the IRS has not extended IRC §1091 wash-sale rules to cryptocurrency).

### IRC §1014 Estate Basis Step-Up

`POST /api/tax-optimizer/estate-step-up`

Fetches historical prices from CoinGecko at a specified date of death and computes the stepped-up cost basis for every open lot acquired before that date. Results show per-unit original basis alongside FMV at death and total gain eliminated — the two per-unit figures sit side by side for direct comparison. Includes a mandatory IRC §1014 / qualified-appraisal disclaimer.

---

## Open-Gap Event Types

The following event types have no direct IRS guidance and always require preparer sign-off:

| Event type | Pending guidance | Notes |
|------------|-----------------|-------|
| LP deposit | Notice 2024-57 | Taxable exchange or non-recognition? |
| LP withdrawal | Notice 2024-57 | Disposition of LP tokens vs. return of capital? |
| DeFi yield | Notice 2024-57 | Income on receipt or deferred? |
| Staking rewards (accrual) | Rev. Rul. 2023-14 (partial) | Cash-basis covered; accrual-basis open |
| NFT sales (collectibles question) | Notice 2023-27 | §408(m) look-through incomplete |

---

## Compliance Safeguards

- **Export block** — Audit packages warn when `requires_review_count > 0`. CPAs can override with explicit acknowledgment.
- **Stale position flagging** — Reasonable Basis positions older than 180 days are automatically flagged (`is_stale = true`) for re-evaluation. New guidance may have issued.
- **Tier ceiling enforcement** — The tier suggestion engine prevents classifying a position at a higher tier than its citations can support.
- **Immutable sign-off** — Once a position is signed, the reviewer name, credential, and timestamp are sealed. Changes require a superseding record.
- **Citation cascade protection** — `DELETE /api/citations/:id` is blocked with HTTP 409 if the citation backs any signed position. The response includes the blocking `signed_position_id` so the caller knows which positions must be superseded first.
- **Form 8275 reminder** — All Reasonable Basis positions appear in the CPA Hand-off checklist with an explicit Form 8275 disclosure reminder.
- **Credential encryption** — Exchange API secrets are encrypted at rest with AES-256-GCM keyed to `SESSION_SECRET`. Secrets are never logged or returned in plain text after saving.

---

## Connections & Data Import

BasisGuard pulls transaction history directly from exchanges, eliminating manual CSV uploads and reducing transcription risk. All credentials are encrypted at rest with AES-256-GCM. The **Connections** page (sidebar → Operations → Connections) provides a UI for all three supported exchanges.

### Coinbase

Supports both **CDP Advanced Trade** keys (JWT/ES256, key name + EC private key in PEM) and **Legacy V2** keys (HMAC, standard key + secret). The key format is detected automatically from the key name.

| Coinbase type | BasisGuard event type | Notes |
|---|---|---|
| `buy` / `receive` | `taxable_acquisition` | Cost basis locked at settlement |
| `sell` / `send` | `taxable_disposition` | Realizes gain/loss |
| `trade` | `crypto_swap` | Exchange between two assets |
| `staking_transfer` / `earn_payout` / `inflation_reward` | `staking_reward` | Ordinary income on receipt — Rev. Rul. 2023-14 |
| `wrap_asset` / `unwrap_asset` | `bridge_transfer` | Open-gap; flagged for preparer review |
| `exchange_deposit` / `exchange_withdrawal` | `non_taxable_transfer` | CEX-internal moves with no realization |
| `fiat_deposit` / `fiat_withdrawal` | `fiat_deposit` / `fiat_withdrawal` | Non-taxable cash flows |
| All other types | `coinbase_<type>` | Lands in review queue automatically |

Key links: [CDP keys](https://portal.cdp.coinbase.com/access/api) · [Legacy keys](https://www.coinbase.com/settings/api)

### Kraken

Uses the Kraken REST API v2 Ledger History endpoint. Requires a standard API Key + Private Key (base64) generated with `Query Ledger Entries` permission.

| Kraken ledger type | BasisGuard event type |
|---|---|
| `trade` | `taxable_disposition` or `purchase` |
| `deposit` | `non_taxable_transfer` |
| `withdrawal` | `non_taxable_transfer` |
| `staking` | `staking_reward` |
| Other types | Mapped via `mapKrakenEventType` → review queue |

Key link: [Manage API keys](https://www.kraken.com/u/security/api)

### Gemini

Uses the Gemini REST API to pull trade history and transfer history. Requires a standard API Key + Secret with `Auditor` scope (read-only is sufficient for sync).

| Gemini type | BasisGuard event type |
|---|---|
| Trades (buy/sell) | `taxable_disposition` or `purchase` |
| Deposits | `non_taxable_transfer` |
| Withdrawals | `non_taxable_transfer` |
| Earn/Staking | `staking_reward` |
| Other transfers | Mapped via `mapGeminiEventType` → review queue |

Key link: [Manage API keys](https://exchange.gemini.com/settings/api)

### Common behavior across all exchanges

- Transactions are deduplicated by `tx_hash` — syncing twice never creates duplicates
- Staking rewards and open-gap events are automatically flagged `requires_review = true`
- CEX transactions are stored under a virtual chain row (no on-chain address required)
- Server-level credentials can be set as Replit Secrets (`COINBASE_API_KEY` / `COINBASE_API_SECRET`); per-user credentials entered via the Connections UI are stored encrypted in the `exchange_connections` table

---

## Key IRS Authorities

| Citation | Type | Relevance |
|----------|------|-----------|
| IRC §1001 | Statute | Gain/loss on disposition — foundational for all crypto trades |
| IRC §1014 | Statute | Estate basis step-up to FMV at date of death |
| IRC §6694 | Statute | Preparer penalty standards — maps directly to confidence tiers |
| Notice 2014-21 | Notice | Virtual currency is property; each disposition is a realization event |
| Rev. Rul. 2019-24 | Rev. Rul. | Hard forks and airdrops — ordinary income on receipt with dominion & control |
| Rev. Rul. 2023-14 | Rev. Rul. | Staking rewards — ordinary income on receipt (cash-basis) |
| Notice 2023-27 | Notice | NFT look-through analysis for §408(m) collectible determination |
| Notice 2024-57 | Notice | DeFi open gap acknowledgment; defers LP/yield/staking guidance |
| Rev. Proc. 2024-28 | Rev. Proc. | Cost basis accounting methods (FIFO/LIFO/SpecID) for crypto |
| T.D. 10000 (2024) | Treasury Decision | Custodial broker 1099-DA reporting final regulations |
| T.D. 10021 (2024) ⚠️ REPEALED | Treasury Decision | DeFi/non-custodial front-end broker rules — repealed by Congress via CRA (H.J. Res. 25, Apr 10 2025); retained as historical reference only |
| Cottage Savings v. Commissioner | Case | Realization doctrine — material difference test for taxable exchanges |

---

## Technical Stack

- **Frontend**: React + Vite, Tailwind CSS v4, TanStack Query, wouter, Recharts
- **API**: Express 5, OpenAPI-first (Orval codegen), Zod validation
- **Auth**: Clerk (Replit-managed tenant) — cookie-based sessions, JIT user provisioning
- **Database**: PostgreSQL 16 + Drizzle ORM
- **EVM decoding**: viem 2 (`decodeEventLog`, public client for receipt fetching)
- **Price oracle**: CoinGecko (current prices via `/simple/price`; historical via `/coins/{id}/history`)
- **Monorepo**: pnpm workspaces

For developer setup, architecture details, and all API routes, see [`replit.md`](./replit.md).

---

## Disclaimer

BasisGuard is a workflow and evidence management tool. It does not constitute legal or tax advice. All positions should be reviewed by a qualified tax professional. Classification of cryptocurrency transactions involves unsettled legal questions; users are solely responsible for the accuracy and completeness of their tax filings.
