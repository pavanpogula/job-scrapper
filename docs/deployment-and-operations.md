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
| `CORS_ORIGINS` | — | — | ✅ | Optional | Comma-separated list of allowed origins (e.g. `https://job-scrapper-ui.vercel.app,http://localhost:3000`). |
| `HEALTH_TOKEN` | — | — | ✅ | Optional | Bearer secret enabling deep database ping via `/health?deep=1`. |
| `VERCEL_TOKEN` | Optional | — | — | — | Personal access token used to purge edge cache tag `jobs-v1`. |
| `VERCEL_PROJECT_ID` | Optional | — | — | — | Project ID associated with `VERCEL_TOKEN`. |
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
- **Inputs:** `workers` (default 4), `skip_publish`, `publish_only`, `recheck_not_found`, `skip_fixer`, `fixture_report`.
- **Steps:**
  1. Restores historical scrape run cache (`output/run-history.json`).
  2. Runs `npm run enrich:companies` to update display names and logos.
  3. Executes `npm run scrape:parallel -- --workers=4` with automatic cache publishing.
  4. Classifies error telemetry via `npm run report:classify`.
  5. Uploads `scrape-report-<runId>` artifact (30-day retention).
  6. On failure (`exitCode = 1` or infra alert), runs `scripts/ci/alert-issue.sh` to create or update a `scrape-alert` issue.
  7. Chains to the automated Claude fixer job when actionable issues are detected.

---

## 4. Vercel & Edge Deployment (`backend/vercel.json`)

```json
{
  "version": 2,
  "regions": ["iad1"],
  "buildCommand": "npm run build",
  "outputDirectory": "public",
  "functions": {
    "backend/api/index.ts": {
      "maxDuration": 15
    }
  },
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https: blob:; connect-src 'self' https:;"
        },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" }
      ]
    }
  ]
}
```

### Edge Caching & Purging
- **Lists / Facets / Meta:** `s-maxage=300, stale-while-revalidate=3600` with `Vercel-Cache-Tag: jobs-v1`.
- **Job Detail:** `s-maxage=3600, stale-while-revalidate=86400` with `Vercel-Cache-Tag: jobs-v1`.
- **Bypass / Uncacheable:** `s-maxage=60, stale-while-revalidate=600`.
- **Cache Invalidation:** The publisher optionally purges tag `jobs-v1` via Vercel Edge API when `VERCEL_TOKEN` and `VERCEL_PROJECT_ID` are configured.

---

## 5. GitHub Repository Configuration & Labels

### Branch Protection (`main`)
- Require pull request before merging (1 approving review).
- Require status checks to pass before merging (`backend-gate`, `frontend-gate`, `repo-gate`).
- Require branches to be up to date before merging.
- Restrict direct pushes (no bypass for apps or administrators).

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
