# 05 · Scraper Plan (correctness, cache publishing, parallel scheduled runs)

> Scope: `src/core/*`, `src/lib/{AshbyClient,Concurrency,ErrorTracker,Sanitizer,Redis}.ts`, `src/cache/*` (new),
> `prisma/schema.prisma`. Gap IDs are in [01](./01-current-state-and-gap-analysis.md) §3.1. The tasks are P1-T03…T15,
> P2-T03/T04 and P3-T02/T03 in [12](./12-implementation-roadmap.md). Before editing, read the BF invariants in
> [`../10-bug-fix-and-improvement-log.md`](../10-bug-fix-and-improvement-log.md). Each task below names the
> invariant it rewrites.

## 1. Order of work

Phase 1 makes the existing scraper correct before any new feature is added. The tasks are sequential because almost
all of them edit `Scraper.ts`. The exceptions marked "parallel" touch other files.

| Task | Change | Gaps | BF touched |
|---|---|---|---|
| P1-T03 | Test harness for `runAll()`: `tests/helpers/prismaFactory.ts` (job `findMany/createMany/updateMany/upsert`, department/location `upsert/findUnique`, company `findMany/update`, `$transaction`) and `tests/unit/ScraperRunAll.test.ts` | TEST-01/02 | BF-006, 010 (guards only) |
| P1-T04 | Remove Redis change detection: the `filterChangedJobs()` Redis branch, the pipeline `SET`, and `initRedis` in workers. The DB `contentHash` compare is the only detector. **Also rewrite or delete the `tests/unit/ScraperCore.test.ts` cases this breaks** (the Redis mock at `:47-61`, `filterChangedJobs` cases at `:152-196`, pipeline cases at `:199-219`) and move their intent into `ScraperRunAll.test.ts`. | SCR-01/02, CACHE-02 | rewrite BF-006/010 to drop their Redis clauses |
| P1-T05 | Clear nullable columns: `?? null` for every nullable scalar column in `create`/`createMany`/`update`. For `postalAddress`, the only nullable JSON column, use `Prisma.DbNull`, which writes SQL NULL (`JsonNull` would write a JSON null). Add a test for a GraphQL job with no address. | SCR-03 | BF-005, 011 |
| P1-T06 | Content hash computed **after** sanitizing and country normalization, over an explicit field list rather than all of `metadata`. **Fields:** the 16 fields hashed today — `title, location, department, salary.min, salary.max, salary.currency, salary.interval, isRemote, workplaceType, employmentType, publishedAt, applyUrl, isListed, country, region, city` (`Scraper.ts:164`) — plus `descriptionHtml`, `descriptionPlain`, `team`, and the sorted `secondaryLocations[].location`. Formula: `md5(stableStringify({...}))`. **Excluded:** `metadata._source` and any other volatile keys, so a REST↔GraphQL flip alone is not a change. Today's hash runs on the raw pre-sanitize job; move it. Every hash changes once, so the first run rewrites about 34k rows; put that in the release note. | SCR-04 | BF-011 |
| P1-T07 | Persisted company health (§2), dead-company job deactivation, weekly `NOT_FOUND` recheck. Delete `fetchJobs()` and `notFoundStrikes`, **and the `ScraperCore.test.ts` cases that call them** (`:71-99`, `:270-287`). Their intent moves to `CompanyHealth.test.ts`. | SCR-05/06/21 | BF-006 |
| P1-T08 | Wrap each company task in try/catch (`company_error` event, `companiesFailed++`, never rethrow). Give the flush chain a `.catch` that records `db_error/batch_flush_failed` and keeps flushing later batches. | SCR-07/08 | BF-004, 006, 008 |
| P1-T09 (parallel) | Remove `unref()` from the limiter pause timer (`Concurrency.ts:83-85`) | SCR-09 | new BF |
| P1-T10 (parallel) | ErrorTracker v2, `ReportClassifier`, `npm run report:classify` (07 §2–§3). The v1 single `validation_issue` category splits into `validation_filtered` and `validation_sanitized`, using each issue's existing `action`. | SCR-13/14/15, LOOP-05 | BF-009 |
| P1-T11 (after P1-T10; merge after T08) | `ClusterScraper`: `Promise.allSettled`, a `workers[]` status in the report, a watchdog, signal forwarding, the exit-code contract (§4) | SCR-10, OPS-06 | BF-008 |
| P1-T12 | `fetchAshbyBoardWithFallback()` returns `failure{kind,status,code,attempts}` and emits `api_error`. Only a final 429 counts as a rate limit. Honor `Retry-After`, capped at 10 s. | SCR-11/12 | BF-001 |
| P1-T13 | Stamp `metadata._source`. A GraphQL result arriving over a REST row updates only `active` and `lastSeenAt`, via raw SQL, so `updatedAt` is untouched. When a company with **≥ 5 active jobs** returns an empty board, deactivation waits one run: P1-T13 adds `Company.pendingEmptySince` and emits `suspicious_empty_board`. | SCR-16/17 | BF-001, 006, 011 |
| P1-T14 (after P1-T12, P1-T10) | CSV: exit 1 on failure, save the report after the stream `finish`, use run-id naming | SCR-19 | BF-009 |
| P1-T15 (after P1-T07, because it touches `Scraper.ts`) | Country normalization to ISO-3166 alpha-2 (§3) plus a backfill CLI | SCR-23, FE-02 | new BF |

