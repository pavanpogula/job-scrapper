# 11 · Testing Guide (Jest Suite, Mocks, Coverage & Regression Map)

> **Purpose:** One place that describes how the test suite works: how to run it, how every external dependency is
> mocked, what each test file covers, how much of the source it reaches, and which `BF-*` Regression Invariants
> (see [10-bug-fix-and-improvement-log.md](./10-bug-fix-and-improvement-log.md)) have a test behind them and which don't.
>
> _Measured 2026-10-22 against the working tree: **16 suites / 79 tests, all passing**, about 2 s wall time._

---

## 1. Running the Tests

| Goal | Command |
|---|---|
| Whole suite (unit + e2e) | `npm test` (runs `jest`) |
| Verbose list of test names | `npx jest --verbose` (`npm test -- --verbose` works too) |
| Quiet run (hide the many `console.log` lines from source modules) | `npx jest --silent` |
| One file | `npm --prefix backend test -- backend/tests/unit/Sanitizer.test.ts` |
| One folder | `npm --prefix backend test -- backend/tests/e2e` |
| One test or `describe` (regex on the full name) | `npx jest -t "three-strike NOT_FOUND"` |
| One test inside one file | `npm --prefix backend test -- backend/tests/unit/ScraperCore.test.ts -t "P2002"` |
| Watch mode | `npx jest --watch` |
| Coverage, terminal only | `npx jest --coverage --coverageReporters=text-summary --coverageReporters=text` |
| Coverage including files no test imports | add `--roots='<rootDir>' --collectCoverageFrom='backend/src/**/*.ts' --collectCoverageFrom='backend/scripts/**/*.ts'`. Without `--roots`, `collectCoverageFrom` alone changes nothing: `roots: ['<rootDir>/tests']` keeps unimported `backend/src/` files out of Jest's file map, so the totals stay the same |
| Machine-readable results | `npx jest --json --outputFile=/tmp/jest.json` |

> ⚠️ `--coverage` writes a `coverage/` directory at the repo root, and **`coverage/` is not in `.gitignore`**.
> Delete it after use (`rm -rf coverage`) or pass `--coverageDirectory=<somewhere outside the repo>`, and never commit it.

The mandatory verification gate (`AGENTS.md`) is:

```bash
npx tsc --noEmit -p . && npm run lint && npm test
```

**This gate does not type-check or lint the tests.** `backend/tsconfig.json` sets `include: ["./src/**/*"]`, `npm run lint`
only lints `backend/src/`, and ts-jest runs with `isolatedModules: true` (transpile only). A type error in `backend/tests/`,
`backend/__mocks__/` or `backend/scripts/` will not fail any step. To type-check tests by hand, run
`npm --prefix backend run typecheck:test`
(it passed with 0 errors on 2026-10-22).

### 1.1 Jest / ts-jest configuration (`jest.config.js`)

| Setting | Value | Effect |
|---|---|---|
| `preset` / `transform` | `ts-jest` with an **inline** tsconfig (`es2020`, `commonjs`, `strict`, `esModuleInterop`) | Tests use their own compiler options. The root `tsconfig.json` is **not** used. |
| `isolatedModules` (ts-jest option) | `true` | Fast transpile-only, no type checking. Every run prints a deprecation warning: ts-jest wants this moved into a tsconfig. |
| `testEnvironment` | `node` | No DOM. |
| `roots` / `testMatch` | `<rootDir>/tests`, `**/*.test.ts` | Only `tests/unit/*.test.ts` and `tests/e2e/*.test.ts` run. |
| `clearMocks` | `true` | `mockClear()` runs before every test: call history is reset, but implementations and queued `mock*Once` values are **not** removed (see §7). |
| `moduleNameMapper` | `^@prisma/client$ → <rootDir>/__mocks__/@prisma/client.ts` | Any import of Prisma gets the manual mock, so no Prisma engine or database is needed. |
| `modulePathIgnorePatterns` | `output`, `documentation`, `node_modules` | Keeps generated artifacts out of the module map. |

Versions: `jest@30.5.2` with `ts-jest@29.4.15`. These majors don't match (ts-jest 29 declares a Jest 29 peer
dependency). It works today, but upgrading ts-jest to 30 is the clean fix.

---

## 2. How Mocking Works

No test touches the network, a database, Redis, Google, or a child process. Every boundary is replaced as follows.

### 2.1 Prisma: two layers

1. **Global manual mock** `__mocks__/@prisma/client.ts`, wired up through `moduleNameMapper`. It exports a
   `PrismaClient` class whose instances all share the same singleton delegates:
   - `company`: `findMany`, `createMany`, `deleteMany`, `upsert`, `update`, `count`
   - `job`: `findMany`, `deleteMany`, `updateMany`, `upsert`, `count`, `groupBy` (**no `createMany`**)
   - `department` / `location`: `findMany`, `upsert` (returns `{id:'mock-dept-id'}` / `{id:'mock-loc-id'}`), `count`
   - `$transaction`, `$disconnect`, `$queryRaw`, `$queryRawUnsafe`

   All of these return empty or zero results by default. They are exported as `mockCompany`, `mockJob`,
   `mockDepartment` and `mockLocation`, but **no test imports them**. The suites that rely on this layer only need
   `new PrismaClient()` to succeed when a module is imported: `ClusterScraper.test`, `ScraperCSV.test`,
   `ProcessCdxData.test` (through `CdxWorker`) and `e2e/ScraperPipeline.test`.

2. **Per-file factory override.** Suites that make assertions on DB calls declare their own
   `jest.mock('@prisma/client', () => ({ PrismaClient: jest.fn().mockImplementation(() => ({...})) }))`. This
   replaces the mapped module for that file. They use these files: `CdxWorker`, `DbClean`, `Seed`, `ScraperCore`,
   `Verify`, and `e2e/DiscoveryPipeline`.

   **The pattern is required.** Every source module runs `const prisma = new PrismaClient()` at import time, and
   `jest.mock` is hoisted above the `const mockX = jest.fn()` declarations. Each delegate is therefore written as a
   lazy forwarder, `findMany: (...args) => mockFindMany(...args)`, so the `mockX` variable is read when the delegate
   is called, not when the factory runs. Referencing `mockFindMany` directly inside the factory would capture
   `undefined`.

   Delegates a factory leaves out are `undefined` on purpose. `Scraper.ts` feature-detects with
   `typeof (prisma.job as any)?.findMany === 'function'`. Because `ScraperCore.test`'s factory defines no
   `job.findMany`, `job.createMany`, `job.updateMany`, `department.findMany` or `location.findMany`, these code paths
   are switched off in that suite: the BF-010 bulk `createMany` fast path, `deactivateStaleJobs()`, and cache
   pre-warming.

### 2.2 Other dependencies

