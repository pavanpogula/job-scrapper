# 10 · Bug-Fix Registry, Regression Guards & Improvement Log

> **Purpose:** This document is the **mandatory checklist and decision log** for any human developer or **Bug-Fix Agent** modifying this repository.
> Every time the scraper runs, `ErrorTracker` (`src/lib/ErrorTracker.ts`) writes telemetry and captured errors to `output/latest-error-report.json`.
> Before applying any new fix, the agent **must** verify that none of the existing **Regression Invariants** below are violated.

---

## 🤖 Bug-Fix Agent Workflow (Mandatory 5-Step Loop)

When spun up to investigate errors or improve the scraper, follow this exact loop:

1. **Inspect Latest Run Telemetry & Errors:**
   - Read `output/latest-error-report.json` (and `output/error-report_YYYY-MM-DD.json`).
   - Check `summary` (`jobsFilteredOut`, `jobsSanitized`, `dbErrors`, `graphqlFallbacksUsed`, `rateLimitsEncountered`) and inspect `events[]` for the exact `companySlug`, `jobId`, `field`, `category`, and `message`.
2. **Check Regression Invariants (Below):**
   - Review every entry (`BF-001` through `BF-007+`) in Section 2 of this file to ensure your proposed change will **not** break an earlier fix.
3. **Implement Fix & Update Filters/Sanitizers:**
   - Update the relevant module (`src/lib/Sanitizer.ts`, `src/lib/AshbyClient.ts`, `src/core/Scraper.ts`, `src/discovery/CdxWorker.ts`, etc.).
4. **Add Unit & E2E Tests and Verify:**
   - Add a unit test in `tests/unit/` and/or E2E test in `tests/e2e/` covering the exact error payload observed.
   - Run:
     ```bash
     npx tsc --noEmit -p . && npm run lint && npm test && npm run docs:generate
     ```
   - All existing and new tests must pass with `0` TypeScript and `0` ESLint errors.
5. **Log the Fix & Sync Docs:**
   - Append a new `BF-XXX` row to Section 2 of this file (including its **Regression Invariant** and **Guarding Test**), and update `AGENTS.md`, `README.md`, `documentation/09-known-issues-and-tech-debt.md`, and any other affected `documentation/*.md` files.
6. **Commit with Detailed Description:**
   - Stage all code, test, agent, and documentation changes (never `.env`, `apikeys/`, or `output/`) and create a detailed `git commit` describing the symptom, root cause, architectural fix, test coverage, and documentation updates.

---

## 🛡️ Regression Guard Registry (Historical Bug Fixes)

