# BasisGuard

**Evidence Log & Tax Optimization Engine for Crypto Tax Compliance**

BasisGuard is a professional tax compliance platform that brings Circular 230 / IRC §6694 standards to every cryptocurrency transaction. Every position is classified with a cited IRS authority, a confidence tier, and a plain-language rationale — and nothing is ever classified without a real citation.

**Live:** [basisguard-web.onrender.com](https://basisguard-web.onrender.com) · API: [basisguard-api.onrender.com/api/healthz](https://basisguard-api.onrender.com/api/healthz)

---

## Table of Contents

1. [Why BasisGuard](#why-basisguard)
2. [Architecture](#architecture)
3. [Core Concepts](#core-concepts)
4. [Workflows](#workflows)
5. [Tax Optimizer](#tax-optimizer-tier-3)
6. [Open-Gap Event Types](#open-gap-event-types)
7. [Compliance Safeguards](#compliance-safeguards)
8. [Connections & Data Import](#connections--data-import)
9. [Key IRS Authorities](#key-irs-authorities)
10. [Technical Stack](#technical-stack)
11. [API Routes](#api-routes)
12. [Frontend Pages](#frontend-pages)
13. [Protocol Adapter Layer](#protocol-adapter-layer)
14. [Testing](#testing)
15. [Setup & Deployment](#setup--deployment)
16. [Environment Variables](#environment-variables)
17. [LinkedIn & Coinbase OAuth](#linkedin--coinbase-oauth-clerk-dashboard)
18. [GitHub Actions — Keep Render Alive](#github-actions--keep-render-alive)
19. [Known Gotchas](#known-gotchas)
20. [What Is Not Yet Built](#what-is-not-yet-built)
21. [Disclaimer](#disclaimer)

---

## Why BasisGuard

Crypto tax preparers face two problems that generic tools ignore:

1. **Defensibility** — When an IRS examiner asks "why did you classify this LP withdrawal as non-taxable?", the answer must cite a specific authority, not a software vendor's assumption. BasisGuard requires a citation for every position.

2. **Guidance gaps** — The IRS has not addressed dozens of common DeFi event types. BasisGuard makes the gap explicit: open-gap events are flagged, held for preparer review, and documented with the best available analogical authority — never silently classified as if guidance existed.

---

## Architecture

pnpm monorepo — two artifacts, four shared libraries.

```
artifacts/
  api-server/       Express 5 REST API (port 8080)
  basisguard/       React + Vite frontend (port 18252)
lib/
  api-spec/         OpenAPI contract (source of truth for Orval codegen)
  api-zod/          Generated Zod schemas — do not edit by hand
  api-client-react/ Generated TanStack Query hooks — do not edit by hand
  db/               Drizzle ORM schema + push config
scripts/
  seed-citations.sql   10 IRS authority citations (idempotent)
  seed-protocols.sql   Chains + Aave/Uniswap protocol rows (idempotent)
  post-merge.sh        Runs db:push + seeds after task-agent merges
```

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

### Database Schema

| Table | Purpose |
|---|---|
| `users` | Clerk-linked accounts; roles: `super_admin`, `reviewer`, `cpa_partner` |
| `authority_citations` | 10 seeded IRS legal authorities (Rev. Rul., T.D., Notice, IRC §) |
| `treatment_profiles` | Versioned rule sets for classification policy |
| `position_records` | Append-only evidence log; `superseded_by` FK for audit trail; `amount_usd` for P&L |
| `position_citations` | Junction: which authorities back each position |
| `raw_transactions` | Ingested transaction data; `processed` + `position_record_id` set by adapters |
| `lots` | Tax lot inventory — one row per acquired lot; tracks cost basis, acquisition date, status, and optional realized gain/loss |
| `chains` | Supported blockchain networks (slug, RPC URL, metadata) |
| `protocols` | DeFi protocols (slug links to adapter class; FK to chain) |
| `chain_submissions` | Community chain onboarding requests |
| `protocol_submissions` | Community protocol onboarding requests |
| `notifications` | Per-user notification log (stale positions, review queue, sync errors) |
| `notification_preferences` | Per-user toggles for each notification category |
| `exchange_connections` | Per-user exchange credentials (API key + AES-256-GCM encrypted secret) |

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
- Server-level credentials can be set as environment variables (`COINBASE_API_KEY` / `COINBASE_API_SECRET`); per-user credentials entered via the Connections UI are stored encrypted in the `exchange_connections` table

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

| Layer | Technology |
|---|---|
| Runtime | Node.js 22, TypeScript 5.9 |
| Frontend | React 19, Vite 7, Tailwind CSS v4, wouter, TanStack Query, Recharts |
| API | Express 5 |
| Auth | Clerk (`@clerk/express` + `@clerk/react`) — Replit-managed tenant |
| Database | PostgreSQL 16 (Neon) + Drizzle ORM |
| Validation | Zod v4, drizzle-zod |
| API codegen | Orval (generates typed hooks + Zod schemas from `lib/api-spec/openapi.yaml`) |
| EVM decoding | viem 2 (`decodeEventLog`, public client for receipt fetching) |
| Price oracle | CoinGecko (current: `/simple/price`; historical: `/coins/{id}/history`) |
| Build | esbuild |
| Tests | Vitest 4 |
| Monorepo | pnpm workspaces |
| Deployment | Render (Web Service + Static Site) + Neon PostgreSQL |

---

## API Routes

All routes except `GET /api/healthz` require a valid Clerk session.

### Auth & User

| Method | Path | Auth |
|---|---|---|
| GET | `/api/healthz` | Public |
| GET / PATCH | `/api/me` | Any authenticated |

### Dashboard & Intelligence

| Method | Path | Auth |
|---|---|---|
| GET | `/api/dashboard/summary` | Any authenticated |
| GET | `/api/dashboard/recent-activity` | Any authenticated |
| GET | `/api/intelligence/suggest` | Any authenticated |
| GET | `/api/intelligence/stale` | Any authenticated |

### Positions (Evidence Log)

| Method | Path | Auth |
|---|---|---|
| GET / POST | `/api/positions` | Any authenticated |
| GET | `/api/positions/review-queue` | Any authenticated |
| GET | `/api/positions/harvest-candidates` | Any authenticated |
| GET | `/api/positions/tier-suggestion` | Any authenticated |
| GET / PATCH | `/api/positions/:id` | Any authenticated |
| POST | `/api/positions/:id/signoff` | `super_admin` or `reviewer` |
| POST | `/api/positions/:id/supersede` | Any authenticated |
| GET | `/api/positions/:id/history` | Any authenticated |
| POST | `/api/positions/batch-signoff` | `super_admin` or `reviewer` |

### Transactions & Classification

| Method | Path | Auth |
|---|---|---|
| GET | `/api/transactions` | Any authenticated |
| POST | `/api/transactions/ingest` | Any authenticated |
| POST | `/api/transactions/classify` | Any authenticated |

### Tax Optimizer

All responses use snake_case keys. Serializers live in `routes/tax-optimizer.ts` and are exported for contract tests.

| Method | Path | Description |
|---|---|---|
| GET | `/api/tax-optimizer/simulate` | What-if sale simulation — all 4 strategies, ranked by total gain. Params: `asset_symbol`, `quantity`, `wallet_id` (optional) |
| GET | `/api/tax-optimizer/harvest` | Ranked unrealized-loss harvest candidates. Params: `min_loss_usd` (default 0), `wallet_id` (optional) |
| POST | `/api/tax-optimizer/estate-step-up` | IRC §1014 basis step-up at date of death. Body: `{ wallet_id, step_up_date, asset_symbols? }` |

### Export

| Method | Path | Description |
|---|---|---|
| GET | `/api/export/audit-package` | Full evidence log for a tax year |
| GET | `/api/export/pattern-report` | Aggregate event-type / tier distribution |
| GET | `/api/export/comment-letter` | Anonymized open-gap data for IRS rulemaking comments |
| GET | `/api/export/cpa-handoff` | Summary + preparer checklist for signing CPA |
| GET | `/api/export/dossier` | All four above in one parallel-fetched envelope |

### Library

| Method | Path | Notes |
|---|---|---|
| GET / POST / PATCH | `/api/citations` | POST and PATCH are `ADMIN_ROLES`-gated |
| DELETE | `/api/citations/:id` | `super_admin` or `reviewer`; blocked with HTTP 409 if linked to any signed position |
| GET / POST / PATCH | `/api/profiles`, `/api/profiles/:id` | |
| GET | `/api/profiles/:id/delta` | |

### Chains & Protocols

| Method | Path |
|---|---|
| GET / POST | `/api/chains` |
| GET | `/api/chains/:id` |
| GET / POST | `/api/protocols` |
| GET | `/api/protocols/:id` |
| POST | `/api/submit/chain`, `/api/submit/protocol` |

### Lot Inventory

Query params for `GET /api/lots`: `wallet_id`, `asset_symbol`, `status` (`open`/`closed`/`partial`), `chain_id`, `limit` (1–200, default 50), `offset` (default 0).

| Method | Path | Auth |
|---|---|---|
| GET / POST | `/api/lots` | Any authenticated |
| GET | `/api/lots/:id` | Any authenticated |
| PATCH | `/api/lots/:id` | `ADMIN_ROLES`-gated |
| DELETE | `/api/lots/:id` | `ADMIN_ROLES`-gated |

### Exchange Connections

Same route shape for each exchange (`{exchange}` = `coinbase` | `kraken` | `gemini`). Sync routes carry `strictLimiter`.

| Method | Path |
|---|---|
| GET / POST / DELETE | `/api/{exchange}/connection` |
| POST | `/api/{exchange}/sync` |

### Notifications

| Method | Path |
|---|---|
| GET | `/api/notifications` |
| PATCH | `/api/notifications/:id/read` |
| POST | `/api/notifications/read-all` |
| GET / PATCH | `/api/notifications/preferences` |

### Admin

| Method | Path | Auth |
|---|---|---|
| GET | `/api/admin/submissions` | `super_admin` or `reviewer` |
| PATCH | `/api/admin/submissions/chain/:id/approve` | `super_admin` or `reviewer` |
| PATCH | `/api/admin/submissions/chain/:id/reject` | `super_admin` or `reviewer` |
| PATCH | `/api/admin/submissions/protocol/:id/approve` | `super_admin` or `reviewer` |
| PATCH | `/api/admin/submissions/protocol/:id/reject` | `super_admin` or `reviewer` |
| POST | `/api/admin/registry/refresh` | `super_admin` or `reviewer` |
| GET | `/api/metrics` | `super_admin` or `reviewer` |

---

## Frontend Pages

| Page | Route | Description |
|---|---|---|
| Landing | `/` | Public; sign in / request access |
| Sign in / up | `/sign-in`, `/sign-up` | Clerk-hosted flows |
| Command Center | `/dashboard` | Tier breakdown chart, pending count, recent activity |
| Evidence Log | `/positions` | Filterable table of all position records |
| Position Detail | `/positions/:id` | Rationale, citations, tier, reviewer sign-off |
| Review Queue | `/review-queue` | Pre-filtered pending positions; batch sign-off modal |
| Citations | `/citations` | Searchable IRS authority citations |
| Profiles | `/profiles` | Versioned treatment rule sets + delta report |
| Audit Export | `/export` | IRS-Ready Dossier, audit package, pattern report, CPA handoff |
| Lot Inventory | `/lots` | Full tax lot ledger — cost basis, acquisition date, status filter, paginated; manual entry and auto-population from position records |
| Realized-Loss Review | `/harvest` | Realized taxable-disposition losses + wash-sale risk flags (30-day window) |
| Tax Optimizer | `/tax-optimizer` | Three tabs: What-If Sale Simulator (all 4 strategies ranked), Unrealized-Loss Harvest Candidates (forward-looking), IRC §1014 Estate Basis Step-Up (CoinGecko historical prices) |
| Connections | `/connections` | Exchange credential entry and sync for Coinbase (CDP + Legacy), Kraken, and Gemini |
| Notifications | `/notifications/preferences` | Toggle stale/review-queue/sync-error alert preferences |
| Chain Registry | `/chains` | Supported blockchains and community submissions |
| Onboarding | `/submissions` | Admin review of chain/protocol submissions |

---

## Protocol Adapter Layer

Automatic classification of on-chain DeFi events into Position Records, without manual entry.

### Architecture

```
core/
  reviewRules.ts         OPEN_GAP_EVENT_TYPES, computeRequiresReview, isStale — no DB deps
  washSaleDetector.ts    Pure wash-sale detection functions — no DB deps
  taxOptimizer.ts        simulateSale, compareStrategies, harvestRecommendations, estateStepUp — no DB deps
  createPosition.ts      Shared insert path used by both ingest route and all adapters
  protocolRegistry.ts    Singleton registry; keyed by protocol UUID
  adapters/
    base.ts              BaseProtocolAdapter abstract class + ParsedEvent interface
    aave.ts              Aave V3 (Supply, Borrow, Repay, Withdraw, LiquidationCall)
    uniswap.ts           Uniswap V3 (Swap → taxable_disposition, multi-hop aware)
```

### How Classification Works

1. Raw transactions are ingested via `POST /api/transactions/ingest` into `raw_transactions` with `processed=false`.
2. `POST /api/transactions/classify` walks unprocessed rows, looks up each row's `protocol_id` in the registry, runs the adapter's `parse()` method, and creates Position Records via `createPosition.ts`.
3. Each adapter tries a **fast path** first — if `rawData` contains `{ event_name, args }` (pre-decoded by an indexer), it skips the RPC call. Otherwise it fetches the receipt via viem and decodes logs against the protocol ABI.

### Activating Adapters

The registry initializes at server startup and lazily re-initializes on the first classify call. After seeding, call `POST /api/admin/registry/refresh` — returns `{ adapters: N }` confirming pickup without a server restart.

Run `scripts/seed-protocols.sql` (idempotent — `ON CONFLICT DO NOTHING`).

The server logs `Protocol registry initialized — adapters: 10` on startup when all rows are present.

### Seeded Chains & Protocols

| Protocol | Chain | Protocol UUID |
|---|---|---|
| Aave V3 | Ethereum | `cc000001-…-0001` |
| Aave V3 | Arbitrum | `cc000001-…-0002` |
| Aave V3 | Base | `cc000001-…-0003` |
| Aave V3 | OP Mainnet | `cc000001-…-0004` |
| Aave V3 | Polygon | `cc000001-…-0005` |
| Uniswap V3 | Ethereum | `cc000001-…-0006` |
| Uniswap V3 | Arbitrum | `cc000001-…-0007` |
| Uniswap V3 | Base | `cc000001-…-0008` |
| Uniswap V3 | OP Mainnet | `cc000001-…-0009` |
| Uniswap V3 | Polygon | `cc000001-…-0010` |

Chain UUIDs use the `bb000001-…-{01-05}` pattern (ethereum=01, arbitrum=02, base=03, optimism=04, polygon=05).

### Authority Citations Seeded

| UUID suffix | Authority |
|---|---|
| `…000001` | Notice 2014-21 (crypto as property) |
| `…000002` | Rev. Rul. 2023-14 (staking rewards) |
| `…000003` | Cottage Savings Ass'n, 499 U.S. 554 (realization doctrine) |
| `…000004` | Rev. Proc. 2024-28 (basis allocation) |
| `…000005` | Rev. Rul. 2019-24 (hard forks) |
| `…000006` | Notice 2024-57 (open-gap DeFi categories) |
| `…000007` | T.D. 10000 (broker 1099-DA) |
| `…000008` | Notice 2023-27 (NFT look-through) |
| `…000009` | IRC §1001 (realization, gain/loss on disposition) |
| `…000010` | IRC §165 (loss deductions) |

---

## Testing

```bash
pnpm --filter @workspace/api-server run test           # run all tests
pnpm --filter @workspace/api-server run test:watch     # watch mode
pnpm --filter @workspace/api-server run test:coverage  # coverage report
```

**253 tests passing across 14 files** (43 additional todo stubs):

| File | What it covers |
|---|---|
| `src/test/reviewRules.test.ts` | `OPEN_GAP_EVENT_TYPES` membership, `computeRequiresReview` all rule branches, `isStale` boundary conditions |
| `src/test/washSale.test.ts` | `detectWashSalePairs` (window boundaries, null wallet/date, gain+gain no-pair), `buildHarvestCandidates` sort order and pair annotation |
| `src/test/registry.test.ts` | `ProtocolRegistry` init with empty tables, `initialized` flag reset on mid-init failure, `parseTransaction` returns `[]` for null/unknown protocol |
| `src/test/taxOptimizer.test.ts` | `simulateSale` (all 4 strategies, partial fill, null basis), `compareStrategies` sort stability, `harvestRecommendations`, `estateStepUp` lot filtering |
| `src/test/taxOptimizerRoutes.test.ts` | Supertest contract tests: snake_case key presence on all three Tax Optimizer HTTP responses; absence of camelCase leakage |
| `src/test/priceOracle.test.ts` | Cache isolation, `clearCache()` in beforeEach, CoinGecko mock response shapes |
| *(8 additional files)* | Positions security, lot matching, FIFO wiring, adapter parsing, serializer contracts |

Pure functions (no DB dependencies) live in `core/reviewRules.ts`, `core/washSaleDetector.ts`, and `core/taxOptimizer.ts` — testable without mocking.

---

## Setup & Deployment

### Replit (Development)

1. **Clerk** — add `CLERK_SECRET_KEY` and `CLERK_PUBLISHABLE_KEY` as Replit Secrets (from https://dashboard.clerk.com).
2. **Schema** — `pnpm --filter @workspace/db run push` (runs automatically via `scripts/post-merge.sh` after task-agent merges).
3. **Citations** — `psql $DATABASE_URL -f scripts/seed-citations.sql`
4. **Chains & Protocols** — `psql $DATABASE_URL -f scripts/seed-protocols.sql`
5. **SESSION_SECRET** — add as a Replit Secret.

### Render (Production)

`render.yaml` at the repo root defines two services (API web service + static site frontend). Both run on the free tier. The database is Neon PostgreSQL (permanent free tier).

**Before first deploy:**

1. Create a Neon database and copy the connection string.
2. In Render dashboard, set these env vars on **basisguard-api**:
   - `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `SESSION_SECRET`, `DATABASE_URL`
   - `CORS_ALLOWED_ORIGINS` → `https://basisguard-web.onrender.com`
3. Set these on **basisguard-web** (build-time):
   - `VITE_CLERK_PUBLISHABLE_KEY` (same value as `CLERK_PUBLISHABLE_KEY`)
   - `VITE_CLERK_PROXY_URL` → `https://basisguard-api.onrender.com/api/__clerk`

**After first deploy** (one-time, via Render shell or `psql`):

```bash
psql $DATABASE_URL -f scripts/seed-citations.sql
psql $DATABASE_URL -f scripts/seed-protocols.sql
```

**Build pipeline (automatic on every deploy):**

```yaml
# basisguard-api buildCommand:
npm install -g pnpm@10.26.1 &&
pnpm install --no-frozen-lockfile &&
pnpm --filter @workspace/api-server run build &&
pnpm db:push      # ← Drizzle push runs migrations idempotently at build time
```

Schema migrations run automatically as part of the build step on every deploy — no separate migration step needed.

### Common Commands

```bash
# Development
pnpm --filter @workspace/api-server run dev   # API on :8080
pnpm --filter @workspace/basisguard run dev   # Frontend on :18252

# Tests
pnpm --filter @workspace/api-server run test

# Schema
pnpm --filter @workspace/db run push          # Push schema changes to dev DB

# Codegen (run after editing lib/api-spec/openapi.yaml)
pnpm --filter @workspace/api-spec run codegen

# Type check
pnpm run typecheck

# Seed (idempotent — ON CONFLICT DO NOTHING)
psql $DATABASE_URL -f scripts/seed-citations.sql
psql $DATABASE_URL -f scripts/seed-protocols.sql
```

---

## Environment Variables

### Backend (API Server)

| Variable | Purpose | Where to set |
|---|---|---|
| `DATABASE_URL` | Neon PostgreSQL connection string | Render dashboard / Replit |
| `CLERK_SECRET_KEY` | Clerk backend key | Render dashboard / Replit Secret |
| `CLERK_PUBLISHABLE_KEY` | Clerk publishable key (also proxied to frontend) | Render dashboard / Replit Secret |
| `SESSION_SECRET` | Long random string — keys AES-256-GCM exchange credential encryption | Render dashboard / Replit Secret |
| `CORS_ALLOWED_ORIGINS` | Comma-separated list of allowed frontend origins in production | Render dashboard |

### Frontend (Static Site — build-time)

| Variable | Purpose | Where to set |
|---|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | Same value as `CLERK_PUBLISHABLE_KEY` | Render dashboard / Replit Secret |
| `VITE_CLERK_PROXY_URL` | Set to `https://basisguard-api.onrender.com/api/__clerk` in production; **intentionally empty in dev** | Render dashboard only |

---

## LinkedIn & Coinbase OAuth (Clerk Dashboard)

Both are configured entirely in the Clerk dashboard — no code changes required.

- **LinkedIn**: Dashboard → User & Authentication → Social Connections → Enable LinkedIn
- **Coinbase**: Dashboard → User & Authentication → Social Connections → Add Custom Provider
  - OAuth 2.0 app credentials from https://www.coinbase.com/settings/api
  - Authorization URL: `https://www.coinbase.com/oauth/authorize`
  - Token URL: `https://api.coinbase.com/oauth/token`
  - Scopes: `wallet:user:read,wallet:user:email`

> **Note:** Production OAuth requires switching from a `pk_test_` key to a `pk_live_` key in the Clerk dashboard. The current deploy uses development keys, which causes `POST /api/__clerk/v1/dev_browser` to return 400 from the live frontend — this is expected behavior and doesn't break authentication for users.

---

## GitHub Actions — Keep Render Alive

`.github/workflows/keep-alive.yml` pings both Render services every 10 minutes to prevent cold starts on the free tier.

**Known issue with the current implementation:** `curl --max-time 30` exits with code 28 on timeout, and because the shell runs under `bash -e`, that non-zero exit fails the step before the warning block can fire. A cold-start timeout registers as a hard workflow failure rather than a warning.

The correct `curl` invocation absorbs the exit code:

```yaml
- name: Ping API health endpoint
  run: |
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 \
      https://basisguard-api.onrender.com/api/healthz || echo "000")
    echo "HTTP status: $HTTP_CODE"
    if [ "$HTTP_CODE" != "200" ]; then
      echo "::warning::Health check returned $HTTP_CODE (expected 200)"
    fi
```

Alternative with no workflow changes: configure a free [UptimeRobot](https://uptimerobot.com) or [cron-job.org](https://cron-job.org) monitor against `https://basisguard-api.onrender.com/api/healthz` — no secrets required since the endpoint is public.

---

## Known Gotchas

- `timestamptz` is not exported from `drizzle-orm/pg-core` — use `timestamp("col", { withTimezone: true })` instead.
- Google Fonts `@import url(...)` must come **before** `@import 'tailwindcss'` in `index.css`, or PostCSS errors.
- Static Express routes (`/positions/review-queue`, `/positions/harvest-candidates`, etc.) must be declared **before** parameterized routes (`/positions/:id`) in the same router.
- DB seeding uses `psql` direct SQL — Node `--experimental-strip-types` cannot resolve extensionless ESM imports from workspace packages.
- Orval generates `api.ts` (Zod) and `types/` (TS) from the same OpenAPI spec. Inline anonymous request bodies generate the same name in both — fix by extracting to named `$ref` schemas in the spec.
- `VITE_CLERK_PROXY_URL` is **intentionally empty in development**. Do not gate on `NODE_ENV`.
- Tailwind v4 requires `tailwindcss({ optimize: false })` in `vite.config.ts` when Clerk is present, and `@layer theme, base, clerk, components, utilities;` before `@import 'tailwindcss'` in `index.css`.
- Price oracle cache is module-level — call `clearCache()` in `beforeEach` in tests or the fetch spy never fires.
- Tax Optimizer route serializers must be used for all three endpoints; the core functions return camelCase and the HTTP contract is snake_case. Do not spread core types directly into `res.json()`.
- `req.params` values are `string | string[]` in Express 5 types — use `req.params.id as string` before passing to Drizzle `eq()` to avoid TS2769.
- `db.transaction()` passes `PgTransaction` not `NodePgDatabase` — use `Parameters<Parameters<typeof db["transaction"]>[0]>[0]` as the Tx type.
- `Record<string, typeof mainnet>` rejects other viem chains — use `Record<string, Chain>` with `Chain` imported from `"viem"`.
- After adding new schema files to `lib/db`, run `npx tsc -b lib/db/tsconfig.json` to emit `.d.ts` files before typechecking `api-server` (project references read `dist/`, not `src/`).

---

## What Is Not Yet Built

| Feature | Notes |
|---|---|
| **`/transactions` ingest page** | Frontend page and App.tsx route were never created; the API (`GET /api/transactions`, `POST /api/transactions/ingest`, `POST /api/transactions/classify`) exists and works |
| **FIFO lot matching end-to-end validation** | `core/lotMatching.ts` is written and wired into `createPosition.ts`; needs real transaction data end-to-end test |
| **OpenAPI spec for new endpoints** | `/notifications`, `/exchanges`, `/metrics`, `/tax-optimizer` are implemented but not yet documented in `lib/api-spec/openapi.yaml` |
| **Uniswap V3 LP adapters** (Mint, Burn, Collect) | LP deposit/withdrawal treatment is Notice 2024-57 open-gap — intentionally deferred until guidance issues |
| **Bridge / staking adapters** | Pending IRS guidance; Notice 2024-57 categories |
| **`amount_usd` backfill** | Positions created before the column existed have `amount_usd=null`; harvest scanner shows them but cannot sort by dollar value |
| **Charitable donation FMV calculator** | Requires FMV oracle — same CoinGecko path as estate step-up; not yet wired to a UI |
| **Kraken / Gemini live sync validation** | Routes, clients, and UI are complete; end-to-end smoke test requires real API credentials |
| **Production Clerk keys** | Currently using `pk_test_` keys; LinkedIn and Coinbase OAuth will be fully production-ready after switching to `pk_live_` in the Clerk dashboard |

---

## Disclaimer

BasisGuard is a workflow and evidence management tool. It does not constitute legal or tax advice. All positions should be reviewed by a qualified tax professional. Classification of cryptocurrency transactions involves unsettled legal questions; users are solely responsible for the accuracy and completeness of their tax filings.