| Dependency | How it is mocked | Where |
|---|---|---|
| `axios` | `jest.mock('axios')` automock with `mockedAxios = axios as jest.Mocked<typeof axios>`. Tests queue `get`/`post` results with `mockResolvedValueOnce` / `mockRejectedValueOnce` and set `isAxiosError.mockReturnValueOnce(true)` for HTTP-status errors. An un-stubbed `axios.post` returns `undefined`, which `fetchFromAshbyGraphQL()` treats as "board doesn't exist". | AshbyClient, CdxWorker, ScraperCSV, ScraperCore, e2e/ScraperPipeline |
| Redis (`src/lib/Redis.ts`) | `jest.mock('../../src/lib/Redis', () => ({ redis: { status:'ready', connect, get, pipeline: () => ({ set, exec }), quit } }))`. The real ioredis client is never built. Tests flip `(scraper as any).isRedisConnected` directly instead of calling `initRedis()`. | ScraperCore only |
| `fs` | `jest.mock('fs')` full automock (`existsSync`, `readFileSync`, `createReadStream`, `writeFileSync` return `undefined` unless stubbed), **or** a partial mock `{ ...jest.requireActual('fs'), writeFileSync: jest.fn() }`, so `extracted-slugs.json` is never written. `ErrorTracker.test` uses the **real** `fs` with a `fs.mkdtempSync(os.tmpdir())` directory that it removes in `finally`. | GoogleDrive, ProcessCdxData (full); e2e/DiscoveryPipeline (partial); ErrorTracker (real fs + temp dir) |
| `googleapis` | Factory mock: `google.auth.JWT` (with `authorize`), `google.auth.OAuth2` (with `setCredentials`, `generateAuthUrl`, `getToken`, `refreshAccessToken`), and `google.drive()` returning `files.create` / `files.list` stubs. | GoogleDrive only. **`ScraperCSV.test` and `e2e/ScraperPipeline.test` load the real `googleapis`** through `ScraperCSV → GoogleDriveOAuth`. That accounts for most of their ~1 s file time, though it makes no network calls. |
| `child_process` | **Not mocked, and never exercised.** `ClusterScraper.test` imports only the pure helpers (`resolveWorkerCount`, `partitionSlugs`). `runWorkerShard()` / `fork()` and the `--ipc-worker` branch of `Scraper.ts` have no tests. | — |
| `../../src/config/Companies` | Factory mock that replaces `TARGET_COMPANIES` with a 3–4 slug list. | Seed, e2e/DiscoveryPipeline |
| `process.argv` | Overwritten per test and restored in `afterAll` (`DbClean` reads `--execute` at call time). | DbClean |
| `console` | `jest.spyOn(console, 'log' / 'warn' / 'error').mockImplementation(() => {})`. Used in Verify and in the BF-004 test in ScraperCore, which also asserts that `warn` and `error` were called. | Verify, ScraperCore |
| Timers / randomness | **Real** `setTimeout` and `Math.random`. Retry tests pass `baseDelayMs: 1`, so they wait about 1–100 ms of jitter. | AshbyClient, Concurrency |

### 2.3 Fixtures (`tests/fixtures/`)

| File | Contents | Used by |
|---|---|---|
| `ashby-sample.json` | A Posting-API-shaped board (`apiVersion:"1"`, `jobs[2]`) for `1password`. One job has `compensation.summaryComponents` (Salary, USD 180,000–240,000) and one is a Remote job with no compensation. | **No test** |
| `cdx-sample.json` | A Wayback CDX `fl=original` array: header row, root URL, `1password` (root + job path), `abridge`, `multiverse`, and junk (`login`, `careers`, `123456`, `.well-known/security.txt`, `100vh`, `a`, a 40-char hex id). | **No test** |

Both fixtures are orphaned. Every test builds its payload inline. They are good candidates for future
`fetchAshbyBoardWithFallback` / `processRawCDXData` tests (load them with `require('../fixtures/…json')`).

---

## 3. Test File → Module → Behaviours Covered

Each `describe ▸ it` group is summarised in the "Behaviours" column. The count in brackets is the number of tests.

