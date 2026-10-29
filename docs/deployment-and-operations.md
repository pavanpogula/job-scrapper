# Deployment & Operations Runbook

This document details account quotas, secrets management, CI/CD workflows, edge configurations, and operational runbooks for the **Ashby Job Scraper** platform.

---

## 1. Cloud Accounts & Free tier Limits

*(Quotas verified as of 2026-10-24)*

| Provider | Service / Tier | Quotas & Limits | Key Invariants |
|---|---|---|---|
| **Vercel** | Hobby (Free tier) | • 1M edge/serverless invocations/month<br>• 4 CPU-hours execution time/month<br>• 1 custom WAF rate limit rule (per region) | Functions region set to `iad1` (US East) matching Neon & Upstash to minimize round-trip latency. Max function duration: 15s. |
| **Neon** | Serverless PostgreSQL (Free tier) | • Neon compute-hours: 100 Compute Unit (CU) hours/month<br>• 1 GB storage<br>• 5 GB data egress/month | All serverless API connections **must** route through the pgBouncer pooled URL (`*-pooler.*.neon.tech`) with `?sslmode=require&pgbouncer=true`. |
| **Upstash** | Serverless Redis (Free tier) | • Budget cap: 10,000 commands/day<br>• 256 MB data storage<br>• 1 concurrent connection pool | Uses double-buffered generation swap (`jc:v1:*`) and in-process API LRU caching to keep commands well within the 10,000/day quota. Automatically enters Circuit breaker cooldown on `budget_exhausted`. |
| **GitHub** | Actions (Free tier) | • 2,000 runner minutes/month<br>• Standard 2-core runners (`ubuntu-24.04`) | Daily scheduled scrape runs at 06:17 UTC with 4 worker processes (~76s execution time, consuming < 2 min/day). |

---

## 2. Secrets Matrix

The matrix below documents where every secret is configured and consumed:

| Secret Name | GitHub `production` Env | GitHub `fixer` Env | Vercel Project Env | Local `.env` | Purpose |
|---|:---:|:---:|:---:|:---:|---|
| `DATABASE_URL` | ✅ | — | ✅ | ✅ | PostgreSQL connection string (pooled for Vercel, direct/pooled for scraper). |
| `REDIS_URL` | ✅ | — | ✅ | Optional | Upstash Redis connection string (`rediss://...`). |
| `ANTHROPIC_API_KEY` | — | ✅ | — | — | API key for automated Claude fixer agent workflow (`P4`). |
| `FIXER_APP_CLIENT_ID` | — | ✅ | — | — | GitHub App client ID for opening automated pull requests. |
| `FIXER_APP_PRIVATE_KEY` | — | ✅ | — | — | GitHub App private key for authenticating fix PR pushes. |
| `CORS_ORIGINS` | — | — | ✅ | Optional | Comma-separated list of allowed origins (default `https://www.boolean.page,https://job-scrapper-ui.vercel.app,http://localhost:3000`). |
| `HEALTH_TOKEN` | — | — | ✅ | Optional | Bearer secret enabling deep database ping via `/health?deep=1`. |
| `VERCEL_TOKEN` | — | — | — | — | Vercel access token used **only** by `deploy.yml`; stored in the GitHub `vercel-production` environment (never in the scraper env). |
| `VERCEL_ORG_ID` | — | — | — | — | Vercel team ID (`boolean6`) for `deploy.yml`; `vercel-production` environment. |
| `VERCEL_PROJECT_ID_FRONTEND` / `VERCEL_PROJECT_ID_BACKEND` | — | — | — | — | Project IDs of `job-scrapper-ui` / `job-scrapper-api` for `deploy.yml`; `vercel-production` environment. |
| `GOOGLE_DRIVE_FOLDER_ID`| — | — | — | Optional | Folder ID for optional cloud CSV uploads (`scrape:csv -- --upload-cloud`). |

---

## 3. Workflows