Order used in 12 for the tasks that touch `Scraper.ts`: T03 → T04 → T05 → T06 → T07 → T15 → T08 → T12 → T13 → T14.
P1-T09, T10 and T11 run in parallel with them (T11 is merged after T08).

## 2. Persisted company health (P1-T07)

**Schema changes.** All are additive, so `prisma db push` applies them without data loss. P1-T07 adds every field
below except `pendingEmptySince`, which P1-T13 adds.

```prisma
model Company {
  // existing fields …
  consecutiveNotFound Int       @default(0)
  consecutiveFailures Int       @default(0)
  lastSuccessAt       DateTime?
  lastCheckedAt       DateTime?
  pendingEmptySince   DateTime?          // P1-T13
}
model Job {
  // existing fields …
  lastSeenAt DateTime?
  @@index([active, lastSeenAt])
}
```

**Rules, applied once per company per run in `runAll()`.** Check `notFound` first, then `source`, because a 404 also
returns `source: 'none'` (`AshbyClient.ts:345-352`).

| Fetch result | Action |
|---|---|
| `notFound: true` (confirmed 404, and the GraphQL fallback found no board) | `consecutiveNotFound += 1`. When it reaches **3**, set `status = NOT_FOUND`, deactivate all of the company's active jobs, and emit `company_quarantined`. |
| `rest` or `graphql` success | `consecutiveNotFound = 0`, `consecutiveFailures = 0`, `lastSuccessAt = now`. Set `lastSeenAt = now` on every seen job with **one raw `UPDATE` per company** via `prisma.$executeRaw` (`UPDATE "Job" SET "lastSeenAt" = now() WHERE "companySlug" = $1 AND "ashbyId" = ANY($2)`). Raw SQL leaves `@updatedAt` alone, so `updatedAt` still means "content changed". Then deactivate the missing jobs (existing BF-006 behaviour). |
| `source: 'none'` with `notFound: false` (5xx, timeout or network after retries, or a 403/400 where the GraphQL fallback also failed) | `consecutiveFailures += 1` and keep the jobs. When it reaches **7**, emit the actionable `company_unreachable` event. It is never auto-deactivated (D-10). |
| Any outcome | `lastCheckedAt = now` |

**Weekly recheck:** on Sundays (UTC), or when `--recheck-not-found` is passed, both company queries change from
`status: 'ACTIVE'` to `status: { in: ['ACTIVE', 'NOT_FOUND'] }`. Those queries are `runAll()` (`Scraper.ts:533-536`)
and `ClusterScraper.ts:104-107`. A successful fetch sets a company back to `ACTIVE`.

**Writes:**
- One `company.update` per company, issued right after its fetch is classified and **not** routed through the job
  flush chain. That is about 3k small writes per run.
- **When `lastSeenAt` gets set:**
  - Jobs already in the DB get it from the raw `UPDATE` right after the fetch.
  - New and changed rows get it inside their `createMany`/`upsert` payloads in the flush chain, because they may not
    exist yet when the raw `UPDATE` runs.

**Tests** use a **stateful** Prisma factory (`tests/helpers/prismaFactory.ts`) that keeps an in-memory `Company`/`Job`
store across successive `runAll()` calls:
- `-t "quarantine after 3 consecutive runs"`: three `runAll` calls with a 404, then expect the status update and
  `updateMany` deactivation.
- `-t "success resets counters"`.
- `-t "sunday recheck includes NOT_FOUND"`.

## 3. Country normalization (P1-T15)

