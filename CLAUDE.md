# CLAUDE.md

Auto-loaded by Claude Code at session start. The two imports below pull in the agent rules and the
documentation index; the quick map after them is enough to orient without opening anything else.
Open the numbered `documentation/` files on demand for detail.

@AGENTS.md
@documentation/README.md

---

## Quick map (verified 2026-10-22 at HEAD `89a1fd2`)

**What it is:** a batch TypeScript CLI (no server, no UI, no scheduler) that discovers companies hosting careers pages on
Ashby (`jobs.ashbyhq.com/<slug>`) and scrapes all their public job postings into PostgreSQL (Prisma) or a dated CSV.

**Pipeline:** `discover` (upserts `Company` rows directly, capped at 1,000 CDX rows) **or** `process:cdx` →
`extracted-slugs.json` (3,072 slugs) → `seed [-- --all]` → `Company` rows (`ACTIVE`) → `scrape` | `scrape:parallel [-- --workers=N]` | `scrape:csv` → `verify` → optional `JOBS.md` via
`scripts/generate-readme.ts`. Every scrape writes `output/latest-error-report.json`.

**Where things live**

| Concern | File |
|---------|------|
| Ashby REST + GraphQL fallback, retries, headers, `extractSalary()` | `src/lib/AshbyClient.ts` |
| Sanitization / validation of every job before storage | `src/lib/Sanitizer.ts` |
| Adaptive concurrency limiter (`createLimiter`) | `src/lib/Concurrency.ts` |
| Run telemetry → `output/latest-error-report.json` | `src/lib/ErrorTracker.ts` |
| Redis client (optional; job hash cache, 7-day TTL, key `job:<ashbyId>:hash`) | `src/lib/Redis.ts` |
| DB scraper (`AshbyScraper.runAll`, 15 concurrent — 12/worker under `scrape:parallel` with >100 companies — 100-job batches) | `src/core/Scraper.ts` |
| Multi-process coordinator (fork + IPC) | `src/core/ClusterScraper.ts` |
| CSV scraper + Google Drive upload | `src/core/ScraperCSV.ts`, `src/lib/GoogleDrive*.ts` |
| Discovery (Wayback CDX, CommonCrawl, enrich) | `src/discovery/CdxWorker.ts`, `src/utils/ProcessCdxData.ts` |
| Seeding / DB health audit | `src/utils/Seed.ts`, `src/utils/Verify.ts` |
| DB maintenance CLIs | `src/database/Db{Clean,Inspect,Menu}.ts` |
| Schema (`Company`, `Job`, `Department`, `Location`) | `prisma/schema.prisma` |
| Explorer HTML generator | `scripts/GenerateDocs.ts` → `docs/project-explorer.html` |

**Env vars actually read:** `DATABASE_URL` (Prisma), `REDIS_URL` (optional), `GOOGLE_DRIVE_FOLDER_ID` (CSV upload).
Everything else is a hard-coded constant — see `documentation/07-configuration-and-setup.md`.

**Which doc to open**

| Task | Read |
|------|------|
| Changing scrape/fetch logic | 02, 03, 06, then 10 (invariants) and 11 §6 (which invariants are actually tested) |
| Adding/running a CLI command | 04 |
| Schema or Redis changes | 05 |
| Env/setup/credentials | 07, `docs/GOOGLE_DRIVE_SETUP.md` |
| Output files and report format | 08 |
| Known bugs before you "fix" something | 09 (numbered #1–#57, open vs resolved) |
| Writing or debugging tests | 11 |

**Zero → populated DB:** `npm install` → `cp .env.example .env` (set `DATABASE_URL`) → `npx prisma db push` (no
migrations dir) → `npm run seed -- --all` (without `--all` only the 7 `TARGET_COMPANIES`) → `npm run scrape:parallel`
(or `scrape`) → `npm run verify`. CSV instead: `npm run scrape:csv [-- --upload-cloud]` → `output/jobs_YYYY-MM-DD.csv`.

**Schema:** `Company{slug @unique, name?, logoUrl?, status: CompanyStatus = ACTIVE|NOT_FOUND|REDIRECTED}`;
`Job{ashbyId @unique, title, applyUrl, companySlug→Company.slug, departmentId?, locationId?, salaryMin/Max/Currency?,
metadata Json, contentHash, active}`; `Department` / `Location{name @unique}`. Full detail in 05.

**Change detection:** `generateHash()` = MD5 of `title|location|department|salaryMin|salaryMax`. With Redis, a matching
`job:<ashbyId>:hash` skips the job before the DB; without Redis, `batchUpsertJobs()` compares DB `contentHash`
(`createMany` for new jobs, `upsert` only if changed or `!active`, per-job fallback on batch error).

**Cluster (`scrape:parallel`):** workers = `--workers=N` or `min(4, max(2, cpus))`, capped at company count; round-robin
shards; children run `Scraper.ts --ipc-worker` with `saveTelemetry:false` and send reports over IPC; only the
coordinator writes the merged report. One failed worker rejects the whole run (09 #35).

**`npm run verify`:** counts all 4 tables, ACTIVE/NOT_FOUND companies, active/inactive jobs, salary coverage, top 15
companies, and a 500-job sample (empty titles, bad `applyUrl`, `\u0000`). Exits 0 even when it finds defects.

**Tests:** `npm test`, or one file `npx jest tests/unit/X.test.ts [-t "name"]`. Prisma → global
`__mocks__/@prisma/client.ts` (via `moduleNameMapper`), which six suites override with their own
`jest.mock('@prisma/client', factory)`; Redis → `jest.mock('../../src/lib/Redis', …)` (ScraperCore); axios →
`jest.mock('axios')`. Nothing touches real network/DB/Redis.

**Invariants with no/partial test (11 §6):** BF-010 entirely; BF-006 (in-flight dedupe, `deactivateStaleJobs`,
100-job flush); BF-008 (IPC, `saveTelemetry:false`); BF-009 (CSV tracker forwarding); partly BF-001 (403/400, headers),
BF-002 (lone surrogates), BF-005 (salary in hash).

**Adding a CLI command:** `src/<area>/Name.ts` with `@file`/`@summary`/`@tags` header, exported main function,
`require.main === module` guard → `package.json` script → test in `tests/unit/` → update docs 04 and 06 (02 if the
pipeline changes), root `README.md`, `AGENTS.md` → `npm run docs:generate`.

**Gotchas worth remembering**
- The 3-strike `NOT_FOUND` quarantine never fires in production (09 #29); dead slugs are re-fetched every run.
- Change-detection bugs: a job that reappears stays `active=false` while its Redis hash is cached (09 #30); edits to
  fields outside the hash (`applyUrl`, currency, description) are never saved (09 #31).
- `AshbyScraper.fetchJobs()` is dead code that only tests call (09 #47) — production path is `runAll()`.
- `latest-error-report.json` is shared by DB and CSV runs (each overwrites it); transient 5xx/timeouts are not recorded.
- Several BF invariants have no guarding test (BF-010 `createMany` fast path has none). Don't assume green tests prove them.
- `tsc -p .` and `npm run lint` only cover `src/`. `tests/` and `scripts/` are not type-checked or linted.
- `DbMenu.ts`, `DbInspect.ts`, `scripts/GenerateDocs.ts`, `scripts/test-drive-upload.ts` run on import — never import them.
- `JOBS.md` is a committed 5 MB generated snapshot; don't read it whole.
- Never read/print `.env`, `apikeys/`, or commit `output/`.
