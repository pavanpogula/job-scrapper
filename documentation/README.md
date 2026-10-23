# 📚 Job Scraper — Project Context Documentation

> **Purpose of this folder:** A single, authoritative source of context for humans *and AI agents*
> working on this repository. Read this index first, then open only the file(s) relevant to your task.
>
> _Last full analysis: 2026-10-23 (BF-013: Security hardening, DOMPurify XSS defense, CSP headers, /v1/facets API implementation, and filter AND-accumulation bugfix)._

---

## ⚡ TL;DR (30-second summary)

- **What it is:** A **Node.js + TypeScript CLI toolkit** (no web server, no HTTP endpoints of its own) that
  scrapes public job postings from companies that use the **Ashby ATS**.
- **How it works:**
  1. **Discover** company slugs (e.g. `1password`) from the Wayback Machine CDX API → `Company` table.
  2. **Seed** `Company` rows (`npm run seed [-- --all]`; `--all` loads all slugs from `extracted-slugs.json`).
  3. **Scrape** each `ACTIVE` company's job board via Ashby's public Posting API (adaptive limiter, default 15
     concurrent per process), falling back to Ashby's hosted GraphQL API when the posting API returns `404`/`403`/`400`.
     Every board is sanitized (`sanitizeJobBatch()`) before storage.
  4. **Persist** either to **PostgreSQL** (via Prisma, 100-job streaming batches, Redis hash change-detection with a
     7-day TTL; Redis is optional) **or** stream to a dated **CSV** file in `output/` (optionally uploaded to **Google Drive**).
     `scrape:parallel` forks N worker processes (default `min(4, max(2, cpus))`) and merges their telemetry.
  5. Every run writes `output/latest-error-report.json` (telemetry for the Bug-Fix Agent loop, see 10).
  6. Optionally render the latest CSV into a giant Markdown table, `JOBS.md`.
