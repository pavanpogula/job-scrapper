# 10 · Testing and Verification Plan

> **Baseline at `22afd64`:** 16 Jest suites and 79 tests, all passing. `tsc` reports 0 errors. Lint reports 0 errors
> and 1 warning (`DbInspect.ts:56`). These checks cover `src/` only. Nothing tests `src/api/**` or `job-scrapper-ui/**`
> (BF-012 and BF-013 have no test that imports them).
> **Rule:** a fix is not done until a test fails without it and passes with it. Every new BF invariant names the test
> that guards it.

## 1. Mandatory checks after P3

| Where | Command |
|---|---|
| Every change, run locally by any agent | `npx tsc --noEmit -p . && npx tsc --noEmit -p tsconfig.test.json && npm run lint && npm test && npm run verify:ui && npm run docs:generate` |
| PR CI (`ci.yml`) | All of the above, plus `npx tsc --noEmit -p tsconfig.test.json` (type-checks `tests/`, `scripts/` and `api/`) and `npm run build`. If the PR touches `job-scrapper-ui/**`, `src/api/**` or `vercel.json`, also run `npm --prefix job-scrapper-ui run test:e2e`. On `auto-fix/*` branches, also run `scripts/ci/check-fixer-scope.sh`. |
| Daily scrape (`scrape-daily.yml`) | `npx tsc --noEmit -p .` before scraping. The classifier also acts as a runtime assertion. |

## 2. New and extended backend suites (Jest, `tests/`)

