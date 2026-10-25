# 12 · Implementation Roadmap

> This is the executable plan. Each task has a goal, the files it touches, its dependencies, whether it can run in
> parallel, its gaps, and acceptance criteria written as commands with their expected output.
>
> **Definition of done for every task** (from `AGENTS.md`):
> 1. Sync the docs: `AGENTS.md`, `README.md`, every affected numbered doc, and the `documentation/README.md`
>    "Last full analysis" date. Update docs 09 and 10 when bugs change.
> 2. Run `npm run docs:generate`.
> 3. Pass `npx tsc --noEmit -p . && npm run lint && npm test`. From P1-T19 onward, also pass `npm run verify:ui`.
>    From P3-T01 onward, also pass `npx tsc --noEmit -p tsconfig.test.json`.
> 4. If the task fixes a bug: add a `BF-0nn` entry plus a Regression Invariant in doc 10, and name the guarding test.
> 5. From P4-T02 onward: add a `CHANGELOG.md` `[Unreleased]` entry in the same commit, and add an ADR whenever the
>    task makes a decision. Before P4-T02, collect these notes in the commit body; P4-T02 backfills them.
> 6. Commit with a Conventional Commit subject and a multi-line bulleted body covering root cause, change, tests and
>    docs. **Do not push** unless the owner asks.
> 7. Every new file and function gets a JSDoc `@file` / `@summary` / `@tags` block.
>
> **Parallelism:** tasks marked ∥ can run at the same time **only in separate git worktrees**
> (`superpowers:using-git-worktrees`). Merge them one at a time. Docs files (09, 10, README) will conflict often;
> resolve those by keeping both entries.

## Phase map

```
P0 accounts & facts (owner) ─► P1 make existing correct ─► P2 cache + API read-through ─► P3 CI + schedule ─► P4 loop + agents ─► P5 frontend polish
                                 (scraper, API, UI S1s, docs truth)      (needs P1-T11, P1-T17)     (needs P2-T04)       (needs P1-T10, P3-T02)
```

Phase 1 runs on four tracks:
- **A (scraper):** `Scraper.ts`, so its tasks are sequential.
- **B (API):** `src/api/**`.
- **C (UI):** `frontend/**`.
- **D (docs and agent files).**

Tracks B, C and D can each run alongside A.

---

## P0 · Prerequisites (owner does these; the implementer verifies and records the results)

| Task | Goal | Acceptance |
|---|---|---|
| P0-T01 | Create the Upstash Redis free database in AWS us-east-1. Copy the `rediss://` URL. Then record in 11 Q-01 the concurrent-connection limit and whether the daily (10K) or monthly (500K) command limit applies. TLS and the budget error text are already confirmed (03 §1). | `redis-cli -u "$REDIS_URL" PING` returns `PONG` (run locally; never print the URL). 11 Q-01 is updated with the real values. |
| P0-T02 | Store secrets. GitHub environment `production`: `DATABASE_URL` (Neon **pooled** URL with `connection_limit=5`) and `REDIS_URL`. GitHub environment `fixer`: `ANTHROPIC_API_KEY`, `FIXER_APP_CLIENT_ID`, `FIXER_APP_PRIVATE_KEY`. Vercel: `DATABASE_URL` (pooled, `connection_limit=3`), `REDIS_URL`, `CORS_ORIGINS`, `HEALTH_TOKEN`. Optional: `VERCEL_TOKEN` and `VERCEL_PROJECT_ID` in `production`. **Neither environment may require reviewers**, or the scheduled run will block (OPS-08). | The secrets are listed in the GitHub and Vercel UIs (names only). |
| P0-T03 | Create a GitHub App with Contents, Pull requests and Issues set to read & write, and install it on the repo. Protect `main`: require a PR, 1 approval and the `ci` check, with no bypass for apps. Create the labels `auto-fix`, `needs-human`, `scrape-alert` and `fix-failed`. | A direct `git push origin main` from a test token is rejected. The labels exist. |
| P0-T04 | Record facts in 11: whether the repo is private (Q-02), which Vercel project serves prod (Q-04), the regions (Q-05), and the Neon DB size from `SELECT pg_size_pretty(pg_database_size(current_database()))` (Q-10, OPS-09). | Q-02, Q-04, Q-05 and Q-10 are answered in 11. |
| P0-T05 | Create the Vercel WAF rate-limit rule: path prefix `/v1/`, fixed 60 s window, 120 requests per IP, action 429. | Hitting `/v1/facets` more than 120 times in a minute from one IP returns 429 (try it on a preview). |