- **Stack:** TypeScript 5 · ts-node · Prisma 5 (PostgreSQL / Neon) · ioredis · axios · googleapis.
- **Run anything:** every feature is an `npm run <script>` → `npx ts-node <file>.ts`, except `scripts/generate-readme.ts`, which has no npm script (run it with `npx ts-node`). There is no build step.
- **Scale seen so far:** ~3,072 discovered slugs → **34,035 live jobs** (across 1,747 hiring companies, 13,686 with extracted salaries) scraped into Neon PostgreSQL in **141.3s** via `npm run scrape:parallel -- --workers=8` (the default worker count is `min(4, max(2, cpus))`, see 09 #39).

---

## 🗂️ Document Index

| # | File | Read it when you need… |
|---|------|------------------------|
| 01 | [01-overview.md](./01-overview.md) | Purpose, tech stack, directory layout, git/repo state |
| 02 | [02-architecture-and-workflows.md](./02-architecture-and-workflows.md) | End-to-end data flow, sequence diagrams, every workflow step-by-step |
| 03 | [03-external-apis.md](./03-external-apis.md) | **All API endpoints** called (Ashby, Wayback CDX, Google Drive/OAuth): request params, response schemas, error behaviour |
| 04 | [04-cli-commands.md](./04-cli-commands.md) | Every `npm run` script / entry point: args, flags, side effects, outputs |
| 05 | [05-database-and-cache.md](./05-database-and-cache.md) | Prisma schema, relations, enums, indexes, Redis key design, field-mapping from API → DB |
| 06 | [06-module-reference.md](./06-module-reference.md) | File-by-file, function-by-function reference with line links |
| 07 | [07-configuration-and-setup.md](./07-configuration-and-setup.md) | Env vars, credentials, first-time setup, Google Drive auth modes |
| 08 | [08-outputs-and-artifacts.md](./08-outputs-and-artifacts.md) | CSV format, `JOBS.md`, `extracted-slugs.json`, `project-explorer.html`, `latest-error-report.json` |
| 09 | [09-known-issues-and-tech-debt.md](./09-known-issues-and-tech-debt.md) | **Verified bugs**, gotchas, doc/code mismatches, improvement roadmap |
| 10 | [10-bug-fix-and-improvement-log.md](./10-bug-fix-and-improvement-log.md) | **Bug-Fix Agent Protocol**, Regression Guard Registry (`BF-001`–`BF-010`, with honest guard status), and App Packaging Roadmap |
| 11 | [11-testing-guide.md](./11-testing-guide.md) | How to run tests, mocking strategy, test-file → module map, e2e flows, coverage map, **BF invariant → test mapping**, conventions for new tests |

---

## 🤖 Guidance for AI Agents

1. **There are no REST endpoints in this repo.** "Endpoints" = the *external* APIs consumed (see 03) and the
   *CLI entry points* (see 04).
2. **Core scrapers & multi-process cluster coordinator** — all use `src/lib/AshbyClient.ts` (`fetchAshbyBoardWithFallback` with browser headers, retry/backoff, and automatic GraphQL fallback):
   - `src/core/Scraper.ts` → DB + Redis, requests `?includeCompensation=true`, extracts salary via `extractSalary()`, streams 100-job batch writes during execution (`createMany` fast-path for new jobs, `upsert` for changed, per-job fallback), deactivates removed jobs (`active = false`), and supports `--ipc-worker` mode. It has a 3-strike `NOT_FOUND` strike counter, but **it never reaches 3 in a real run** (in-memory, one fetch per company per run) — see 09 #29.
   - `src/core/ClusterScraper.ts` → (`npm run scrape:parallel [-- --workers=N]`) forks multiple OS worker processes across CPU cores, partitions active company slugs via round-robin sharding, and merges worker telemetry into `output/latest-error-report.json`.
   - `src/core/ScraperCSV.ts` → CSV stream only (reads company list from DB), no Redis, optional Drive upload.
3. **Adaptive Rate Limiting:** `createLimiter()` in `src/lib/Concurrency.ts` dynamically halves concurrency and pauses the queue when `429`/`403` rate limits occur, then ramps back up after consecutive clean responses.
4. **`GoogleDriveOAuth.ts` is misnamed** — it actually uses a *service-account JWT*, not user OAuth.
   The real user-OAuth flow lives in `GoogleDriveUserOAuth.ts`. See 07 & 09.
5. **Some entry-point files execute on import** (`src/database/DbMenu.ts`, `src/database/DbInspect.ts`, `scripts/GenerateDocs.ts`). Don't import them from other modules.
   The others (`Scraper`, `ClusterScraper`, `ScraperCSV`, `CdxWorker`, `Seed`, `ProcessCdxData`, `Verify`, `DbClean`, `scripts/generate-readme.ts`) use a `require.main === module` guard.
6. **Secrets live in `.env` and `apikeys/`** (both gitignored). Never print or commit their contents.
7. **Verification scope:** `npx tsc --noEmit -p .` and `npm run lint` cover **`src/` only**, not `tests/` or `scripts/`.
   Tests use a global Prisma manual mock (`__mocks__/@prisma/client.ts`) and never touch a real DB/Redis/network. Six suites
   (`CdxWorker`, `DbClean`, `Seed`, `ScraperCore`, `Verify`, `e2e/DiscoveryPipeline`) override it with their own
   `jest.mock('@prisma/client', factory)`. See 11.
8. **Before trusting a doc claim about a guard or invariant**, check its guard status in 10 / 11 §6 — several
   invariants (e.g. BF-010 `createMany`) have no test that exercises them.
9. **Default Change, Docs & Commit Rule (Mandatory):** Whenever you make *any* change in this repository, you must: (a) update `AGENTS.md`, `README.md`, and the matching files in `documentation/` + "Last full analysis" date, (b) regenerate `docs/project-explorer.html` (`npm run docs:generate`), (c) verify `npx tsc --noEmit -p .`, `npm run lint`, and `npm test` pass, and (d) commit all changes (`git commit`) with a detailed Conventional Commit subject and multi-line bulleted description.
