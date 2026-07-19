#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter @workspace/db run push
psql "$DATABASE_URL" -f scripts/seed-citations.sql