---

## P1 · Make what exists correct

**Order rule:** do P1-T01 and P1-T02 first. They make every later session load the truth.

### Track D: context truth and settings (first)

**P1-T01 · Shared `.claude/settings.json`, and a repo-level ignore for the personal file** (GAP-AG-01, S3) · ∥ none (do first)
- **Files:** `.gitignore`, `.claude/settings.json` (new, content in 08 §4), `scripts/hooks/post-commit-reminder.sh` (new), `.codex/hooks.json` (review).
- **Steps:**
  1. Add `.claude/settings.local.json` to `.gitignore`. It is not tracked today; only the owner's global gitignore
     keeps it out.
  2. Create `settings.json` and leave the impeccable hooks out of it.
  3. Ask the owner whether to keep the tracked `.codex/hooks.json`, whose impeccable hook can download a binary.
     The default is to keep it and add a one-line warning in doc 07.
- **Acceptance:**
  - `git -c core.excludesFile=/dev/null check-ignore -q --no-index .claude/settings.local.json && echo ignored`
    prints `ignored`. This proves the repo `.gitignore` covers it: `GIT_CONFIG_GLOBAL=/dev/null` would still read
    `~/.config/git/ignore`.
  - `node -e "JSON.parse(require('fs').readFileSync('.claude/settings.json','utf8'))"` exits 0.
  - `bash scripts/hooks/post-commit-reminder.sh </dev/null; echo $?` prints `0`.

**P1-T02 · Rewrite the auto-loaded context** (GAP-DOC-01/09/11/14, AG-05/06) · deps P1-T01
- **Files:** `AGENTS.md` (rewrite per 08 §3.1, ≤ 6 KB), `CLAUDE.md` (shim, ≤ 40 lines), `documentation/agents/context.md` (new, ≤ 6 KB), `documentation/README.md` (TL;DR, index 12–16 marked "planned", fact-owner table from 09 §3).
- **Content rule:** describe **today's** truth. Planned items are marked "(planned: P2)" and so on, so agents aren't misled while the work is in flight. Update these files again at the end of every phase.
- **Acceptance:**
  - `wc -c AGENTS.md documentation/agents/context.md` shows each ≤ 6144.
  - `wc -l CLAUDE.md` shows ≤ 40.
  - `grep -nE "no (web )?server|no REST endpoints|MUI v6|5 fields" AGENTS.md CLAUDE.md documentation/README.md documentation/agents/context.md` prints nothing.
  - A fresh Claude session answers cold-start questions 1, 3, 4, 8 and 12 (08 §7) with **today's** behaviour, and
    marks the 08 §7 target answers as "(planned: Pn)". Expected answers today:
    - Redis change detection is still on.
    - There is no `jc:v1` cache.
    - There is no `/v1/meta`.
    - The checks are tsc, lint and test only.

### Track A: scraper (sequential; all of it touches `Scraper.ts`)

