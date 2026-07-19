---
name: Drizzle timestamp quirk
description: timestamptz is not a valid export from drizzle-orm/pg-core — use the withTimezone option instead
---

**Rule:** Never use `timestamptz` from `drizzle-orm/pg-core` — it does not exist. Instead use:
```ts
timestamp("col_name", { withTimezone: true })
```

**Why:** The Drizzle pg-core package does not export `timestamptz` as a named function. Attempting to import it causes a runtime error. The `timestamp` function accepts a `withTimezone` option that produces identical SQL (`TIMESTAMPTZ`).

**How to apply:** Any time a schema file uses timestamps (createdAt, reviewerSignoffAt, etc.), always use `timestamp("col", { withTimezone: true })`.
