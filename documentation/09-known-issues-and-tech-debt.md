# 09 · Known Issues, Gotchas & Tech Debt

Severity: 🔴 data-correctness bug · 🟠 reliability/operational risk · 🟡 inconsistency / docs drift · ⚪ cleanup.

## 🔴 Data-correctness bugs

### #1 *(Resolved)* Salary extraction fixed in `AshbyClient.ts` & `Scraper.ts`
- `extractSalary()` in `src/lib/AshbyClient.ts` now extracts `minValue`, `maxValue`, and `currencyCode` from `job.compensation.summaryComponents` (and `compensationTiers`), and `Scraper.ts` includes these in `generateHash`, `create`, and `update`.

### #2 *(Resolved)* Stale postings are automatically deactivated
- `deactivateStaleJobs()` in `Scraper.ts` marks previously active jobs for a company as `active = false` when their `ashbyId` is absent from a successful live board fetch.

### #3 *(Resolved)* Upsert `update` branch updated
- `metadata`, `applyUrl`, and `salaryCurrency` are now refreshed in `batchUpsertJobs` on change.

### #4 *(Resolved)* Browser headers, retry/backoff, and GraphQL fallback added
- `fetchAshbyBoardWithFallback` in `src/lib/AshbyClient.ts` sends browser `User-Agent` headers, retries with exponential backoff + jitter on `429`/`5xx`/timeout, and falls back to Ashby's hosted GraphQL API (`ApiJobBoardWithTeams`) when the external `posting-api` returns `404`/`403`/`400`.

## 🟠 Reliability / operational risks

| # | Issue | Where |
|---|---|---|
| 5 | *(Resolved)* **Race in `getOrCreateDepartment/Location`**: deduplicated with in-flight Promise maps (`departmentInFlight`, `locationInFlight`) | `Scraper.ts` |
| 6 | *(Resolved)* Incremental streaming DB writes flush every `BATCH_SIZE = 100` jobs during the scrape instead of holding all jobs in memory until the end | `Scraper.ts` `runAll` |
| 7 | One sequential Redis `GET` per job (~30k round trips). Use `MGET`/pipeline | `filterChangedJobs` |
| 8 | `NOT_FOUND` is terminal — no re-check; `REDIRECTED` unused | `Scraper.ts`, schema |
| 9 | CSV scraper doesn't mark 404 companies, so dead slugs are re-requested forever (~1k wasted calls/run) | `ScraperCSV.ts` |
| 10 | `scrapeToCSV().catch(console.error)` → exit code 0 on failure (bad for cron/CI alerting). Same for `Seed`, `Verify` | several |
| 11 | Service-account Drive upload fails on personal Drive (no quota); user-OAuth module exists but isn't wired in | `ScraperCSV.ts` / `GoogleDriveOAuth.ts` |
| 12 | CSV filename uses UTC date → evening US runs get "tomorrow's" date; same-day reruns overwrite (evidence: `jobs_2025-12-28.csv` created Dec 27 local) | `ScraperCSV.ts` L113 |
| 13 | `CdxWorker` limited to 1000 CDX rows ("for testing") | `CdxWorker.ts` L59 |
| 14 | *(Partially resolved)* Added comprehensive 49-test unit and E2E Jest suite; CI config and live rate-limiting still pending | repo |

## 🟡 Inconsistencies & docs drift