| Task | Goal (gaps) | Files | Deps | Acceptance |
|---|---|---|---|---|
| P1-T03 | `runAll()` test harness (TEST-01/02) | `tests/helpers/prismaFactory.ts`, `tests/helpers/fakeRedis.ts`, `tests/unit/ScraperRunAll.test.ts` | — | `npx jest tests/unit/ScraperRunAll.test.ts` passes. It covers: 250 jobs → 3 flush chunks; `updateMany` called with `ashbyId: { notIn: [...] }` for a successful company; new ids → `createMany`. |
| P1-T04 | Remove Redis change detection (SCR-01/02, CACHE-02, TEST-02; D-06) | `src/core/Scraper.ts`, `tests/unit/ScraperCore.test.ts` (remove the Redis mock and Redis cases) | T03 | `grep -n ":hash\|initRedis\|redis\." src/core/Scraper.ts` prints nothing. `-t "reactivates inactive job with same hash"` passes. Doc 10 BF-006/BF-010 are rewritten without Redis. 09 #7 and #30 are marked resolved. |
| P1-T05 | Null-clearing; `Prisma.DbNull` for `postalAddress` (SCR-03, TEST-05) | `Scraper.ts`, `Sanitizer.test.ts` (surrogate case) | T04 | `-t "clears removed salary"` passes, with the update payload having `salaryMin === null`. The surrogate test passes. |
| P1-T06 | Content hash over the explicit field list in 05 §1, after sanitize and normalization (SCR-04, TEST-06) | `Scraper.ts`, `tests/unit/ContentHash.test.ts` | T05 | All 17 cases pass. The commit body notes the one-time ~34k-row rewrite on the next run. |
| P1-T07 | Persisted company health, quarantine, `lastSeenAt`, weekly recheck; delete `fetchJobs`/`notFoundStrikes` (SCR-05/06/21; D-10) | `prisma/schema.prisma` (05 §2), `Scraper.ts`, `ClusterScraper.ts` (company query), `tests/unit/CompanyHealth.test.ts`, `tests/unit/ScraperCore.test.ts` (remove the `fetchJobs`/strike cases) | T06 | `npx prisma validate` passes. `-t "quarantine after 3 consecutive runs"` and `-t "sunday recheck includes NOT_FOUND"` pass. `grep -n "notFoundStrikes\|fetchJobs" src/core/Scraper.ts` prints nothing. 09 #8, #29, #47 are resolved. |
| P1-T15 | Country ISO-3166 normalization plus backfill CLI (SCR-23) | `src/lib/Country.ts`, `Scraper.ts` (country assignment), `src/database/NormalizeCountries.ts`, `package.json` (`db:normalize-countries`), `tests/unit/Country.test.ts` | T07 | ≥ 30 cases pass. `npm run db:normalize-countries -- --dry-run` prints `{scanned, changed, unknown}`. Doc 05 country row is fixed. **Run the real backfill only when P1-T21 is ready to deploy.** |
| P1-T08 | Company isolation; safe flush chain (SCR-07/08, TEST-01) | `Scraper.ts`, `ErrorTracker.ts` (add `company_error`) | T15 | `-t "isolates a failing company"` and `-t "flush failure does not drop later batches"` pass. |
| P1-T12 | `api_error` with failure info; only 429 counts as a rate limit, emitted as `rate_limited`; `Retry-After` (SCR-11/12, TEST-09) | `src/lib/AshbyClient.ts`, `Scraper.ts`, `ScraperCSV.ts`, `AshbyClient.test.ts` | T08 | The 403, 400, 503×3, ETIMEDOUT and Retry-After cases pass. 09 #33 and #34 are resolved. |
| P1-T13 | GraphQL can't overwrite REST content; empty-board deferral at ≥ 5 active jobs (SCR-16/17) | `Scraper.ts`, schema (`pendingEmptySince`), `tests/unit/ScraperRunAll.test.ts` | T12 | `-t "graphql does not overwrite rest content"` and `-t "empty board deferred one run"` pass. |
| P1-T14 | CSV: exit codes, report saved after the stream finishes, naming (SCR-19) | `src/core/ScraperCSV.ts`, `ScraperCSV.test.ts` | T12, P1-T10 | `-t "saves report after stream finish"` passes. A forced failure exits 1. 09 #10 (CSV part), #12 and #38 are resolved. |

### Track A′: scraper files outside `Scraper.ts` (∥ with track A)

| Task | Goal (gaps) | Files | Deps | Acceptance |
|---|---|---|---|---|
| P1-T09 ∥ | Limiter must not let the process exit early (SCR-09, TEST-04) | `src/lib/Concurrency.ts`, `tests/unit/ConcurrencyExit.test.ts`, `tests/fixtures/limiter-exit.ts` | — | The test asserts `tasksDone=4/4` and exit 0. |
| P1-T10 ∥ | ErrorTracker v2, classifier, `report:classify` (SCR-13/14/15, LOOP-05, TEST-07; 07 §2–§3) | `src/lib/ErrorTracker.ts`, `src/lib/ReportClassifier.ts`, `src/utils/ReportClassifyCli.ts`, `package.json`, `tests/fixtures/reports/*.json`, `tests/unit/ErrorTrackerV2.test.ts`, `tests/unit/ReportClassifier.test.ts`, `documentation/08-outputs-and-artifacts.md` | — (agree the category list in 07 §2.2 first) | Both suites pass. `npm run report:classify -- --report tests/fixtures/reports/actionable.json --github-output /tmp/o` writes `actionable=` and `run_id=` lines. 09 #36 and #52 are resolved. |
| P1-T11 | Cluster `allSettled`, watchdog, signals, exit codes 0/1 (2 comes in P2-T04) (SCR-10, OPS-06, TEST-03) | `src/core/ClusterScraper.ts`, `ClusterScraper.test.ts` | P1-T10; merge after T08 | `-t "1 of 2 fails → report saved, exit 1"` and `-t "timeout → SIGTERM then SIGKILL"` pass. 09 #35 is resolved. |

