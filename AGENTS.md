# AGENTS.md

This repo is the **Ashby Job Scraper**, a TypeScript CLI toolkit (no web server).

**Before you do any work, read [`documentation/README.md`](./documentation/README.md).** It holds the full project context
(architecture, workflows, external API endpoints, CLI commands, DB/Redis schema, module reference, setup, and known issues).

Key Architecture Notes:
- **Ashby API Client (`src/lib/AshbyClient.ts`):** All Ashby requests go through `fetchAshbyBoardWithFallback()`, which sends browser headers (`BROWSER_HEADERS`), retries transient `429`/`5xx`/timeouts with exponential backoff + jitter, and automatically falls back to Ashby's hosted GraphQL API (`POST https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams`) when a company's external `posting-api` is disabled (`404`/`403`/`400`).
- **Data Sanitization & Error-Driven Filtering (`src/lib/Sanitizer.ts`):** All incoming job records are validated and sanitized via `sanitizeJobBatch()` / `validateAndSanitizeJob()` before DB or CSV storage—stripping PostgreSQL-fatal `\u0000` null bytes and lone UTF-16 surrogates from `metadata` (`jsonb`), stripping `<script>`/`<style>`/`<iframe>`/inline JS and oversized base64 strings from `descriptionHtml`, normalizing `jobUrl`/`applyUrl` with canonical fallback, filtering corrupt/duplicate job IDs, and falling back to per-job upserts if a batch transaction ever fails.
- **Adaptive Concurrency (`src/lib/Concurrency.ts`):** `createLimiter()` dynamically throttles concurrency and pauses on rate limits (`429`/`403`), recovering after consecutive successes.
- **Core Scrapers:** `src/core/Scraper.ts` (DB + Redis, incremental streaming 100-job batch writes, 3-strike `NOT_FOUND` quarantine, stale job deactivation, cross-process `P2002` race recovery, and real salary extraction via `extractSalary()`), `src/core/ClusterScraper.ts` (`npm run scrape:parallel` multi-process OS worker coordinator using `child_process.fork()` and IPC telemetry merging), and `src/core/ScraperCSV.ts` (streaming CSV export + optional Google Drive upload).
- **Discovery & Seeding:** `npm run seed` seeds `TARGET_COMPANIES` (or all 3,072 slugs from `extracted-slugs.json` via `npm run seed -- --all`); `npm run discover` supports `-- --common-crawl` and `-- --enrich`.
- **Telemetry & Bug-Fix Agent Loop (`src/lib/ErrorTracker.ts` & [`documentation/10-bug-fix-and-improvement-log.md`](./documentation/10-bug-fix-and-improvement-log.md)):** Every scrape run writes structured telemetry, sanitization issues, and errors to `output/latest-error-report.json`.

Bug-Fix Agent Protocol (Mandatory when fixing bugs or improving scraping):
1. Read `output/latest-error-report.json` and [`documentation/10-bug-fix-and-improvement-log.md`](./documentation/10-bug-fix-and-improvement-log.md).
2. Verify your planned fix does **not** violate any existing `BF-*` Regression Invariant in `10-bug-fix-and-improvement-log.md`.
3. Implement the fix, add/update unit tests (`tests/unit/`) and E2E tests (`tests/e2e/`), and verify with `npx tsc --noEmit -p . && npm run lint && npm test`.
4. Append the new `BF-XXX` entry and its Regression Invariant to `documentation/10-bug-fix-and-improvement-log.md`, update `documentation/09-known-issues-and-tech-debt.md`, and regenerate `docs/project-explorer.html` (`npm run docs:generate`).

Default Change, Documentation & Git Commit Rule (Mandatory on EVERY Change):
- Whenever ANY code, config, test, or workflow change is made, you **MUST** before finishing:
  1. **Sync All Documentation & Agent Files:** Update `AGENTS.md`, `README.md`, and every affected numbered file in `documentation/` (including `documentation/README.md` "Last full analysis" date, `09-known-issues-and-tech-debt.md`, and `10-bug-fix-and-improvement-log.md`).
  2. **Regenerate Explorer Docs:** Run `npm run docs:generate` to keep `docs/project-explorer.html` in sync with JSDoc `@file` / `@summary` / `@tags` blocks and Prisma models.
  3. **Verify Zero Regressions:** Run `npx tsc --noEmit -p .`, `npm run lint`, and `npm test` — all must pass with `0` errors.
  4. **Commit All Changes with Detailed Descriptions:** Stage all modified/new tracked files and create a `git commit` using a clear Conventional Commit subject (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`) followed by a detailed multi-line bulleted body covering root causes, architectural changes, new/updated tests, and documentation/agent updates.

Rules:
- Run things with `npm run <script>` (ts-node, so there's no build step). Type-check with `npx tsc --noEmit -p .`. Lint with `npm run lint`. Run tests with `npm test`.
- Never print, stage, or commit `.env`, `output/`, or anything in `apikeys/`.
- Every new file and function needs a JSDoc `@file` / `@summary` / `@tags` block (ESLint and `npm run docs:generate` depend on it).
