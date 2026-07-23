# BasisGuard

A crypto tax compliance evidence platform for licensed CPAs and authorized partners. Every DeFi transaction is classified into an immutable **Position Record** with a confidence tier drawn from Circular 230 / IRC §6694 preparer-penalty standards, a cited IRS authority, and a plain-language rationale. Nothing is classified without a cited reason.

---

## Architecture

pnpm monorepo — three artifacts, two shared libraries.

```
artifacts/
  api-server/       Express 5 REST API (port 8080)
  basisguard/       React + Vite frontend (port 18252)
lib/
  api-spec/         OpenAPI contract (source of truth for Orval codegen)
  api-zod/          Generated Zod schemas (do not edit by hand)
  api-client-react/ Generated TanStack Query hooks (do not edit by hand)
  db/               Drizzle ORM schema + push config
```

---

## Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20, TypeScript 5.9 |
| Frontend | React 18, Vite, Tailwind CSS v4, wouter, TanStack Query, Recharts |
| API | Express 5 |
| Auth | Clerk (`@clerk/express` + `@clerk/react`) — external tenant (your own Clerk dashboard) |
| Database | PostgreSQL 16 + Drizzle ORM |
| Validation | Zod v4, drizzle-zod |
| API codegen | Orval (generates typed hooks + Zod schemas from `lib/api-spec/openapi.yaml`) |
| EVM decoding | viem 2 (`decodeEventLog`, public client for receipt fetching) |
| Price oracle | CoinGecko (current: `/simple/price`; historical: `/coins/{id}/history`) |
| Build | esbuild |
| Tests | Vitest 4 |

---

## Database Schema

| Table | Purpose |
|---|---|
| `users` | Clerk-linked accounts; roles: `super_admin`, `reviewer`, `cpa_partner` |
| `authority_citations` | 10 seeded IRS legal authorities (Rev. Rul., T.D., Notice, IRC §) |
| `treatment_profiles` | Versioned rule sets for classification policy |
| `position_records` | Append-only evidence log; `superseded_by` FK for audit trail; `amount_usd` for P&L |
| `position_citations` | Junction: which authorities back each position |
| `raw_transactions` | Ingested transaction data; `processed` + `position_record_id` set by adapters |
| `lots` | Tax lot inventory — one row per acquired lot; tracks cost basis, acquisition date, status (open/closed/partial), and optional realized gain/loss on disposal |
| `chains` | Supported blockchain networks (slug, RPC URL, metadata) |
| `protocols` | DeFi protocols (slug links to adapter class; FK to chain) |
| `chain_submissions` | Community chain onboarding requests |
| `protocol_submissions` | Community protocol onboarding requests |
| `notifications` | Per-user notification log (stale positions, review queue, sync errors) |
| `notification_preferences` | Per-user toggles for each notification category |
| `exchange_connections` | Per-user exchange credentials (API key + AES-256-GCM encrypted secret) |

### Key columns

| Column | Table | Type | Purpose |
|---|---|---|---|
| `amount_usd` | `position_records` | `double precision` (nullable) | Realized gain/loss in USD; set by adapters; used by loss-harvesting scanner |
| `cost_basis_per_unit_usd` | `lots` | `double precision` (nullable) | Pre-computed per-unit basis; used directly by Tax Optimizer harvest tab |

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

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/tax-optimizer/simulate` | Any authenticated | What-if sale simulation — all 4 strategies, ranked by total gain. Params: `asset_symbol`, `quantity`, `wallet_id` (optional) |
| GET | `/api/tax-optimizer/harvest` | Any authenticated | Ranked unrealized-loss harvest candidates. Params: `min_loss_usd` (default 0), `wallet_id` (optional) |
| POST | `/api/tax-optimizer/estate-step-up` | Any authenticated | IRC §1014 basis step-up at date of death. Body: `{ wallet_id, step_up_date, asset_symbols? }` |

### Export

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/export/audit-package` | Any authenticated | Full evidence log for a tax year |
| GET | `/api/export/pattern-report` | Any authenticated | Aggregate event-type / tier distribution |
| GET | `/api/export/comment-letter` | Any authenticated | Anonymized open-gap data for IRS rulemaking comments |
| GET | `/api/export/cpa-handoff` | Any authenticated | Summary + preparer checklist for signing CPA |
| GET | `/api/export/dossier` | Any authenticated | All four above combined in one parallel-fetched envelope |

