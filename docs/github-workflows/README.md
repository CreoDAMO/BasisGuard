# GitHub Workflows for BasisGuard

Copy the YAML files from this folder to `.github/workflows/` in your repository.

| File | Trigger | Purpose |
|------|---------|---------|
| `neon-migrations.yml` | Push to `main`, PRs | Runs Drizzle migrations on `main`; creates/destroys isolated Neon DB branches for each PR |
| `keep-alive.yml` | Every 10 minutes | Pings the Render API health endpoint to prevent cold starts |

## Required GitHub Secrets

Go to your repo → **Settings → Secrets and variables → Actions** and add:

| Secret | Where to get it |
|--------|----------------|
| `DATABASE_URL` | Neon Console → Connection Details (main branch) |
| `NEON_API_KEY` | Neon Console → Account → API Keys |
| `NEON_PROJECT_ID` | Neon Console → Project Settings |

The keep-alive workflow needs no secrets — it just pings a public URL.

## How PR branching works

When you open or update a PR, `neon-migrations.yml` automatically:
1. Creates a fresh Neon database branch forked from your `main` DB branch.
2. Runs `drizzle-kit push` against that branch — so the PR gets its own isolated schema.
3. Deletes the branch when the PR is closed or merged.

This keeps your production data safe and gives each PR a clean slate for testing.

## Copying workflows

Option A — GitHub web UI:
1. Go to your repo → **Actions** tab → **New workflow**.
2. Paste the YAML content from each file.

Option B — local terminal:
```bash
mkdir -p .github/workflows
cp docs/github-workflows/*.yml .github/workflows/
git add .github/workflows
git commit -m "chore: add GitHub Actions workflows"
git push
```