### Track B: API (∥ with A and C)

| Task | Goal (gaps) | Files | Deps | Acceptance |
|---|---|---|---|---|
| P1-T16 | API test harness and **contract snapshots before any change** (API-13, TEST-11) | `tests/unit/ApiServer.test.ts`, `tests/fixtures/api/*`, `__mocks__/@prisma/client.ts` (add `findFirst`; `groupBy` already exists), devDeps `supertest` and `@types/supertest` | — | ≥ 15 tests covering status and keys for every route, with snapshots committed. `npm test` is green. |
| P1-T17 | API correctness (API-01/04/05/06/09/10/11/12/18; D-07), and extract `src/api/contract.ts` and `src/api/db/queries.ts` (04 §1, §4) | `src/api/**`, tests | P1-T16 | Tests show: `salaryInterval` alone is ignored; `findMany` args have `select` with no `metadata`; `orderBy` ends with `{id:'asc'}` and uses `nulls:'last'`; a non-UUID id gives 404 with no Redis or Prisma call; `/health.activeJobs` counts `active AND isListed` and makes at most one DB count per 10 min (04 §4 item 7); the `X-Forwarded-Uri` header is ignored (only after the preview check in 04 §4.8). Every snapshot from P1-T16 still matches, except the intended `salaryInterval` change and the additive fields. |
| P1-T18 | Composite indexes (API-22) | `prisma/schema.prisma`, doc 05 | P1-T07 (same file) | `npx prisma validate` passes. `npx prisma format && git diff --exit-code prisma/schema.prisma` shows no diff after the edit. Apply with `npx prisma db push` (the owner runs it or approves it). |

### Track C: UI (∥ with A and B)

| Task | Goal (gaps) | Files | Deps | Acceptance |
|---|---|---|---|---|
| P1-T19 | UI tooling: Vitest, Testing Library, MSW, Playwright, ESLint 9; root `verify:ui` (FE-09/10, TEST-12) | see 06 §4 | — | `npm run verify:ui` exits 0. `AGENTS.md` lists it in the mandatory checks. |
| P1-T20 | The default view shows all jobs (FE-01, API-01) | `filterSlice.ts`, `jobsApi.ts`, tests | P1-T19, P1-T17 (deployed) | The default query string is `page=1&pageSize=25&sortBy=publishedAt&sortOrder=desc`. After deploy, `curl -s "$URL/v1/jobs?page=1&pageSize=25&sortBy=publishedAt&sortOrder=desc" \| jq .meta.total` equals `curl -s $URL/health \| jq .activeJobs`. |
| P1-T21 | Country options come from facets, labelled with `Intl.DisplayNames` (FE-02) | `BrowsePage.tsx` / `FilterControls.tsx`, tests | P1-T19, P1-T15, P1-T17 | An MSW test passes. `grep -rnE '"(US\|GB\|CA\|DE\|FR)"' frontend/src/pages` prints nothing (mocks are excluded until P5-T10). When running these greps, type a plain `\|` as `|`. **Deploy together with the P1-T15 backfill.** After the backfill, `curl -s $URL/v1/facets \| jq -r '.countries[].value' \| grep -vcE '^[A-Z]{2}$'` prints `0`. |

### Track D (end of P1)

**P1-T22 · Factual doc fixes and doc 15 skeleton** (GAP-DOC-05/08/09/10/12/13/15/16/18, AG-10) · deps: the rest of P1
- **Files:** every fix in 09 §5 except the P5-only rows; `README.md` rewrite (09 §4); `documentation/15-system-architecture-and-flows.md` (sections 1–5 from 02); doc 10 registry rows for BF-011…013 with honest guard status; doc 11 §6.
- **Acceptance:**
  - `grep -rn "file:///" documentation README.md AGENTS.md` prints nothing.
  - `grep -rn "test-drive-upload\|BackfillJobFields\|db:backfill" --include=*.md .` prints nothing (excluding `documentation/plan/`).
  - `grep -n "BF-012\|BF-013" documentation/10-bug-fix-and-improvement-log.md` shows registry rows.
  - Refresh `AGENTS.md` and `context.md` to the end-of-P1 truth.

