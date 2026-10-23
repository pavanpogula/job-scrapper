# 📚 Job Scraper — Project Context Documentation

> **Purpose of this folder:** A single, authoritative source of context for humans *and AI agents*
> working on this repository. Read this index first, then open only the file(s) relevant to your task.
>
> _Last full analysis: 2026-10-22 (based on working tree, including uncommitted restructure)._

---

## ⚡ TL;DR (30-second summary)

- **What it is:** A **Node.js + TypeScript CLI toolkit** (no web server, no HTTP endpoints of its own) that
  scrapes public job postings from companies that use the **Ashby ATS**.
- **How it works:**
  1. **Discover** company slugs (e.g. `1password`) from the Wayback Machine CDX API → `Company` table.
  2. **Scrape** each `ACTIVE` company's job board via Ashby's public Posting API (15 concurrent requests).
  3. **Persist** either to **PostgreSQL** (via Prisma, with Redis hash-based change detection) **or** stream to a
     dated **CSV** file in `output/` (optionally uploaded to **Google Drive**).
  4. Optionally render the latest CSV into a giant Markdown table, `JOBS.md`.
- **Stack:** TypeScript 5 · ts-node · Prisma 5 (PostgreSQL / Neon) · ioredis · axios · googleapis.
- **Run anything:** every feature is an `npm run <script>` → `npx ts-node <file>.ts`. There is no build step.
- **Scale seen so far:** ~3,072 discovered slugs → ~29,900 jobs per CSV run.

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
| 10 | [10-bug-fix-and-improvement-log.md](./10-bug-fix-and-improvement-log.md) | **Bug-Fix Agent Protocol**, Regression Guard Registry (`BF-001`–`BF-008`), and App Packaging Roadmap |

---

## 🤖 Guidance for AI Agents

1. **There are no REST endpoints in this repo.** "Endpoints" = the *external* APIs consumed (see 03) and the
   *CLI entry points* (see 04).
2. **Core scrapers & multi-process cluster coordinator** — all use `src/lib/AshbyClient.ts` (`fetchAshbyBoardWithFallback` with browser headers, retry/backoff, and automatic GraphQL fallback):
   - `src/core/Scraper.ts` → DB + Redis, requests `?includeCompensation=true`, extracts salary via `extractSalary()`, streams 100-job batch writes during execution, deactivates removed jobs (`active = false`), uses a 3-strike `NOT_FOUND` quarantine, and supports `--ipc-worker` mode.
   - `src/core/ClusterScraper.ts` → (`npm run scrape:parallel [-- --workers=N]`) forks multiple OS worker processes across CPU cores, partitions active company slugs via round-robin sharding, and merges worker telemetry into `output/latest-error-report.json`.
   - `src/core/ScraperCSV.ts` → CSV stream only (reads company list from DB), no Redis, optional Drive upload.
3. **Adaptive Rate Limiting:** `createLimiter()` in `src/lib/Concurrency.ts` dynamically halves concurrency and pauses the queue when `429`/`403` rate limits occur, then ramps back up after consecutive clean responses.
4. **`GoogleDriveOAuth.ts` is misnamed** — it actually uses a *service-account JWT*, not user OAuth.
   The real user-OAuth flow lives in `GoogleDriveUserOAuth.ts`. See 07 & 09.
5. **Some entry-point files execute on import** (`DbMenu.ts`, `DbInspect.ts`). Don't import them from other modules.
6. **Secrets live in `.env` and `apikeys/`** (both gitignored). Never print or commit their contents.
7. **Default Change, Docs & Commit Rule (Mandatory):** Whenever you make *any* change in this repository, you must: (a) update `AGENTS.md`, `README.md`, and the matching files in `documentation/` + "Last full analysis" date, (b) regenerate `docs/project-explorer.html` (`npm run docs:generate`), (c) verify `npx tsc --noEmit -p .`, `npm run lint`, and `npm test` pass, and (d) commit all changes (`git commit`) with a detailed Conventional Commit subject and multi-line bulleted description.
