# 10 · Bug-Fix Registry, Regression Guards & Improvement Log

> **Purpose:** This is the **mandatory checklist and decision log** for any human developer or **Bug-Fix Agent** changing this repository.
> Every scrape run makes `ErrorTracker` (`src/lib/ErrorTracker.ts`) write telemetry and captured errors to `output/latest-error-report.json`.
> Before applying any new fix, the agent **must** check that none of the **Regression Invariants** below would be broken.
>
> _Registry last audited against the code: 2026-10-22 (HEAD `89a1fd2`). Each entry cites where the fix lives and whether a test actually guards its invariant._

---

## 🤖 Bug-Fix Agent Workflow (Mandatory 6-Step Loop)

When you are started to investigate errors or improve the scraper, follow this loop:

1. **Inspect the latest run telemetry & errors**
   - Read `output/latest-error-report.json` (and `output/error-report_YYYY-MM-DD.json`. Same-day runs overwrite it, see 09 #36).
   - Check `summary` (`companiesNotFound`, `jobsFilteredOut`, `jobsSanitized`, `dbErrors`, `graphqlFallbacksUsed`, `rateLimitsEncountered`) and look at `events[]` (at most 500) for the exact `companySlug`, `jobId`, `field`, `category` and `message`.
   - Event categories actually emitted: `graphql_fallback`, `validation_issue`, `db_error`. `api_error` is declared but never emitted (09 #33), so transient fetch failures do **not** appear in the report.
2. **Check the Regression Invariants** below (`BF-001` … `BF-010`) so your change does not break an earlier fix. Also read [`09-known-issues-and-tech-debt.md`](./09-known-issues-and-tech-debt.md).
3. **Implement the fix** in the relevant module (`src/lib/Sanitizer.ts`, `src/lib/AshbyClient.ts`, `src/core/Scraper.ts`, `src/discovery/CdxWorker.ts`, …).
4. **Add unit & E2E tests and verify**
   - Add a unit test in `tests/unit/` and/or an E2E test in `tests/e2e/` that covers the exact payload you observed.
   - Run:
     ```bash
     npx tsc --noEmit -p . && npm run lint && npm test && npm run docs:generate
     ```
   - Everything must pass with `0` TypeScript and `0` ESLint errors. `tsc` and `lint` cover only `src/` (09 #44), so check test files yourself.
5. **Log the fix & sync docs**: add a `BF-XXX` entry below in the same format (Symptom, Root cause & fix, Implemented in, Regression Invariant, Guarding tests). Then update `AGENTS.md`, `README.md`, `09-known-issues-and-tech-debt.md` and any other affected `documentation/*.md`.
6. **Commit with a detailed description**: stage code, tests, agent files and docs (never `.env`, `apikeys/` or `output/`) and write a Conventional Commit that covers the symptom, root cause, fix, tests and doc updates.

---

## 🛡️ Regression Guard Registry

Guard status legend: ✅ an existing test fails if the invariant breaks · ⚠️ partially guarded · ❌ no test guards it.
The clause-by-clause test mapping and coverage numbers are in [`11-testing-guide.md` §5–§6](./11-testing-guide.md#6-bf--regression-invariants--guarding-tests). `src/core` has about 31.6 % statement coverage, and `runAll()`, `runClusterScrape()` and `scrapeToCSV()` have no tests.

| ID | Commit | Summary | Guard status |
|---|---|---|---|
| BF-001 | `f872356` | REST 404/403/400 → GraphQL fallback, browser headers | ⚠️ (404 only, headers unchecked) |
| BF-002 | `f872356` | `\u0000` / surrogate / script stripping before `jsonb` | ✅ |
| BF-003 | `f872356` | URL validation + canonical fallback | ✅ |
| BF-004 | `f872356` | Validation pre-filter + per-job batch fallback | ⚠️ (legacy branch only) |
| BF-005 | `f872356` | Real salary extraction, null-clearing on removal | ✅ |
| BF-006 | `f872356` | Dept/location dedupe, streaming flushes, stale-job deactivation | ❌ (only the strike counter is tested) |
| BF-007 | `f872356` | CSV / Markdown escaping | ⚠️ (newline/CRLF untested) |
| BF-008 | `f872356`, `2cce729` | Multi-process cluster scraper | ⚠️ (IPC/`saveTelemetry` untested) |
| BF-009 | `747d8d1`, `635e69d` | CSV-mode telemetry parity, `verify` auditor | ⚠️ (forwarding untested, Verify counts only) |
| BF-010 | `627dfae` | Bulk `createMany` fast path, cache pre-warming | ❌ none, see 11-testing-guide.md |
| BF-011 | HEAD | Structured field promotion, GraphQL preservation, company enrichment, and full-field hash (#31) | ✅ (`extractSalary` interval, unit tests) |

### BF-001: Posting API 404/403 for boards that are live in the browser
- **Symptom:** Companies return `404`/`403` from `api.ashbyhq.com/posting-api/job-board/<slug>` but show live jobs at `jobs.ashbyhq.com/<slug>`.
- **Root cause & fix:** Ashby's external posting API is opt-in. Added `fetchAshbyBoardWithFallback()`: it sends `BROWSER_HEADERS`, retries `429`/`5xx`/`ECONNABORTED`/`ETIMEDOUT`/`ECONNRESET` with exponential backoff + jitter (`maxRetries = 2`, base 300 ms), and on a final `404`/`403`/`400` calls `fetchFromAshbyGraphQL()` (`POST https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams`).
- **Implemented in:** `src/lib/AshbyClient.ts` (`fetchAshbyBoardWithFallback`, `fetchFromAshbyGraphQL`, `isRetryableError`, `BROWSER_HEADERS`). `fetchAshbyBoardWithFallback()` is used by `Scraper.runAll()`, `ScraperCSV.fetchJobsForCompany()` and the dead `Scraper.fetchJobs()`. *(Correction: `CdxWorker` enrichment does **not** use it. `fetchOrganizationMetadata()` is a separate single `GET https://jobs.ashbyhq.com/<slug>` with `BROWSER_HEADERS`, no retries and no fallback.)*
- **Regression Invariant:** `notFound: true` is returned **only** for a REST `404` **after** GraphQL also reports no board. A `403`/`400` that GraphQL cannot recover returns `notFound: false`. Every Ashby request sends `BROWSER_HEADERS`.
- **Guarding tests:** `tests/unit/AshbyClient.test.ts` ("recover jobs via GraphQL when Posting API returns 404", "retry on HTTP 429", `isRetryableError`), `tests/e2e/ScraperPipeline.test.ts` (fallback + telemetry).
- **⚠️ Unguarded:** only 404 → GraphQL is tested. 403 and 400 → GraphQL, 404 + GraphQL miss → `notFound: true`, and the fact that `BROWSER_HEADERS` are sent are not asserted (see 11-testing-guide.md §6).
- **Known gaps:** GraphQL jobs have no salary numbers, `publishedAt` or descriptions, and their validation issues are dropped (09 #32). A `403` is also counted as a rate limit (09 #34).

### BF-002: PostgreSQL `jsonb` crashes on corrupt descriptions / metadata
- **Symptom:** A whole 100-job `$transaction` aborts when `Job.metadata` contains `\u0000` or a lone UTF-16 surrogate.
- **Root cause & fix:** Postgres `jsonb` rejects those code points. Added recursive `sanitizeJsonMetadata()`, `sanitizeJobDescriptionHtml()` and `sanitizeJobDescriptionPlain()`, plus `sanitizeText()` for single-line fields.
- **Implemented in:** `src/lib/Sanitizer.ts`. Applied in `validateAndSanitizeJob()` (inside `sanitizeJobBatch()`, called by `AshbyClient`) and again in `Scraper.processCompanyJobs()` (`sanitizeJsonMetadata(job)`).
- **Regression Invariant:** Every string anywhere in `Job.metadata` has `\u0000` and lone surrogates removed. The `descriptionHtml` value additionally has `<script>`/`<style>`/`<iframe>`/`<object>`/`<embed>`, inline `on*=` handlers, `javascript:`/`vbscript:` `href`/`src`, and base64 data URIs of 1 KB or more stripped. `descriptionPlain` falls back to tag-stripped HTML. `title`/`department`/`location`/`employmentType` go through `sanitizeText()` (control chars removed, entities decoded, whitespace collapsed). *(Correction: the earlier wording said script/style stripping applied to "every string". It applies only to the two description keys.)*
- **Guarding tests:** `tests/unit/Sanitizer.test.ts` (null bytes, lone surrogates, tags, handlers, base64, nested descriptions) ✅.
- **Regression Invariant:** When a source posting removes compensation or workplaceType fields, `batchUpsertJobs` explicitly sets them to `null` (not `undefined`) so Prisma clears the database columns. `postalAddress` uses `Prisma.DbNull` to write SQL NULL.

### BF-003: Broken / relative / unsafe `jobUrl` and `applyUrl`
- **Symptom:** Missing, relative, placeholder (`"undefined"`, `"null"`) or `javascript:` URLs.
- **Root cause & fix:** `sanitizeJobUrl()` parses with `new URL()`, resolves `/`-relative paths against `https://jobs.ashbyhq.com`, rejects `javascript:`/`data:`/`vbscript:`/`file:`/`mailto:` and non-http(s) protocols, and otherwise falls back to `https://jobs.ashbyhq.com/{slug}/{id}[/application]`.
- **Implemented in:** `src/lib/Sanitizer.ts` `sanitizeJobUrl()`. Called from `validateAndSanitizeJob()` (which records a `sanitized` issue), `Scraper.processCompanyJobs()` (`applyUrl`) and `ScraperCSV.fetchJobsForCompany()` (`jobUrl` → CSV "Job Link").
- **Regression Invariant:** `Job.applyUrl` and the CSV `Job Link` are always absolute `http(s)://` URLs. Invalid input falls back to the canonical Ashby URL and logs a `sanitized` validation issue.
- **Guarding tests:** `tests/unit/Sanitizer.test.ts`.

### BF-004: One corrupt record aborts a whole DB batch
- **Symptom:** A single constraint error inside `prisma.$transaction(batch)` rolled back all 100 jobs.
- **Root cause & fix:** Malformed records are pre-filtered (`validateAndSanitizeJob()` / `sanitizeJobBatch()`: non-objects, invalid/placeholder IDs, empty titles, duplicate IDs). `batchUpsertJobs()` wraps each batch in `try/catch`, and on failure retries each job individually with `upsert`, logging `[BatchError]` → `[JobStoreError]` and recording a `db_error` event (`skipped_corrupt_job_in_fallback`).
- **Implemented in:** `src/lib/Sanitizer.ts`, `src/core/Scraper.ts` `batchUpsertJobs()`.
- **Regression Invariant:** Any error in a batch (either the `createMany` fast path or the `$transaction` path) must fall back to per-job upserts so the valid jobs are still saved. Only failing `ashbyId`s are skipped and counted in `tracker.dbErrors`.
- **Guarding tests:** `tests/unit/ScraperCore.test.ts` ("fall back to per-job upserts and isolate failing job"), `tests/unit/Sanitizer.test.ts`. ⚠️ Only on the legacy `$transaction` branch. The fallback after a failing `createMany` (BF-010 path) and `tracker.dbErrors` are not asserted.

### BF-005: Salary columns always `NULL`
- **Symptom:** `salaryMin` / `salaryMax` / `salaryCurrency` were always `NULL`.
- **Root cause & fix:** The scraper read a non-existent `job.compensationTier`. Added `extractSalary()`, which tries `compensation.summaryComponents`, then `compensation.compensationTiers[].components`, then the legacy `compensationTier`. REST requests use `?includeCompensation=true` in DB mode.
- **Implemented in:** `src/lib/AshbyClient.ts` `extractSalary()`. Used by `Scraper.generateHash()` and `Scraper.processCompanyJobs()` → `buildUpsertArgs` / `createMany` data.
- **Regression Invariant:** `extractSalary()` supports all 3 shapes and uses only components with `compensationType === 'Salary'` and a non-null min or max. Its `min`/`max` go into `generateHash()`, and `min`/`max`/`currency` go into `create`, `update` and `createMany`. *(Correction: `salaryCurrency` is written but is **not** part of the hash, see 09 #31.)*
- **Guarding tests:** `tests/unit/AshbyClient.test.ts` (all 3 shapes + empty) ✅; `tests/unit/ScraperRunAll.test.ts` (guards explicit `salaryMin === null` payload when source removes salary) ✅.

### BF-006: Dept/Location upsert races, unbounded memory, stale jobs left active
- **Symptom:** Concurrent `P2002` crashes on `Department`/`Location`, all ~30k jobs buffered until the end of the run, and closed jobs staying `active = true`.
- **Root cause & fix:** Added `departmentInFlight` / `locationInFlight` Promise maps in front of `departmentCache` / `locationCache`. Added streaming flushes (`enqueueFlushIfNeeded()` chunks of `BATCH_SIZE = 100`, serialized through `flushChain`), `deactivateStaleJobs()` after every successful `rest`/`graphql` fetch, and `recordNotFoundStrike()` (3-strike `NOT_FOUND`).
- **Implemented in:** `src/core/Scraper.ts` (`getOrCreateDepartment`, `getOrCreateLocation`, `runAll`, `deactivateStaleJobs`, `recordNotFoundStrike`).
- **Regression Invariant:** Concurrent `getOrCreateDepartment`/`getOrCreateLocation` calls for the same name share one in-flight Promise. Pending jobs are flushed every 100 and at the end. Jobs are deactivated **only** after a successful board fetch (never on `source: 'none'`).
- **Guarding tests:** `tests/unit/ScraperRunAll.test.ts` (guards 100-job streaming flush, `deactivateStaleJobs()` stale job deactivation, and reactivation of inactive jobs with identical hash); `tests/unit/ScraperCore.test.ts` (cache hit, empty names, and `recordNotFoundStrike()` called directly).
- **⚠️ Unguarded / known broken:**
  - Concurrent in-flight dedupe has no test (no `Promise.all([get(x), get(x)])` → 1 upsert check).
  - **The 3-strike quarantine never triggers in production.** Strikes live in an in-memory `Map` per instance and `runAll()` fetches each company once per run (09 #29; the latest run had 1,109 `companiesNotFound`). The only test calls `recordNotFoundStrike()` three times directly.
  - *(Resolved in P1-T04 / D-06)* Jobs that reappear after deactivation are now reactivated properly; Redis change detection was removed so the DB `!prev.active` check reactivates returning jobs cleanly.

### BF-007: CSV / `JOBS.md` corruption from quotes, CRLF and pipes
- **Symptom:** Escaped quotes (`""`), `\r\n` and `|` in titles/locations broke CSV parsing and the Markdown table.
- **Root cause & fix:** `escapeCSV()` strips `\x00` and quotes on `,` `"` `\n` `\r`. `parseCSV()` normalizes CRLF and unescapes `""` inside quoted fields. `sanitizeMarkdownCell()` escapes `\|` and flattens newlines. `generateMarkdownTable()` percent-encodes `)` and whitespace in links.
- **Implemented in:** `src/core/ScraperCSV.ts` (`escapeCSV`, `formatCSVRow`), `scripts/generate-readme.ts` (`parseCSV`, `sanitizeMarkdownCell`, `generateMarkdownTable`).
- **Regression Invariant:** `parseCSV()` unescapes `""` inside quoted fields and handles `\r\n`. Every `JOBS.md` cell is passed through `sanitizeMarkdownCell()`. *(Limitation: `parseCSV()` splits lines before parsing quotes, so quoted multi-line fields are not supported. New CSVs are safe only because `sanitizeText()` removes newlines first. The committed `JOBS.md`, built from a pre-sanitizer CSV, already has one split row (29,911 rows from 29,910 records), see 09 #42.)*
- **Guarding tests:** `tests/unit/GenerateReadme.test.ts`, `tests/unit/ScraperCSV.test.ts`, `tests/e2e/ScraperPipeline.test.ts` (`""` and `\|` ✅). ⚠️ Newline flattening in Markdown cells and `\r\n` handling in `parseCSV()` have no test.

### BF-008: Single-process bottleneck & cross-process unique races
- **Symptom:** One Node event loop limited throughput, and multiple processes raced on `Department`/`Location` inserts.
- **Root cause & fix:** `ClusterScraper.ts` (`npm run scrape:parallel [-- --workers=N]`, default `min(4, max(2, cpus))`) forks `Scraper.ts --ipc-worker` children, shards slugs round-robin with `partitionSlugs()`, and merges results with `ErrorTracker.mergeReports()` + `saveMergedReport()`. `getOrCreateDepartment/Location` catch the upsert error and recover with `findUnique`.
- **Implemented in:** `src/core/ClusterScraper.ts` (`resolveWorkerCount`, `partitionSlugs`, `runWorkerShard`, `runClusterScrape`; added in `2cce729`), `src/core/Scraper.ts` (`--ipc-worker` handler, `runAll({ saveTelemetry })`, `findUnique` P2002 recovery; these landed earlier in `f872356`, and `2cce729` did not touch `Scraper.ts`), `src/lib/ErrorTracker.ts` (`mergeReports`/`saveMergedReport`, also from `f872356`).
- **Regression Invariant:** Workers run with `saveTelemetry: false` (also the default when `workerId` is set) and send `{ type: 'worker_done', report }` over IPC. Only `ClusterScraper` writes `latest-error-report.json`. A cross-process `P2002` on `Department`/`Location` is recovered via `findUnique`.
- **Guarding tests:** `tests/unit/ClusterScraper.test.ts` (`resolveWorkerCount`, `partitionSlugs`, `mergeReports`), `tests/unit/ScraperCore.test.ts` (P2002 recovery).
- **⚠️ Unguarded:** the `saveTelemetry: false` / IPC `worker_done`/`worker_error` contract, the single `saveMergedReport` write, and `Location` P2002 recovery (only `Department` is tested) have no test. If one worker fails, `Promise.all` rejects and the merged report is lost (09 #35).

### BF-009: CSV-mode telemetry under-reported fallbacks; `verify` incomplete
- **Symptom:** `csv_scrape` reports showed `graphqlFallbacksUsed: 0` even when boards (e.g. `go-augment`) were recovered via GraphQL, and `Verify.ts` skipped `Location`.
- **Root cause & fix:** `fetchJobsForCompany()` ignored `source`, `rateLimited`, `notFound` and `validationIssues`. It now takes `tracker`, `onRateLimit` and `onSuccess`, and `scrapeToCSV()` wires them to the `ErrorTracker` and the `AdaptiveLimiter`. `verifyDatabase()` was upgraded in `635e69d` to count all 4 tables, ACTIVE/NOT_FOUND companies and salary coverage, and to audit a 500-job sample.
- **Implemented in:** `src/core/ScraperCSV.ts` `fetchJobsForCompany()` / `scrapeToCSV()`, `src/utils/Verify.ts` `verifyDatabase()`.
- **Regression Invariant:** When a tracker is passed, `fetchJobsForCompany()` records `graphql_fallback` events, `rateLimitsEncountered`, `companiesNotFound` and `validationIssues`, and calls `onRateLimit`/`onSuccess`. `verifyDatabase()` returns counts for all 4 tables and the three integrity counters (`emptyTitles`, `invalidApplyUrls`, `nullByteMetadataIssues`). *(Correction: it reports defects but does not fail or exit non-zero on them.)*
- **Guarding tests:** `tests/unit/Verify.test.ts` ✅. `tests/unit/ScraperCSV.test.ts` calls `fetchJobsForCompany()` **without** a tracker, so the forwarding invariant is ❌ unguarded.
- **Known gap:** on the GraphQL path `validationIssues` is always undefined, because `fetchFromAshbyGraphQL()` drops them (09 #32).

### BF-010: Full 3,072-company WAN scrape bottlenecked on per-row queries
- **Symptom:** About 34,000 individual `prisma.job.upsert` calls and 3,072 `deactivateStaleJobs` round trips over WAN.
- **Root cause & fix:** `batchUpsertJobs()` now runs one `findMany` per batch, `createMany({ skipDuplicates: true })` for new `ashbyId`s, and `$transaction(upsert)` only for existing rows whose `contentHash` changed or that are `!active`. It falls back to the plain `$transaction(upsert)` path when `findMany`/`createMany` are unavailable. `runAll()` pre-warms `departmentCache`/`locationCache` and loads `companiesWithExistingJobs` (distinct `companySlug` of active jobs) to skip `deactivateStaleJobs()` for companies with no prior active jobs. `ClusterScraper` uses 12 requests per worker when there are more than 100 companies. Result: 34,035 jobs / 1,747 companies in 141.3 s with `--workers=8`.
- **Implemented in:** `src/core/Scraper.ts` (`batchUpsertJobs`, `runAll` pre-warm), `src/core/ClusterScraper.ts` (`perWorkerConcurrency`).
- **Regression Invariant:** When `prisma.job.findMany` and `prisma.job.createMany` exist, new IDs go through `createMany` and only changed or inactive existing rows are upserted. Unchanged rows cause no write. The `catch` per-job fallback (BF-004) still wraps both paths.
- **Guarding tests:** `tests/unit/ScraperRunAll.test.ts` (asserts `createMany({ skipDuplicates: true })` fast-path handles newly discovered IDs in 100-job chunks).
- **Known gap:** because the hash covers only five fields, "unchanged" can hide real changes (09 #31; resolved in BF-011).

### BF-011: Promotion of structured Posting API fields, GraphQL field preservation, company enrichment, and full change detection
- **Symptom:** Salary filters could not distinguish between hourly ($60/hr) and yearly ($150,000/yr) rates; `isRemote`, `workplaceType`, `country`, `city`, and `publishedAt` were trapped in JSONB without first-class database columns or indexes; GraphQL fallback dropped `workplaceType` and `secondaryLocations`; `generateHash()` ignored 11 stored fields (#31); and active hiring companies had unpopulated `name` (= slug) and null `logoUrl`.
- **Root cause & fix:**
  1. Extended `prisma/schema.prisma` with indexed columns `salaryInterval`, `isRemote`, `workplaceType`, `employmentType`, `publishedAt`, `isListed`, `country`, `region`, `city`, `postalAddress` and ran `npx prisma db push`.
  2. Promoted `extractSalary()` in `src/lib/AshbyClient.ts` to parse interval (`1 YEAR`, `1 HOUR`, etc.); updated `fetchFromAshbyGraphQL()` to map `workplaceType`, `secondaryLocations`, and return GraphQL `validationIssues`.
  3. Extended `generateHash()` in `src/core/Scraper.ts` across all 16 fields, resolving known issue #31.
  4. Wrote and executed `BackfillJobFields.ts` (`npm run db:backfill`) which backfilled all 34,037 active jobs in Postgres with structured columns.
  5. Built and executed `EnrichCompanies.ts` (`npm run enrich:companies`) which concurrently enriched 1,729 / 1,747 active hiring companies (99.0%) with real names and logos in 30.77s.
- **Implemented in:** `prisma/schema.prisma`, `src/lib/AshbyClient.ts`, `src/lib/Sanitizer.ts`, `src/core/Scraper.ts`, `src/database/BackfillJobFields.ts`, `src/utils/EnrichCompanies.ts`.
- **Regression Invariant:** `extractSalary()` returns `interval` whenever present; `generateHash()` hashes all 16 fields; `validateAndSanitizeJob()` preserves `workplaceType` and defaults `isListed` to true; `fetchFromAshbyGraphQL()` preserves `workplaceType` and `secondaryLocations`.
- **Guarding tests:** `tests/unit/AshbyClient.test.ts` (`extractSalary` with interval and legacy shape).
- **Known gap:** GraphQL fallback list endpoints do not provide `publishedAt` or descriptions (only 22 jobs affected, addressable via single-posting GraphQL queries if needed).

### BF-012: React UI with RTK Query and Backend REST API with Dual Rate Limiting
- **Symptom:** No web UI or REST API existed to query the 34,000+ jobs directly; un-debounced search fired rapid-fire queries that overwhelmed rate limits; duplicate in-flight queries occurred in React StrictMode.
- **Root cause & fix:**
  1. Built React 19 + TypeScript + Vite 6 + Redux Toolkit + RTK Query + MUI v6 UI (`job-scrapper-ui/`) with responsive desktop ledger and mobile drawer layouts.
  2. Built Express REST API (`src/api/Server.ts`, `npm run api:start`) connecting directly to Neon PostgreSQL with structured pagination, filtering, facets, and SPA static serving.
  3. Enforced a dual-layer rolling rate limit of 10 requests / 60 seconds (backend sliding window middleware + frontend `rateLimitSlice` in Redux and `baseQueryWithRateLimit`).
  4. Implemented 400ms search input debouncing on Browse and Companies pages to eliminate keystroke spam.
  5. Implemented 10-minute Redux caching (`keepUnusedDataFor: 600`) so revisited pages consume zero rate limit quota.
  6. Added security hardening: HTTP security headers, DoS query capping at 100 chars, trust proxy configuration, and periodic rate-limiter map pruning.
- **Implemented in:** `src/api/Server.ts`, `job-scrapper-ui/` (`src/store/`, `src/pages/`, `src/components/`, `src/theme/`).
- **Regression Invariant:** `baseQueryWithRateLimit` gates requests based on `state.rateLimit.timestamps`; `jobsApi` endpoints cache for 600 seconds; Express server enforces 10 req/min with `Retry-After` header.
- **Guarding tests:** Unit tests pass (79 tests). Frontend verified via production build (`npm --prefix job-scrapper-ui run build`).

### BF-013: Security hardening, facets API implementation, and filter OR-clobber fix
- **Symptom:** Combining `search` with `hasSalary` clobbered the Prisma `where.OR` clause, returning broken search results; `/v1/facets` was defined in types and API contract but not implemented in Express; client IP resolution was vulnerable to header spoofing; `descriptionHtml` lacked client-side DOMPurify sanitization.
- **Root cause & fix:**
  1. Refactored `src/api/Server.ts` query builder to accumulate conditions in `where.AND = andConditions`, preserving both multi-field search and `hasSalary` filters simultaneously.
  2. Implemented `GET /v1/facets` using Prisma `groupBy` across workplace types, employment types, top 20 countries, and salary counts.
  3. Installed `dompurify` in `job-scrapper-ui` and wrapped all HTML description injection in `DOMPurify.sanitize()` for defense-in-depth against Stored XSS.
  4. Added Content-Security-Policy (CSP) headers to Express responses.
  5. Fixed SPA routing fallback in Express to support `HEAD` requests and check `req.accepts('html')`.
  6. Corrected client IP resolution to prioritize `req.ip` under `trust proxy` to prevent client header spoofing.
- **Implemented in:** `src/api/Server.ts`, `job-scrapper-ui/src/pages/JobDetailPage.tsx`, `job-scrapper-ui/package.json`.
- **Regression Invariant:** Combined search + salary filters use `where.AND` and do not clobber; `/v1/facets` returns workplaceTypes, employmentTypes, countries, and hasSalary; `JobDetailPage` sanitizes HTML via DOMPurify.
- **Guarding tests:** Verified via Jest unit suites (79 tests) and live API endpoint verification.

---

## 📈 Improvement Log & Future Packaging Roadmap

### Completed improvements (referred to as "v1.1.0". `package.json` still reads `1.0.0` and there are no tags)
- **Adaptive concurrency (`src/lib/Concurrency.ts`):** `onRateLimit()` halves concurrency (floor 2) and pauses for 2 s. `onSuccess()` adds 1 back after 25 consecutive successes.
- **Multi-source discovery (`src/discovery/CdxWorker.ts`, `src/utils/Seed.ts`):** CommonCrawl index (`--common-crawl`, first page of `CC-MAIN-2024-51` only), `window.__appData` name/logo enrichment (`--enrich`), a larger slug `BLOCKLIST`, and `seed -- --all` from `extracted-slugs.json` (3,072 slugs).
- **Automated telemetry (`src/lib/ErrorTracker.ts`):** every DB, cluster or CSV scrape writes `output/latest-error-report.json` for the Bug-Fix Agent.
- **Database auditor (`src/utils/Verify.ts`, `635e69d`):** `npm run verify` reports table counts, salary coverage and sample integrity.

### Next phase: turning the toolkit into an application (after stabilization)
Once all company scrapes are stable through the Bug-Fix Agent loop above, there are three ways to package this for end users:

1. **Recommended: React web app (Next.js or Vite + Express/Fastify)**
   - **Why:** It reuses the existing TypeScript code, Prisma schema and Neon PostgreSQL database.
   - **What it adds:** A dashboard to browse and filter about 34k jobs by title, salary, remote status, company and location, plus a "Run Scraper" button with live progress and a `latest-error-report.json` viewer.
2. **Desktop app (Electron or Tauri + React):** wraps the React UI and the Node.js scraper into a standalone macOS (`.dmg`) or Windows (`.exe`) app.
3. **Standalone CLI executable (Node Single Executable Applications / `pkg`):** bundles the CLI into a single `job-scraper` binary that needs no local Node.js install.