**P1 exit check:** all P1 acceptance criteria pass. A local `npm run scrape:parallel` exits 0 and writes `output/reports/<YYYY-MM>/<runId>.json` (schema 2.0). `npm run verify` is clean.

---

## P2 · Cache and API read-through

| Task | Goal (gaps) | Files | Deps | ∥ | Acceptance |
|---|---|---|---|---|---|
| P2-T01 | Cache keys, canonicalizer, `detailsShard()` (CACHE-01, API-02; 03 §3) | `src/lib/cache/keys.ts`, `tests/unit/CacheKeys.test.ts` | P1-T17 | ∥ T02 | 20-case table passes. The examples in 03 §3.2 produce exactly the documented keys. |
| P2-T02 | Redis client factory, breaker, budget flag (SCR-20, CACHE-03; 04 §3) | `src/lib/cache/RedisClient.ts`, `src/api/cache/Breaker.ts`, tests; `src/lib/Redis.ts` (keep as a thin wrapper or delete; update importers) | — | ∥ T01 | `createRedis({role:'api'})` returns `null` without `REDIS_URL`. Breaker and budget tests pass. 09 #48 is resolved. |
| P2-T03 | Publisher and CLIs (`cache:publish [--dry-run]`, `cache:status`, `cache:purge-legacy`) (CACHE-01/02/06, TEST-08; 03 §4, §8) | `src/cache/Publisher.ts`, `src/cache/CacheCli.ts`, `package.json`, `tests/unit/Publisher.test.ts` | P2-T01, T02 | — | `Publisher.test.ts` passes every case in 10 §2. Against the real Upstash, `npm run cache:publish -- --dry-run` prints a generation ≤ 16 MiB, details ≤ 152 MiB (each shard ≤ 19 MiB) and commands ≤ 300. The dry run reads no detail rows. **Ask the owner before the first real publish to production Redis.** A real `npm run cache:publish` followed by `npm run cache:status` shows `current` = the new gen and `lastPublish.status=published`. |
| P2-T04 | Wire the publisher into the coordinator and standalone scrape; sanity gate inside the publisher, with `--force`; exit code 2; `--skip-publish` → `recordScrapeFinished()` (SCR-18, CACHE-01, OPS-06; 05 §4) | `ClusterScraper.ts`, `Scraper.ts` (new `runAll({ publish })` option set by main only, 05 §4.1), `ErrorTracker.ts` (cache section), tests | P1-T11, P2-T03 | — | `-t "publishes only when all workers succeed"`, `-t "gate blocks publish on 30% drop"` and `-t "exit 2 when publish fails"` pass. A new BF entry for cache publishing is added. |
| P2-T05 | Read-through for lists, facets, companies and meta; headers; error contract; single-flight; dbGuard (API-02/16/17/19, CACHE-04/07; 03 §5.1, 04 §3) | `src/api/cache/ReadThrough.ts`, `src/api/middleware/*`, `Server.ts`, `tests/unit/ReadThrough.test.ts` | P2-T01, T02, P1-T17 | ∥ T03 (different files) | The parity and failure-mode tests in 10 §2 pass. The P1-T16 snapshots still match (plus additive fields). A new BF for read-through parity is added. |
| P2-T06 | Detail from `jc:v1:details:<detailsShard(id)>`, with DB fallback `OR(id, ashbyId)` (API-02; 03 §5.2) | `ReadThrough.ts`, `Server.ts`, tests | P2-T05 | — | `-t "detail HIT from details hash"` and `-t "detail miss → DB, no Redis write"` pass. |
| P2-T07 | `/health` v2 and `GET /v1/meta` (API-04, CACHE-04; 04 §5) | `Server.ts`, tests | P2-T05 | — | Shallow health makes 0 Prisma calls. `?deep=1` without a token makes no DB call. Responses are `no-store`. `/v1/meta` matches the contract. |
| P2-T08 | Remove the in-memory limiter; CORS allow-list; Cache-Control; `vercel.json` regions/functions/headers (SPA CSP); delete `frontend/vercel.json`; type-check and lint `api/` (API-03/07/08/14/15/21, FE-08/19; D-16) | `Server.ts`, `src/api/middleware/*`, `vercel.json`, `frontend/vercel.json` (delete), `tsconfig.json`, `package.json` (lint script) | P2-T05, P0-T05, P1-T17 (the `x-forwarded-uri` decision) | — | An unlisted origin gets no `Access-Control-Allow-Origin`. The 11th request from one IP is not a 429. The 14th concurrent fallback gets 503 + `Retry-After: 5`. On the preview, `curl -sI $PREVIEW/` shows a CSP without `script-src 'unsafe-inline'` and `X-Frame-Options: DENY`, and `curl -sI "$PREVIEW/v1/jobs?page=1"` shows `s-maxage=300` and `X-Cache`. |
| P2-T09 | Docs: new `documentation/12-backend-api.md` (09 §8); doc 05 Redis section → `jc:v1:*`; doc 07 env vars and Neon pooled URL; `.env.example`; serverless Prisma notes (DOC-02, DOC-16, API-20, CACHE-05, OPS-08) | docs, `.env.example` | T03–T08 | ∥ | `grep -n "jc:v1:current" documentation/05-database-and-cache.md documentation/12-backend-api.md` finds matches. `grep -n "Required" .env.example` doesn't match the Redis line. |