| # | Issue |
|---|---|
| 15 | `GoogleDriveOAuth.ts` / `uploadWithOAuth` are named "OAuth" but implement **service-account JWT**. |
| 16 | README & `GOOGLE_DRIVE_SETUP.md` say `google-credentials.json` goes in project root; code reads `apikeys/google-credentials.json`. |
| 17 | README says Redis is "Required"; code treats it as optional. README says "Hourly Scraping" but there is no scheduler. |
| 18 | README's Job model row mentions "type" — there is no employment-type column (only in `metadata`). |
| 19 | `ProcessCdxData` tells you to copy into `src/config/companies.ts` (old name; now `Companies.ts`). Usage text references `process-cdx-data.ts`. |
| 20 | `extracted-slugs.json` is tracked in git although `.gitignore` has `/extracted-slugs*`. |
| 21 | `.gitignore` still contains Java boilerplate (`*.class`, `*.jar`, …). |
| 22 | *(Resolved)* Restructure and case-only renames (`Companies.ts`, `Redis.ts`) committed via `git mv`. |
| 23 | `Companies.ts` has only 4 slugs; at analysis time `remote` → 404, `deel`/`reddit` → 0 jobs. Fresh setups scrape almost nothing until the full slug list is seeded. |
| 24 | `scripts/generate-readme.ts` and `scripts/test-drive-upload.ts` have no npm scripts. |
| 25 | `README.md` describes `db:clean` as "Clean database (remove old jobs)" — but `DbClean.ts` deletes companies with **invalid slugs** (and their dependent jobs), not aged jobs. |
| 26 | `README.md` completely omits `JOBS.md` and `scripts/generate-readme.ts`, despite `JOBS.md` being a 5+ MB generated markdown table in the root directory. |
| 27 | `scripts/GenerateDocs.ts` usage comment references `scripts/generate-docs.ts` (kebab-case old name), and its file regex matches its own source code, corrupting its entry in `project-explorer.html`. |
| 28 | *(Resolved)* `src/utils/Verify.ts` (`verifyDatabase()`) now audits `Company`, `Job`, `Department`, and `Location` counts, salary coverage, and data sanitization integrity with a `require.main` guard. |

- `chunk()` in `Concurrency.ts` unused.
- `google-auth-library` imported directly but not declared in `package.json`.
- Build/runtime tools (`typescript`, `ts-node`, `prisma`, `@types/node`) are in `dependencies`.
- Entry modules run on import: added `require.main` guard to `ScraperCSV`, `Seed`, `DbClean`, `Verify`, and `generate-readme` (remaining: `DbMenu`, `DbInspect`).
- Multiple `new PrismaClient()` instances (one per module) — fine for CLIs, but a shared `lib/Prisma.ts` would be cleaner.
- ESLint: 1 warning (`no-empty`, `DbInspect.ts:56`).
- *(Resolved)* `generate-readme.ts` CSV parser now handles escaped `""` quotes and `\r\n`, and `generateMarkdownTable` escapes `|` (`\|`) and newlines in table cells.

## 🛡️ Decision Log & Bug Fixes (2026-10-22 Update)

