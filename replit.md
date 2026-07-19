# BasisGuard

A crypto tax compliance evidence platform for licensed CPAs and authorized partners. Every DeFi transaction is classified into an immutable **Position Record** with a confidence tier drawn from Circular 230 / IRC §6694 preparer-penalty standards, a cited IRS authority, and a plain-language rationale. Nothing is classified without a cited reason.

## Architecture

pnpm monorepo — three artifacts, two shared libraries.

```
artifacts/
  api-server/       Express 5 REST API (port 8080)
  basisguard/       React + Vite frontend (port 18252)
lib/
  api-spec/         OpenAPI contract (source of truth for codegen)
  db/               Drizzle schema + migrations
```

## Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 24, TypeScript 5.9 |
| Frontend | React 18, Vite, Tailwind CSS v4, wouter, TanStack Query, Recharts |
| API | Express 5 |
| Auth | Clerk (`@clerk/express` 2.1.43, `@clerk/react` 6.12.5) — Replit-managed tenant |
| Database | PostgreSQL + Drizzle ORM |
| Validation | Zod v4, drizzle-zod |
| API codegen | Orval (generates typed hooks and Zod schemas from OpenAPI spec) |
| Build | esbuild |

## Database Schema

| Table | Purpose |
|---|---|
| `users` | Clerk-linked user accounts; roles: `super_admin`, `reviewer`, `cpa_partner` |
| `authority_citations` | Seeded IRS legal authorities (Rev. Rul., T.D., Notice, IRC §) |
| `treatment_profiles` | Versioned rule sets for classification policy |
| `position_records` | Append-only evidence log; superseding creates a new row via `superseded_by` |
| `position_citations` | Junction: which authorities back each position |
| `raw_transactions` | Ingested transaction data; `processed` flag set when a position record is created |
| `chains` | Supported blockchain networks |
| `protocols` | DeFi protocols (linked to chains) |
| `chain_submissions` | Community-submitted chain onboarding requests |
| `protocol_submissions` | Community-submitted protocol onboarding requests |

## API Routes

All routes except `GET /api/healthz` require a valid Clerk session.

| Method | Path | Auth level |
|---|---|---|
| GET | `/api/healthz` | Public |
| GET / PATCH | `/api/me` | Any authenticated user |
| GET | `/api/dashboard/summary` | Any authenticated user |
| GET | `/api/dashboard/recent-activity` | Any authenticated user |
| GET / POST | `/api/chains`, `/api/protocols` | Any authenticated user |
| GET / POST / PATCH / DELETE | `/api/citations` | Any authenticated user |
| GET / POST / PATCH | `/api/positions` | Any authenticated user |
| GET | `/api/positions/review-queue` | Any authenticated user |
| POST | `/api/positions/tier-suggestion` | Any authenticated user |
| GET | `/api/positions/:id` | Any authenticated user |
| POST | `/api/positions/:id/signoff` | `super_admin` or `reviewer` |
| POST | `/api/positions/batch-signoff` | `super_admin` or `reviewer` |
| GET / POST / PATCH | `/api/profiles`, `/api/profiles/:id` | Any authenticated user |
| GET | `/api/profiles/:id/delta` | Any authenticated user |
| GET | `/api/intelligence/suggest` | Any authenticated user |
| GET | `/api/intelligence/stale` | Any authenticated user |
| GET | `/api/export/audit-package` | Any authenticated user |
| GET | `/api/export/pattern-report` | Any authenticated user |
| GET | `/api/export/comment-letter` | Any authenticated user |
| GET | `/api/export/cpa-handoff` | Any authenticated user |
| GET / POST | `/api/transactions` | Any authenticated user |
| POST | `/api/transactions/ingest` | Any authenticated user |
| POST | `/api/submit/chain`, `/api/submit/protocol` | Any authenticated user |
| GET | `/api/admin/submissions` | `super_admin` or `reviewer` |
| PATCH | `/api/admin/submissions/chain/:id/approve` | `super_admin` or `reviewer` |
| PATCH | `/api/admin/submissions/chain/:id/reject` | `super_admin` or `reviewer` |
| PATCH | `/api/admin/submissions/protocol/:id/approve` | `super_admin` or `reviewer` |
| PATCH | `/api/admin/submissions/protocol/:id/reject` | `super_admin` or `reviewer` |

## Frontend Pages