**P2 exit check:** the live checks in 10 §5 for P2 pass on a preview deploy and then on production.

---

## P3 · CI and schedule

| Task | Goal (gaps) | Files | Deps | Acceptance |
|---|---|---|---|---|
| P3-T01 | PR CI: `.github/workflows/ci.yml` (Node 24, `npm ci` for root and UI, tsc, lint, test, `tsc -p tsconfig.test.json`, `verify:ui`, build, Playwright when relevant); `.nvmrc` = `24`; `engines`; `tsconfig.test.json`; root `build` uses `npm ci --prefix frontend` (OPS-01/02, TEST-10, FE-18) | `.github/workflows/ci.yml`, `.nvmrc`, `package.json`, `tsconfig.test.json` | P1 done | The `ci` check is green on a test PR. `npx tsc --noEmit -p tsconfig.test.json` exits 0. Branch protection requires `ci` (P0-T03). |
| P3-T02 | Daily scrape workflow, `scrape` job only (07 §6 without `fixer`); `scripts/ci/alert-issue.sh`; `npm run report:install-fixture` (07 §6 notes) (OPS-01/03/04/05/07) | `.github/workflows/scrape-daily.yml`, `scripts/ci/alert-issue.sh`, `src/utils/InstallReportFixture.ts`, `tests/fixtures/reports/failed-run.json` | P3-T01 (`.nvmrc`), P2-T04, P1-T10, P0-T02 | A `workflow_dispatch` run is green. The `scrape-report-<runId>` artifact exists. The step summary uses the 07 §2.3 template. `npm run cache:status` (locally) shows `current` = that run's gen. A `workflow_dispatch` run with `fixture_report=tests/fixtures/reports/failed-run.json` (exit code 1) opens or appends the `scrape-alert` issue. `--workers=0` can't be used for this, because it is ignored. |
| P3-T03 | Enrichment returns a status and backs off on 429 (SCR-22) | `src/lib/AshbyClient.ts`, `src/utils/EnrichCompanies.ts`, tests | P1-T12 | `-t "enrich backs off on 429"` passes. |
| P3-T04 | Ops doc `documentation/14-deployment-and-operations.md` (09 §7), runbook (DOC-04, CACHE-06) | docs | P3-T02 | The doc exists, is linked from the index, and its secrets matrix matches the workflow files. |

---

## P4 · Self-healing loop and agents