| # | Bug / Problem Observed | Architectural Decision & Fix Implemented | Files Updated |
|---|---|---|---|
| **BF-1** | **Company URLs returning 404/403 in scraper while working in browser** | Companies that use Ashby's hosted board (`jobs.ashbyhq.com/<slug>`) without enabling the external `posting-api` return 404/403 on `api.ashbyhq.com`. Added `fetchAshbyBoardWithFallback()` with Chrome `BROWSER_HEADERS`, exponential backoff + jitter on `429`/`5xx`/timeouts, and automatic fallback to Ashby's hosted GraphQL API (`POST /api/non-user-graphql?op=ApiJobBoardWithTeams`). | `src/lib/AshbyClient.ts`, `src/core/Scraper.ts`, `src/core/ScraperCSV.ts` |
| **BF-2** | **PostgreSQL `jsonb` & storage crashes on corrupt job descriptions (`descriptionHtml` / `descriptionPlain`)** | PostgreSQL `jsonb` rejects strings containing `\u0000` (null bytes) or lone UTF-16 surrogates, aborting the entire 100-job `$transaction`. Added `sanitizeJobDescriptionHtml()`, `sanitizeJobDescriptionPlain()`, and recursive `sanitizeJsonMetadata()` to strip null bytes, lone surrogates, `<script>`/`<style>`/`<iframe>` tags, inline JS handlers, and `>1KB` base64 data URIs before storage. | `src/lib/Sanitizer.ts`, `src/core/Scraper.ts` |
| **BF-3** | **Broken, relative, or unsafe `jobUrl` / `applyUrl` job links** | Added `sanitizeJobUrl()` to validate URLs via `new URL()`, resolve relative paths against `https://jobs.ashbyhq.com`, reject unsafe protocols (`javascript:`, `data:`) or placeholder strings (`"undefined"`, `"null"`), and fall back to the canonical `https://jobs.ashbyhq.com/{slug}/{id}[/application]` URL while logging a sanitization issue. | `src/lib/Sanitizer.ts`, `src/core/Scraper.ts`, `src/core/ScraperCSV.ts` |
| **BF-4** | **Malformed job objects & single-record DB batch poisoning** | Added `validateAndSanitizeJob()` and `sanitizeJobBatch()` to filter out non-object records, invalid/placeholder job IDs, empty titles, and duplicate IDs per company with structured `[Sanitizer]` logging. Updated `batchUpsertJobs()` in `Scraper.ts` to automatically fall back to per-job upserts (`[BatchError]` → `[JobStoreError]`) if a batch transaction ever fails, isolating the bad record without losing the other 99 jobs. | `src/lib/Sanitizer.ts`, `src/core/Scraper.ts` |
| **BF-5** | **Discovery slug filter & CSV/Markdown table corruption** | Expanded `BLOCKLIST` in `CdxWorker.ts` (`embed`, `application`, `apply`, `graphql`, `non-user-graphql`, `posting-api`, `sitemap.xml`, `manifest.json`, `oauth`, `webhook`, etc.). Updated `escapeCSV()` for `\r` and `\x00`, `parseCSV()` for `""` escaped quotes, and `generateMarkdownTable()` to escape `\|` pipes in `JOBS.md`. | `src/discovery/CdxWorker.ts`, `src/core/ScraperCSV.ts`, `scripts/generate-readme.ts` |
| **BF-6** | **Salary always `NULL`, stale jobs never deactivated, and concurrent upsert races** | Added `extractSalary()` for `compensation.summaryComponents`, `deactivateStaleJobs()` (`active = false`), 3-strike `NOT_FOUND` quarantine (`recordNotFoundStrike()`), in-flight Promise deduplication for `Department`/`Location` upserts, and incremental 100-job streaming DB flushes. | `src/lib/AshbyClient.ts`, `src/core/Scraper.ts`, `src/lib/Concurrency.ts` |
| **BF-7** | **Multi-process cluster scaling & cross-process unique races** | Added `ClusterScraper.ts` (`npm run scrape:parallel [-- --workers=N]`) to fork OS worker processes via IPC, shard companies round-robin, recover cross-process `P2002` `Department`/`Location` races via `findUnique`, and merge worker telemetry via `ErrorTracker.mergeReports()`. | `src/core/ClusterScraper.ts`, `src/core/Scraper.ts`, `src/lib/ErrorTracker.ts` |

## 🗺️ Suggested Roadmap (priority order)

1. Fix salary extraction (#1) + full update branch (#3) + backfill.
2. Distinguish fetch failure vs empty (#4), add retries/backoff, then deactivate stale jobs (#2).
3. Pre-load/serialize department & location creation (#5); stream DB writes per company (#6); batch Redis reads (#7).
4. Wire user-OAuth (or Shared Drive) for uploads (#11); fix exit codes (#10); local-date filenames (#12).
5. Move `TARGET_COMPANIES` to read `extracted-slugs.json` directly; remove CDX test limit (#13, #23).
6. Add tests (slug validation, CSV escaping, mapping), a CI workflow, and a scheduler (GitHub Actions cron).
7. Update README / GOOGLE_DRIVE_SETUP to match code (#15–#19).
