# 04 · CLI Commands (Entry Points)

All scripts run through `npx ts-node` — no build required. Pass extra args after `--`, e.g. `npm run db:clean -- --execute`.
Every flag below is parsed with a plain `process.argv.includes(...)` / `startsWith(...)` check (`process:cdx` reads the
positional `process.argv[2]`) — there is no argument
parser, so unknown flags are silently ignored and typos (e.g. `--excute`) fall back to the default behaviour.

## Summary Table

| Command | Entry file | Needs DB | Needs Redis | Network | Writes | Exit code on failure |
|---|---|:-:|:-:|---|---|---|
| `npm run seed [-- --all]` | `src/utils/Seed.ts` | ✅ | — | — | `Company` rows | 0 (`.catch(console.error)`) |
| `npm run discover [-- --common-crawl] [-- --enrich]` | `src/discovery/CdxWorker.ts` | ✅ | — | Wayback CDX (+ CommonCrawl, + Ashby HTML) | `Company` rows (`name`/`logoUrl` with `--enrich`) | 1 |
| `npm run process:cdx -- <file.json>` | `src/utils/ProcessCdxData.ts` | — | — | — | `./extracted-slugs.json` (CWD) | non-zero only on thrown read/parse error |
| `npm run scrape` | `src/core/Scraper.ts` | ✅ | optional | Ashby REST (+ GraphQL fallback) | `Job`, `Department`, `Location`, `Company.status` (`NOT_FOUND` — in practice never reached, see 05), Redis `job:*:hash`, `output/latest-error-report.json`, `output/error-report_YYYY-MM-DD.json` | 1 |
| `npm run scrape:parallel [-- --workers=N]` | `src/core/ClusterScraper.ts` (forks `Scraper.ts --ipc-worker`) | ✅ | optional | Ashby REST (+ GraphQL fallback) | same as `scrape`, report merged across workers | 1 |
| `npm run scrape:csv` | `src/core/ScraperCSV.ts` | ✅ (read) | — | Ashby REST (+ GraphQL fallback) | `output/jobs_YYYY-MM-DD.csv`, `output/latest-error-report.json`, `output/error-report_YYYY-MM-DD.json` | 0 (`.catch(console.error)`) |
| `npm run scrape:csv -- --upload-cloud` | same | ✅ (read) | — | Ashby + Google Drive | CSV + Drive file (service account) | 0 |
| `npm run db:menu` | `src/database/DbMenu.ts` | ✅ | — | — | read-only (unless raw SQL in option 7 mutates!) | 0 |
| `npm run db:inspect` | `src/database/DbInspect.ts` | ✅ | — | — | read-only | 0 (errors caught & logged) |
| `npm run db:clean` | `src/database/DbClean.ts` | ✅ | — | — | nothing (dry run) | 0 (errors caught & logged) |
| `npm run db:clean -- --execute` | same | ✅ | — | — | **deletes** `Job` + `Company` rows with invalid slugs | 0 |
| `npm run db:backfill` | `src/database/BackfillJobFields.ts` | ✅ | — | — | backfills structured `Job` columns from metadata JSONB | 1 |
| `npm run enrich:companies [-- --concurrency=N] [-- --limit=N] [-- --force]` | `src/utils/EnrichCompanies.ts` | ✅ | — | Ashby hosted boards | updates `Company.name` & `Company.logoUrl` | 1 |
| `npm run verify` | `src/utils/Verify.ts` | ✅ | — | — | read-only (console report) | 1 |
| `npm run api:start` | `src/api/Server.ts` | ✅ | — | — | HTTP server on port 3001 with rate limiting and static UI serving | 1 |
| `npm run prisma:studio` | Prisma CLI (`npx prisma studio`) | ✅ | — | — | GUI (can edit rows) | — |
| `npm run docs:generate` | `scripts/GenerateDocs.ts` | — | — | — | `docs/project-explorer.html` | 0 (`.catch(console.error)`) |
| `npm run lint` / `npm run lint:fix` | `npx eslint src/ --ext .ts [--fix]` | — | — | — | (`lint:fix`: rewrites `src/` files) | non-zero only on lint **errors** (warnings pass) |
| `npm test` | `jest` (`jest.config.js`) | — (Prisma mocked) | — (mocked) | — (axios mocked) | nothing | non-zero on failing test |
| `npx tsc --noEmit -p .` | TypeScript compiler | — | — | — | nothing (type-check `src/**/*` only) | non-zero on type error |
| `npx ts-node scripts/generate-readme.ts` | *(no npm script)* | — | — | — | `JOBS.md` (repo root) | 1 if no `jobs_*.csv`; otherwise 0 |
| `npx ts-node scripts/test-drive-upload.ts` | *(no npm script)* | — | — | Google OAuth/Drive | `apikeys/oauth-token.json`, Drive file; temp `output/test-upload.txt` | 0 (`.catch(console.error)`) |

