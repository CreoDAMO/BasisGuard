# BasisGuard

A professional crypto tax compliance platform built around an Evidence Log & Adaptation Engine. Every transaction is classified into an immutable Position Record — with a real confidence tier from Circular 230 / IRC §6694 preparer penalty rules, a cited IRS authority, and a plain-language rationale. Nothing is classified without a cited reason.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/basisguard run dev` — run the frontend (port 18252)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, Tailwind CSS, wouter, Recharts, TanStack Query
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI contract (source of truth)
- `lib/db/src/schema/` — Drizzle schema (treatment_profiles, authority_citations, position_records, position_citations)
- `artifacts/api-server/src/routes/` — Express route handlers (dashboard, positions, citations, profiles, export)
- `artifacts/basisguard/src/pages/` — React page components

## Architecture decisions

- Position Records are append-only; superseding creates a new record linked via `superseded_by`
- The confidence tier system maps exactly to Circular 230 / IRC §6694 standards (will, should, more_likely_than_not, substantial_authority, reasonable_basis)
- "No defensible basis" is never a system default — only opt-in profiles behind licensed preparer sign-off
- `requires_review=true` + `reviewer_signoff_at=null` = pending queue item
- Delta reports are computed dynamically by comparing current positions against a profile's rules — not stored

## Product

- **Dashboard** — tier breakdown chart, pending review count, system metrics, recent activity feed
- **Evidence Log** — filterable table of all Position Records
- **Position Detail** — rationale, authority citations, tier, reviewer sign-off action
- **Review Queue** — pre-filtered pending positions for CPA workflow
- **Citations Library** — searchable IRS authority citations (seeded with 10 key items)
- **Treatment Profiles** — versioned rule sets with delta report
- **Audit Export** — tax-year evidence package + anonymized pattern report

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- `timestamptz` is not exported from `drizzle-orm/pg-core`; use `timestamp("col", { withTimezone: true })` instead
- Google Fonts `@import url(...)` must come before `@import 'tailwindcss'` in index.css or PostCSS errors
- `pnpm --filter @workspace/db run push` is sufficient for dev schema changes; production uses the Replit publish flow
- The `/positions/review-queue` route must be declared before `/positions/:id` in Express to avoid being captured as a param route

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