| Test file | Module(s) under test | Behaviours covered | Notable mocks |
|---|---|---|---|
| `unit/AshbyClient.test.ts` [9] | `src/lib/AshbyClient.ts` | **extractSalary** [4]: `summaryComponents` Salary row (ignores null-valued `EquityCashValue`); `compensationTiers[].components` fallback (GBP); legacy `compensationTier`; no compensation → `{}`. **isRetryableError** [2]: 429/503/`ECONNABORTED`/`ETIMEDOUT` → true; 404 and plain `Error` → false. **fetchFromAshbyGraphQL** [1]: maps `jobPostings` + `teams` to `AshbyJob` (team name becomes department, `isRemote` from `workplaceType`, canonical apply URL). **fetchAshbyBoardWithFallback** [2]: REST 404 → GraphQL recovery (`source:'graphql'`, `notFound:false`); REST 429 → retry → REST success (`axios.get` called twice). | `axios` automock |
| `unit/CdxWorker.test.ts` [7] | `src/discovery/CdxWorker.ts` | **isValidSlug** [5]: accepts real slugs; length bounds 2–50; regex rejects leading/trailing/double dash, `_`, `.`, spaces, uppercase, `@`; rejects the original 23 blocklist words; rejects pure numerics (`123-abc` allowed). **runDiscovery** [2]: CDX rows → dedup → filter `login` and numerics → exactly 2 `company.upsert({where,update:{},create})` calls; CDX network error resolves without upserting. | `axios`, Prisma factory (`company.upsert`) |
| `unit/ClusterScraper.test.ts` [4] | `src/core/ClusterScraper.ts`, `ErrorTracker.mergeReports` | **resolveWorkerCount** [2]: `--workers=N`, capped at the company count; default of 4 on 8 CPUs and 2 on 2 CPUs. **partitionSlugs** [1]: 7 slugs over 3 shards in round-robin order. **ErrorTracker.mergeReports** [1]: sums every summary counter across 2 worker reports and concatenates events. | Global Prisma mock (import only) |
| `unit/Concurrency.test.ts` [7] | `src/lib/Concurrency.ts` | **createLimiter** [3]: never more than N in flight and reaches exactly N (10 tasks × 30 ms, limit 3); a rejected task doesn't block later ones; `onRateLimit(0)` halves concurrency (10→5→2, floor `minConcurrency`), and `recoveryThreshold` successes add +1. **chunk** [4]: uneven split, exact split, empty array, size larger than the array. | none (real timers) |
| `unit/DbClean.test.ts` [3] | `src/database/DbClean.ts` | Dry run (no `--execute`) lists invalid slugs and deletes nothing; `--execute` deletes `job.deleteMany` **before** `company.deleteMany` with the right `in:` lists; all-valid DB → no deletes. `$disconnect` always called. | Prisma factory, `process.argv` |
| `unit/ErrorTracker.test.ts` [2] | `src/lib/ErrorTracker.ts` | `recordValidationIssues` increments `jobsFilteredOut`/`jobsSanitized` by `action` and records one event per issue, plus `recordEvent`, giving 3 events; `buildReport` schema `1.0`. `saveReport(tmpDir)` returns the path of `latest-error-report.json`, and the JSON on disk round-trips. *(The title says "and dated report", but the dated `error-report_YYYY-MM-DD.json` is never asserted.)* | real `fs` + temp dir |
| `unit/GenerateReadme.test.ts` [6] | `scripts/generate-readme.ts` | **parseCSV** [3]: plain rows; commas inside quoted fields; blank lines skipped. **generateMarkdownTable** [3]: header, total count, row format, `[Apply →](link)`; truncation (company/location 20→17+`...`, title 40→37+`...`, department 15→12+`...`); `""` unescaping plus `\|` escaping in cells (BF-007). | none |
| `unit/GoogleDrive.test.ts` [5] | `src/lib/GoogleDriveOAuth.ts`, `src/lib/GoogleDriveUserOAuth.ts` | **Service account** [3]: missing `apikeys/google-credentials.json` → `null`, no upload; upload returns `webViewLink`, `parents:[folderId]`, `supportsAllDrives:true`; "storage quota" error → `null`. **User OAuth** [2]: missing `oauth-credentials.json` → `null`; valid creds + unexpired token → upload returns the link. | `fs` automock, `googleapis` factory |
| `unit/ProcessCdxData.test.ts` [2] | `src/utils/ProcessCdxData.ts` | Filters header, root, `.well-known`, `$`/`%` prefixes, `*`, numbers, UUIDs, ≥20-char hex, CSS units (`100vw`, `750ms`), 1-char slugs, and blocklisted words. Result is sorted and deduped, and `writeFileSync('extracted-slugs.json', …)` is asserted. Also checks URI decoding and quote stripping (`%22acme-corp%22`, `'linear'`). | `fs` automock (global Prisma via CdxWorker import) |
| `unit/Sanitizer.test.ts` [8] | `src/lib/Sanitizer.ts` | **sanitizeText**: `\u0000`/control chars → space, HTML entities decoded, whitespace collapsed, `null` → `''`. **sanitizeJobDescriptionHtml**: strips `<script>`, `<style>`, `<iframe>`, `onclick=`, `javascript:` hrefs, null bytes; base64 ≥1 KB → `data:removed;base64,`. **sanitizeJobDescriptionPlain**: falls back to tag-stripped HTML. **sanitizeJobUrl** [2]: valid https kept; relative path resolved against `jobs.ashbyhq.com`; `javascript:`, malformed and empty input → canonical URL plus 3 `onIssue` callbacks. **sanitizePublishedDate**: ISO → `YYYY-MM-DD`; garbage/null → `undefined`. **sanitizeJsonMetadata**: recursive null-byte strip, nested `descriptionHtml` sanitised, empty `descriptionPlain` rebuilt from the HTML. **sanitizeJobBatch / validateAndSanitizeJob**: filters `null`, `'undefined'` id, id with spaces, blank title, duplicate id (5 `filtered`), and sanitises the survivor's title, department and both URLs (2 `sanitized`). | none |
| `unit/ScraperCSV.test.ts` [8] | `src/core/ScraperCSV.ts` | **escapeCSV** [5]: plain; commas; `"` doubling; `\n`; combined. **formatCSVRow** [1]: 6-column escaped line. **fetchJobsForCompany** [2]: REST jobs → `JobRecord` (canonical link, date trimmed, null fields → `''`); network error → `[]`. *(Title says "404, 500, network", but only a generic `Error` is tested. No `tracker` argument is ever passed.)* | `axios` (global Prisma, real `googleapis`) |
| `unit/ScraperCore.test.ts` [12] | `src/core/Scraper.ts` (`AshbyScraper`) | **fetchJobs** [2]: REST 404 + GraphQL miss → `company.update({status:'NOT_FOUND'})` (strike threshold 1); generic error → `[]` with status untouched. **getOrCreateDepartment/Location** [3]: second call served from memory cache; empty name → `null`, no query; `upsert` throws a P2002-style error → `findUnique` fallback id returned. **generateHash** [1]: deterministic 32-char MD5. **filterChangedJobs** [3]: cached hash equal → skipped; different → kept; Redis disabled → everything kept and `redis.get` never called. **batchUpsertJobs** [2]: 150 jobs → 2 `$transaction` calls + 2 Redis pipelines; `$transaction` throws → per-job fallback, 4 `job.upsert` calls (2 while building the batch + 2 retries), one failing job logged via `console.error` (BF-004). **recordNotFoundStrike** [1]: strikes 1–2 → `false` and no update; strike 3 → `true` + `NOT_FOUND`. | `axios`, Prisma factory (no `job.findMany/createMany/updateMany`), Redis factory, console spies |
| `unit/Seed.test.ts` [2] | `src/utils/Seed.ts` | Memory diff: `findMany({select:{slug:true}})`, then **one** `createMany({data:[new…], skipDuplicates:true})` with `status:'ACTIVE'`; nothing new → `createMany` not called. | Prisma factory, `Companies` mock |
| `unit/Verify.test.ts` [1] | `src/utils/Verify.ts` | `verifyDatabase()` maps the 9 parallel `count()` calls to the report fields (relies on `Promise.all` order: company ×3, job ×4, dept, loc); one clean sample job → `emptyTitles = invalidApplyUrls = nullByteMetadataIssues = 0`. | Prisma factory, `console.log` spy |
| `e2e/DiscoveryPipeline.test.ts` [1] | `ProcessCdxData` → `Seed` → `DbClean` | See §4.1. | Prisma factory, `Companies` mock, partial `fs` |
| `e2e/ScraperPipeline.test.ts` [2] | `ScraperCSV` → `generate-readme`; `AshbyClient` + `Sanitizer` + `ErrorTracker` | See §4.2. | `axios` (global Prisma) |

### 3.1 Full test name inventory (79)

<details><summary>Expand: every <code>describe ▸ it</code> as Jest reports it</summary>

- **AshbyClient Unit Tests**
  - extractSalary ▸ should extract salary from Ashby summaryComponents · should fall back to compensationTiers components when summaryComponents is missing · should support legacy compensationTier shape · should return empty object when no compensation is present
  - isRetryableError ▸ should return true for 429 and 5xx HTTP status codes and timeout codes · should return false for 404 or generic errors
  - fetchFromAshbyGraphQL ▸ should map GraphQL jobPostings and teams into AshbyJob objects
  - fetchAshbyBoardWithFallback ▸ should recover jobs via GraphQL when Posting API returns 404 (e.g. go-augment) · should retry on HTTP 429 and succeed on subsequent attempt
- **CdxWorker**
  - isValidSlug ▸ should accept valid company slugs · should reject slugs that are too short or too long · should reject slugs violating regex pattern · should reject blocklisted keywords · should reject purely numeric strings
  - runDiscovery ▸ should fetch CDX URLs, extract valid slugs, and upsert each slug into Prisma · should handle CDX API network failures gracefully without crashing
