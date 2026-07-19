---
name: DB seeding approach
description: How to reliably seed the PostgreSQL database in this monorepo — and what doesn't work
---

## Rule
Use **direct `psql` SQL** with `ON CONFLICT (id) DO NOTHING` for seeding fixed reference data. Do not try to run TypeScript seed scripts via `node --experimental-strip-types`.

## Why
`node --experimental-strip-types` cannot resolve extensionless workspace package imports (e.g. `import ... from "./index"` inside `lib/db/src/`) — it requires explicit `.js` extensions for ESM. The workspace packages use TypeScript path resolution that only works through the build pipeline or tsx, neither of which is straightforwardly available for ad-hoc script execution.

## How to apply
```bash
psql "$DATABASE_URL" <<'SQL'
INSERT INTO authority_citations (id, type, ...) VALUES (...) ON CONFLICT (id) DO NOTHING;
SQL
```

For idempotent seed data (fixed UUIDs), this is safe to run multiple times.
