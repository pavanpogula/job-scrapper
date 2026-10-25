# 10 · Bug-Fix Registry, Regression Guards & Improvement Log

> **Purpose:** This is the **mandatory checklist and decision log** for any human developer or **Bug-Fix Agent** changing this repository.
> Every scrape run makes `ErrorTracker` (`src/lib/ErrorTracker.ts`) write telemetry and captured errors to `output/latest-error-report.json`.
> Before applying any new fix, the agent **must** check that none of the **Regression Invariants** below would be broken.
>
> _Registry last audited against the code: 2026-10-22 (HEAD `89a1fd2`). Each entry cites where the fix lives and whether a test actually guards its invariant._

---

## 🤖 Bug-Fix Agent Protocol

All bug-fix workflows follow the mandatory 9-step self-healing protocol documented in [`documentation/16-self-healing-loop.md`](./16-self-healing-loop.md). This registry serves as the authoritative checklist of Regression Invariants (`BF-001` through `BF-019+`). Every fix must check and preserve all invariants below before committing.

---

## 🛡️ Regression Guard Registry

Guard status legend: ✅ an existing test fails if the invariant breaks · ⚠️ partially guarded · ❌ no test guards it.
The clause-by-clause test mapping and coverage numbers are in [`11-testing-guide.md` §5–§6](./11-testing-guide.md#6-bf--regression-invariants--guarding-tests). `src/core` has about 31.6 % statement coverage, and `runAll()`, `runClusterScrape()` and `scrapeToCSV()` have no tests.

| ID | Commit | Summary | Guard status |
|---|---|---|---|
| BF-001 | `f872356` | REST 404/403/400 → GraphQL fallback, browser headers | ⚠️ (404 only, headers unchecked) |
| BF-002 | `f872356` | `\u0000` / surrogate / script stripping before `jsonb` | ✅ |
| BF-003 | `f872356` | URL validation + canonical fallback | ✅ |
| BF-004 | `f872356` | Validation pre-filter + per-job batch fallback | ✅ |
| BF-005 | `f872356` | Real salary extraction, null-clearing on removal | ✅ |
| BF-006 | `f872356` | Dept/location dedupe, streaming flushes, stale-job deactivation, 3-strike quarantine | ✅ |
| BF-007 | `f872356` | CSV / Markdown escaping | ⚠️ (newline/CRLF untested) |
| BF-008 | `f872356`, `2cce729`, HEAD | Multi-process cluster scraper (watchdog, allSettled, report saved on worker failure) | ✅ |
| BF-009 | `747d8d1`, `635e69d` | CSV-mode telemetry parity, `verify` auditor | ⚠️ (forwarding untested, Verify counts only) |
| BF-010 | `627dfae` | Bulk `createMany` fast path, cache pre-warming | ❌ none, see 11-testing-guide.md |
| BF-011 | `2cdced2` | Structured field promotion, GraphQL preservation, company enrichment, and full-field hash (#31) | ✅ (`ContentHash.test.ts` 17 cases, `extractSalary` interval, unit tests) |
| BF-012 | `831ae95` | React UI with RTK Query and Backend REST API with Dual Rate Limiting | ✅ (`tests/unit/ApiServer.test.ts`, rate limit and security headers) |
| BF-013 | `632c83c` | Security hardening, facets API implementation, and filter OR-clobber fix | ✅ (`tests/unit/ApiServer.test.ts`; DOMPurify XSS tests in P5-T07) |
| BF-014 | `55465a0` | Limiter pause timer event loop retention (SCR-09) | ✅ (`tests/unit/ConcurrencyExit.test.ts`) |
| BF-015 | `8895d95` | Posting API failure classification, 429 rate limit scoping, and Retry-After header honoring (SCR-11/12) | ✅ (`tests/unit/AshbyClient.test.ts`, `ScraperRunAll.test.ts`) |
| BF-016 | `38f4f01` | GraphQL source preservation against REST overwrite and empty board deactivation deferral (SCR-16/17) | ✅ (`tests/unit/ScraperRunAll.test.ts`) |
| BF-017 | HEAD | Cache publishing orchestration, worker failure isolation, and exit code contract (CACHE-04, GAP-OPS-06) | ✅ (`tests/unit/ClusterScraper.test.ts`, `ScraperRunAll.test.ts`) |

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
- **Guarding tests:** `tests/unit/CompanyHealth.test.ts` (guards 3-strike quarantine, weekly Sunday recheck, success reset counters) ✅; `tests/unit/ScraperRunAll.test.ts` (guards 100-job streaming flush and `deactivateStaleJobs()` stale job deactivation) ✅.
- **⚠️ Unguarded / known broken:**
  - Concurrent in-flight dedupe has no test (no `Promise.all([get(x), get(x)])` → 1 upsert check).
  - *(Resolved in P1-T07)* 3-strike quarantine persisted on `Company.consecutiveNotFound` and rechecks on Sunday.
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
- **Regression Invariant:** Workers run with `saveTelemetry: false` (also the default when `workerId` is set) and send `{ type: 'worker_done', report }` or `{ type: 'worker_error' }` over IPC. `runClusterScrape` coordinates via `Promise.allSettled`, watchdog timeout sends `SIGTERM` then `SIGKILL`, signal handlers forward to children, and a partial or failed merged report is always saved with exit code 1 on worker failure.
- **Guarding tests:** `tests/unit/ClusterScraper.test.ts` (`resolveWorkerCount`, `partitionSlugs`, `mergeReports`, `1 of 2 fails → report saved, exit 1`, `timeout → SIGTERM then SIGKILL`), `tests/unit/ScraperCore.test.ts` (P2002 recovery).

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
  4. Backfilled active jobs in Postgres with structured columns.
  5. Built and executed `EnrichCompanies.ts` (`npm run enrich:companies`) which concurrently enriched 1,729 / 1,747 active hiring companies (99.0%) with real names and logos in 30.77s.
- **Implemented in:** `prisma/schema.prisma`, `src/lib/AshbyClient.ts`, `src/lib/Sanitizer.ts`, `src/core/Scraper.ts`, `src/utils/EnrichCompanies.ts`.
- **Regression Invariant:** `extractSalary()` returns `interval` whenever present; `generateHash()` hashes all 16 fields; `validateAndSanitizeJob()` preserves `workplaceType` and defaults `isListed` to true; `fetchFromAshbyGraphQL()` preserves `workplaceType` and `secondaryLocations`.
- **Guarding tests:** `tests/unit/AshbyClient.test.ts` (`extractSalary` with interval and legacy shape).
- **Known gap:** GraphQL fallback list endpoints do not provide `publishedAt` or descriptions (only 22 jobs affected, addressable via single-posting GraphQL queries if needed).

### BF-012: React UI with RTK Query and Backend REST API with Dual Rate Limiting
- **Symptom:** No web UI or REST API existed to query the 34,000+ jobs directly; un-debounced search fired rapid-fire queries that overwhelmed rate limits; duplicate in-flight queries occurred in React StrictMode.
- **Root cause & fix:**
  1. Built React 19 + TypeScript + Vite 6 + Redux Toolkit + RTK Query + MUI v6 UI (`frontend/`) with responsive desktop ledger and mobile drawer layouts.
  2. Built Express REST API (`src/api/Server.ts`, `npm run api:start`) connecting directly to Neon PostgreSQL with structured pagination, filtering, facets, and SPA static serving.
  3. Enforced a dual-layer rolling rate limit of 10 requests / 60 seconds (backend sliding window middleware + frontend `rateLimitSlice` in Redux and `baseQueryWithRateLimit`).
  4. Implemented 400ms search input debouncing on Browse and Companies pages to eliminate keystroke spam.
  5. Implemented 10-minute Redux caching (`keepUnusedDataFor: 600`) so revisited pages consume zero rate limit quota.
  6. Added security hardening: HTTP security headers, DoS query capping at 100 chars, trust proxy configuration, and periodic rate-limiter map pruning.
- **Implemented in:** `src/api/Server.ts`, `frontend/` (`src/store/`, `src/pages/`, `src/components/`, `src/theme/`).
- **Regression Invariant:** `baseQueryWithRateLimit` gates requests based on `state.rateLimit.timestamps`; `jobsApi` endpoints cache for 600 seconds; Express server enforces 10 req/min with `Retry-After` header.
- **Guarding tests:** Unit tests pass (79 tests). Frontend verified via production build (`npm --prefix frontend run build`).

### BF-013: Security hardening, facets API implementation, and filter OR-clobber fix
- **Symptom:** Combining `search` with `hasSalary` clobbered the Prisma `where.OR` clause, returning broken search results; `/v1/facets` was defined in types and API contract but not implemented in Express; client IP resolution was vulnerable to header spoofing; `descriptionHtml` lacked client-side DOMPurify sanitization.
- **Root cause & fix:**
  1. Refactored `src/api/Server.ts` query builder to accumulate conditions in `where.AND = andConditions`, preserving both multi-field search and `hasSalary` filters simultaneously.
  2. Implemented `GET /v1/facets` using Prisma `groupBy` across workplace types, employment types, top 20 countries, and salary counts.
  3. Installed `dompurify` in `frontend` and wrapped all HTML description injection in `DOMPurify.sanitize()` for defense-in-depth against Stored XSS.
  4. Added Content-Security-Policy (CSP) headers to Express responses.
  5. Fixed SPA routing fallback in Express to support `HEAD` requests and check `req.accepts('html')`.
  6. Corrected client IP resolution to prioritize `req.ip` under `trust proxy` to prevent client header spoofing.
- **Implemented in:** `src/api/Server.ts`, `frontend/src/pages/JobDetailPage.tsx`, `frontend/package.json`.
- **Regression Invariant:** Combined search + salary filters use `where.AND` and do not clobber; `/v1/facets` returns workplaceTypes, employmentTypes, countries, and hasSalary; `JobDetailPage` sanitizes HTML via DOMPurify.
- **Guarding tests:** Verified via Jest unit suites (79 tests) and live API endpoint verification.

### BF-014: Limiter unref pause timer premature process exit
- **Symptom:** Limiter rate-limit cooldown paused execution with `pauseTimer.unref()`, causing Node.js to see no active handles and exit prematurely with remaining queued tasks unexecuted (e.g. `tasksDone=2/4`).
- **Root cause & fix:** Removed `pauseTimer.unref()` from `src/lib/Concurrency.ts`. The cooldown timer now properly maintains active reference in the Node.js event loop until cooldown completes and queued tasks resume.
- **Implemented in:** `src/lib/Concurrency.ts`.
- **Regression Invariant:** Rate limit cooldown timer must retain the Node.js event loop so in-flight and queued tasks are never abandoned by early process exit.
- **Guarding tests:** `tests/unit/ConcurrencyExit.test.ts` running `tests/fixtures/limiter-exit.ts` (asserts `tasksDone=4/4` and exit code 0).

### BF-015: Posting API failure classification, 429 rate limit scoping, and Retry-After header honoring
- **Symptom:** Exhausted 5xx/timeout/network errors on Ashby board fetch silently returned `{ source: 'none', notFound: false }` without emitting any error event, masking network dropouts as empty boards. In addition, HTTP 403 on posting-api was incorrectly classified as rate-limiting (`sawRateLimit = true`), unnecessarily halving concurrency even when GraphQL fallback succeeded, and upstream `Retry-After` headers were ignored.
- **Root cause & fix:**
  1. Updated `AshbyBoardFetchResult` in `src/lib/AshbyClient.ts` to include structured `failure?: { kind: 'http' | 'timeout' | 'network'; status?: number; code?: string; attempts: number }`.
  2. Only HTTP 429 sets `sawRateLimit = true`. 403/400 now cleanly attempt GraphQL fallback without penalizing concurrency.
  3. Extracted and parsed `Retry-After` header on HTTP 429, capping delay at 10 seconds.
  4. Both `Scraper.ts` and `ScraperCSV.ts` now emit `api_error` events when `failure` is present and `rate_limited` when `rateLimited` is true.
- **Implemented in:** `src/lib/AshbyClient.ts`, `src/core/Scraper.ts`, `src/core/ScraperCSV.ts`.
- **Regression Invariant:** Only HTTP 429 triggers `sawRateLimit`; Retry-After header is honored (capped at 10 s); exhausted network/http failures emit `api_error` with failure details and attempt counts.
- **Guarding tests:** `tests/unit/AshbyClient.test.ts` (403/400 fallback, BROWSER_HEADERS on GET/POST, 503×3 failure, ETIMEDOUT timeout, 403 rateLimited: false, Retry-After capping), `tests/unit/ScraperRunAll.test.ts` (records api_error event).

### BF-016: GraphQL source preservation against REST overwrite and empty board deactivation deferral
- **Symptom:** If a company temporarily fell back to GraphQL, less detailed GraphQL records overwrote richer REST records (e.g. descriptions, publishedAt, salary intervals) in Postgres. In addition, a single transient empty `200` response from Ashby would immediately deactivate all active jobs for companies with substantial listings.
- **Root cause & fix:**
  1. Stamped `metadata._source` ('rest' or 'graphql') during job processing.
  2. When a GraphQL result arrives over an existing REST row, the scraper executes only a raw SQL update setting `active = true` and `lastSeenAt = now`, leaving `updatedAt` and rich REST content intact.
  3. Added `pendingEmptySince` to `Company` model in Prisma schema.
  4. When a company with ≥ 5 active jobs returns an empty board (200 OK, 0 jobs), deactivation is deferred for one run, recording `pendingEmptySince` and emitting `suspicious_empty_board`. If the board is empty on the second consecutive run, deactivation proceeds and `pendingEmptySince` is reset.
- **Implemented in:** `prisma/schema.prisma`, `src/core/Scraper.ts`.
- **Regression Invariant:** GraphQL fallback never overwrites rich REST job content or bumps `updatedAt`; empty boards for companies with ≥ 5 active jobs defer deactivation for one scrape cycle and record `suspicious_empty_board`.
- **Guarding tests:** `tests/unit/ScraperRunAll.test.ts` (`-t "graphql does not overwrite rest content"` and `-t "empty board deferred one run"`).

### BF-017: Cache publishing orchestration, worker failure isolation, and exit code contract
- **Symptom:** Without coordination between scrapers and the Redis publisher, partial worker failures in cluster mode could publish corrupted or incomplete cache generations, and exit codes did not distinguish between scraper crashes (exit 1) and cache publication failures / sanity gate trips (exit 2). In addition, debug runs with `--skip-publish` failed to update `meta:lastScrapeAt`.
- **Root cause & fix:**
  1. Updated `ClusterScraper.ts` so `publishCacheGeneration()` is invoked only after `Promise.allSettled()` confirms 100% of workers succeeded.
  2. If any worker failed or timed out, cache publication is skipped (`skipped_incomplete_run`), `meta:lastScrapeAt` is untouched, and process exits 1.
  3. When scraping succeeds but cache publishing fails or trips the sanity gate (`gated`), `exitCode = 2` is emitted (GAP-OPS-06).
  4. Both `ClusterScraper.ts` and `Scraper.ts` honor `--skip-publish` by calling `recordScrapeFinished()` and setting cache status to `skipped_flag` with exit code 0.
- **Implemented in:** `src/core/ClusterScraper.ts`, `src/core/Scraper.ts`, `src/cache/Publisher.ts`.
- **Regression Invariant:** Cache publishing is never attempted if any worker fails; cache publication failure or sanity gate tripping yields exit code 2; `--skip-publish` records scrape timestamp and yields exit code 0.
- **Guarding tests:** `tests/unit/ClusterScraper.test.ts` (all ok -> publish once exit 0; 1 worker fails -> publish skipped exit 1; publish fails -> exit 2; skip-publish -> exit 0), `tests/unit/ScraperRunAll.test.ts` (`-t "standalone runAll honors publish: true and skipPublish"`).

### BF-018: API cache read-through parity, detail sharding, and negative 404 LRU cache
- **Symptom:** Direct PostgreSQL queries on every API request risked exhausting serverless connection pools and Neon compute quotas. Uncached detail lookups on nonexistent IDs triggered repetitive database queries.
- **Root cause & fix:**
  1. Implemented `ReadThroughService` (`src/api/cache/ReadThrough.ts`) serving lists, facets, companies, and meta through Upstash Redis generations with in-process LRU cache.
  2. Implemented detail shard lookup querying `jc:v1:details:<shard>` (8 shards via `CRC32(id) % 8`) and `jc:v1:details:index` fallback.
  3. Added 10-minute in-process negative LRU cache for confirmed 404 lookups.
  4. Non-UUID IDs return 404 immediately with zero database and zero Redis operations.
  5. Backpressure protection via `DbGuard` (max 3 concurrent active DB queries, 10 queue, 503 backpressure) and `singleFlight` deduplication.
- **Implemented in:** `src/api/cache/ReadThrough.ts`, `src/api/middleware/dbGuard.ts`, `src/api/middleware/cacheControl.ts`, `src/api/Server.ts`.
- **Regression Invariant:** All cacheable views return identical payload contract to direct DB queries; detail queries lookup CRC32 shard hashes; confirmed 404s are negatively cached for 10 minutes; non-UUID IDs execute zero I/O; concurrent DB queries are capped at 3 with single-flight deduplication.
- **Guarding tests:** `tests/unit/ReadThrough.test.ts`, `tests/unit/Hardening.test.ts`, `tests/unit/HealthMeta.test.ts`, `tests/unit/ApiServer.test.ts`.

### BF-019: Cache/DB body parity, full companies cache, and API Redis cold-start connect
- **Symptom:** Once a cache generation was live, the UI would receive `{data: facets}` / `{data: meta}` instead of the bare objects the DB path returns, cached job pages lacked `hasNext`/`hasPrev`, `/v1/companies` used a different `meta` layout, and later company pages came back empty. After every serverless cold start the first Redis commands were rejected.
- **Root cause & fix:**
  1. `Publisher.ts` serialized bodies in its own shape; it now stores exactly what `queryJobs`, `computeFacets` and `queryCompanies` return (bare facets/meta, top-level company paging, `hasNext`/`hasPrev` on every job page).
  2. `queryCompanies` was called once with `pageSize: 100`; `fetchAllCompanies()` now pages until `totalPages`.
  3. The API client is `lazyConnect` with `enableOfflineQueue:false`; `ReadThroughService.getReadyClient()` connects an idle (`wait`/`end`) client once through a shared promise and records a breaker failure if connecting fails.
  4. `/v1/meta` DB fallback counts `hiringCompanies` over `active AND isListed` jobs, like the publisher.
- **Implemented in:** `src/cache/Publisher.ts`, `src/api/cache/ReadThrough.ts`, `src/api/Server.ts`.
- **Regression Invariant:** For every cached view, the gunzipped cache body equals the DB-path body for the same request (ignoring `meta.lastScrapeAt`/`generation`); every ACTIVE company page is cached; an idle API Redis client is connected before the first command.
- **Guarding tests:** `tests/unit/CacheParity.test.ts`, `tests/unit/HealthMeta.test.ts`.

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