- **New file** `src/lib/Country.ts`:
  - `toIsoCountry(raw: string | undefined): string | null`.
  - Build an `Intl.DisplayNames(['en'], {type:'region'})` lookup over every alpha-2 code, AA to ZZ, keeping only
    codes that resolve to a name.
  - Add an alias map: `USA, U.S., United States of America → US; UK, England, Scotland, Wales, Great Britain → GB;
    Deutschland → DE; …`.
  - Comparison is case-insensitive with trimmed punctuation.
  - An input that is already a valid 2-letter code is returned upper-cased.
  - Anything unknown returns `null`. The raw value stays in `metadata.address`.
- **Use it** in `processCompanyJobs`, where `country` is set (`Scraper.ts:482`). The CSV has no country column
  (`ScraperCSV.ts:21-28`), so CSV mode is unaffected.
- **Hash interaction:** P1-T06 hashes the normalized `country`. The backfill CLI updates `country` **and** recomputes
  `contentHash` for every row it changes. Without that, the next scrape would rewrite those rows a second time.
- **Backfill:** `npm run db:normalize-countries` (`src/database/NormalizeCountries.ts`).
  - It pages through `Job` with `country NOT NULL` and updates rows whose value changes.
  - It prints `{scanned, changed, unknown}` and supports `--dry-run`.
- **Acceptance:**
  - Unit table of at least 30 cases.
  - After the backfill, `GET /v1/facets` returns `countries[].value` matching `^[A-Z]{2}$`.
  - Fix the wrong ISO claim in doc 05:121.
- **Ship order:** P1-T15 deploys together with P1-T21, the UI change that builds the country select from facets. The
  UI then shows names via `Intl.DisplayNames`.

## 4. Cache publishing and exit codes (P2-T03, P2-T04)

### 4.1 Where the publisher is called

The publisher is the only Redis writer (03 §4).

| Entry point | When |
|---|---|
| `scrape:parallel` coordinator (`ClusterScraper.ts`) | After `Promise.allSettled`, after the reports are merged, and before the merged report is saved. Only when **every worker succeeded**. The publisher then applies the sanity gate itself. |
| Standalone `npm run scrape` | `runAll()` gets a new option, `publish?: boolean`. Main sets it to `true`; `--ipc-worker` never does. When it is set, `runAll()` calls the publisher after `await flushChain` (`Scraper.ts:631`) and before `buildReport()` (`:633`), so the report includes `cache`. |
| `npm run cache:publish` | Manual or Actions `workflow_dispatch` republish from the DB, with no scraping |

- `--ipc-worker` processes never open Redis.
- The `--skip-publish` flag (for debugging and the Actions input) skips the publish and records `skipped_flag`.

### 4.2 Sanity gate (GAP-SCR-18)

The publisher runs the gate (03 §4 step 2), right after its Postgres snapshot. That way it covers both the scrape paths
and `npm run cache:publish`. Use `--force` to skip it.

The previous values come from `jc:v1:meta:lastPublish`, which carries `jobCount` and `companiesWithJobs`. That key
works in CI, locally, and for `cache:publish`. If it is missing, fall back to the last entry in `run-history.json`
(07 §2).

**Block the publish when:**
- active, listed jobs drop below **0.7×** the previous published `jobCount`; or
- `companiesWithJobs` drops below **0.8×** the previous value.

**Effect:** status `gated`, and the event `sanity_gate_failed`, which is actionable S1 (rule R-GATE-1).

**First run:** with no previous value, the gate passes.

### 4.3 `CachePublishResult` (it goes into `report.cache`)

```ts
{ attempted: boolean; status: 'published'|'skipped_not_configured'|'skipped_locked'|'skipped_incomplete_run'|
  'skipped_flag'|'gated'|'failed'; gen?: string; previousGen?: string; mode?: 'double_buffer'|'single_buffer';
  fields?: number; bytes?: number; detailsWritten?: number; detailsDeleted?: number; commands?: number;
  jobCount?: number; companiesWithJobs?: number; durationMs: number; step?: string; error?: string }
```

### 4.4 Exit codes (GAP-OPS-06)

| Code | Meaning | Cache |
|---|---|---|
| 0 | Every worker finished. The cache was `published`, or it was `skipped_not_configured`, `skipped_flag` or `skipped_locked` (each logs a warning). | New generation is live, or untouched |
| 1 | Hard failure: the coordinator threw, or a worker failed or timed out. The report is still written if at all possible. | Old generation stays (`skipped_incomplete_run`) |
| 2 | The scrape succeeded, but the publish `failed` or was `gated` | Old generation stays |