| Suite | Task | Guards (BF / gap) | Key cases |
|---|---|---|---|
| `tests/helpers/prismaFactory.ts` | P1-T03 | — | A shared factory with every method the scraper and API use, including `findFirst`, `createMany`, `updateMany`, `$transaction` and `groupBy` |
| `tests/unit/ScraperCore.test.ts` (shrink) | P1-T04, P1-T07 | — | Remove the Redis mock and the `filterChangedJobs`/pipeline, `fetchJobs` and `recordNotFoundStrike` cases. Their intent moves to the suites below. |
| `tests/unit/ScraperRunAll.test.ts` | P1-T03, T04–T08, T13 | BF-006, 008, 010; SCR-01…08, 16, 17 | 250 jobs flush in 3 chunks; `deactivateStaleJobs` gets the live ids; new → `createMany`; unchanged → no upsert (only the per-company `lastSeenAt` raw `UPDATE`); changed or inactive → upsert; reactivation when the DB has the same hash but `active=false`; nulls are cleared; one failing company is isolated; a flush failure doesn't drop later batches; GraphQL doesn't overwrite REST; an empty board is deferred |
| `tests/unit/ContentHash.test.ts` | P1-T06 | BF-011; SCR-04 | 17 cases: each hashed field and metadata changes the hash; key order doesn't matter |
| `tests/unit/CompanyHealth.test.ts` | P1-T07 | BF-006 ext; SCR-05/06 | Quarantined after 3 consecutive 404s; a success resets the counter; the Sunday recheck includes `NOT_FOUND`; reaching 7 failures emits `company_unreachable` without deactivating |
| `tests/unit/ConcurrencyExit.test.ts` + `tests/fixtures/limiter-exit.ts` | P1-T09 | SCR-09 | A child process runs the fixture; assert `tasksDone=4/4` and exit 0 |
| `tests/unit/ErrorTrackerV2.test.ts` | P1-T10 | BF-009; SCR-13/14/15 | Run-id naming; two saves in the same second in different modes give two files; per-category caps with exact counts; numeric merge sums every field |
| `tests/unit/ReportClassifier.test.ts` | P1-T10 | LOOP-05 | One case per rule R-*; fingerprint normalisation is stable; `regressed` detection; `issues_file` is capped at 3 |
| `tests/unit/ClusterScraper.test.ts` (extend) | P1-T11, P2-T04 | BF-008; SCR-10 | `allSettled`; 1 of 2 workers fails → report saved and exit 1; timeout → SIGTERM then SIGKILL; publisher called only when all workers are OK; exit 2 when the publish fails |
| `tests/unit/AshbyClient.test.ts` (extend) | P1-T12 | BF-001; SCR-11/12 | 403 and 400 fall back to GraphQL; `BROWSER_HEADERS` is sent on GET and POST; 503×3 → failure `http/503/3`; ETIMEDOUT → `timeout`; 403 + GraphQL OK → `rateLimited:false`; `Retry-After` is honoured and capped at 10 s |
| `tests/unit/ScraperCSV.test.ts` (extend) | P1-T14 | BF-009; SCR-19 | Exit 1 on failure; the report is saved after the stream emits `finish` |
| `tests/unit/Country.test.ts` | P1-T15 | SCR-23 | ≥30 cases, including `USA`, `United States`, `U.S.`, `UK`, `England`, `Deutschland`, lower case, unknown → null, and a code that is already ISO |
| `tests/unit/ApiServer.test.ts` + `tests/fixtures/api/*` | P1-T16 (snapshots), P1-T17, P2-T05…T08 | BF-012/013 (finally guarded); API-01…22 | Contract snapshots for every route; `salaryInterval` without `salaryMin` is ignored; `select` excludes metadata; `orderBy` tie-breaks on `id`; non-UUID id → 404 with no DB call; `X-Forwarded-Uri` is ignored; CORS allow-list; Cache-Control by status; dbGuard returns 503 on the 14th concurrent fallback; shallow `/health` makes no Prisma call |
| `tests/unit/CacheKeys.test.ts` | P2-T01 | — | A 20-case table: `salaryInterval` without `salaryMin`, arrays, junk booleans, `pageSize=26` is not cacheable, defaults dropped, sorted keys |
| `tests/unit/RedisClient.test.ts` + `Breaker.test.ts` | P2-T02 | SCR-20, CACHE-03 | `null` when `REDIS_URL` is unset; API options as in 04 §3; the breaker opens after 3 failures and half-opens after 30 s; the budget-error regex sets `budgetExhaustedUntil` to the next UTC midnight |
| `tests/unit/Publisher.test.ts` | P2-T03 | new cache BF; TEST-08 | `__manifest` is the last HSET; `EXPIRE 172800` follows the first chunk; the MULTI contents are exact; details are written to `jc:v1:details:<crc32(id)%8>` before the swap and HDEL'd after it; no shard is over 20 MiB; first-fill command count ≤ 300; a failure mid-write UNLINKs, leaves `current` untouched and records `cache_publish_failed`; mode selection; lock contention → `skipped_locked`; dry run writes nothing; generation over budget → pages dropped deepest-first |
| `tests/unit/ReadThrough.test.ts` | P2-T05/T06 | invariants in 02 §8 | **Parity:** with a 60-job fixture, the DB-path body equals the gunzipped cached field byte for byte, for `jobs?page=1`, `jobs?page=2&workplaceType=Remote`, `facets`, `companies?page=1` and a detail. **Failure modes:** throw, 200 ms timeout, no pointer, no generation, missing field, breaker open, budget exhausted and unset URL each return 200 from the DB with the right `X-Cache` and reason. A page past the end gives an empty HIT with no DB call. |
| `tests/unit/AgentShells.test.ts` | P4-T07 | D-14; AG-* | 08 §6 items 1–8 |
| `tests/unit/FixerScope.test.ts` | P4-T08 | 07 §7 | `scripts/ci/check-fixer-scope.sh` rejects changes to `.github/**`, `package.json` dependencies and `vercel.json`, and accepts `src/**` and `documentation/**` |

**Mocking rules (unchanged):** no real network, DB or Redis. Use the global Prisma mock, `jest.mock('axios')`, and an
in-memory Redis fake (`tests/helpers/fakeRedis.ts`) that implements `get`, `getBuffer`, `hget`, `hgetBuffer`,
`hgetall`, `hset`, `hdel`, `hlen`, `set`, `del`, `unlink`, `expire`, `persist`, `multi`/`exec`, `pipeline`, `eval`,
`scan`, `info`, `dbsize` and `quit`, and counts the commands it receives. Don't use `ioredis-mock`.

## 3. UI suites (Vitest and Playwright, `job-scrapper-ui/`)