Prisma CLI (not wrapped): `npx prisma generate`, `npx prisma db push` (no `prisma/migrations/` folder exists — the schema
is synced with `db push`, not `migrate`).

Verification gate used by `AGENTS.md`: `npx tsc --noEmit -p . && npm run lint && npm test`
(at the 2026-10-22 analysis: 16 suites / 79 tests passing).

---

## Details

### `npm run seed [-- --all]` — `src/utils/Seed.ts`
- Flag: `--all` → reads `extracted-slugs.json` from `process.cwd()` (`loadTargetSlugs(true)`). Without the flag (or if
  the file is missing / not a JSON array) it **silently falls back** to `TARGET_COMPANIES` in `src/config/Companies.ts`
  (currently 7 slugs: `deel`, `remote`, `reddit`, `multiverse`, `1password`, `abridge`, `go-augment`).
- 1× `company.findMany({ select: { slug } })` → in-memory diff → 1× `company.createMany({ skipDuplicates: true })`
  with `name = slug`, `status = 'ACTIVE'`.
- Output: `📊 Found N existing companies in DB.`, `📝 Found M NEW companies to insert.`, `✅ Seed complete.` — or
  `✅ No new companies to add.`
- Prereq: `DATABASE_URL`, tables created (`npx prisma db push`).