| Page | Route | Description |
|---|---|---|
| Landing | `/` | Public; sign in / request access |
| Sign in | `/sign-in` | Clerk-hosted sign-in |
| Sign up | `/sign-up` | Clerk-hosted sign-up |
| Command Center | `/dashboard` | Tier breakdown chart, pending count, recent activity |
| Evidence Log | `/positions` | Filterable table of all position records |
| Position Detail | `/positions/:id` | Rationale, citations, tier, reviewer sign-off action |
| Review Queue | `/review-queue` | Pre-filtered pending positions for CPA workflow |
| Citations | `/citations` | Searchable IRS authority citations |
| Profiles | `/profiles` | Versioned treatment rule sets + delta report |
| Chain Registry | `/chains` | Supported blockchains and community submissions |
| Onboarding | `/submissions` | Admin review of chain/protocol onboarding requests |
| Audit Export | `/export` | Tax-year evidence package, pattern report, CPA handoff |
| Ingest | `/transactions` | Raw transaction ingestion |

## Key Design Decisions

**Position Records are append-only.** Superseding a position creates a new record with a `superseded_by` FK — the original is never mutated. This gives a full audit trail.

**Confidence tiers map exactly to preparer standards.**
- `will` — near certainty
- `should` — substantial likelihood
- `more_likely_than_not` — >50%
- `substantial_authority` — meaningful legal support
- `reasonable_basis` — colorable argument, lowest defensible tier

**`requires_review` is always computed, never stored.**
`requires_review=true` if: the event type is an open-gap category (bridge transfers, cross-chain ops, etc.) OR the position has zero authority citations. Enforced in both the positions route and the ingest endpoint via `OPEN_GAP_EVENT_TYPES` (single source of truth in `positions.ts`).

**`is_stale` is computed at serialization time.** A position is stale if `tier=reasonable_basis`, it has no superseding record, and it was created more than 180 days ago. Never stored.

**Auth is cookie-based.** The Clerk session cookie is the credential; no Bearer tokens are sent from the frontend. The API is configured with `credentials: true` CORS.

**User JIT-provisioning.** On first authenticated request, `requireAuth` inserts a `users` row with role `cpa_partner` if one doesn't exist. To promote a user: `UPDATE users SET role = 'super_admin' WHERE email = '...'`.

## Common Commands

```bash
# Start everything
pnpm --filter @workspace/api-server run dev   # API on :8080
pnpm --filter @workspace/basisguard run dev   # Frontend on :18252

# Schema changes
pnpm --filter @workspace/db run push          # Push to dev DB
pnpm --filter @workspace/db run push-force    # Force push (drops conflicting state)

# Codegen (run after changing openapi.yaml)
pnpm --filter @workspace/api-spec run codegen

# Types
pnpm run typecheck
```

## Required Environment Variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `CLERK_SECRET_KEY` | Clerk backend key (server-side auth verification) |
| `CLERK_PUBLISHABLE_KEY` | Clerk publishable key |
| `VITE_CLERK_PUBLISHABLE_KEY` | Same key, exposed to Vite frontend |
| `SESSION_SECRET` | Express session signing |

## Known Gotchas

- `timestamptz` is not exported from `drizzle-orm/pg-core` — use `timestamp("col", { withTimezone: true })` instead.
- Google Fonts `@import url(...)` must come **before** `@import 'tailwindcss'` in `index.css` or PostCSS errors.
- Express route ordering matters: `/positions/review-queue`, `/positions/batch-signoff`, `/positions/tier-suggestion` must be declared before `/:id` in the same router.
- DB seeding uses `psql` direct SQL — Node `--experimental-strip-types` cannot resolve extensionless ESM imports from workspace packages.
- `VITE_CLERK_PROXY_URL` is intentionally empty in development. Do not gate it on `NODE_ENV`.
- Tailwind v4 requires `tailwindcss({ optimize: false })` in `vite.config.ts` when Clerk is present, and `@layer theme, base, clerk, components, utilities;` before `@import 'tailwindcss'` in `index.css`.

## What Is Not Yet Built

The **Protocol Adapter / ProtocolRegistry engine** (Layer 2 from the design doc) — chain-aware DeFi protocol adapters (Uniswap, Aave, bridge protocols) that classify raw transactions automatically. The `raw_transactions` table and `/transactions/ingest` endpoint are the ingestion layer that adapters will feed into. The `processed` flag and `position_record_id` FK columns exist to track adapter processing.

## User Preferences

_Populate as you build — explicit user instructions worth remembering across sessions._