These are listed in 06 §5: `jobsApi`, `BrowsePage`, `JobDetailPage` (which guards the BF-013 DOMPurify invariant),
`CompaniesPage`, the contract test (shares fixtures with `ApiServer.test.ts`), and the Playwright suites `browse`,
`detail` and `a11y` (axe: 0 serious or critical issues in light and dark).

## 4. BF invariant → guard map (target)

The P1-T22 and P4-T03 doc updates copy this table into doc 11 §6.

| BF | Today | After the plan |
|---|---|---|
| BF-001 | ⚠️ (only 404 tested) | ✅ `AshbyClient.test.ts` (403/400/headers/failure info) |
| BF-002 | ⚠️ (surrogates untested) | ✅ add a surrogate case to `Sanitizer.test.ts` in P1-T05 |
| BF-004 | ⚠️ | ✅ `ScraperRunAll.test.ts` (createMany failure → per-job fallback) |
| BF-005 | ⚠️ | ✅ null-clearing and hash cases |
| BF-006 | ❌ | ✅ `ScraperRunAll.test.ts` + `CompanyHealth.test.ts` |
| BF-008 | ⚠️ | ✅ `ClusterScraper.test.ts` |
| BF-009 | ⚠️ | ✅ `ErrorTrackerV2.test.ts`, `ScraperCSV.test.ts` |
| BF-010 | ❌ | ✅ `ScraperRunAll.test.ts` |
| BF-011 | ⚠️ (currently claimed as ✅) | ✅ `ContentHash.test.ts` |
| BF-012 | ❌ | ✅ `ApiServer.test.ts` + UI tests |
| BF-013 | ❌ | ✅ `JobDetailPage.test.tsx` (DOMPurify) + `ApiServer.test.ts` (headers, filters) |
| New: cache publisher (P2-T03; wiring in P2-T04) | — | `Publisher.test.ts` + `ClusterScraper.test.ts` |
| New: read-through parity (P2-T05) | — | `ReadThrough.test.ts` |
| New: `salaryInterval` (P1-T17) | — | `ApiServer.test.ts` |
| New: limiter exit (P1-T09) | — | `ConcurrencyExit.test.ts` |
| New: country ISO (P1-T15) | — | `Country.test.ts` |

## 5. Live verification, run once per phase by the owner or with `workflow_dispatch`

| Phase | Check | Expected |
|---|---|---|
| P1 | Run `npm run scrape:parallel` locally, then `npm run verify` | Exit 0. Report v2 is under `output/reports/`. `jobsReactivated` and `jobsDeactivated` are present. |
| P1 | `curl -s "$URL/v1/jobs?page=1&pageSize=25" \| jq .meta.total` vs `curl -s $URL/health \| jq .activeJobs` | Equal |
| P1 | `curl -s $URL/v1/facets \| jq '.countries[].value'` | Every value matches `^[A-Z]{2}$` |
| P2 | `npm run cache:publish -- --dry-run` | Generation ≤ 16 MiB, details ≤ 152 MiB (each shard ≤ 19 MiB), commands ≤ 300 |
| P2 | `curl -sI "$URL/v1/jobs?page=1"` twice | `X-Cache: HIT`, plus `X-Cache-Generation` and `Cache-Control` with `s-maxage=300` |
| P2 | Point a Vercel preview's `REDIS_URL` at a wrong host | Status 200 with `X-Cache: BYPASS`, and the reason header is `circuit_open` or `redis_error` |
| P3 | Run `scrape-daily.yml` with `workflow_dispatch` | Green. The `scrape-report-<runId>` artifact and the step summary exist. `jc:v1:current` equals the new generation. A second dispatch with `fixture_report=tests/fixtures/reports/failed-run.json` opens or appends the `scrape-alert` issue. |
| P4 | Run `workflow_dispatch` on a test branch with `fixture_report=tests/fixtures/reports/actionable.json`. No scrape runs; the fixer checks out that branch. | The fixer opens an `auto-fix/*` PR that includes the ADR or CHANGELOG entry and `documentation/runs/<runId>.md`. The `ci` check runs on the PR. |
| P4 | Cold-start test (08 §7) | 12/12 in Claude Code and in Antigravity |
| P5 | Playwright and axe in CI; `curl -sI $URL/` | Green; the CSP has no `script-src 'unsafe-inline'`; `X-Frame-Options: DENY` |