### `npm run discover [-- --common-crawl] [-- --enrich]` — `src/discovery/CdxWorker.ts`
- See [02 → Workflow A1](./02-architecture-and-workflows.md#workflow-a1).
- Always queries Wayback CDX (`http://web.archive.org/cdx/search/cdx`, `url=jobs.ashbyhq.com/*`, `collapse=urlkey`,
  **`limit=1000`**).
- `--common-crawl`: also queries `https://index.commoncrawl.org/CC-MAIN-2024-51-index` (JSONL, 15 s timeout).
- `--enrich`: after each upsert, fetches `https://jobs.ashbyhq.com/{slug}`, parses `window.__appData.organization` and
  updates `Company.name` / `Company.logoUrl` (`theme.logoWordmarkImageUrl` → `theme.logoSquareImageUrl`). One extra HTTP
  request per slug, sequential.
- Slugs go through `extractCompanySlug()` → `isValidSlug()`; each slug is upserted **one at a time**
  (`update: {}`, `create: { slug, name: slug }`), printing one `.` per slug.
- Output: `Found N URLs. Extracting slugs...`, `Found M unique company slugs.`, dots, `Discovery complete.`

### `npm run process:cdx -- <path>` — `src/utils/ProcessCdxData.ts`
- Positional arg: `process.argv[2]` = path to a raw CDX JSON file (array-of-arrays, `[["original"],["url"],...]`).
- Without a path: prints usage (which still references the old name `process-cdx-data.ts`) and exits 0.
- Filters: header row, bare root URL, `.well-known*`, `$`/`%` prefixes, wildcards, pure numbers, UUIDs, ≥20-char hex
  strings, CSS values (`100vh`, `500ms`…), length < 2, then `isValidSlug()`.
- Output: valid-slug count, a `TARGET_COMPANIES = [...]` code block on stdout (prompt still says
  `src/config/companies.ts` — real file is `Companies.ts`), rejected count; writes **sorted** `extracted-slugs.json`
  to the **current working directory** (not repo root if run elsewhere).
- No DB access (but it imports `CdxWorker.ts`, which constructs an unused `PrismaClient`).

### `npm run scrape` — `src/core/Scraper.ts`
- Flags: none for normal mode. `--ipc-worker` is internal (used by `scrape:parallel`): the process waits for one IPC
  message `{ workerId, slugs, concurrency }`, scrapes only those slugs, sends back
  `{ type: 'worker_done', workerId, report }` (or `{ type: 'worker_error', workerId, error }`) and does **not** write
  report files itself.
- Scrapes every `Company` with `status = 'ACTIVE'`. Concurrency 15 (adaptive, see `createLimiter()`), DB batch 100.
- Startup pre-warm: loads all `Department`/`Location` rows into memory and the distinct `companySlug`s that have
  `active = true` jobs (used to skip the stale-job `updateMany` for companies that never had jobs).
- Per company: `GET https://api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=true` with retry, GraphQL
  fallback on `404/403/400`; 404 after fallback counts as a NOT_FOUND strike (threshold 3, in-memory per run — see
  [05 → CompanyStatus](./05-database-and-cache.md#enum-companystatus)); successful fetch → `deactivateStaleJobs()`.
- Logs: start banner (company count, concurrency, batch size, `Redis: ✅ Connected` / `⚠️ Disabled`);
  `✅ slug: N jobs (M changed)` per company **only when ≤ 50 companies are scraped**; `[Sanitizer] slug: filtered N…`
  warnings; `📊 Progress: X/Y companies | J jobs found (concurrency: C)` **every 50 companies** and at the end;
  `📦 Flushing remaining jobs to database...`; `✅ Scrape complete in Ns`; `Companies: N | Jobs processed: M`;
  `📋 Telemetry & Error Report: <path>`.
- Exit code 1 on unhandled error (after `prisma.$disconnect()`).

### `npm run scrape:parallel [-- --workers=N]` — `src/core/ClusterScraper.ts`
- Flag: `--workers=N` (integer ≥ 1; invalid values ignored). Default = `min(4, max(2, os.cpus().length))`. The result is
  capped at the number of active companies (`resolveWorkerCount()`).
- Loads `ACTIVE` slugs once, disconnects Prisma, splits them round-robin (`partitionSlugs()`), and forks one child per
  shard: `fork(path.join(__dirname, 'Scraper.ts'), ['--ipc-worker'], { execArgv, stdio: [..., 'ipc'] })`, where `execArgv`
  reuses `process.execArgv` if it already contains `ts-node`, otherwise appends `-r ts-node/register`.
- Per-worker HTTP concurrency: **12** when > 100 active companies, otherwise `max(5, ceil(20 / shards))`.
- Each worker has its own Prisma client, Redis connection and department/location caches (cross-process `P2002` races
  are recovered via `findUnique`).
- Merges the returned reports via `ErrorTracker.mergeReports()` (`runId = cluster_run_<ms>`) and writes them with
  `ErrorTracker.saveMergedReport()`.
- If **any** worker fails or exits early, `Promise.all` rejects → `❌ Cluster scrape failed` → exit 1 and **no** merged
  report is written (surviving workers' DB writes are kept).
- Logs: `⚡ MULTI-PROCESS CLUSTER SCRAPER` banner (companies, worker count, CPU cores, per-worker concurrency), worker
  logs prefixed `[Worker #i | PID p]`, final `🏁 MULTI-PROCESS SCRAPE COMPLETE` summary.
- If no active companies: prints `⚠️ No active companies found in database. Run: npm run seed` and exits 0.
- The 34,035-job / 141.3 s benchmark in `documentation/README.md` was run with `-- --workers=8`.

### `npm run scrape:csv [-- --upload-cloud]` — `src/core/ScraperCSV.ts`
- Reads `ACTIVE` slugs from the DB; fetches **without** `includeCompensation`; concurrency 15 (adaptive). No Redis.
- Writes `output/jobs_YYYY-MM-DD.csv` (format in [08](./08-outputs-and-artifacts.md#1-csv-format)).
- Logs `✅ slug: N jobs` for **every** company with jobs and `📊 Progress: X/Y companies (J jobs so far)` every 100.
- File name uses the **UTC** date (`new Date().toISOString()`), so evening runs in US time zones get the next day's
  date; same-UTC-day reruns overwrite the file.
- Always writes the telemetry report (`mode: "csv_scrape"`), which **overwrites** the `latest-error-report.json` of a
  previous DB scrape.
- If 0 jobs in total: deletes the empty CSV and returns (no upload).
- `--upload-cloud`: uploads via service-account JWT (`uploadWithOAuth()` in `src/lib/GoogleDriveOAuth.ts`) into
  `GOOGLE_DRIVE_FOLDER_ID` (`mimeType text/csv`, `supportsAllDrives: true`). Without the flag prints
  `💡 Tip: Add --upload-cloud to upload to Google Drive`.
- Does **not** mark 404 companies `NOT_FOUND`.
- Errors are caught with `.catch(console.error)` → process exits 0 even on failure.

### `npm run db:menu` — `src/database/DbMenu.ts`
Interactive `readline` loop (`Select an option [1-8]`). Runs on import (no `require.main` guard).

| Option | Query |
|---|---|
| `1` Dashboard | `count()` of Company, Job (**all**, incl. inactive), Department, Location |
| `2` Jobs per company | `job.groupBy(companySlug)` top 15 (incl. inactive jobs) |
| `3` Top salaries | top 10 by `salaryMax desc` where `salaryMax not null` (any currency) |
| `4` Search by title | case-insensitive `contains`, first 10 |
| `5` Location breakdown | `job.groupBy(locationId)` top 10, names resolved via `location.findMany` |
| `6` Ghost companies | companies with **zero** `Job` rows (first 20 printed) |
| `7` Raw SQL | `$queryRawUnsafe(sql)`, first 50 rows shown |
| `8` Exit | disconnect + `process.exit(0)` |

> Prisma table names are PascalCase and must be quoted in raw SQL, e.g. `SELECT * FROM "Job" LIMIT 5;`.

### `npm run db:inspect` — `src/database/DbInspect.ts`
- Lists `information_schema.tables` in schema `public` (skipping names starting with `_`), prints each table's columns
  (`column_name`, `data_type`, `is_nullable`) via `console.table`, and `SELECT COUNT(*)` row counts.
- Runs on import (no `require.main` guard).

### `npm run db:clean [-- --execute]` — `src/database/DbClean.ts`
- Flag: `--execute` (anything else = dry run). Applies `isValidSlug()` to every company; prints up to 15 invalid slugs.
- `--execute`: `job.deleteMany({ companySlug in invalidSlugs })` then `company.deleteMany({ id in invalidIds })`.
- ⚠️ *Note:* `README.md` used to describe this as "remove old jobs"; it actually purges companies with *invalid slugs*
  (and their dependent jobs), not aged records.

### `npm run verify` — `src/utils/Verify.ts`
- Prints counts: `Company` total / `ACTIVE` / `NOT_FOUND`; `Job` total / active / inactive / with salary
  (`salaryMin not null`); `Department`; `Location`.
- Top 15 companies by job count (with status).
- Integrity audit on a **sample of the first 500 jobs** (not the whole table): empty titles, `applyUrl` not matching
  `^https?://`, metadata JSON containing `\u0000`.
- Top 5 `USD` salaries (`salaryMax desc`) with location.
- Final line: `✅ Database Integrity Check PASSED (0 data errors)` or `⚠️ Database Integrity Issues Detected`
  (exit code is 0 either way; 1 only on exceptions).

### `npm run docs:generate` — `scripts/GenerateDocs.ts`
- Recursively scans the **whole project root** for `*.ts` (not `*.d.ts`) and `*.prisma`, excluding the directories
  `node_modules`, `dist`, `.git`, `docs`, `output`, `.vscode`, `apikeys` (so `src/`, `scripts/`, `tests/`, `__mocks__/`
  and `prisma/` are all included).
- Parses the JSDoc `@file` / `@summary` / `@tags` header and per-function `@summary`; for `.prisma`, models and fields.
- Writes `docs/project-explorer.html` (creates `docs/` if missing). Runs on import (`main().catch(console.error)`, no
  `require.main` guard).

### `npm run lint` / `npm run lint:fix`
- `npx eslint src/ --ext .ts` — only `src/` is linted (`.eslintrc.json` additionally ignores `scripts/`, `docs/`,
  `dist/`, `*.js`). `tests/` and `__mocks__/` are not linted. JSDoc rules (`jsdoc/require-jsdoc`,
  `jsdoc/check-tag-names` allowing `@file`, `@summary`, `@tags`, `@example`, `@configuration`, `@behavior`) are
  **warnings**, so they never fail the command.

### `npm test`
- `jest` with `ts-jest` (`isolatedModules: true` → transpile only, **no type checking** of tests), `roots: ['<rootDir>/tests']`,
  `testMatch: **/*.test.ts`, `clearMocks: true`.
- `@prisma/client` is globally mapped to `__mocks__/@prisma/client.ts`, so no database or Prisma engine is needed.
  Individual tests also `jest.mock('axios')`, `jest.mock('../../src/lib/Redis')`, `fs`, and `googleapis`.
- Suites: `tests/unit/*.test.ts` (14) and `tests/e2e/*.test.ts` (2), fixtures in `tests/fixtures/`.

### `npx ts-node scripts/generate-readme.ts` *(no npm script shortcut)*
- Reads `<repo>/output/` (resolved from `__dirname`, not CWD), picks the last `jobs_*.csv` by name sort.
- Parses it with a minimal CSV parser (quoted fields, `""` escapes, `\r\n`/`\r` normalised) and writes **all** rows (no
  row cap) as a Markdown table to `<repo>/JOBS.md`. It splits on newlines **before** quote handling, so a quoted field
  containing a newline is split into two rows (the current exporter never emits one because `sanitizeText()` collapses
  whitespace, but the Dec-2025 CSVs contain one such title, which is why the committed `JOBS.md` shows 29,911 rows
  from a 29,910-record CSV). Format in [08](./08-outputs-and-artifacts.md#2-jobsmd).
- Exits 1 with `❌ No job CSV files found in output/` when no CSV exists (throws → logged, exit 0, if `output/` itself
  is missing).

### `npx ts-node scripts/test-drive-upload.ts` *(no npm script shortcut)*
- Runs on import (`main().catch(console.error)` at module level, no `require.main` guard).
- Tests the Google Drive **user OAuth2** flow (`src/lib/GoogleDriveUserOAuth.ts`, scope `drive.file`).
- Writes `output/test-upload.txt`, runs consent (prints URL, asks you to paste the code) or reuses/refreshes
  `apikeys/oauth-token.json`, uploads the file to **My Drive root** (no folder ID is passed), lists your 10 most recently
  modified files, then deletes the local test file. If an exception is thrown before cleanup the `.txt` is left behind.
- Reads `apikeys/oauth-credentials.json` (`installed` or `web` client).
