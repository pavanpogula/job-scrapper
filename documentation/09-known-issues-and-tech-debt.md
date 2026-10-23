# 09 · Known Issues, Gotchas & Tech Debt

Severity: 🔴 data-correctness bug · 🟠 reliability/operational risk · 🟡 inconsistency / docs drift · ⚪ cleanup.

## 🔴 Data-correctness bugs

### #1 Salary is never captured (field-name mismatch) — **verified against live API**
- `Scraper.ts` reads `job.compensationTier.{min,max,currency}`; Ashby returns `job.compensation.{summaryComponents, compensationTiers, …}`.
- Effects: `salaryMin/salaryMax/salaryCurrency` always `NULL`; `db:menu` "Top Salaries" always empty; hash input has `undefined|undefined`.
- Fix sketch:
  ```ts
  const salary = job.compensation?.summaryComponents?.find(c => c.compensationType === 'Salary');
  salaryMin = salary?.minValue ?? undefined; salaryMax = salary?.maxValue ?? undefined; salaryCurrency = salary?.currencyCode;
  ```
  Then include those values in `generateHash` and in the upsert `update` (also `salaryCurrency`). Backfill existing rows from `metadata->'compensation'`.

### #2 Removed postings are never deactivated
- `active` is only ever set `true`. Jobs that disappear from Ashby stay `active = true` forever.
- Fix: per company, `updateMany({ where: { companySlug, ashbyId: { notIn: currentIds } }, data: { active: false } })` (only when the fetch succeeded).

### #3 Upsert `update` branch is incomplete
- `metadata`, `applyUrl`, `salaryCurrency` are not updated on change → stale raw data.

### #4 Transient errors look like "0 jobs"
- Any non-404 failure (timeout, 429, 5xx) returns `[]` silently in both scrapers — combined with #2's fix this would wrongly deactivate jobs. Distinguish "failed" from "empty" and add retry with backoff.

## 🟠 Reliability / operational risks

| # | Issue | Where |
|---|---|---|
| 5 | **Race in `getOrCreateDepartment/Location`**: two concurrent companies with a new identical name both `upsert` → possible `P2002` unique violation → rejects the limiter → whole `Promise.all` (and run) fails | `Scraper.ts` L110-147 |
| 6 | All changed jobs held in memory and written only at the end — crash = nothing saved; memory ~ includes full `descriptionHtml` per job | `Scraper.ts` `runAll` |
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
| 28 | `src/utils/Verify.ts` logs counts for `Company`, `Job`, and `Department`, but omits `Location`. |

- `chunk()` in `Concurrency.ts` unused.
- `google-auth-library` imported directly but not declared in `package.json`.
- Build/runtime tools (`typescript`, `ts-node`, `prisma`, `@types/node`) are in `dependencies`.
- Entry modules run on import: added `require.main` guard to `ScraperCSV`, `Seed`, `DbClean`, and `generate-readme` (remaining: `Verify`, `DbMenu`, `DbInspect`).
- Multiple `new PrismaClient()` instances (one per module) — fine for CLIs, but a shared `lib/Prisma.ts` would be cleaner.
- ESLint: 1 warning (`no-empty`, `DbInspect.ts:56`).
- `generate-readme.ts` CSV parser doesn't handle escaped `""` quotes; Markdown doesn't escape `|`.

## 🗺️ Suggested Roadmap (priority order)

1. Fix salary extraction (#1) + full update branch (#3) + backfill.
2. Distinguish fetch failure vs empty (#4), add retries/backoff, then deactivate stale jobs (#2).
3. Pre-load/serialize department & location creation (#5); stream DB writes per company (#6); batch Redis reads (#7).
4. Wire user-OAuth (or Shared Drive) for uploads (#11); fix exit codes (#10); local-date filenames (#12).
5. Move `TARGET_COMPANIES` to read `extracted-slugs.json` directly; remove CDX test limit (#13, #23).
6. Add tests (slug validation, CSV escaping, mapping), a CI workflow, and a scheduler (GitHub Actions cron).
7. Update README / GOOGLE_DRIVE_SETUP to match code (#15–#19).
