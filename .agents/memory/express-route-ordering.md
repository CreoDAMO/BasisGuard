---
name: Express static vs parameterized route ordering
description: Static path segments must be declared before /:id in the same Express router
---

**Rule:** In the positions router, all static sub-paths must appear before `/:id`:
- `/positions/review-queue` → before `/positions/:id`
- `/positions/batch-signoff` → before `/positions/:id`
- `/positions/tier-suggestion` → before `/positions/:id`

**Why:** Express matches routes in declaration order. If `/:id` is declared first, it captures `review-queue`, `batch-signoff`, etc. as the `id` param, causing 404s or wrong handlers.

**How to apply:** When adding any new fixed-path route under /positions, always place it before the `/:id` handler block.