### Library

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET / POST / PATCH | `/api/citations` | Any authenticated | POST and PATCH are `ADMIN_ROLES`-gated |
| DELETE | `/api/citations/:id` | `super_admin` or `reviewer` | Blocked with HTTP 409 if citation is linked to any signed position |
| GET / POST / PATCH | `/api/profiles`, `/api/profiles/:id` | Any authenticated | |
| GET | `/api/profiles/:id/delta` | Any authenticated | |

### Chains & Protocols

| Method | Path | Auth |
|---|---|---|
| GET / POST | `/api/chains` | Any authenticated |
| GET | `/api/chains/:id` | Any authenticated |
| GET / POST | `/api/protocols` | Any authenticated |
| GET | `/api/protocols/:id` | Any authenticated |
| POST | `/api/submit/chain`, `/api/submit/protocol` | Any authenticated |

### Lot Inventory

| Method | Path | Auth |
|---|---|---|
| GET | `/api/lots` | Any authenticated |
| POST | `/api/lots` | Any authenticated |
| GET | `/api/lots/:id` | Any authenticated |
| PATCH | `/api/lots/:id` | `ADMIN_ROLES`-gated |
| DELETE | `/api/lots/:id` | `ADMIN_ROLES`-gated |

Query params for `GET /api/lots`: `wallet_id`, `asset_symbol`, `status` (`open`/`closed`/`partial`), `chain_id`, `limit` (1–200, default 50), `offset` (default 0).

### Exchange Connections (Coinbase, Kraken, Gemini)

Same route shape for each exchange (`{exchange}` = `coinbase` | `kraken` | `gemini`). Sync routes carry `strictLimiter`.

| Method | Path | Auth |
|---|---|---|
| GET | `/api/{exchange}/connection` | Any authenticated |
| POST | `/api/{exchange}/connection` | Any authenticated |
| DELETE | `/api/{exchange}/connection` | Any authenticated |
| POST | `/api/{exchange}/sync` | Any authenticated |

### Notifications

| Method | Path | Auth |
|---|---|---|
| GET | `/api/notifications` | Any authenticated |
| PATCH | `/api/notifications/:id/read` | Any authenticated |
| POST | `/api/notifications/read-all` | Any authenticated |
| GET / PATCH | `/api/notifications/preferences` | Any authenticated |

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

The server logs `Protocol registry initialized — adapters: 10` on startup when all rows are present.

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

## Realized-Loss Review

`GET /api/positions/harvest-candidates?tax_year=2024&wallet_id=optional`

**Scope:** Surfaces already-closed `taxable_disposition` positions sorted by `amount_usd` ascending (largest losses first), each annotated with wash-sale risk within a 30-day window. This is distinct from the Tax Optimizer's Harvest Candidates tab, which surfaces *open lots with unrealized losses*.

**Note on IRC §1091:** Wash-sale rules apply to stocks and securities. The IRS has not extended them to cryptocurrency. Flags are conservative practitioner markers — not legal determinations. A disclaimer is embedded in every response.

---

## IRS-Ready Dossier

`GET /api/export/dossier?tax_year=2024&redact_pii=false`

Runs all four export builders in parallel (`Promise.all`) and returns a single JSON envelope:

```json
{
  "generated_at": "...",
  "dossier_version": "1.0",
  "tax_year": 2024,
  "disclaimer": "...",
  "audit_package": { ... },
  "pattern_report": { ... },
  "comment_letter": { ... },
  "cpa_handoff": { ... }
}
```

Total latency is bounded by the slowest individual query. Downloads as `basisguard_irs_dossier_2024.json`.

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

## Key Design Decisions

**Position Records are append-only.** Superseding creates a new record with `superseded_by` pointing at the old one. The original is never mutated — complete audit trail always intact.

