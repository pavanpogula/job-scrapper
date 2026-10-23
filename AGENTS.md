# AGENTS.md

This repo is the **Ashby Job Scraper**, a TypeScript CLI toolkit (no web server).

**Before you do any work, read [`documentation/README.md`](./documentation/README.md).** It holds the full project context
(architecture, workflows, external API endpoints, CLI commands, DB/Redis schema, module reference, setup, and known issues).

Key Architecture Notes:
- **Ashby API Client (`src/lib/AshbyClient.ts`):** All job-board fetches go through `fetchAshbyBoardWithFallback()`, which sends browser headers (`BROWSER_HEADERS`), retries transient `429`/`5xx`/timeouts with exponential backoff + jitter, and automatically falls back to Ashby's hosted GraphQL API (`POST https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams`) when a company's external `posting-api` is disabled (`404`/`403`/`400`). Exceptions: that GraphQL fallback (`fetchFromAshbyGraphQL()`) is a direct single `POST` with no retries, and `fetchOrganizationMetadata()` (used by `npm run discover -- --enrich`) is a separate single `GET https://jobs.ashbyhq.com/{slug}` with no retries.
- **Data Sanitization & Error-Driven Filtering (`src/lib/Sanitizer.ts`):** All incoming job records are validated and sanitized via `sanitizeJobBatch()` / `validateAndSanitizeJob()` before DB or CSV storage—stripping PostgreSQL-fatal `\u0000` null bytes and lone UTF-16 surrogates from `metadata` (`jsonb`), stripping `<script>`/`<style>`/`<iframe>`/inline JS and oversized base64 strings from `descriptionHtml`, normalizing `jobUrl`/`applyUrl` with canonical fallback, and filtering corrupt/duplicate job IDs. (The per-job upsert fallback when a batch transaction fails lives in `Scraper.ts` `batchUpsertJobs()`, not in the sanitizer.)
- **Adaptive Concurrency (`src/lib/Concurrency.ts`):** `createLimiter()` dynamically throttles concurrency and pauses on rate limits (`429`/`403`), recovering after consecutive successes.
- **Core Scrapers:** `src/core/Scraper.ts` (DB + optional Redis, incremental streaming 100-job batch writes with a `createMany` fast-path for new jobs, stale job deactivation, cross-process `P2002` race recovery, and real salary extraction via `extractSalary()`; it has a 3-strike `NOT_FOUND` strike counter that **never reaches 3 in a real run** — see `09` #29), `src/core/ClusterScraper.ts` (`npm run scrape:parallel [-- --workers=N]`, default `min(4, max(2, cpus))` workers; multi-process OS worker coordinator using `child_process.fork()` and IPC telemetry merging), and `src/core/ScraperCSV.ts` (streaming CSV export + optional Google Drive upload).
- **Tests (`tests/unit/`, `tests/e2e/`, guide in [`documentation/11-testing-guide.md`](./documentation/11-testing-guide.md)):** Jest + ts-jest (transpile-only), global Prisma manual mock in `__mocks__/@prisma/client.ts`; no real DB/Redis/network. "E2E" suites chain real functions in-process with mocked I/O. `tsc` and `lint` cover `src/` only.
- **Discovery & Seeding:** `npm run seed` seeds `TARGET_COMPANIES` (or all 3,072 slugs from `extracted-slugs.json` via `npm run seed -- --all`); `npm run discover` supports `-- --common-crawl` and `-- --enrich`.
- **Telemetry & Bug-Fix Agent Loop (`src/lib/ErrorTracker.ts` & [`documentation/10-bug-fix-and-improvement-log.md`](./documentation/10-bug-fix-and-improvement-log.md)):** Every scrape run writes structured telemetry, sanitization issues, and errors to `output/latest-error-report.json` (plus a dated `error-report_YYYY-MM-DD.json`). Caveats: transient `5xx`/timeout/network failures that exhaust retries are **not** recorded (`api_error` is declared but never emitted, `09` #33), and DB and CSV runs write the same file, so each run overwrites the previous report (`09` #36).

Bug-Fix Agent Protocol (Mandatory when fixing bugs or improving scraping):
1. Read `output/latest-error-report.json` and [`documentation/10-bug-fix-and-improvement-log.md`](./documentation/10-bug-fix-and-improvement-log.md).
2. Verify your planned fix does **not** violate any existing `BF-*` Regression Invariant in `10-bug-fix-and-improvement-log.md` (check each invariant's guard status there and in `11-testing-guide.md` §6 — some have no guarding test, so a green `npm test` alone does not prove them).
3. Implement the fix, add/update unit tests (`tests/unit/`) and E2E tests (`tests/e2e/`), and verify with `npx tsc --noEmit -p . && npm run lint && npm test`.
4. Append the new `BF-XXX` entry and its Regression Invariant to `documentation/10-bug-fix-and-improvement-log.md`, update `documentation/09-known-issues-and-tech-debt.md`, and regenerate `docs/project-explorer.html` (`npm run docs:generate`).

Default Change, Documentation & Git Commit Rule (Mandatory on EVERY Change):
- Whenever ANY code, config, test, or workflow change is made, you **MUST** before finishing:
  1. **Sync All Documentation & Agent Files:** Update `AGENTS.md`, `README.md`, and every affected numbered file in `documentation/` (including `documentation/README.md` "Last full analysis" date, `09-known-issues-and-tech-debt.md`, and `10-bug-fix-and-improvement-log.md`).
  2. **Regenerate Explorer Docs:** Run `npm run docs:generate` to keep `docs/project-explorer.html` in sync with JSDoc `@file` / `@summary` / `@tags` blocks and Prisma models.
  3. **Verify Zero Regressions:** Run `npx tsc --noEmit -p .`, `npm run lint`, and `npm test` — all must pass with `0` errors. (Note: `tsc` and `lint` cover `src/` only; `tests/` and `scripts/` are exercised only by `npm test`.)
  4. **Commit All Changes with Detailed Descriptions:** Stage all modified/new tracked files and create a `git commit` using a clear Conventional Commit subject (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`) followed by a detailed multi-line bulleted body covering root causes, architectural changes, new/updated tests, and documentation/agent updates.

Rules:
- Run things with `npm run <script>` (ts-node, so there's no build step). Type-check with `npx tsc --noEmit -p .`. Lint with `npm run lint`. Run tests with `npm test`.
- Never print, stage, or commit `.env`, `output/`, or anything in `apikeys/`.
- Every new file and function needs a JSDoc `@file` / `@summary` / `@tags` block (`npm run docs:generate` parses it to build `docs/project-explorer.html`; ESLint's `jsdoc/require-jsdoc` only warns, so this is a convention you must follow, not something lint will catch).
