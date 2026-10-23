# Ashby Job Scraper

A TypeScript **command-line toolkit** that collects public job postings from companies whose careers page is
hosted on [Ashby](https://www.ashbyhq.com/) (`jobs.ashbyhq.com/<company-slug>`). It discovers company slugs, scrapes
every known job board, and stores the results in **PostgreSQL** (via Prisma) or exports them to a dated **CSV** file
(optionally uploaded to Google Drive).

**Who it's for:** developers, job seekers and data folks who want one up-to-date, queryable dataset of Ashby-hosted
openings (titles, departments, locations, salary ranges, apply links) instead of browsing thousands of boards by hand.

**What it is not:** there is no web server, no REST API of its own, no UI and no built-in scheduler. Every feature is an
`npm run <script>` executed through `ts-node` (no build step). Schedule runs externally (cron, GitHub Actions, etc.).

> Full project context for humans and AI agents lives in [`documentation/`](./documentation/README.md).
> Agent rules live in [`AGENTS.md`](./AGENTS.md).

## Features

- 🔍 **Company discovery**: finds Ashby slugs from the Wayback Machine CDX API (and the CommonCrawl index with `--common-crawl`), validates them against a regex + blocklist, and can enrich company name/logo from the hosted page (`--enrich`).
- 🌐 **Resilient Ashby client** (`src/lib/AshbyClient.ts`): browser-like headers, exponential backoff + jitter on `429`/`5xx`/timeouts, and automatic fallback to Ashby's hosted GraphQL API when a company's public `posting-api` is disabled (`404`/`403`/`400`).
- 🧼 **Sanitization & validation** (`src/lib/Sanitizer.ts`): strips PostgreSQL-fatal `\u0000` bytes and lone surrogates from `jsonb` metadata, removes `<script>`/`<style>`/`<iframe>`, inline JS handlers and huge base64 blobs from descriptions, normalizes job/apply URLs to canonical Ashby URLs, and drops malformed or duplicate job records.
- 📊 **PostgreSQL storage** (Prisma 5): normalized `Company` / `Job` / `Department` / `Location` schema, real salary extraction (`salaryMin` / `salaryMax` / `salaryCurrency`), streaming 100-job batch writes, a bulk `createMany` fast path for new jobs, per-job fallback when a batch fails, and deactivation (`active = false`) of jobs that disappear from a board.
- ⚡ **Parallel scraping**: an adaptive concurrency limiter (halves concurrency and pauses on `429`/`403`, then ramps back up) inside each process, plus a multi-process cluster mode (`npm run scrape:parallel`) that shards companies across OS worker processes.
- 🗃️ **Optional Redis change detection**: an MD5 hash per job (7-day TTL) skips unchanged jobs. If Redis is unreachable the scraper keeps running without it.
- 📄 **CSV export**: streams `output/jobs_YYYY-MM-DD.csv`, with optional Google Drive upload (`--upload-cloud`).
- 📋 **Run telemetry**: every DB or CSV scrape writes `output/latest-error-report.json` (GraphQL fallbacks, rate limits, filtered/sanitized jobs, DB errors), which the Bug-Fix Agent loop reads.

## How It Works (end-to-end data flow)

```
 Wayback CDX / CommonCrawl ──► npm run discover ──┐
 extracted-slugs.json (3,072) ─► npm run seed ────┴──► Company table (status ACTIVE)
                                                              │
                                                              ▼
   npm run scrape  /  npm run scrape:parallel  /  npm run scrape:csv
                                                              │
        fetchAshbyBoardWithFallback(slug)  ── REST posting-api (?includeCompensation=true)
                                           └─ 404/403/400 → hosted GraphQL (ApiJobBoardWithTeams)
                                                              │
                                  sanitizeJobBatch() → valid, cleaned jobs
                                                              │
               ┌──────────────────────────────────────────────┴───────────────────────┐
               ▼ (DB modes)                                                          ▼ (CSV mode)
   Redis hash check → 100-job batches → Postgres                     output/jobs_YYYY-MM-DD.csv
   (createMany new / upsert changed / per-job fallback)              (+ optional Google Drive upload)
   deactivate jobs missing from the board                                            │
               │                                                                     ▼
               └──────────► output/latest-error-report.json ◄────────    scripts/generate-readme.ts → JOBS.md
```

## Quick Start

Prerequisites: Node.js (developed on v24), a PostgreSQL database (Neon works well), and optionally Redis.

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Set DATABASE_URL (required). REDIS_URL and GOOGLE_DRIVE_FOLDER_ID are optional.

# 3. Create the database schema
npx prisma generate
npx prisma db push

# 4. Seed companies
npm run seed             # 7 sample slugs from src/config/Companies.ts
npm run seed -- --all    # all 3,072 slugs from extracted-slugs.json

# 5. Scrape
npm run scrape                          # single process → PostgreSQL
npm run scrape:parallel -- --workers=8  # multi-process → PostgreSQL
npm run scrape:csv                      # → output/jobs_YYYY-MM-DD.csv

# 6. Check the results
npm run verify           # row counts, salary coverage, integrity audit
npm run db:menu          # interactive explorer
```

## Environment Variables

```env
# Required: PostgreSQL connection string (read by Prisma)
DATABASE_URL="postgresql://user:pass@host:5432/jobscraper"

# Optional: Redis for change detection. Defaults to redis://localhost:6379; if unreachable, caching is disabled.
REDIS_URL="redis://localhost:6379"

# Optional: target folder for --upload-cloud
GOOGLE_DRIVE_FOLDER_ID="your_folder_id"
```

> `.env.example` still labels Redis as "Required", but the code treats it as optional.

## NPM Scripts

| Command | Description |
|---------|-------------|
| `npm run scrape` | Single-process DB scrape of all `ACTIVE` companies (15 concurrent requests, streaming 100-job batch writes, GraphQL fallback) |
| `npm run scrape:parallel` | Multi-process DB scrape. Default workers = `min(4, max(2, CPU cores))`; override with `-- --workers=N`. Each worker runs 12 concurrent requests when there are more than 100 companies |
| `npm run scrape:csv` | Scrape all `ACTIVE` companies (company list still read from the DB) to `output/jobs_YYYY-MM-DD.csv` |
| `npm run scrape:csv -- --upload-cloud` | Same, then upload the CSV to Google Drive (service account) |
| `npm run discover` | Discover slugs via Wayback CDX (currently capped at 1,000 CDX rows). Flags: `-- --common-crawl`, `-- --enrich` |
| `npm run seed` | Insert new companies from `TARGET_COMPANIES` (`-- --all` uses `extracted-slugs.json`) |
| `npm run process:cdx -- <file.json>` | Convert a raw CDX JSON dump into `extracted-slugs.json` |
| `npm run verify` | Database health audit: table counts, ACTIVE/NOT_FOUND breakdown, salary coverage, 500-job integrity sample |
| `npm run db:menu` | Interactive database explorer (dashboard, search, salaries, raw SQL) |
| `npm run db:inspect` | Dump tables, columns and row counts via `information_schema` |
| `npm run db:clean` | Dry-run listing of companies with invalid slugs; `-- --execute` deletes them and their jobs |
| `npm run prisma:studio` | Open Prisma Studio |
| `npm run docs:generate` | Regenerate `docs/project-explorer.html` from JSDoc `@file`/`@summary`/`@tags` blocks and the Prisma schema |
| `npm test` | Jest unit + E2E suite (16 suites, 79 tests) |
| `npm run lint` / `npm run lint:fix` | ESLint over `src/` only |

Scripts without an npm alias:

| Command | Description |
|---------|-------------|
| `npx ts-node scripts/generate-readme.ts` | Render the newest `output/jobs_*.csv` into `JOBS.md` |
| `npx ts-node scripts/test-drive-upload.ts` | Test the user-OAuth Google Drive upload flow |

## Outputs

| Path | What it is |
|------|------------|
| PostgreSQL | `Company`, `Job`, `Department`, `Location` tables (main dataset) |
| `output/jobs_YYYY-MM-DD.csv` | CSV export (gitignored). Columns: Company, Job Title, Job Link, Published Date, Location, Department. The date is UTC, and re-running on the same day overwrites the file |
| `output/latest-error-report.json`, `output/error-report_YYYY-MM-DD.json` | Run telemetry + error events (gitignored) |
| `JOBS.md` | **Generated** Markdown table of a CSV export (via `scripts/generate-readme.ts`). It is committed to git, about 5 MB, and currently a snapshot from 2026-01-05 with 29,911 table rows (rendered from a 29,910-record CSV; one title with an embedded newline was split in two, see known issues #42). Don't edit it by hand |
| `extracted-slugs.json` | 3,072 validated Ashby slugs (output of `process:cdx`, input to `seed --all`) |
| `docs/project-explorer.html` | Generated interactive code explorer |

## Database Schema

```
Company (slug PK-like, unique) 1 ──→ N Job N ──→ 0..1 Department
                                         └──→ 0..1 Location
```

| Model | Key fields |
|-------|------------|
| `Company` | `slug` (unique), `name`, `logoUrl`, `status` (`ACTIVE` / `NOT_FOUND` / `REDIRECTED`) |
| `Job` | `ashbyId` (unique), `title`, `applyUrl`, `companySlug`, `departmentId`, `locationId`, `salaryMin`, `salaryMax`, `salaryCurrency`, `metadata` (sanitized raw job JSON, `jsonb`), `contentHash`, `active` |
| `Department` | `name` (unique) |
| `Location` | `name` (unique) |

Employment type, remote flag, descriptions and publish date are not columns. They are kept inside `Job.metadata`.

## Performance

A full run with 3,072 seeded slugs and 8 workers (`npm run scrape:parallel -- --workers=8`) against Neon wrote
**34,035 jobs from 1,747 hiring companies in 141.3 s** (BF-010). 13,686 of those jobs had a salary. A later cached re-run collected
34,021 jobs in about 24 s. About 1,100 of the seeded slugs return `404` on every run (see known issues).

## Google Drive Integration

`--upload-cloud` uses a **service account** (`src/lib/GoogleDriveOAuth.ts`, despite the name):

1. Follow `docs/GOOGLE_DRIVE_SETUP.md`.
2. Save the service-account key as **`apikeys/google-credentials.json`** (not the project root).
3. Set `GOOGLE_DRIVE_FOLDER_ID` in `.env`, and share that folder with the service-account email.
4. Run `npm run scrape:csv -- --upload-cloud`.

Service accounts have no storage quota on personal Drives, so uploads to a personal "My Drive" folder can fail. A
user-OAuth uploader (`src/lib/GoogleDriveUserOAuth.ts`, credentials in `apikeys/oauth-credentials.json`) exists and can be
tested with `scripts/test-drive-upload.ts`, but it is not yet wired into `scrape:csv`.

## Data Sources

- **Ashby Posting API**: `GET https://api.ashbyhq.com/posting-api/job-board/{slug}[?includeCompensation=true]`
- **Ashby hosted GraphQL API (fallback)**: `POST https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams`. Jobs from this path have no salary numbers, publish date or description.
- **Ashby hosted page** (`--enrich`): `GET https://jobs.ashbyhq.com/{slug}` → `window.__appData.organization`
- **Wayback Machine CDX**: `http://web.archive.org/cdx/search/cdx?url=jobs.ashbyhq.com/*`
- **CommonCrawl index**: `https://index.commoncrawl.org/CC-MAIN-2024-51-index` (one fixed crawl)

## Project Structure

```
job-scrapper/
├── src/
│   ├── config/Companies.ts         # TARGET_COMPANIES (7 sample slugs)
│   ├── core/
│   │   ├── Scraper.ts              # AshbyScraper: DB + Redis scraper (also --ipc-worker mode)
│   │   ├── ClusterScraper.ts       # Multi-process coordinator (child_process.fork + IPC)
│   │   └── ScraperCSV.ts           # Streaming CSV scraper + Drive upload
│   ├── discovery/CdxWorker.ts      # Wayback CDX / CommonCrawl discovery, slug validation, enrichment
│   ├── database/
│   │   ├── DbMenu.ts               # Interactive readline explorer
│   │   ├── DbInspect.ts            # information_schema dump
│   │   └── DbClean.ts              # Invalid-slug cleanup (dry-run by default)
│   ├── lib/
│   │   ├── AshbyClient.ts          # REST + GraphQL fallback client, retry, salary parser
│   │   ├── Sanitizer.ts            # Job validation & sanitization
│   │   ├── Concurrency.ts          # Adaptive createLimiter(), chunk()
│   │   ├── ErrorTracker.ts         # Telemetry / error report writer & multi-worker merger
│   │   ├── Redis.ts                # Shared lazy ioredis client
│   │   ├── GoogleDriveOAuth.ts     # Service-account Drive upload (misnamed)
│   │   └── GoogleDriveUserOAuth.ts # User OAuth2 Drive upload
│   └── utils/
│       ├── Seed.ts                 # Seeder (--all)
│       ├── ProcessCdxData.ts       # Raw CDX JSON → extracted-slugs.json
│       └── Verify.ts               # Database health & integrity auditor
├── scripts/
│   ├── GenerateDocs.ts             # → docs/project-explorer.html
│   ├── generate-readme.ts          # newest CSV → JOBS.md
│   └── test-drive-upload.ts        # user-OAuth upload smoke test
├── tests/
│   ├── unit/                       # 14 unit suites
│   ├── e2e/                        # 2 pipeline suites
│   └── fixtures/                   # sample Ashby / CDX payloads
├── __mocks__/@prisma/client.ts     # Jest Prisma mock (no DB needed for tests)
├── prisma/schema.prisma
├── documentation/                  # Project context docs (01–11)
├── docs/                           # GOOGLE_DRIVE_SETUP.md, project-explorer.html
├── output/                         # CSV + telemetry (gitignored)
├── apikeys/                        # Google credentials (gitignored)
├── extracted-slugs.json
├── JOBS.md                         # generated
├── AGENTS.md / CLAUDE.md          # agent rules / quick map
└── package.json / tsconfig.json / jest.config.js / .eslintrc.json
```

## Development

```bash
npx tsc --noEmit -p .   # type-check (tsconfig only includes src/)
npm run lint            # ESLint on src/ (only warns on functions/classes without JSDoc)
npm test                # Jest (Prisma mocked; no DB/Redis/network needed)
npm run docs:generate   # refresh docs/project-explorer.html
```

Every new file and function needs a JSDoc `@file` / `@summary` / `@tags` block. Bug fixes follow the Bug-Fix Agent
protocol and Regression Guard Registry in
[`documentation/10-bug-fix-and-improvement-log.md`](./documentation/10-bug-fix-and-improvement-log.md). Known bugs and
tech debt are tracked in [`documentation/09-known-issues-and-tech-debt.md`](./documentation/09-known-issues-and-tech-debt.md).
The test suite, mocks and coverage gaps are described in [`documentation/11-testing-guide.md`](./documentation/11-testing-guide.md).

## Changelog: "v1.1.0" Scraper Hardening

The commits from `f872356` through `627dfae` are referred to as v1.1.0. `package.json` still says `1.0.0`, and there is no git tag.

- **GraphQL fallback & browser headers** (`AshbyClient.ts`, BF-001).
- **Sanitization & error-driven filtering** (`Sanitizer.ts`, BF-002/003/004).
- **Real salary extraction, stale-job deactivation, streaming batch writes** (`Scraper.ts`, BF-005/006).
- **CSV/Markdown escaping** (`ScraperCSV.ts`, `generate-readme.ts`, BF-007).
- **Multi-process cluster scraper** (`ClusterScraper.ts`, BF-008).
- **CSV-mode telemetry parity & `verify` auditor** (BF-009).
- **Bulk `createMany` fast path + cache pre-warming** for the 34k-job full scrape (BF-010).

### Roadmap: Packaging as an Application
1. **React web app** (Next.js / Vite + Prisma): a job search/filter dashboard, salary analytics, and scraper control on the same TypeScript + PostgreSQL stack.
2. **Desktop app** (Electron / Tauri) wrapping the UI and the Node scraper.
3. **Standalone CLI binary** (Node SEA / `pkg`).

## License

ISC