**Confidence tiers map exactly to IRC §6694 preparer standards.**
- `will` — near certainty
- `should` — substantial likelihood
- `more_likely_than_not` — >50%
- `substantial_authority` — meaningful legal support, meaningful weight of authority
- `reasonable_basis` — colorable argument; lowest defensible tier; requires Form 8275 disclosure

**`requires_review` is always computed, never stored as mutable state.** Rules live in `core/reviewRules.ts` (no DB deps, fully tested):
1. Open-gap event type → always true (non-overridable)
2. No citations linked → true
3. Otherwise → honour caller value, default false

**`is_stale` is computed at serialization time.** Stale = `tier=reasonable_basis` + no superseding record + created more than 180 days ago. Never stored.

**Two categories of open-gap events, deliberately kept separate.**
- *IRS-guidance-gap* (lp_deposit, lp_withdrawal, defi_yield, bridge_transfer, staking_reward, nft_sale) — forced review AND surfaced in `/export/comment-letter` as evidence for IRS rulemaking.
- *Fact-pattern-gap* (aave_withdraw, aave_liquidation) — forced review because lot-matching is needed, not because guidance is pending. These do NOT appear in the comment-letter export.

**Registry `initialize()` resets `initialized=false` before the async DB calls.** Any mid-init failure leaves the registry in a retryable state. `ensureInitialized()` uses the flag for the lazy-init guard; `initialize()` itself is called directly by the refresh route and bypasses the guard.

**Auth is cookie-based.** Clerk session cookie is the credential; no Bearer tokens from the frontend. CORS is `credentials: true, origin: true`.

**User JIT-provisioning.** On first authenticated request, `requireAuth` inserts a `users` row with role `cpa_partner` if one doesn't exist. To promote: `UPDATE users SET role = 'super_admin' WHERE email = '...'`.

**Tax Optimizer responses are always snake_case.** Core algorithm types use camelCase internally; named serializer functions (`serializeSimulation`, `serializeHarvestRecommendation`, `serializeStepUpLot`, etc.) in `routes/tax-optimizer.ts` handle the conversion. The serializers are exported and tested directly by `taxOptimizerRoutes.test.ts`.

**Citation deletion is cascade-protected.** `DELETE /api/citations/:id` checks for signed positions referencing the citation via `position_citations` JOIN `position_records WHERE reviewer_signoff_at IS NOT NULL`. Returns HTTP 409 with `signed_position_id` if blocked. The DB schema uses `ON DELETE CASCADE`, so the guard is the only thing preventing silent evidentiary-basis loss.

**Exchange secrets are encrypted at rest.** AES-256-GCM with a key derived from `SESSION_SECRET`. The same `encrypt`/`decrypt` functions are used for all three exchanges (Coinbase, Kraken, Gemini) — a fix to `SESSION_SECRET` propagates to all three automatically.

---

## Common Commands

```bash
# Development
pnpm --filter @workspace/api-server run dev   # API on :8080 (build + start)
pnpm --filter @workspace/basisguard run dev   # Frontend on :18252

# Tests
pnpm --filter @workspace/api-server run test

# Schema
pnpm --filter @workspace/db run push          # Push schema changes to dev DB

# Codegen (run after editing lib/api-spec/openapi.yaml)
pnpm --filter @workspace/api-spec run codegen

# Type check
pnpm run typecheck

# Seed authority citations (idempotent — ON CONFLICT DO NOTHING)
psql $DATABASE_URL -f scripts/seed-citations.sql

# Seed chains and protocol rows (idempotent — ON CONFLICT DO NOTHING)
psql $DATABASE_URL -f scripts/seed-protocols.sql
```

---

## Required Environment Variables

### Backend (API Server)

| Variable | Where to set |
|---|---|
| `DATABASE_URL` | Runtime-managed by Replit (dev) / Render PostgreSQL or external (prod) |
| `CLERK_SECRET_KEY` | Replit Secret (dev) / Render Environment (prod) — from Clerk dashboard |
| `CLERK_PUBLISHABLE_KEY` | Replit Secret (dev) / Render Environment (prod) — from Clerk dashboard |
| `SESSION_SECRET` | Replit Secret (dev) / Render Environment (prod) — any long random string; also keys AES-256-GCM exchange credential encryption |