| Task | Goal (gaps) | Files | Deps | ∥ | Acceptance |
|---|---|---|---|---|---|
| P4-T01 | Decision log: `documentation/decisions/README.md`, the template, and backfilled ADR-0001…0012 (07 §4) (LOOP-02, DOC-06, AG-08 via ADR-0005) | `documentation/decisions/**` | — | ∥ T02 | 12 ADR files plus the index. Each has the header block (Status, Date, Deciders, Related) and the 4 sections Context, Options considered, Decision, Consequences, and links its D-xx, BF and GAP ids. |
| P4-T02 | `CHANGELOG.md` with backfilled `[1.3.0] - 2026-10-23` (BF-001…013 from git history); `package.json` version `1.3.0`, description, and removal of the stale `main`. P1–P3 work (BF-014 onward, from the commit bodies) goes under `[Unreleased]` (LOOP-03, DOC-06; 09 #40) | `CHANGELOG.md`, `package.json` | — | ∥ T01 | `node -p "require('./package.json').version"` prints `1.3.0`. The CHANGELOG has `[Unreleased]` (P1–P3 entries) and `[1.3.0]`. The owner runs `git tag v1.3.0 22afd64`. |
| P4-T03 | THE protocol: `documentation/16-self-healing-loop.md` (07 §1–§8 in final form). `AGENTS.md` protocol replaced by a summary plus link. Doc 10 becomes registry-only. Doc 15 completed (sections 6–10) (LOOP-04, DOC-05/07) | docs | T01, T02 | — | `grep -c "Bug-Fix Agent Protocol" AGENTS.md documentation/10-bug-fix-and-improvement-log.md` shows only links to 16. Doc 16 contains the 9-step order. |
| P4-T04 | Shared agent source: `documentation/agents/roster.md` and `roles/<6>.md` (08 §3.3) (AG-02) | `documentation/agents/**` | T03 | — | 6 role files, each with responsibilities, read-first list, allowed scope and output contract. |
| P4-T05 | Claude shells and skills: `.claude/agents/<6>.md`; `.agents/skills/{fix-from-error-report,review-run,record-decision,release-notes,release,verify-change}/SKILL.md`; `.claude/skills/*` symlinks (replace the impeccable copy); `.claude/rules/scraper-invariants.md`; pin impeccable in `skills-lock.json`; exclude `.agents`/`.claude` in `GenerateDocs.ts` (AG-02/03/04/07/12; 09 #55) | those paths | T04 | ∥ T06 | `find .claude/skills -maxdepth 1 -mindepth 1 ! -type l` prints nothing. A fresh Claude session lists the 6 agents and 6 skills (via `/agents` and the skills menu). |
| P4-T06 | Antigravity shells: `.agents/rules/{00,10,20,30,40}-*.md`, `.agents/agents/<6>.md`, `.agents/hooks.json` (08 §2) (AG-05/07/09) | those paths | T04 | ∥ T05 | In Antigravity, `/context` lists `AGENTS.md` and `00-scraper-context.md`, and `/agents` lists the 6 roles. Every rule has a valid `trigger`. |
| P4-T07 | Parity test (08 §6) (TEST-13) | `tests/unit/AgentShells.test.ts` | T05, T06 | — | Passes. It fails if one shell's description is edited. |
| P4-T08 | Fixer job (07 §6 `fixer`), `scripts/ci/open-fix-pr.sh`, `scripts/ci/record-fix-attempt.sh`, `scripts/ci/check-fixer-scope.sh` (+ `ci.yml` step for `auto-fix/*`), `.github/pull_request_template.md`. **Step 1 confirms Q-17 on a test branch.** Source reading says yes: `settingSources` defaults to user, project and local. Also confirm that, with `github_token: ${{ github.token }}`, `git push` from inside the agent step fails. Record both results in an ADR (LOOP-01/06, AG-08; D-08/09/11). | `.github/workflows/scrape-daily.yml`, `scripts/ci/*`, `tests/fixtures/reports/actionable.json` (plus a matching small reproducible bug on the test branch), `tests/unit/FixerScope.test.ts` | P3-T02, T05, P0-T02/T03 | — | A `workflow_dispatch` run on a test branch with `fixture_report=tests/fixtures/reports/actionable.json` (no scrape; the fixer checks out `github.sha`, so it sees that branch) opens an `auto-fix/<runId>` PR labelled `auto-fix`. The PR contains a code fix with a test, a CHANGELOG `[Unreleased]` entry, `documentation/runs/<runId>.md` and a BF entry. `ci` runs on it. A second run with the same fingerprint only comments on the PR. Forcing the gate to fail twice applies `needs-human`. |
| P4-T09 | Cold-start test in both tools (08 §7); record the results in a doc 16 appendix (AG-11) | doc 16 | T05–T08 | — | 12/12 in Claude Code and 12/12 in Antigravity, recorded with the date and sha. |

---

## P5 · Frontend polish (after the P2 contract freeze)

The full specification for P5-T01…T10 (files and acceptance) is in [06](./06-frontend-plan.md) §4.

**Order:**
1. **P5-T01**, then **T05**, then **T06**, then **T08**. These are serial because they touch most pages.
2. **T02** and **T03** run in parallel with step 1, provided they don't edit the same page.
3. **T04**, **T07**, **T09** and **T10** come last.

| Task | Goal (gaps) | Deps |
|---|---|---|
| P5-T01 | URL state, mobile drawer draft, scroll/focus, loading bar, sort (FE-03/07/16) | P2 done |
| P5-T02 | Remove the client rate gate; `<QueryState>`; 429 countdown and refetch (FE-05/06) | P2-T08 |
| P5-T03 | Companies pagination and empty state (FE-04) | P2 done |
| P5-T04 | Live counts and freshness from `/v1/meta` (FE-11) | P2-T07 |
| P5-T05 | Accessibility and touch targets (FE-12/25) | P5-T01 |
| P5-T06 | SEO basics; JSON-LD behind a flag (FE-13; D-13) | P5-T05 |
| P5-T07 | DOMPurify config; closed-job banner disables both Apply buttons (FE-14/15) | P2-T06 |
| P5-T08 | Performance and hygiene (FE-20/21/22/24) | P5-T06 |
| P5-T09 | UI doc `documentation/13-frontend-ui.md` (DOC-03) | P5-T01…T08 |
| P5-T10 | Types match the contract; fixtures; contract test (FE-17/23, API-23, DOC-17) | P2 done |
| P5-T11 | Optional weekly discovery workflow `.github/workflows/discover-weekly.yml` running `npm run discover -- --common-crawl` (OPS-10; Q-16). Needs the CDX paging fixes first (09 #13, #37). Acceptance: a `workflow_dispatch` run is green. | P3-T02 |

---

## Traceability

- Every S1 and S2 gap in 01 maps to at least one task above.
- Every task names its gaps.
- The round-2 validation (11 §4) checks both directions mechanically.

---

## Implementer prompt (paste this into the implementing LLM)

```text
You are implementing the plan in documentation/plan/ of the repo at /Users/pavanreddy/Documents/anti-gravity/job-scrapper
(Ashby Job Scraper: TypeScript scraper CLI + Express API on Vercel + React UI in frontend/).

Before anything else, read in order: AGENTS.md, CLAUDE.md, documentation/README.md, then documentation/plan/00-README.md
and every file it lists (01–12). The plan is the spec; documentation/plan/11-open-questions-and-decisions.md holds the
final decisions (D-01…D-16) — do not re-litigate them. If something in the code contradicts the plan, trust the code,
note the discrepancy in your commit body, and adapt the smallest part of the plan needed.

Work phase by phase from documentation/plan/12-implementation-roadmap.md, starting at P1-T01 then P1-T02 (P0 tasks are
the owner's; if a P0 result you need is missing, stop and ask me for exactly that item). For EACH task:
  1. Re-read the task row, its gaps in 01, and the design section it references (03/04/05/06/07/08/09/10).
  2. Check the BF Regression Invariants in documentation/10-bug-fix-and-improvement-log.md and guard status in
     documentation/11-testing-guide.md §6; do not violate them; if the task rewrites one, update it in the same commit.
  3. Write the failing test first (superpowers:test-driven-development), then the change.
  4. Run every command in the task's Acceptance column and paste the real output in your summary; do not claim
     success without it (superpowers:verification-before-completion).
  5. Do the Definition of Done at the top of 12 (docs sync, npm run docs:generate, tsc/lint/test[/verify:ui],
     BF entry for bug fixes, CHANGELOG/ADR from P4-T02 on, JSDoc headers, Conventional Commit with bulleted body).
  6. One commit per task (or a small series), on a feature branch per phase (e.g. plan/p1-correctness). Never push to
     main, never merge, never force-push; push branches only if I ask.

Rules: never read/print/commit .env, apikeys/, or output/ values; never run the real scraper against production or
`prisma db push` against production without asking me first (dry-runs and tests are fine); tasks marked ∥ may run in
parallel only in separate git worktrees (superpowers:using-git-worktrees) — merge one at a time. Use the skills:
superpowers:executing-plans (or subagent-driven-development for independent tasks), test-driven-development,
systematic-debugging on any failure, verification-before-completion, requesting-code-review at the end of each phase;
supabase:supabase-postgres-best-practices for schema/index/query work; impeccable for UI work in P5.

At the end of each phase: refresh AGENTS.md + documentation/agents/context.md to the new truth, run the phase exit
check, and give me a summary: tasks done (with commit SHAs), acceptance output, deviations from the plan and why,
and anything I must do (P0 items, secrets, approvals).
```
