# 09 · Known Issues, Gotchas & Tech Debt

Severity: 🔴 data-correctness bug · 🟠 reliability/operational risk · 🟡 inconsistency / docs drift · ⚪ cleanup.

_Last re-verified against the code: 2026-10-22 (HEAD `89a1fd2`). "Resolved" entries name the commit or `BF-*` id that fixed them.
Numbers #1–#28 are kept stable. New issues start at #29._

Evidence from the latest run (`output/latest-error-report.json`, cluster `db_scrape`, 2026-10-23): 3,072 companies attempted,
1,746 with jobs, **1,109 `companiesNotFound`**, 34,021 jobs collected, 1 job filtered, 0 DB errors.

---

## ✅ Resolved

| # | Issue | Fixed by |
|---|---|---|
| 1 | Salary columns always `NULL`. `extractSalary()` (`src/lib/AshbyClient.ts`) now reads `compensation.summaryComponents`, `compensationTiers` and the legacy `compensationTier`, and writes to `create`/`update` | `f872356` · BF-005 |
| 2 | Stale postings never deactivated. `AshbyScraper.deactivateStaleJobs()` sets `active = false` for missing `ashbyId`s after a successful (`rest`/`graphql`) fetch | `f872356` · BF-006 (but see #30) |
| 3 | Upsert `update` branch missed fields. `metadata`, `applyUrl` and `salaryCurrency` are now updated (`buildUpsertArgs` in `batchUpsertJobs`) | `f872356` |
| 4 | No browser headers, retry or fallback. `fetchAshbyBoardWithFallback()` has `BROWSER_HEADERS`, backoff + jitter, and the GraphQL fallback. A fetch failure (`source: 'none'`) no longer deactivates jobs | `f872356` · BF-001 (but see #33) |
| 5 | `getOrCreateDepartment/Location` race. Fixed with in-flight Promise maps plus `findUnique` recovery on `P2002` | `f872356` · BF-006/BF-008 |
| 6 | All jobs held in memory. `runAll()` streams 100-job chunks through `enqueueFlushIfNeeded()` / `flushChain` | `f872356` · BF-006 |
| 22 | Restructure and case-only renames committed | `8194e1d` |
| 25 | README described `db:clean` as "remove old jobs". It now says "invalid slugs" | `6bdb815` |
| 26 | README omitted `JOBS.md` / `generate-readme.ts`. It now documents both (Outputs table, "Scripts without an npm alias") | 2026-10-22 docs sync |
| 28 | `Verify.ts` printed only counts. `verifyDatabase()` now audits all 4 tables, statuses, salary coverage and a 500-job integrity sample, behind a `require.main` guard | `635e69d` · BF-009 |
| — | `generate-readme.ts` CSV parser broke on `""` and pipes. `parseCSV()` unescapes `""` and `sanitizeMarkdownCell()` escapes `\|` and newlines | `f872356` · BF-007 (but see #42) |
| 16 | `docs/GOOGLE_DRIVE_SETUP.md` said `google-credentials.json` goes in the project root. It now says `apikeys/google-credentials.json` (and documents the user-OAuth files) | 2026-10-22 docs sync (working tree, not yet committed) |
| 17/18 *(README part only)* | README said Redis is "Required" and that Job has a "type" column, and it advertised "Hourly Scraping". All corrected in README | 2026-10-22 docs sync. `.env.example` is still stale, so #17 stays open below |
| 7 | One sequential Redis `GET` per job (~34k round trips per run). Removed Redis change detection from `Scraper.ts` (D-06) | P1-T04 |
| 30 | Jobs that come back after deactivation stayed `active = false`. Removed Redis change detection so DB `!prev.active` reactivates jobs | P1-T04 |

---

## 🔴 Data-correctness bugs (open)

### #29 The 3-strike `NOT_FOUND` quarantine never fires in production
- `AshbyScraper.notFoundStrikes` is an in-memory `Map` on each instance (`src/core/Scraper.ts`). `runAll()` fetches each company **once** per run and calls `recordNotFoundStrike(slug, 3)`, so the count never reaches 3 before the process exits. Neither `npm run scrape` nor `scrape:parallel` (which runs a fresh process per shard) ever marks a company `NOT_FOUND`.
- The latest run shows the result: 1,109 dead slugs were requested again, and each one also triggered a GraphQL fallback request.
- The private `fetchJobs()` uses threshold `1` and does mark `NOT_FOUND`, but nothing calls it except `tests/unit/ScraperCore.test.ts`, so the tests pass while the production path is broken.
- Fix direction: persist strikes (a `Company.notFoundStrikes` column or a Redis counter `company:<slug>:404`), or treat a REST 404 that GraphQL confirms as a strike that survives across runs.

### #30 Jobs that come back after deactivation stay `active = false` — [RESOLVED in P1-T04]
- Previously, `deactivateStaleJobs()` set `active = false` in Postgres but left the Redis key `job:<ashbyId>:hash` (7-day TTL). If the job reappeared with the same content, `filterChangedJobs()` saw the cached hash and skipped it. The job never reached `batchUpsertJobs()`, so the bulk path's `!prev.active` check could not reactivate it.
- **Resolved in P1-T04 (D-06):** Redis change detection (`job:<id>:hash`) was removed from `Scraper.ts`. The DB `contentHash` and `!prev.active` checks in `batchUpsertJobs()` now handle reactivation cleanly without Redis caching side effects, guarded by `tests/unit/ScraperRunAll.test.ts`.

### #31 The change-detection hash ignores most stored fields — [RESOLVED in BF-011]
- `generateHash()` previously hashed only `title|location|department|salary.min|salary.max`.
- **Resolved in BF-011:** `generateHash()` now hashes `title|location|department|salary.min|salary.max|salary.currency|salary.interval|isRemote|workplaceType|employmentType|publishedAt|applyUrl|isListed|country|region|city`. Any change to compensation, URLs, workplace policies, or addresses now properly breaks cache and updates the database row.

### #32 GraphQL-fallback jobs have less data — [PARTIALLY RESOLVED in BF-011]
- `fetchFromAshbyGraphQL()` (`src/lib/AshbyClient.ts`) now preserves `workplaceType`, `secondaryLocations`, and returns any GraphQL `validationIssues` from Ashby's response.
- Note: Out of 34,037 active jobs, only 22 jobs (across 2 companies, `withcherry` and `go-augment`) currently use GraphQL fallback. These 22 roles still lack `publishedAt` and descriptions on the list endpoint (obtainable via single-posting GraphQL query `ApiJobPosting` if needed).
- Its `sanitizeJobBatch()` issues are thrown away (`const { validJobs } = …`), so `validationIssues` is never set when `source === 'graphql'`. Jobs filtered on that path never reach telemetry.
- The telemetry message says "Posting API returned 404/403", but `400` also triggers the fallback.

---

## 🟠 Reliability / operational risks (open)

| # | Issue | Where |
|---|---|---|
| 7 | [RESOLVED in P1-T04] One sequential Redis `GET` per job (~34k round trips per run). Removed Redis change detection from `Scraper.ts` (D-06) | `Scraper.ts` |
| 8 | `NOT_FOUND` is terminal: nothing re-checks those companies (`runAll()` only loads `ACTIVE`). `REDIRECTED` is never set. Today this only matters for slugs marked by hand or by `fetchJobs()`, because of #29 | `Scraper.ts`, `schema.prisma` |
| 9 | The CSV scraper counts `companiesNotFound` but never quarantines them, so dead slugs are requested on every run | `ScraperCSV.ts` `fetchJobsForCompany()` |
| 10 | Exit code 0 on failure: `scrapeToCSV().catch(console.error)`, `seed().catch(console.error)`, `GenerateDocs`/`generate-readme`/`test-drive-upload` `main().catch(console.error)`, and `cleanDatabase()` / `inspectDatabase()` catch their own errors. `npm run verify` exits 0 even when its integrity audit finds defects. These now exit 1 on a thrown error: `Scraper` (`runAll` catch), `ClusterScraper`, `Verify`, `CdxWorker` | `ScraperCSV.ts`, `Seed.ts`, `DbClean.ts`, `DbInspect.ts`, `Verify.ts`, `scripts/*.ts` |
| 11 | The service-account Drive upload fails on a personal Drive (no quota). The user-OAuth module (`uploadWithUserOAuth`) exists but `ScraperCSV.uploadToGoogleDrive()` doesn't use it | `ScraperCSV.ts`, `GoogleDriveOAuth.ts` |
| 12 | The CSV filename uses the UTC date (`new Date().toISOString()`), so evening US runs get tomorrow's date and same-day re-runs overwrite the file | `ScraperCSV.ts` L142 |
| 13 | Wayback CDX is capped at 1,000 rows (`fetchAshbyUrls(limit = 1000)`) | `CdxWorker.ts` L55 |
| 14 | *(Partially resolved)* The old "49-test" figure is outdated: there are now **16 Jest suites / 79 tests** (`f57f902`, `2cce729`, `635e69d`). Still no CI workflow, and coverage is low where it matters: `src/core` is about 31.6 % statements, and `runAll()`, `runClusterScrape()` and `scrapeToCSV()` have no tests. Several BF invariants are unguarded (#43). See [`11-testing-guide.md`](./11-testing-guide.md) §5 | `tests/`, `src/core/` |
| 33 | A final `5xx`/timeout/network error returns `{ source: 'none', notFound: false }` and records **no event**, so it looks like an empty board. `RecordedErrorEvent.category` includes `'api_error'` but nothing ever emits it | `AshbyClient.ts` `fetchAshbyBoardWithFallback()`, `Scraper.ts` `runAll()`, `ScraperCSV.ts` |
| 34 | A `403` counts as a rate limit (`sawRateLimit = true`). A company whose posting-api is disabled and returns 403 halves the limiter and pauses it for 2 s, even when the GraphQL fallback succeeds. It also inflates `rateLimitsEncountered` | `AshbyClient.ts`, `Concurrency.ts` `onRateLimit()` |
| 35 | `runClusterScrape()` uses `Promise.all(workerPromises)`. If one worker fails or crashes, the whole run rejects and no merged report is written, even though the other workers finished their DB writes. The surviving child processes are **not** killed and keep scraping and writing after the coordinator has exited with code 1. Consider `Promise.allSettled` plus `child.kill()` on failure | `ClusterScraper.ts` `runClusterScrape()` / `runWorkerShard()` |
| 36 | `ErrorTracker.saveReport()` / `saveMergedReport()` write `error-report_<YYYY-MM-DD>.json` (UTC date), so several runs on one day overwrite each other. Both `db_scrape` and `csv_scrape` also write the same `latest-error-report.json`, so a CSV run replaces the last DB report and the other way round. Only the last run survives. Use the mode and run id in filenames | `ErrorTracker.ts` |
| 37 | `fetchCommonCrawlUrls()` reads only the first result page (no `page` param / `showNumPages`), and the crawl id `CC-MAIN-2024-51` is hard-coded | `CdxWorker.ts` |
| 38 | `scrapeToCSV()` calls `tracker.saveReport()` **before** the write stream is closed, so the CSV can still be incomplete when telemetry says the run finished | `ScraperCSV.ts` |
| 39 | Default `scrape:parallel` worker count is `min(4, max(2, cpus))`, not 8. The documented 141.3 s / 34,035-job run used `--workers=8`. Per-worker concurrency is hard-coded at 12 when there are more than 100 companies | `ClusterScraper.ts` `resolveWorkerCount()` |

## 🟡 Inconsistencies & docs drift (open)

| # | Issue |
|---|---|
| 15 | `GoogleDriveOAuth.ts` / `uploadWithOAuth` are named "OAuth" but implement **service-account JWT** auth. |
| 17 | `.env.example` labels Redis "Required" (`# Redis - Required`). The code treats it as optional and falls back to `redis://localhost:6379`. There is no scheduler. (README fixed.) |
| 19 | `ProcessCdxData.ts` says to copy output into `src/config/companies.ts` (old name) and its usage text references `process-cdx-data.ts`. |
| 20 | `extracted-slugs.json` is tracked in git although `.gitignore` has `/extracted-slugs*`. |
| 21 | `.gitignore` still contains Java boilerplate (`*.class`, `*.jar`, …). |
| 23 | `Companies.ts` has only **7** sample slugs (`deel`, `remote`, `reddit`, `multiverse`, `1password`, `abridge`, `go-augment`). Some of them are dead or empty boards, so fresh setups scrape very little until you run `seed -- --all`. |
| 24 | `scripts/generate-readme.ts` and `scripts/test-drive-upload.ts` have no npm scripts. |
| 27 | *(Partially resolved)* The stale `generate-docs.ts` usage comment is gone. Whether `GenerateDocs.ts`'s regexes mis-parse its own source in `project-explorer.html` has not been re-verified. |
| 40 | Version drift: README / `10` call the current state "v1.1.0", but `package.json` `version` is `1.0.0` and there are no git tags. `package.json` also has an empty `description`/`author` and a stale `"main": "index.js"` (the file doesn't exist). |
| 41 | `JOBS.md` is **committed** (~5.4 MB). It is a stale snapshot from 2026-01-05 (29,911 table rows rendered from the 29,910-record `jobs_2025-12-29.csv`; the extra row is the #42 newline split), while the DB now has ~34k jobs. Regenerating it makes huge diffs. Consider gitignoring it or publishing it elsewhere. |

## ⚪ Cleanup / tooling

| # | Issue | Where |
|---|---|---|
| 42 | `parseCSV()` splits on newlines **before** handling quotes, so a quoted field with an embedded newline breaks a row. **This already happened:** the three Dec-2025 CSVs each contain one job title with an embedded newline, so the committed `JOBS.md` (from `jobs_2025-12-29.csv`, 29,910 records) shows "Total Jobs: 29911" and one split row. Current CSVs can't contain one, because `sanitizeText()` (added in `f872356`) collapses whitespace before `escapeCSV()`, but the parser is still not RFC-4180. | `scripts/generate-readme.ts` |
| 43 | Some BF invariants have no test (details in `10` and [`11-testing-guide.md`](./11-testing-guide.md) §6): the `createMany` fast path (the global Prisma mock `__mocks__/@prisma/client.ts` has no `job.createMany` and no `department/location.findUnique`, so tests always take the `$transaction` path. `ScraperCore.test.ts` adds its own `findUnique` mocks for the P2002 test), `deactivateStaleJobs()`, concurrent in-flight dedupe (the test only does sequential cache hits), `ScraperCSV` tracker forwarding, and the `runAll()` 3-strike path. | `tests/`, `__mocks__/@prisma/client.ts` |
| 44 | `npm run lint` covers only `src/` (`.eslintrc.json` `ignorePatterns` excludes `scripts/`, and `tests/` is never passed). `tsconfig.json` `include` is `src/**/*` only, and ts-jest runs with `isolatedModules: true` (transpile only), so **`scripts/` and `tests/` are never type-checked**. Also, `jsdoc/require-jsdoc` and `jsdoc/check-tag-names` are set to `"warn"` and nothing requires `@file`/`@summary`/`@tags`, so a missing or empty JSDoc block never fails lint (see `ProcessCdxData.ts`, #49). | `package.json`, `.eslintrc.json`, `tsconfig.json`, `jest.config.js` |
| 45 | `npm test` prints a ts-jest deprecation warning once per suite: the `isolatedModules` ts-jest option will be removed in v30. Move it to `tsconfig` (`"isolatedModules": true`). The major versions also differ: **jest `30.5.2`** with **ts-jest `29.4.15`** and `@types/jest` 30. Older docs said "Jest 29". | `jest.config.js`, `package.json` |
| 46 | ESLint: 1 warning (`no-empty`, `DbInspect.ts:56`, the empty `catch (e) { }` around the row count). | `src/database/DbInspect.ts` |
| 47 | Private `AshbyScraper.fetchJobs()` is dead code. `runAll()` calls `fetchAshbyBoardWithFallback()` directly, and the unit tests named "fetchJobs error handling" exercise only this unused path. | `src/core/Scraper.ts` |
| 48 | The Redis `retryStrategy` comment says "Exponential backoff: 50ms, 100ms, 150ms" but `Math.min(times * 50, 2000)` is linear. | `src/lib/Redis.ts` |
| 49 | `ProcessCdxData.ts` reads `process.argv[2]` at module load, and `processRawCDXData()` has an empty JSDoc block (no `@summary`). | `src/utils/ProcessCdxData.ts` |
| 50 | Missing JSDoc `@tags` in the file header of `src/lib/GoogleDriveUserOAuth.ts` (it has `@file` and `@summary`) and of `scripts/test-drive-upload.ts`. `generate-readme.ts` `main()` has no JSDoc. | `src/lib/GoogleDriveUserOAuth.ts`, `scripts/` |
| 51 | `Verify.ts` integrity audit: it checks only an unordered 500-row sample. The `\u0000` metadata check can never fire, because Postgres rejects `\u0000` in `jsonb` on write. It does not exit non-zero when the audit fails. | `src/utils/Verify.ts` |
| 52 | Telemetry semantics: `RecordedErrorEvent.samplePayload` is declared but never set. `jobsSanitized` / `jobsFilteredOut` count **validation issues**, not jobs (`recordValidationIssues()` increments once per issue, so a job with both URLs repaired counts as 2 "sanitized"). | `src/lib/ErrorTracker.ts` |
| 53 | `scripts/test-drive-upload.ts` and `scripts/GenerateDocs.ts` call `main()` at module load (no `require.main` guard). | `scripts/` |
| 54 | `process:cdx` writes `extracted-slugs.json` relative to the **current working directory** (`outputPath = 'extracted-slugs.json'`), while `seed -- --all` reads `path.join(process.cwd(), …)`. Running from another directory splits them. | `src/utils/ProcessCdxData.ts`, `src/utils/Seed.ts` |
| 55 | `docs:generate` walks the whole repo and only skips `node_modules`, `dist`, `.git`, `docs`, `output`, `.vscode`, `apikeys` (`EXCLUDED_DIRS`). Any `.ts` file added under `.agents/` or `.claude/` (or other tool folders) would show up in `project-explorer.html`. | `scripts/GenerateDocs.ts` |
| 56 | `coverage/` (from `npx jest --coverage`) is not in `.gitignore`. | `.gitignore` |
| 57 | Both fixtures, `tests/fixtures/ashby-sample.json` and `tests/fixtures/cdx-sample.json`, are never loaded by any test. | `tests/fixtures/` |
| — | `chunk()` in `Concurrency.ts` is used only by tests. | `src/lib/Concurrency.ts` |
| — | `google-auth-library` (installed 10.5.0, transitive via `googleapis`) is imported directly in `GoogleDriveUserOAuth.ts` but not declared in `package.json`. | `package.json` |
| — | Build/runtime tools (`typescript`, `ts-node`, `prisma`, `@types/node`) are in `dependencies`, not `devDependencies`. | `package.json` |
| — | Modules that run on import (no `require.main` guard): `src/database/DbMenu.ts`, `src/database/DbInspect.ts`, `scripts/GenerateDocs.ts` (L545) and `scripts/test-drive-upload.ts` (L47), see also #53. All other entry points have a guard. | `src/database/`, `scripts/` |
| — | A separate `new PrismaClient()` in every module. Fine for CLIs, but a shared `lib/Prisma.ts` would be cleaner. | several |

---

## 🗺️ Suggested Roadmap (priority order)

1. Make the `NOT_FOUND` quarantine actually work by persisting strikes (#29). Add a periodic re-check of `NOT_FOUND` (#8) and quarantine in CSV mode too (#9).
2. Fix the change-detection correctness problems: clear Redis keys on deactivation (#30) and hash every stored field (#31).
3. Telemetry fidelity: emit `api_error` (#33), stop treating 403 as a rate limit (#34), keep GraphQL validation issues (#32), use `allSettled` in the cluster (#35), and give report files unique names (#36).
4. Batch Redis reads (#7). Fix exit codes (#10) and local-date / unique CSV filenames (#12). Close the stream before saving telemetry (#38).
5. Wire user-OAuth (or a Shared Drive) into uploads (#11).
6. Discovery: remove the CDX cap (#13), page through and parameterize the CommonCrawl crawl (#37).
7. Tooling: lint and type-check `tests/` + `scripts/` (#44), fix the ts-jest config (#45), add the missing invariant tests (#43), add a CI workflow and a scheduler (GitHub Actions cron).
8. Docs/config hygiene: `.env.example`, `package.json` metadata/version, and whether to keep `JOBS.md` in git (#17, #40, #41).