### Frontend (Static Site — build-time)

| Variable | Where to set |
|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | Replit Secret (dev, copied automatically) / Render Environment (prod) — same value as `CLERK_PUBLISHABLE_KEY` |
| `VITE_CLERK_PROXY_URL` | Empty in dev (intentional). On Render set to `https://<api-service>.onrender.com/api/__clerk` |

---

## Replit First-Time Setup

1. **Clerk** — add `CLERK_SECRET_KEY` and `CLERK_PUBLISHABLE_KEY` as Replit Secrets (from https://dashboard.clerk.com).
2. **Schema** — `pnpm --filter @workspace/db run push` (or runs automatically via `scripts/post-merge.sh`).
3. **Citations** — `psql $DATABASE_URL -f scripts/seed-citations.sql`
4. **Chains & Protocols** — `psql $DATABASE_URL -f scripts/seed-protocols.sql`
5. **SESSION_SECRET** — add as a Replit Secret.

---

## Render Deployment

`render.yaml` at the repo root defines two services (API web service + static site frontend). Before deploying:

1. Create a PostgreSQL database in Render and copy the connection string.
2. In the Render dashboard set these environment variables on **basisguard-api**:
   - `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `SESSION_SECRET`, `DATABASE_URL`
3. Set these on **basisguard-web** (build-time):
   - `VITE_CLERK_PUBLISHABLE_KEY` (same as publishable key)
   - `VITE_CLERK_PROXY_URL` = `https://basisguard-api.onrender.com/api/__clerk`
4. After first deploy, SSH into the API service shell and run:
   ```bash
   psql $DATABASE_URL -f scripts/seed-citations.sql
   psql $DATABASE_URL -f scripts/seed-protocols.sql
   ```

---

## LinkedIn & Coinbase OAuth (Clerk Dashboard)

Both are configured entirely in the Clerk dashboard — no code changes required.

- **LinkedIn**: Dashboard → User & Authentication → Social Connections → Enable LinkedIn
- **Coinbase**: Dashboard → User & Authentication → Social Connections → Add Custom Provider
  - OAuth 2.0 app credentials from https://www.coinbase.com/settings/api
  - Authorization URL: `https://www.coinbase.com/oauth/authorize`
  - Token URL: `https://api.coinbase.com/oauth/token`
  - Scopes: `wallet:user:read,wallet:user:email`

> **Note:** `pnpm --filter @workspace/db run seed` requires Node 24 (`--experimental-strip-types`). The Replit environment runs Node 20 — use the SQL file above instead.

---

## Known Gotchas

- `timestamptz` is not exported from `drizzle-orm/pg-core` — use `timestamp("col", { withTimezone: true })` instead.
- Google Fonts `@import url(...)` must come **before** `@import 'tailwindcss'` in `index.css`, or PostCSS errors.
- Static Express routes (`/positions/review-queue`, `/positions/harvest-candidates`, etc.) must be declared **before** parameterized routes (`/positions/:id`) in the same router.
- DB seeding uses `psql` direct SQL — Node `--experimental-strip-types` cannot resolve extensionless ESM imports from workspace packages.
- Orval generates `api.ts` (Zod) and `types/` (TS) from the same OpenAPI spec. Inline anonymous request bodies generate the same name in both — fix by extracting to named `$ref` schemas in the spec.
- `VITE_CLERK_PROXY_URL` is intentionally empty in development. Do not gate on `NODE_ENV`.
- Tailwind v4 requires `tailwindcss({ optimize: false })` in `vite.config.ts` when Clerk is present, and `@layer theme, base, clerk, components, utilities;` before `@import 'tailwindcss'` in `index.css`.
- Price oracle cache is module-level — call `clearCache()` in `beforeEach` in tests or fetch spy never fires.
- Tax Optimizer route serializers must be used for all three endpoints; the core functions return camelCase and the HTTP contract is snake_case. Do not spread core types directly into `res.json()`.

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

---

## User Preferences

_Populate as you build — explicit user instructions worth remembering across sessions._