| ID | Date | Bug / Symptom | Root Cause & Architectural Fix | Regression Invariant (Must NEVER Break) | Guarding Tests |
|---|---|---|---|---|---|
| **BF-001** | 2026-10-22 | Company URLs return `404`/`403` in scraper (`api.ashbyhq.com`) but open with live jobs in the browser (`jobs.ashbyhq.com/<slug>`). | Ashby's external `posting-api` is opt-in. Companies using only Ashby's hosted board return `404`/`403` on the REST API. Added `fetchAshbyBoardWithFallback()` with Chrome `BROWSER_HEADERS`, retry/backoff, and automatic fallback to `POST https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams`. | Never mark a company `NOT_FOUND` on a `posting-api` 404/403 without first checking `fetchFromAshbyGraphQL()`. Always send `BROWSER_HEADERS`. | `tests/unit/AshbyClient.test.ts`, `tests/e2e/ScraperPipeline.test.ts` |
| **BF-002** | 2026-10-22 | PostgreSQL `jsonb` transaction crashes when storing job descriptions (`descriptionHtml` / `descriptionPlain`) or `metadata`. | PostgreSQL `jsonb` rejects strings containing `\u0000` (null bytes) or lone UTF-16 surrogates, aborting the entire 100-job `$transaction`. Added `sanitizeJobDescriptionHtml()`, `sanitizeJobDescriptionPlain()`, and recursive `sanitizeJsonMetadata()` in `src/lib/Sanitizer.ts`. | Every string written to `Job.metadata` or text columns must be stripped of `\u0000` null bytes, lone surrogates, `<script>`/`<style>`/`<iframe>` tags, inline JS handlers, and `>1KB` base64 data URIs. | `tests/unit/Sanitizer.test.ts` |
| **BF-003** | 2026-10-22 | Broken, missing, relative, or `javascript:` URLs in `jobUrl` and `applyUrl`. | Raw job objects occasionally omit `applyUrl`/`jobUrl` or contain relative paths or invalid strings. Added `sanitizeJobUrl()` to validate `http(s):` via `new URL()`, resolve relative paths against `https://jobs.ashbyhq.com`, and fall back to canonical `https://jobs.ashbyhq.com/{slug}/{id}[/application]`. | `Job.applyUrl` and CSV `Job Link` must always be valid absolute `http(s)://` URLs; invalid URLs must fall back to the canonical Ashby URL and log a `sanitized` issue. | `tests/unit/Sanitizer.test.ts` |
| **BF-004** | 2026-10-22 | Single corrupt job record aborts entire 100-job DB batch transaction (`batchUpsertJobs`). | A single unexpected DB constraint error inside `prisma.$transaction(batch)` rolled back all 100 jobs in the chunk. Added `validateAndSanitizeJob()` pre-filtering plus a `try/catch` per-job fallback loop inside `batchUpsertJobs()`. | `batchUpsertJobs()` must catch `$transaction` errors and retry each job in the failed batch individually so 99 valid jobs are still saved and only the offending `ashbyId` is logged. | `tests/unit/ScraperCore.test.ts`, `tests/unit/Sanitizer.test.ts` |
| **BF-005** | 2026-10-22 | Salary columns (`salaryMin`, `salaryMax`, `salaryCurrency`) in Postgres were always `NULL`. | `Scraper.ts` read non-existent `job.compensationTier` instead of `job.compensation.summaryComponents`. Added `extractSalary()` in `src/lib/AshbyClient.ts` supporting `summaryComponents`, `compensationTiers`, and legacy `compensationTier`. | `extractSalary()` must support all 3 compensation shapes and feed `generateHash()`, `create`, and `update` (including `salaryCurrency`). | `tests/unit/AshbyClient.test.ts`, `tests/unit/ScraperCore.test.ts` |
| **BF-006** | 2026-10-22 | Concurrent `P2002` unique constraint crashes on `Department`/`Location` upserts, high RAM usage, and stale closed jobs staying `active=true`. | Parallel workers upserted identical new department/location names simultaneously; all 30k jobs were buffered until the end; removed jobs were never deactivated. Added `departmentInFlight`/`locationInFlight` Promise deduplication, incremental 100-job streaming flushes, 3-strike `NOT_FOUND` quarantine, and `deactivateStaleJobs()`. | Concurrent calls to `getOrCreateDepartment`/`getOrCreateLocation` for the same name must share a single in-flight Promise; closed jobs must be deactivated on successful board fetch. | `tests/unit/ScraperCore.test.ts`, `tests/unit/Concurrency.test.ts` |
| **BF-007** | 2026-10-22 | Escaped quotes (`""`), `\r\n`, and pipe characters (`\|`) in job titles/locations corrupted CSV parsing and `JOBS.md` Markdown tables. | Naive quote toggling in `parseCSV()` and unescaped `\|` in `generateMarkdownTable()`. Updated `escapeCSV()`, `parseCSV()`, and `sanitizeMarkdownCell()`. | `parseCSV()` must unescape `""` inside quoted fields, and `generateMarkdownTable()` must escape `\|` and newlines in every cell. | `tests/unit/GenerateReadme.test.ts`, `tests/unit/ScraperCSV.test.ts` |
| **BF-008** | 2026-10-22 | Single-process Node event loop bottleneck & cross-process unique constraint races when scaling across CPU cores. | Added `src/core/ClusterScraper.ts` (`npm run scrape:parallel [-- --workers=N]`) to fork OS child processes (`--ipc-worker`), shard slugs via round-robin (`partitionSlugs()`), recover cross-process `P2002` `Department`/`Location` races via `findUnique`, and merge telemetry via `ErrorTracker.mergeReports()`. | Multi-process workers must suppress individual `latest-error-report.json` writes (`saveTelemetry: false`), return `ErrorReportDocument` over IPC so `ClusterScraper` writes one unified report, and recover from cross-process `Department`/`Location` `P2002` races via `findUnique`. | `tests/unit/ClusterScraper.test.ts`, `tests/unit/ScraperCore.test.ts` |
| **BF-009** | 2026-10-22 | `ScraperCSV.ts` (`csv_scrape` mode) reported `graphqlFallbacksUsed: 0` in `output/latest-error-report.json` even when recovering boards (`go-augment`) via GraphQL fallback, and omitted `Location` count in `Verify.ts`. | `fetchJobsForCompany()` in `ScraperCSV.ts` discarded `result.source`, `result.rateLimited`, `result.notFound`, and `result.validationIssues` from `fetchAshbyBoardWithFallback()`. Wired `ErrorTracker` and `AdaptiveLimiter` callbacks into `fetchJobsForCompany()` and upgraded `Verify.ts` (`verifyDatabase()`) to audit `Location`, salary coverage, and sanitization integrity. | `fetchJobsForCompany()` in `ScraperCSV.ts` must forward `graphql_fallback`, `rateLimited`, `notFound`, and `validationIssues` to `ErrorTracker` when a tracker is provided; `verifyDatabase()` must validate all 4 tables and 0 sanitization defects. | `tests/unit/ScraperCSV.test.ts`, `tests/unit/Verify.test.ts` |

---

## 📈 Improvement Log & Future Packaging Roadmap

### Completed Improvements (v1.1.0 Release)
- **Adaptive Concurrency (`src/lib/Concurrency.ts`):** Dynamic rate-limit throttling (`onRateLimit` halves concurrency + cooldown pause; `onSuccess` ramps back up).
- **Multi-Source Discovery (`src/discovery/CdxWorker.ts` & `src/utils/Seed.ts`):** Added CommonCrawl Index support (`--common-crawl`), Ashby `window.__appData` organization name/logo enrichment (`--enrich`), expanded slug `BLOCKLIST`, and `--all` seeding from `extracted-slugs.json`.
- **Automated Telemetry (`src/lib/ErrorTracker.ts`):** Every DB or CSV scrape run emits `output/latest-error-report.json` for the Bug-Fix Agent.

### Next Phase: Turning the Toolkit into an Application (Post-Stabilization)
Once we finish running and stabilizing all company scrapes using the Bug-Fix Agent loop above, we have three clean paths to package this as an end-user application:

1. **Recommended — React Web App (Next.js or Vite + Express/Fastify):**
   - **Why:** Reuses 100% of our existing TypeScript code, Prisma schema, and Neon PostgreSQL database.
   - **What it adds:** A dashboard UI to browse/filter ~30k jobs by title, salary, remote status, company, and location; a "Run Scraper" button with live progress and `latest-error-report.json` viewer.
2. **Desktop App (Electron or Tauri + React):**
   - Wraps the React UI and Node.js scraper into a standalone macOS (`.dmg`) / Windows (`.exe`) desktop app.
3. **Standalone CLI Executable (Node Single Executable Applications / `pkg`):**
   - Bundles the TypeScript CLI into a single binary (`job-scraper` / `job-scraper.exe`) without needing Python or a local Node installation.