### 3.1 PR Continuous Integration (`.github/workflows/backend-ci.yml`, `frontend-ci.yml`, `repo-ci.yml`)
- **Triggers:** Pull requests and pushes targeting `main`, `plan/**`, or `auto-fix/**`.
- **Environment:** Node 24 (`.nvmrc`), Ubuntu 24.04 runner.
- **Architecture:** Split monorepo workflows with path-based change detection and gate jobs:
  1. `backend-ci.yml`: Runs on `backend/**` changes -> `backend-gate`.
  2. `frontend-ci.yml`: Runs on `frontend/**` changes -> `frontend-gate`.
  3. `repo-ci.yml`: Always runs root repo-tests, pinned actionlint, and fixer scope checks -> `repo-gate`.

### 3.2 Daily Scheduled Scraper (`.github/workflows/scrape-daily.yml`)
- **Triggers:** Cron schedule `17 6 * * *` (06:17 UTC daily) and manual `workflow_dispatch`.
- **Inputs:** `workers` (default 4), `skip_publish`, `publish_only`, `recheck_not_found`, `skip_fixer`, `fixture_report`, `sources` (comma-separated, e.g. `ashby,greenhouse`), `force_publish` (boolean), `deactivate_source` (`none` / `greenhouse`).
- **Source Configuration (`GREENHOUSE_ENABLED`):**
  - Effective sources: `inputs.sources` if set, else `ashby,greenhouse` when `vars.GREENHOUSE_ENABLED == 'true'`, else `ashby`.
  - Passed as `--sources=<effective>` to `scrape:parallel` and `enrich:companies`.
- **Steps:**
  1. Syncs database schema (`npx prisma db push --skip-generate`).
  2. Backfills multi-source columns and validates uniqueness (`npm run db:backfill-source`, `continue-on-error: true`).
  3. Emergency source rollback if requested (`npm run source:deactivate -- <source>` when `inputs.deactivate_source != 'none'`).
  4. Restores historical scrape run cache (`output/run-history.json`).
  5. Runs `npm run enrich:companies -- --sources=<effective>` to update display names and logos.
  6. Executes `npm run scrape:parallel -- --workers=4 --sources=<effective>` with automatic cache publishing.
  7. Classifies error telemetry via `npm run report:classify` and writes metrics (including `summary.bySource`) to GitHub Actions step summary.
  8. Uploads `scrape-report-<runId>` artifact (30-day retention).
  9. On failure (`exitCode = 1` or infra alert), runs `scripts/ci/alert-issue.sh` to create or update a `scrape-alert` issue.
  10. Chains to the automated Claude fixer job when actionable issues are detected.

#### How to Enable, Measure, and Roll Back Greenhouse

- **How to Enable Greenhouse:**
  1. Measure with dry run: Actions → **Daily scrape** → Run workflow with `sources=ashby,greenhouse`, `skip_publish=true`. This writes Greenhouse jobs to the database without publishing to Redis cache. Verify job counts, duration, and telemetry.
  2. If healthy, set GitHub repository variable `GREENHOUSE_ENABLED=true`. Subsequent daily cron runs will automatically scrape and publish both Ashby and Greenhouse boards.
- **Per-Source Sanity Gate:**
  `Publisher.ts` tracks active jobs `bySource`. If any source with a baseline ≥ 100 jobs drops > 30%, the sanity gate trips and exits with code 2. A new source with no previous baseline never gates.
- **How to Roll Back:**
  1. Set repo variable `GREENHOUSE_ENABLED=false` (or run workflow with `sources=ashby`).
  2. Run **Daily scrape** with `deactivate_source=greenhouse`. This runs `npm run source:deactivate -- greenhouse` to set `active=false` on all Greenhouse jobs and skips scraping and the telemetry classify step (a rollback run has no scrape report, so classify would exit 1 and turn the run red). The result is printed in the run's step summary ("Deactivated N active jobs"). Empty Greenhouse companies remain hidden from public API listings.
  3. If Redis cache needs immediate updating, run **Daily scrape** with `publish_only=true` and `force_publish=true` (`--force` bypasses the per-source drop sanity gate to reset the baseline to Ashby-only).

---

### 3.3 Manual Deploys (`.github/workflows/deploy.yml`)
Vercel's own git deploys are **off** (`"git": { "deploymentEnabled": false }` in `frontend/vercel.json` and
`backend/vercel.json`), so pushes to `main` or any branch never change the live site. Deploys happen only when
the owner runs this workflow (ADR-0016).

- **Trigger:** GitHub → Actions → **Deploy to Vercel** → Run workflow. Inputs: `app` (`both` / `frontend` /
  `backend`), `target` (`production` / `preview`), `ref` (branch, tag or commit SHA; default `main`).