- **ClusterScraper Unit Tests**
  - resolveWorkerCount ▸ should parse --workers=N flag and cap at total company count · should default to min(4, cpuCount) when no --workers flag is passed *(title is inaccurate: the code is `min(4, max(2, cpuCount))`, see §7)*
  - partitionSlugs ▸ should distribute slugs evenly across shards using round-robin partitioning
  - ErrorTracker.mergeReports ▸ should aggregate metrics and events across multiple OS worker reports
- **Concurrency Utilities**
  - createLimiter ▸ should limit maximum concurrent executions to the specified limit · should propagate errors from tasks and continue processing subsequent tasks · should dynamically throttle concurrency on rate limit and recover after consecutive successes
  - chunk ▸ should split an array into chunks of the specified size · should handle exact division · should return an empty array when given an empty array · should return a single chunk when size is greater than array length
- **DbClean Unit Tests** ▸ should identify invalid slugs in dry-run mode without deleting any records · should delete dependent jobs first, then delete companies when --execute is passed · should do nothing if all companies have valid slugs
- **ErrorTracker Unit Tests** ▸ should record validation issues, fallback events, and counters into a structured report · should write latest-error-report.json and dated report to disk
- **GenerateReadme Unit Tests**
  - parseCSV ▸ should parse standard CSV content into structured JobRow objects · should correctly handle commas inside quoted field values · should ignore empty lines in CSV
  - generateMarkdownTable ▸ should generate markdown table with total count and apply links · should truncate fields exceeding column character limits · should unescape doubled quotes in CSV and escape pipe characters in Markdown cells
- **GoogleDrive Upload Helpers**
  - GoogleDriveOAuth (Service Account JWT) ▸ should return null with helpful setup instructions if credentials file is missing · should upload CSV and return webViewLink when credentials are present · should handle storage quota error and return null
  - GoogleDriveUserOAuth (User OAuth Consent Flow) ▸ should return null if oauth-credentials.json is missing · should upload file and return link when credentials and token exist
- **ProcessCdxData** ▸ should filter out system paths, wildcards, numbers, UUIDs, hex strings, and CSS units · should decode URI components and strip quotes from slugs
- **Sanitizer & Validator Unit Tests**
  - sanitizeText ▸ should strip null bytes, control chars, decode HTML entities, and collapse whitespace
  - sanitizeJobDescriptionHtml ▸ should strip script, style, iframe tags, inline event handlers, null bytes, and huge base64 strings
  - sanitizeJobDescriptionPlain ▸ should fallback to stripping HTML when plain text is missing and remove null bytes
  - sanitizeJobUrl ▸ should keep valid https URLs and resolve relative paths against jobs.ashbyhq.com · should fallback to canonical Ashby URL and record issue when URL is missing, unsafe, or malformed
  - sanitizePublishedDate ▸ should extract valid YYYY-MM-DD and reject invalid dates
  - sanitizeJsonMetadata ▸ should recursively strip null bytes and sanitize nested descriptionHtml/descriptionPlain
  - validateAndSanitizeJob & sanitizeJobBatch ▸ should filter out malformed jobs (missing id/title, placeholder id, duplicates) and sanitize valid ones
- **ScraperCSV Unit Tests**
  - escapeCSV ▸ should return unquoted string when no special characters exist · should quote values containing commas · should escape double quotes by doubling them and wrapping in quotes · should quote values containing newlines · should handle combination of commas, quotes, and newlines
  - formatCSVRow ▸ should format a JobRecord into an escaped 6-column CSV line
  - fetchJobsForCompany ▸ should fetch jobs from Ashby API and map to JobRecord format · should return empty array when Ashby API request fails (404, 500, network)
- **AshbyScraper Unit Tests**
  - fetchJobs error handling ▸ should mark company status as NOT_FOUND when Ashby returns HTTP 404 · should return empty jobs array on general network failure without altering company status
  - getOrCreateDepartment and getOrCreateLocation in-memory caching ▸ should query Prisma on first department lookup, then hit memory cache on second · should return null if department or location name is empty or undefined · should recover from cross-process P2002 unique constraint race via findUnique fallback
  - generateHash ▸ should generate consistent md5 hash for identical job payloads
  - filterChangedJobs ▸ should skip job when hash matches Redis cache · should include job when hash differs from Redis cache · should retain all jobs when Redis is disabled
  - batchUpsertJobs ▸ should batch database transactions into chunks of BATCH_SIZE (100) and update Redis pipeline · should fall back to per-job upserts and isolate failing job when a batch transaction throws
  - three-strike NOT_FOUND quarantine ▸ should only mark company NOT_FOUND on the 3rd strike when maxStrikes is 3
- **Seed Unit Tests** ▸ should find existing companies, diff in memory, and insert only new companies · should skip createMany if all target companies already exist in the database
- **Verify Database Auditor Unit Tests** ▸ should return accurate table counts and 0 integrity issues for clean jobs
- **E2E: Discovery to Seeding & Clean Pipeline** ▸ should run end-to-end: parse CDX data -> seed new companies -> verify clean database state
- **E2E: Scraper to CSV to Markdown Pipeline** ▸ should execute end-to-end flow: fetch from Ashby -> format CSV -> parse CSV -> render JOBS.md table · should execute E2E fallback, data sanitization, and ErrorTracker telemetry for bug-fix agent

</details>

---

## 4. End-to-End Flows

The "E2E" suites are **in-process integration tests**. They chain real module functions together, but all I/O is
mocked. They never spawn the CLI entry points (`require.main === module` blocks), so `scrapeToCSV()`,
`AshbyScraper.runAll()`, `runClusterScrape()` and `main()` in `generate-readme.ts` are not run by any test.

### 4.1 `tests/e2e/DiscoveryPipeline.test.ts`: Discovery → Seed → Clean

1. **CDX parsing.** `processRawCDXData()` is given 6 rows (header, `1password`, `deel`, `multiverse`, `login`,
   `123456`) and returns `['1password','deel','multiverse']`, sorted. `fs.writeFileSync` is a partial mock, so
   `extracted-slugs.json` is never written.
2. **Seeding (memory diff).** `company.findMany` returns `[{slug:'deel'}]`. `seed()` (with `TARGET_COMPANIES`
   mocked to `['deel','1password','multiverse']`) calls `createMany` once with `1password` and `multiverse`,
   `status:'ACTIVE'` and `skipDuplicates:true`.