Whether the fixer runs is decided by the classifier (07 §3), not by the exit code.

## 5. Cluster hardening (P1-T11)

- Use `Promise.allSettled(workerPromises)`. Each worker resolves to
  `{workerId, pid, companies, status: 'ok'|'failed'|'timeout', durationSeconds, error?, report?}`.
- **Watchdog.** If a worker runs longer than `SCRAPE_WORKER_TIMEOUT_MS` (default 900000), the coordinator sends
  `SIGTERM`, waits 10 s, then sends `SIGKILL`. The worker is recorded as `timeout`.
- **Signals.** On `SIGINT`/`SIGTERM`, the coordinator forwards the signal to all children, saves a partial report,
  and exits 1.
- **The merge** sums every numeric summary field (this replaces the fixed list at `ErrorTracker.ts:188-197`).
- **Worker count.** Keep `--workers=N` and the default `min(4, max(2, cpus))`. CI always passes `--workers=4`
  (GitHub-hosted private runners have 2 cores).
- **Tests** (mocked `child_process.fork`):
  - `-t "1 of 2 fails → report saved, exit 1"`
  - `-t "timeout → SIGTERM then SIGKILL"`
  - `-t "all ok → publisher called once"`

## 6. Parallel scheduled runs (P3-T02)

The daily scrape is a GitHub Actions workflow, `.github/workflows/scrape-daily.yml`. The full draft is in
[07](./07-error-report-and-self-healing-loop.md) §6, and the ops notes are in doc 14 (P3-T04).

- **Trigger:** cron `17 6 * * *` (06:17 UTC, off the hour, because runs on the hour can be delayed or dropped), plus
  `workflow_dispatch` with the inputs `workers` (default 4), `skip_publish`, `publish_only` (runs
  `npm run cache:publish`) and `recheck_not_found`.
- **Concurrency:** `group: scrape-production`, `cancel-in-progress: false`. Combined with `jc:v1:lock:publish`, this
  guarantees a single writer.
- **Environment:**
  - `TS_NODE_TRANSPILE_ONLY=true`, because type-checking runs once as a separate step.
  - `DATABASE_URL` is the pooled Neon URL with `connection_limit=5`.
  - `REDIS_URL`.
  - `SCRAPE_WORKER_TIMEOUT_MS=900000`.
- **Steps:**
  1. checkout
  2. setup-node (Node 24 via `.nvmrc`)
  3. `npm ci`
  4. `npx prisma generate`
  5. `npx tsc --noEmit -p .`
  6. `npx prisma db push --skip-generate`, which is additive and refuses destructive changes
  7. restore the run history
  8. `npm run enrich:companies`, with `continue-on-error`
  9. `npm run scrape:parallel -- --workers=4`
  10. `npm run report:classify`
  11. upload the artifact
  12. save the history
  13. alert on failure
- **Budget** (checked 2026-10-23; see doc 14):
  - Each run takes about 5 min, so about 150 of the 2,000 private-repo minutes per month.
  - Neon uses about 0.8–6.5 of its 100 CU-h per month.
  - Neon egress (5 GB/month):
    - The list snapshot (`LIST_SELECT`, no `metadata`) is about 10–15 MB per run.
    - Detail rows (`DETAIL_SELECT`, which includes the description) are read in full **once, on the first fill**, likely
      a few hundred MB. After that, only changed ids are read, a few MB per run.

## 7. Behaviour the scraper must keep (existing BF invariants)

These are re-stated so that an implementer does not break them:

| BF | Behaviour |
|---|---|
| BF-001 | REST 404/403/400 falls back to GraphQL, and `BROWSER_HEADERS` is sent on GET and POST |
| BF-002/003 | Sanitizing runs before anything is stored: `\u0000`, lone surrogates, scripts, URL normalization |
| BF-004 | A per-job fallback isolates one bad record |
| BF-006 | Department/location in-flight dedupe, 100-job streaming flushes, and stale deactivation only after a successful fetch. **Extended by P1-T07:** a confirmed-dead company is deactivated. |
| BF-008 | IPC workers use `saveTelemetry:false`, and only the coordinator writes the report |
| BF-010 | `createMany` for new ids, and an upsert only when the row changed or `!active` |

## 8. Out of scope here

- Discovery scheduling (09 #13, #37) is optional and goes in P5-T11.
- Google Drive OAuth naming (09 #11, #15) is not touched.
- `JOBS.md` (09 #41) is not touched.