- **Jobs:** `verify` runs `scripts/check-all.sh` (install, builds, typecheck, lint, all tests) on `ref`. Only if it
  is green, `deploy-backend` then `deploy-frontend` run `vercel pull` → `vercel build` → `vercel deploy --prebuilt`
  with the pinned Vercel CLI, from the repo root (each project's Root Directory is a Vercel setting). The backend
  goes first because the frontend proxies `/v1/*` and `/health` to it.
- **After a production deploy** each job runs `scripts/smoke/smoke.mjs` against
  `https://job-scrapper-api-eight.vercel.app` (backend) and `https://www.boolean.page` (frontend).
  Preview URLs sit behind Vercel login, so preview runs only print the URL (open it in your browser). A frontend
  preview still proxies to the **production** backend domain.
- **Secrets:** GitHub environment `vercel-production` (see §2). Optionally add the owner as a required reviewer
  there to get an approval click before every deploy.

#### How to deploy
1. Merge your work to `main` (CI must be green).
2. Optional: run with `target=preview` and check the printed URL in your browser.
3. Run with `app=both`, `target=production`. Both smoke steps must print `PASSED`.

#### How to roll back
- **Fastest:** Vercel dashboard → project → Deployments → previous deployment → **Instant Rollback**
  (Hobby: only the immediately previous deployment) or **Promote to Production**.
- **Any commit:** run the workflow again with `ref=<older commit SHA>`.
- **Turn git deploys back on:** revert the PR that added `deploymentEnabled: false`.

### 3.4 Weekly Discovery Workflow (`.github/workflows/discover-weekly.yml`)
- **Triggers:** Cron schedule `0 4 * * 0` (04:00 UTC every Sunday) and manual `workflow_dispatch`.
- **Inputs:** `common_crawl` (boolean, default true), `enrich` (boolean, default true).
- **Concurrency:** `group: discovery-pipeline`, non-overlapping runs.
- **Jobs:**
  1. `discover`: Discovers and seeds new Ashby companies from Wayback CDX (+ Common Crawl). Gated by `vars.DISCOVERY_ENABLED != 'false'`. Syncs DB schema with `npx prisma db push --skip-generate` before running discovery.
  2. `discover-greenhouse`: Discovers and seeds new Greenhouse companies from Common Crawl paged CDX index (`--source=greenhouse --enrich`). Runs after the Ashby job (`needs: discover`). Gated by repo variable `vars.DISCOVERY_GREENHOUSE_ENABLED == 'true'` (default off). Runs schema sync (`prisma db push`), then `npm run discover -- --source=greenhouse --enrich` with a 30-minute timeout. Outputs summary to step summary. Discovered companies remain hidden from public endpoints until jobs are scraped in G6.

---

## 4. Vercel & Edge Deployment (`frontend/vercel.json`, `backend/vercel.json`)

Two Vercel projects (ADR-0014), both with git deploys disabled (deploys run via §3.3):

- **`job-scrapper-api`** (Root Directory `backend`, `https://job-scrapper-api-eight.vercel.app`): region `iad1`,
  `buildCommand` = `npm run build` (Prisma generate), serverless function `api/index.ts` (`maxDuration` 15),
  rewrites `/v1/(.*)` and `/health` → `/api/index`, headers `X-Frame-Options`, `Referrer-Policy`,
  `X-Content-Type-Options`.
- **`job-scrapper-ui`** (Root Directory `frontend`, `https://www.boolean.page`; `boolean.page` 308-redirects to `www`,
  and `https://job-scrapper-ui.vercel.app` still works): Vite build to `dist`,
  rewrites `/v1/*` and `/health` to the backend domain and everything else to `/index.html`, headers
  `Content-Security-Policy`, `X-Frame-Options`, `Referrer-Policy`, `X-Content-Type-Options`, `Permissions-Policy`.

The two `vercel.json` files are the source of truth; `scripts/repo-tests/vercel-config.test.mjs` guards them.

### Edge Caching & Purging
- **Lists / Facets / Meta:** `s-maxage=300, stale-while-revalidate=3600` with `Vercel-Cache-Tag: jobs-v1`.
- **Job Detail:** `s-maxage=3600, stale-while-revalidate=86400` with `Vercel-Cache-Tag: jobs-v1`.
- **Bypass / Uncacheable:** `s-maxage=60, stale-while-revalidate=600`.
- **Cache Invalidation:** Atomic generation pointer swap in Upstash Redis (`jc:v1:*`) invalidates cache atomically on every publish run; external Vercel Edge API purging via `VERCEL_TOKEN` was retired in P3a.

---

## 5. GitHub Repository Configuration & Labels

### Branch Protection (`main`)
Current setup (development phase; the owner pushes to `main` directly):
- **Ruleset on `main`:** block force pushes and restrict deletions (applies to everyone, owner included).
- **No required pull request**, so the owner can push directly. Agents never push `main`: they publish task
  branches only via `scripts/agents/push-branch.sh` (ADR-0017), and the owner reviews and merges.
- **Optional:** require the status checks `backend-gate`, `frontend-gate`, `repo-gate` before merging.

Because agents use the owner's git credentials, GitHub cannot tell an agent push from an owner push; the
"never `main`" rule is enforced by the agent permission settings and the push script, and the ruleset is the
server-side backstop for the destructive cases.

### Issue & PR Labels
- `auto-fix`: Pull requests generated by the self-healing Claude agent.
- `needs-human`: Issues requiring human triage after repeated fix attempts.
- `scrape-alert`: Issues tracking scrape pipeline failures or infrastructure alerts.
- `fix-failed`: Issues tracking failed agent fix attempts.

---

## 6. Operational Runbooks

### Runbook 1: Cache Empty or Corrupted
**Symptom:** API returns `X-Cache: BYPASS` with `X-Cache-Reason: no_generation` or `missing_generation`.
**Remediation:**
1. Navigate to GitHub Actions → **Daily scrape** workflow.
2. Click **Run workflow** → Select `main` branch.
3. Check `publish_only` = `true`.
4. Run workflow. The publisher will compute manifest, diff detail rows, and atomically swap pointer `jc:v1:current`.
5. Verify via CLI locally or API: `npm run cache:status`.

### Runbook 2: Upstash Quota Exhaustion (`budget_exhausted`)
**Symptom:** `/health` reports `cache.state: budget_exhausted`, API serves from PostgreSQL with `X-Cache: BYPASS`.
**Remediation:**
1. Check Upstash console for daily command count.
2. Verify CDN cache headers (`s-maxage=300` on `/v1/jobs` and `s-maxage=3600` on `/v1/jobs/:id`). Ensure requests are hitting edge CDN rather than penetrating to serverless origins.
3. If legitimate traffic increased, upgrade Upstash database tier or adjust in-process LRU cache TTLs in `src/api/cache/ReadThrough.ts`.

### Runbook 3: Upstash Instance Archived Due to Inactivity
**Symptom:** Redis client throws connection timeout / unresolvable host.
**Remediation:**
1. Log into Upstash Console and un-archive the database, or create a replacement database.
2. Update `REDIS_URL` in GitHub Repository Secrets (for `production` environment) and Vercel Project Settings.
3. Run `npm run cache:publish` to populate the new instance.

### Runbook 4: Neon Compute Hours Exhausted
**Symptom:** Prisma throws `Can't reach database server at ...-pooler.neon.tech`.
**Remediation:**
1. Inspect Neon console CU-hours consumption.
2. Verify `/health` is not being pinged with `?deep=1` by external monitors. External monitors must hit shallow `/health` which makes 0 DB queries when cache is warm.
3. Ensure all Vercel instances connect using `-pooler` endpoint to leverage pgBouncer connection pooling.

### Runbook 5: Scrape Daily Failures
**Symptom:** GitHub Actions sends an alert issue labelled `scrape-alert`.
**Remediation:**
1. Open the failed run in GitHub Actions.
2. Download the `scrape-report-<runId>` artifact.
3. Check `latest-error-report.json` for categorised errors:
   - `auth_401` / `forbidden_403`: Company ATS slug may have changed or gone private.
   - `schema_validation`: Board format changed; inspect logged `validationIssues`.
   - `network_timeout`: Ashby API latency; check adaptive concurrency and rate limiting.
4. Run locally with fixture to reproduce: `npm run report:install-fixture -- <artifact-path>`.