3. **Cleanup verification.** `company.findMany` returns the 3 seeded rows. `cleanDatabase()` runs in dry-run mode
   (the test doesn't set `--execute`), finds no invalid slugs, and asserts that neither `job.deleteMany` nor
   `company.deleteMany` was called.

> ⚠️ **The steps don't actually hand data to each other.** The slugs from step 1 are never passed to `seed()`.
> `seed()` reads the mocked `TARGET_COMPANIES` (or `extracted-slugs.json` only with `useExtractedSlugs:true`, which the
> test doesn't use). Step 3 uses a hand-written `findMany` result instead of the step-2 `createMany` payload. The
> chain looks connected only because the fixtures share the same three slugs. Step 3 also cannot fail on deletes,
> because dry-run never deletes.

### 4.2 `tests/e2e/ScraperPipeline.test.ts`: Scrape → CSV → JOBS.md, plus the fallback/telemetry path

**Test 1: CSV/Markdown pipeline (REST path)**
1. `axios.get` (Posting API) returns 2 jobs for `1password`.
2. `fetchJobsForCompany('1password')` → `fetchAshbyBoardWithFallback` → `sanitizeJobBatch` → 2 `JobRecord`s
   (canonical link, `publishedAt` trimmed to `YYYY-MM-DD`).
3. The test builds CSV text itself from a hard-coded header plus `formatCSVRow`. `scrapeToCSV()`'s streaming writer
   is **not** used. It asserts quoting of `"Toronto, ON"` and `"Senior Frontend Developer, Core Web"`.
4. `parseCSV()` round-trips the 2 titles.
5. `generateMarkdownTable()` produces the header, `**Total Jobs: 2**`, and two rows, with `Frontend Engineering`
   truncated to `Frontend Eng...`.

**Test 2: GraphQL fallback + sanitisation + telemetry (BF-001 / BF-002 / BF-009 shape)**
1. `axios.get` rejects with `{response:{status:404}}` and `isAxiosError → true`, so REST fails with no retry.
2. `axios.post` (GraphQL `ApiJobBoardWithTeams`) returns team `Core &amp; Platform` and 2 postings: `id:'undefined'`
   (corrupt) and `aug-101`, whose title contains `|` and `\u0000`.
3. `fetchAshbyBoardWithFallback('go-augment', {includeCompensation:true})` returns `source:'graphql'` and 1 job. The
   corrupt id is filtered, the title becomes `AI Engineer | Agents` (null byte stripped), and the department becomes
   `Core & Platform` (entity decoded).
4. The **test itself** increments `tracker.graphqlFallbacksUsed` and calls `recordEvent`, then asserts the report.
   This shows the shape `ErrorTracker` expects. It does **not** prove that `Scraper.ts` or `ScraperCSV.ts` forward the
   event, because their wiring isn't run.

---

## 5. Coverage Map

Measured with
`npx jest --coverage --coverageReporters=text-summary --coverageReporters=text` (re-run 2026-10-22; adding
`--collectCoverageFrom` without `--roots` gives identical numbers, see §1). Only files imported by some test appear.

**Totals (instrumented files): Statements 61.24 % (779/1272) · Branches 54.74 % (369/674) · Functions 56.49 % (87/154) · Lines 61.97 % (740/1194).**

| File | % Stmts | % Branch | % Funcs | % Lines | Uncovered lines |
|---|---:|---:|---:|---:|---|
| `src/lib/Sanitizer.ts` | 90.83 | 80.55 | 92.30 | 93.69 | 142-143, 177, 185, 206, 319-326 |
| `src/database/DbClean.ts` | 91.89 | 75.00 | 100 | 93.75 | 70, 77 |
| `src/utils/ProcessCdxData.ts` | 88.40 | 87.50 | 100 | 89.06 | 120-127 |
| `src/lib/AshbyClient.ts` | 84.26 | 73.26 | 88.88 | 86.74 | 217, 227-251 |
| `src/utils/Verify.ts` | 83.72 | 65.21 | 33.33 | 90.00 | 133-138 |
| `src/lib/Concurrency.ts` | 81.66 | 63.63 | 81.81 | 85.45 | 76-84 |
| `src/lib/ErrorTracker.ts` | 79.41 | 42.85 | 85.71 | 80.59 | 141, 155, 220-235 |
| `src/lib/GoogleDriveOAuth.ts` | 76.27 | 50.00 | 50.00 | 77.19 | 42, 108-130 |
| `src/utils/Seed.ts` | 75.75 | 50.00 | 83.33 | 74.19 | 19-23, 71-74 |
| `scripts/generate-readme.ts` | 69.84 | 66.66 | 75.00 | 70.49 | 110-138, 142 |
| `src/discovery/CdxWorker.ts` | 66.27 | 59.45 | 50.00 | 64.10 | 80-105, 132, 140-155, 165-166, 192, 196, 204-213 |
| `src/lib/GoogleDriveUserOAuth.ts` | 51.11 | 46.42 | 25.00 | 51.13 | 57-65, 73-119, 175-176, 184-207 |
| `src/core/Scraper.ts` | 32.85 | 21.62 | 32.43 | 33.33 | 60-68, 99-113, 136, 167, 188, 205-239, 311-345, 365-366, 399-590, 595-629 |
| `src/core/ClusterScraper.ts` | 30.86 | 20.00 | 37.50 | 28.94 | 54-90, 102-145, 149-152 |
| `src/core/ScraperCSV.ts` | 28.86 | 42.55 | 33.33 | 29.03 | 44-45, 47, 51-52, 61, 65, 108-109, 116-216, 222 |
| **Not imported by any test (0 %, missing from the report):** `src/lib/Redis.ts` (always mocked), `src/config/Companies.ts` (always mocked), `src/database/DbMenu.ts`, `src/database/DbInspect.ts`, `scripts/GenerateDocs.ts` | — | — | — | — | entire file |

By directory: `src/lib` 77.8 % stmts · `src/utils` 84.1 % · `src/database` 91.9 % (DbClean only) · `src/discovery`
66.3 % · **`src/core` 31.6 %** · `scripts` 69.8 % (generate-readme only).

### 5.1 Untested or weakly tested code (by function)

**`src/core/Scraper.ts` (`AshbyScraper`). The production write path is mostly untested.**
- `runAll()` (L440-591) has **no test at all**. That covers cache pre-warming (`department/location.findMany`),
  `companiesWithExistingJobs` pre-loading, the adaptive-limiter wiring (`onRateLimit`/`onSuccess`), the incremental
  `enqueueFlushIfNeeded()` 100-job streaming and `flushChain` ordering, GraphQL/notFound/validation telemetry,
  `saveTelemetry` defaulting, and the worker log prefix.
- `deactivateStaleJobs()` (L95-115): untested (the factory has no `job.updateMany`).
- `processCompanyJobs()` (L395-435): untested. It covers title/id skip, sanitizer calls, salary mapping into
  `ProcessedJob`, and `sanitizeJsonMetadata` on metadata.
- `batchUpsertJobs()` **BF-010 fast path** (L309-347: `findMany` → `createMany({skipDuplicates})` →
  `$transaction` only for changed or inactive rows): never runs. The tests only reach the legacy
  `$transaction(upsert)` branch (L350). Upsert `create`/`update` arguments (salary fields, `active:true`) are never
  inspected, and the `tracker.dbErrors` / `db_error` event in the fallback is never asserted (no tracker is passed).
- `initRedis()` (L59-70): untested (tests set `isRedisConnected` directly).
- In-flight Promise deduplication (L166-167 / L210-211) is untested; the cache test runs sequentially.
- `getOrCreateLocation()` P2002 recovery (L224-232) is untested (only the department path is).
- The `--ipc-worker` and CLI `require.main` blocks (L594-631) are untested.
- `fetchJobs()` (L120-143) is **dead code**. Nothing in `src/` calls it (`runAll` calls
  `fetchAshbyBoardWithFallback` directly with a 3-strike threshold), yet two tests exercise it.

**`src/core/ClusterScraper.ts`**: `runWorkerShard()` (fork, IPC `worker_done`/`worker_error`, `error`/`exit`
handling, `settled` guard) and `runClusterScrape()` (empty-DB early return, `perWorkerConcurrency` formula,
`saveMergedReport`) are untested. `resolveWorkerCount` with `cpuCount = 1` (the default floor is 2) and an invalid
`--workers=abc` are also untested.

**`src/core/ScraperCSV.ts`**: `scrapeToCSV()` (L115-216: stream writer, header, limiter, `--upload-cloud`,
telemetry save) and `uploadToGoogleDrive()` are untested. In `fetchJobsForCompany()`, every `tracker` /
`onRateLimit` / `onSuccess` branch (L43-66, the BF-009 fix) is uncovered because no test passes a tracker. `\r`
quoting in `escapeCSV` and null-byte stripping are untested.

**`src/lib/AshbyClient.ts`**: `fetchOrganizationMetadata()` (L224-253, `window.__appData` parsing) is untested.
No test covers the 403/400 → GraphQL fallback, 404 + GraphQL miss → `notFound:true` / `source:'none'`, exhausting
`maxRetries` on 5xx, `rateLimited:true` propagation, the GraphQL "no jobBoard" branch, or that `BROWSER_HEADERS`
are actually sent.

**`src/lib/Concurrency.ts`**: the cooldown pause (`isPaused`, `pauseTimer`, `unref`, L76-84) is untested. Every
test uses `cooldownMs = 0`, and `getActiveCount()` is never called.

**`src/lib/ErrorTracker.ts`**: `ErrorTracker.saveMergedReport()` (L216-237), the `saveReport` failure → `null`
branch, `MAX_EVENTS_STORED` capping in `recordEvent`/`mergeReports`, and the dated report file are untested.

**`src/lib/Sanitizer.ts`**: lone UTF-16 surrogate stripping (the BF-002 invariant), non-http protocol rejection
(`ftp:` → L141-143), non-finite number → `null` (L177), arrays inside metadata (L185), the non-array
`sanitizeJobBatch` payload (L319-326), the >128-char id limit, and `decodeHtmlEntities` case-insensitivity are
untested.

**`src/discovery/CdxWorker.ts`**: `fetchCommonCrawlUrls()` (JSONL parsing), `enrichCompanyMetadata()`, and the
`includeCommonCrawl` / `enrichMetadata` options of `runDiscovery()` are untested, as are the per-slug upsert failure
branch and the CLI flags. The 18 newer `BLOCKLIST` entries (`embed`, `application`, `apply`, `graphql`,
`non-user-graphql`, `posting-api`, `sitemap.xml`, `health`, `status`, `privacy`, `terms`, `oauth`, `auth`, `webhook(s)`,
`internal`, `nan`, …) are not asserted. `extractCompanySlug()` is only reached indirectly.

**`src/utils/Seed.ts`**: `loadTargetSlugs(true)` (the `--all` / `extracted-slugs.json` path) is untested.
**`src/utils/Verify.ts`**: no test covers a dirty dataset (non-zero `emptyTitles`, `invalidApplyUrls` or
`nullByteMetadataIssues`) or the "Integrity Issues Detected" branch.
**`src/database/DbClean.ts`**: the error-catch branch and the >15 invalid-slug "…and N more" message are untested.
**Google Drive**: `listFiles()`, `listUserFiles()`, the expired-token refresh and refresh-failure re-auth (which
calls `fs.unlinkSync` and recurses), and `getNewToken()`/`askQuestion()` (interactive readline) are untested. The
`credentials.web` shape and the MIME-type map are untested too.
**`scripts/generate-readme.ts`**: `main()` (finding the latest `output/jobs_*.csv`, writing `JOBS.md`) is untested.
`sanitizeMarkdownCell` newline handling and `)`/whitespace link encoding are untested.
**No tests at all**: `src/lib/Redis.ts` (`retryStrategy`, ECONNREFUSED suppression), `src/database/DbMenu.ts`,
`src/database/DbInspect.ts` (both run on import and can't be imported safely), and `scripts/GenerateDocs.ts`
(`parseJSDoc`, `parsePrismaSchema`, `discoverFiles`). `GenerateDocs` is what `npm run docs:generate` relies on.

---

## 6. BF-* Regression Invariants → Guarding Tests

The "Guarding Tests" column in doc 10 lists files. The table below checks what those files actually assert.
✅ = asserted · 🟡 = partially asserted · ❌ = no test enforces it.

| ID | Invariant (abridged) | Test(s) that actually guard it | Status / gap |
|---|---|---|---|
| **BF-001** | Never mark `NOT_FOUND` on a posting-api 404 without trying `fetchFromAshbyGraphQL()`; a 403/400 that GraphQL cannot recover returns `notFound: false`; always send `BROWSER_HEADERS`. | `AshbyClient ▸ fetchAshbyBoardWithFallback ▸ should recover jobs via GraphQL when Posting API returns 404`, `▸ should send BROWSER_HEADERS on GET and POST requests`, `▸ should fall back to GraphQL on 403 and 400 without setting rateLimited`. | ✅ 404/403/400 → GraphQL ✅; `BROWSER_HEADERS` on GET and POST ✅. |
| **BF-002** | Strip `\u0000`, lone surrogates, `<script>/<style>/<iframe>`, inline JS, and >1 KB base64 from metadata and text. | `Sanitizer ▸ sanitizeText`, `▸ sanitizeJobDescriptionHtml`, `▸ sanitizeJobDescriptionPlain`, `▸ sanitizeJsonMetadata`. | ✅ Lone UTF-16 surrogates guarded in `Sanitizer.test.ts`. |
| **BF-003** | `applyUrl` / CSV link always an absolute http(s) URL; invalid → canonical + `sanitized` issue. | `Sanitizer ▸ sanitizeJobUrl` (both), `▸ sanitizeJobBatch` (2 `sanitized` issues); `ScraperCSV ▸ fetchJobsForCompany` (canonical link). | ✅ Non-http protocol (`ftp:`) branch untested (minor). |
| **BF-004** | `batchUpsertJobs()` catches errors and retries each job; failing company isolated; flush chain failure does not drop later batches. | `ScraperRunAll ▸ isolates a failing company`, `ScraperRunAll ▸ flush failure does not drop later batches`, `ScraperCore ▸ batchUpsertJobs ▸ should fall back to per-job upserts…` | ✅ Guarded by `ScraperRunAll.test.ts` (company task isolation and flush chain continuity) and `ScraperCore.test.ts`. |
| **BF-005** | `extractSalary()` supports 3 shapes and feeds `generateHash`, `create` and `update` (incl. `salaryCurrency`); null-clearing on removal. | `AshbyClient ▸ extractSalary` ×4; `ScraperRunAll ▸ clears removed salary`. | 🟡 The 3 shapes ✅; null-clearing on removal ✅. Salary inside the hash ❌ (planned: P1-T06). |
| **BF-006** | Concurrent `getOrCreateDepartment/Location` for the same name share one in-flight Promise; closed jobs deactivated on a successful fetch; 3-strike quarantine persisted and weekly recheck. | `ScraperRunAll ▸ deactivates stale jobs`, `CompanyHealth ▸ quarantine after 3 consecutive runs`, `▸ sunday recheck includes NOT_FOUND`. | ✅ `deactivateStaleJobs()` ✅, 100-job streaming flush ✅, 3-strike quarantine & Sunday recheck ✅. |
| **BF-007** | `parseCSV()` unescapes `""`; `generateMarkdownTable()` escapes `\|` and newlines. | `GenerateReadme ▸ …unescape doubled quotes… escape pipe…`, `▸ commas inside quoted`; `ScraperCSV ▸ escapeCSV` ×5. | 🟡 `""` and `\|` ✅. **Newline escaping in Markdown cells ❌.** `\r\n` handling in `parseCSV` ❌. |
| **BF-008** | Multi-process cluster scraper coordinates via `allSettled`, watchdog kills stalled workers with SIGTERM then SIGKILL, partial report saved on failure with exit 1. | `ClusterScraper ▸ 1 of 2 fails → report saved, exit 1`, `▸ timeout → SIGTERM then SIGKILL`, `▸ partitionSlugs`, `▸ resolveWorkerCount`, `▸ ErrorTracker.mergeReports`; `ScraperCore ▸ …P2002…findUnique`. | ✅ **Guarded by `ClusterScraper.test.ts`** and `ScraperCore.test.ts`. |
| **BF-009** | `fetchJobsForCompany()` forwards `graphql_fallback`, `rateLimited`, `notFound` and `validationIssues` to the tracker; `verifyDatabase()` validates 4 tables and 0 defects. | `Verify ▸ should return accurate table counts…`; `ScraperCSV ▸ fetchJobsForCompany` (no tracker). The e2e test increments the tracker **by hand**. | ❌ for the `ScraperCSV` half: **no test passes a `tracker` to `fetchJobsForCompany()`**, so the forwarding code (L43-66) has 0 % coverage. `verifyDatabase` 4-table counts ✅. Defect *detection* ❌. |
| **BF-010** | `batchUpsertJobs()` uses `createMany` for new ids when available, runs `$transaction(upsert)` only for changed existing rows, and keeps the BF-004 fallback. | `ScraperRunAll ▸ 250 jobs flush in 3 chunks (100, 100, 50) and populate via createMany fast path`. | ✅ **Guarded by `ScraperRunAll.test.ts`.** |
| **BF-011** | Promotion of structured Posting API fields, GraphQL field preservation, company enrichment, and explicit full change detection hash after sanitization. | `ContentHash ▸ 17 cases`; `AshbyClient ▸ extractSalary`; `EnrichCompanies`. | ✅ **Guarded by `ContentHash.test.ts` (17 cases).** Changes on every stored field alter hash; key order is invariant; volatile metadata (`_source`) ignored. |
| **BF-012** | React UI with RTK Query and Backend REST API with Dual Rate Limiting (10 req/min sliding window, security headers, in-process cache). | `ApiServer ▸ Middleware & Error Handling ▸ enforces rate limiter`, `▸ sets standard security headers`, `▸ contract snapshots`. | ✅ **Guarded by `tests/unit/ApiServer.test.ts`.** |
| **BF-013** | Security hardening, facets API implementation, and filter OR-clobber fix (where.AND accumulation, DOMPurify HTML sanitization). | `ApiServer ▸ GET /v1/facets`, `▸ GET /v1/jobs ▸ applies search filter`. | ✅ **Guarded by `tests/unit/ApiServer.test.ts` (API half); DOMPurify guarded in UI suites.** |
| **BF-014** | Limiter pause timer retains event loop so rate limit cooldowns never drop queued tasks due to early process exit. | `ConcurrencyExit ▸ limiter must not let the process exit early when paused` | ✅ **Guarded by `tests/unit/ConcurrencyExit.test.ts`** running `tests/fixtures/limiter-exit.ts` (`tasksDone=4/4`, exit code 0). |
| **BF-015** | Only HTTP 429 triggers `sawRateLimit`; Retry-After header is honored (capped at 10 s); exhausted network/http failures emit `api_error` with failure details and attempt counts. | `AshbyClient ▸ fetchAshbyBoardWithFallback ▸ should return failure info http/503/3 when 503 retries are exhausted`, `▸ should honor Retry-After header and cap at 10 seconds`, `ScraperRunAll ▸ records api_error event when posting API request fails`. | ✅ **Guarded by `tests/unit/AshbyClient.test.ts` and `tests/unit/ScraperRunAll.test.ts`.** |
| **BF-016** | GraphQL fallback never overwrites rich REST job content or bumps `updatedAt`; empty boards for companies with ≥ 5 active jobs defer deactivation for one scrape cycle and record `suspicious_empty_board`. | `ScraperRunAll ▸ graphql does not overwrite rest content`, `▸ empty board deferred one run`. | ✅ **Guarded by `tests/unit/ScraperRunAll.test.ts`.** |

**Invariants without an effective test:** BF-010 (entirely), BF-006 (in-flight dedup, stale deactivation, streaming
flush), BF-009 (ScraperCSV tracker forwarding), BF-008 (`saveTelemetry:false`/IPC), plus the sub-clauses marked
❌ above in BF-001 (403/400, `BROWSER_HEADERS`), BF-002 (surrogates) and BF-005 (salary inside the hash and the upsert
payload).

---

## 7. Gotchas, Flaky Spots & Oddities

- **Unused fixtures.** `tests/fixtures/ashby-sample.json` and `cdx-sample.json` are never loaded (§2.3).
- **Real timers.** `Concurrency ▸ should limit maximum concurrent executions` relies on 30 ms `setTimeout`s and
  asserts `maxSeenActive === 3`. This is deterministic in practice but slow-ish (~150 ms). The 429 retry test uses
  real jitter `Math.random()*100` (up to ~100 ms). Neither has failed so far. Use `jest.useFakeTimers()` if they
  ever flake under CI load.
- **`clearMocks` keeps queued `*Once` values.** If a test queues `mockResolvedValueOnce` and the code under test
  doesn't consume it, the value **leaks into the next test** in the same file. Several suites call
  `jest.clearAllMocks()` explicitly, which has the same limitation. Use `mockReset()` (or `resetMocks: true`) when a
  test may not consume what it queued.
- **Shared global Prisma singletons.** Every `new PrismaClient()` from the manual mock shares the same `jest.fn()`
  objects, across modules within one test file.
- **Private-method testing.** `ScraperCore.test` reaches into internals with `(scraper as any).fetchJobs /
  generateHash / filterChangedJobs / batchUpsertJobs / getOrCreate*` and sets `isRedisConnected` directly. Renaming a
  private member breaks the tests without any type error, because of `isolatedModules` and `any`.
- **Implementation-coupled count.** The BF-004 test expects `job.upsert` to be called 4 times: 2 from
  `batch.map(job => prisma.job.upsert(...))` while the `$transaction` array is built, plus 2 retries. A refactor of
  how the transaction array is built will change that number.
- **Dead code under test.** `AshbyScraper.fetchJobs()` is only called from tests (§5.1).
- **Over-claiming titles.** "should return empty array when Ashby API request fails (404, 500, network)" only
  tests a generic network error. "should write latest-error-report.json and dated report" never checks the dated file.
  "should default to min(4, cpuCount)": the code is actually `min(4, max(2, cpuCount))`, so 1 CPU gives 2 workers.
- **Real `googleapis` load.** `ScraperCSV.test` and `e2e/ScraperPipeline.test` import the real googleapis package
  through `GoogleDriveOAuth`, which adds about 1 s each.
- **Noisy output.** Source modules log heavily (emoji progress lines, CDX slug listings). Use `--silent` to read
  results.

### 7.1 Docs that contradicted actual test behaviour (all fixed)

No open contradictions as of the 2026-10-22 second-round docs sweep. *Fixed, listed here for history:*
`AGENTS.md`'s verification gate implied `tsc --noEmit -p .` + lint verify the whole change (it now notes they cover
`src/` only, §1); `02-architecture-and-workflows.md` §8 said ESLint enforces JSDoc (it now says `jsdoc/require-jsdoc`
is `"warn"` and the convention is review-only, 09 #44); `01-overview` said "Jest 29" (installed: 30.5.2); 09 #14
said "49 tests" (now 79); 10 listed `ScraperCore`/`ClusterScraper`/`Concurrency`/`ScraperCSV` tests as guarding
BF-010, BF-006 and BF-009, which they don't. 10 now marks those invariants ❌/⚠️.

---

## 8. Conventions for Adding Tests

1. **Placement and naming.**
   - Unit tests go in `tests/unit/<ModuleName>.test.ts`, named after the source file (`Sanitizer.ts` →
     `Sanitizer.test.ts`). `ScraperCore.test.ts` (for `Scraper.ts`) and `GoogleDrive.test.ts` (two modules) are the
     existing exceptions.
   - Cross-module flows go in `tests/e2e/<Flow>Pipeline.test.ts`.
   - Fixtures go in `tests/fixtures/*.json`.
   - Only `*.test.ts` under `tests/` is collected. Files elsewhere (e.g. `src/**/*.spec.ts`) are ignored.
2. **Header block.** Every existing test file and `__mocks__/@prisma/client.ts` starts with the project's JSDoc
   header. ESLint doesn't lint `tests/`, but `npm run docs:generate` (`scripts/GenerateDocs.ts`) walks the whole repo,
   including `tests/` and `__mocks__/`, and uses this block in `docs/project-explorer.html`. Keep the convention:
   ```ts
   /**
    * @file <Module> Unit Tests
    * @summary <one line: what behaviours this suite guards>
    * @tags Unit Test, <Area>, <Keywords>
    */
   ```
   Use `@tags E2E, Pipeline, …` for e2e files. Individual `it` callbacks don't need JSDoc.
3. **Structure.** Use one top-level `describe('<Module> Unit Tests')`, one nested `describe` per exported function
   or behaviour, and `it('should …')` sentences. Name BF-related tests after the invariant, and add the test name
   to the "Guarding Tests" column of doc 10 when you add a `BF-XXX` entry.
4. **Mocking recipe.**
   - Prisma: rely on the global mock if you only need imports to succeed. If you assert DB calls, declare
     `const mockX = jest.fn()` at file top and a `jest.mock('@prisma/client', …)` factory that forwards lazily
     (`(...a) => mockX(...a)`). **Include every delegate the code feature-detects**, or the branch will silently
     never run (see BF-010). If you add delegates to `__mocks__/@prisma/client.ts`, remember that this changes
     behaviour for every suite that relies on it.
   - HTTP: `jest.mock('axios')`, then queue `mockResolvedValueOnce` / `mockRejectedValueOnce({ isAxiosError:true,
     response:{status} })` together with `mockedAxios.isAxiosError.mockReturnValueOnce(true)`. Pass
     `baseDelayMs: 1` to retry paths.
   - Redis: mock `../../src/lib/Redis` the same way `ScraperCore.test` does. Never let the real ioredis client load.
   - Filesystem: use `jest.mock('fs')` or a partial `requireActual` mock. When real files are needed, write only
     under `fs.mkdtempSync(os.tmpdir())` and clean up in `finally`. **Never write to `output/`, `apikeys/`,
     `extracted-slugs.json` or `.env`.**
   - Never import `src/database/DbMenu.ts` or `DbInspect.ts`, which run on import. For other entry modules, import
     the exported function. The `require.main === module` guard keeps the CLI from starting.
5. **Determinism.** No real network, DB or clock dependence. Prefer `jest.useFakeTimers()` for cooldown and backoff
   logic, and restore any `process.argv` or `console` spies in `afterEach`/`afterAll`.
6. **Before committing,** run `npx tsc --noEmit -p . && npm run lint && npm test`. Make sure `coverage/` isn't staged,
   update test counts in `01-overview.md`, `04-cli-commands.md` and this file, and run `npm run docs:generate`, since
   new test files show up in the explorer.

### 8.1 Highest-value tests to add next

1. **BF-010**: give a `ScraperCore` factory `job.findMany` and `job.createMany`, then assert that new ids go to
   `createMany({skipDuplicates:true})`, unchanged ones are skipped, and changed or inactive ones go to
   `$transaction`.
2. **BF-006**: `await Promise.all([dept('X'), dept('X')])` → `department.upsert` called once. Also call
   `deactivateStaleJobs('s', ['a'])` and assert the `updateMany` `notIn` arguments.
3. **BF-009**: call `fetchJobsForCompany(slug, tracker, onRL, onOK)` for the GraphQL, 429 and validation-issue cases
   and assert the tracker counters and events.
4. **BF-001**: cover 403 and 400 → GraphQL, assert `headers: BROWSER_HEADERS` on `axios.get` and `axios.post`, and
   check that 404 + GraphQL miss gives `notFound:true`.
5. **`runAll()`** with 2–3 slugs: streaming flush, `saveTelemetry:false` writing nothing (spy on
   `ErrorTracker.prototype.saveReport`), and limiter `onRateLimit` on `rateLimited`.
6. **BF-002**: a lone-surrogate case (`'a\uD800b'`) in `sanitizeJsonMetadata` and `sanitizeText`.
7. Load the orphaned fixtures in `AshbyClient`/`ProcessCdxData` tests.
