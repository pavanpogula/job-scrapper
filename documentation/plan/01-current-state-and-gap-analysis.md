# 01 · Current State and Gap Analysis

> Verified at HEAD `22afd64`, 2026-10-23. Read-only audit with five parallel auditors (frontend, API/cache,
> scraper/ops, docs/agent tooling, Claude Code formats).
> Each gap links to the task that closes it in [`12-implementation-roadmap.md`](./12-implementation-roadmap.md).
> Severity scale:
> - **S1**: broken or incorrect data, or a security issue
> - **S2**: target behaviour missing
> - **S3**: quality problem or drift
> - **S4**: nice to have
>
> `path:line` references are to HEAD `22afd64`. Line numbers drift, so search for the symbol if a line has moved.

## 1. What exists today

| Part | Where | Reality |
|---|---|---|
| Scraper | `src/core/Scraper.ts`, `ClusterScraper.ts`, `ScraperCSV.ts`, `src/lib/*` | Works. The last run (2026-10-23) scraped 3,072 companies in 76.3 s with 4 workers and collected 33,997 jobs. The DB holds 34,458 jobs, 34,023 of them active. Redis is optional, and it is not configured in this environment. |
| Backend API | `src/api/Server.ts` (Express 5), `api/index.ts`, `vercel.json` | Live on Vercel at `https://job-scrapper-ui.vercel.app/` (`/health` returns `{"status":"ok","activeJobs":34023}`). It reads **Postgres only**; there is no cache. |
| Frontend | `job-scrapper-ui/` (React 19.3.1, MUI 9.5.0, RTK Query, Vite 6.4.5) | Live. It has no tests, no lint, and no URL state. |
| Cache | `src/lib/Redis.ts` | Holds only `job:<ashbyId>:hash` change-detection keys (`Scraper.ts:265-269, 425-431`). The API never reads them. |
| Scheduling/CI | none | There is no `.github/`. Every scrape is run by hand. |
| Error loop | `src/lib/ErrorTracker.ts` → `output/latest-error-report.json` | Each run overwrites the previous report. Doc 10 has a protocol, but nothing automates it, and there is no decision log or changelog. |
| Agents | `.claude/agents/impeccable-*` (design only), `.agents/skills/` (design only) | Nothing exists for the scraper, the API or the loop, and there is no Antigravity config. |
| Checks | `npx tsc --noEmit -p .` (0 errors), `npm run lint` (0 errors, 1 warning), `npm test` (16 suites, 79 tests) | These cover `src/` only. The UI, `api/`, `tests/` and `scripts/` are not type-checked or linted. |

## 2. Top 12 gaps (read these first)

| # | ID | Sev | One-liner |
|---|---|---|---|
| 1 | GAP-FE-01 / GAP-API-01 | S1 | The default browse view sends `salaryInterval=1 YEAR` and hides about 63% of jobs (live: 12,708 shown vs 34,023 active). |
| 2 | GAP-FE-02 / GAP-SCR-23 | S1 | The country filter sends ISO codes, but the DB stores raw names (`United States` 15,601 / `USA` 2,799 / `US` 323), so 4 of the 5 options return 0 results. |
| 3 | GAP-SCR-05 | S1 | Jobs of companies that 404 or fail to fetch stay `active=true` forever. |
| 4 | GAP-SCR-03 | S1 | When a company removes a salary or workplace value, the old value is never cleared, because the update passes `undefined`. |
| 5 | GAP-SCR-01 | S1 | When the Redis hash is cached, it blocks reactivation of a returning job (09 #30). |
| 6 | GAP-SCR-07 | S2 | One thrown Prisma error inside a company task kills its worker, and with it the cluster run. |
| 7 | GAP-DOC-01 | S1 | The context every agent auto-loads says "no server, no UI, no REST endpoints", which is false. |
| 8 | GAP-API-02 / GAP-CACHE-01 | S2 | Nothing is cache-first. The API never reads Redis, and the scraper writes nothing the API could serve. |
| 9 | GAP-SCR-10 | S2 | One failed worker aborts the whole cluster run: no merged report is written, and the other child processes are orphaned (09 #35). |
| 10 | GAP-API-03 / GAP-FE-05 | S2 | The rate limit is 10 requests/min, counted per serverless instance. A normal user hits 429 within about a minute, and the UI shows a 429 as "Position not found". |
| 11 | GAP-OPS-01 / GAP-LOOP-01 | S2 | There is no scheduler, no CI, no decision log, no changelog, and no error history. |
| 12 | GAP-AG-02 / GAP-AG-05 | S2 | There are no scraper/API/loop agents for Claude Code, and Antigravity sees only an `AGENTS.md` that contradicts the code. |

## 3. Full gap register

### 3.1 Scraper (GAP-SCR)

| ID | Sev | Gap | Evidence | Task |
|---|---|---|---|---|
| GAP-SCR-01 | S1 | A cached Redis hash skips a job before the DB reactivation branch can run (09 #30). The TTL is refreshed only for jobs that missed the Redis check, whether or not they were written. Skipped jobs keep their old expiry, so a hidden job returns within 7 days. | `Scraper.ts:265-268, 337, 352-355, 426-431` | P1-T04 |
| GAP-SCR-02 | S2 | The Redis hash detector does one sequential GET per job (09 #7). The DB `contentHash` comparison already does the same job, so Redis adds no value here. | `Scraper.ts:259-275, 425-432` | P1-T04 |
| GAP-SCR-03 | S1 | The salary fields (`salaryMin/Max/Currency/Interval`) and `workplaceType` are passed as `undefined` when the source drops them. Prisma treats that as "no change", so old values stay. `country`, `region`, `city` and `publishedAt` already clear correctly (explicit `null`). `postalAddress` is set to a plain `null` on a `Json?` field, where Prisma 5 expects `Prisma.DbNull`; this only type-checks because the field is `any`. | `Scraper.ts:314-320, 463-464, 482-485`; `AshbyClient.ts:183`; `Sanitizer.ts:307` | P1-T05 |
| GAP-SCR-04 | S2 | The hash ignores the description and `metadata` (residual of 09 #31), so description edits are never saved. | `Scraper.ts:164` vs `:327` | P1-T06 |
| GAP-SCR-05 | S1 | Jobs are deactivated only when the source is `rest`/`graphql`. Companies that 404 or fail keep their jobs active forever. | `Scraper.ts:585-594` | P1-T07 |
| GAP-SCR-06 | S2 | The 3-strike quarantine never fires because it is an in-memory Map (09 #29), and `NOT_FOUND` is terminal (09 #8). | `Scraper.ts:61, 85-100, 587, 533-536` | P1-T07 |
| GAP-SCR-07 | S2 | The company task has no try/catch, so one thrown Prisma error kills the worker and with it the cluster run. | `Scraper.ts:561-627, 202, 246` | P1-T08 |
| GAP-SCR-08 | S2 | If one flush batch rejects, every later batch is skipped while fetching continues. The error only surfaces at `await flushChain` (`:631`) after all fetches finish, and then the run fails with no report. | `Scraper.ts:555-557, 426-431, 631, 668-673` | P1-T08 |
| GAP-SCR-09 | S2 | The limiter's pause timer is `unref`'d, so the process can exit 0 with work still queued (repro: `tasksDone=2/4`). | `Concurrency.ts:78-85` | P1-T09 |
| GAP-SCR-10 | S2 | `Promise.all` over workers means one failure leaves no report and orphans the other children. There is also no watchdog (09 #35). | `ClusterScraper.ts:126-130, 148-153` | P1-T11 |
| GAP-SCR-11 | S2 | A final 5xx/timeout records no event, so the board looks empty (09 #33). | `AshbyClient.ts:356-362` | P1-T12 |
| GAP-SCR-12 | S3 | A 403 counts as a rate limit, which halves concurrency (09 #34). `Retry-After` is ignored. | `AshbyClient.ts:315-317`; `Scraper.ts:568-571` | P1-T12 |
| GAP-SCR-13 | S3 | Reports are overwritten for each day and mode, so there is no history (09 #36). | `ErrorTracker.ts:145-151, 225-231` | P1-T10 |
| GAP-SCR-14 | S3 | There are no created/updated/deactivated counters. The merge uses a fixed field list. | `Scraper.ts:592, 638`; `ErrorTracker.ts:188-197` | P1-T10 |
| GAP-SCR-15 | S3 | The 500-event cap keeps the first events, and dead slugs are never listed (the latest report has an empty `events` array). | `ErrorTracker.ts:45, 79, 199-203` | P1-T10 |
| GAP-SCR-16 | S3 | A REST→GraphQL fallback overwrites rich REST data (descriptions, `publishedAt`) for that run. | `AshbyClient.ts:227-241`; `Scraper.ts:299, 327` | P1-T13 |
| GAP-SCR-17 | S3 | One empty `200` board deactivates all of a company's jobs immediately. | `Scraper.ts:588-593` | P1-T13 |
| GAP-SCR-18 | S3 | There is no sanity gate before data is published. | — | P2-T04 |
| GAP-SCR-19 | S3 | CSV mode exits 0 on failure (09 #10), saves the report before the stream closes (#38), and names files by UTC date (#12). | `ScraperCSV.ts:222, 189-197, 142` | P1-T14 |
| GAP-SCR-20 | S3 | The Redis client silently falls back to `localhost`. Its `retryStrategy` gives up after 3 tries, so the client is dead for the rest of the process. | `Redis.ts:26, 52-71` | P2-T02 |
| GAP-SCR-21 | S4 | `fetchJobs()` and the in-memory strike map are dead code (09 #47). | `Scraper.ts:61, 130-153` | P1-T07 |
| GAP-SCR-22 | S4 | The enrichment 429 back-off can never run, because `fetchOrganizationMetadata` never throws. | `AshbyClient.ts:279-281`; `EnrichCompanies.ts:103-105` | P3-T03 |
| GAP-SCR-23 | S1 | `Job.country` stores raw `addressCountry` text instead of ISO-3166 codes, and doc 05:121 wrongly says it is ISO. | `Scraper.ts:482`; live `/v1/facets` | P1-T15 |

### 3.2 Backend API (GAP-API)

| ID | Sev | Gap | Evidence | Task |
|---|---|---|---|---|
| GAP-API-01 | S1 | `salaryInterval` alone becomes an equality filter, and the UI always sends it. | `Server.ts:187-189`; `filterSlice.ts:11` | P1-T17 (+P1-T20) |
| GAP-API-02 | S2 | There is no cache read path. | `Server.ts:11-13` | P2-T01, P2-T05, P2-T06 |
| GAP-API-03 | S2 | The rate limiter is an in-memory Map plus `setInterval`, counted per instance, at 10/min. | `Server.ts:51-104` | P2-T08 |
| GAP-API-04 | S2 | `/health` runs a DB count on every call, so an uptime pinger keeps Neon awake (about 182 CU-h/month against 100 free). | `Server.ts:107-114` | P1-T17, P2-T07 |
| GAP-API-05 | S2 | The list query loads full `metadata` jsonb, including descriptions, for every row. | `Server.ts:211-231` | P1-T17 |
| GAP-API-06 | S2 (S1 once CDN caching is on) | The server trusts the client-supplied `x-forwarded-uri`, which allows cache poisoning. | `Server.ts:20-25` | P1-T17 |
| GAP-API-07 | S3 | `cors({ origin: true })` reflects any origin. | `Server.ts:27` | P2-T08 |
| GAP-API-08 | S3 | There is no `Cache-Control` header, so the Vercel CDN is unused. | — | P2-T08 |
| GAP-API-09 | S3 | The sort has no unique tie-breaker, and DESC puts NULLs first, so rows repeat or get skipped across pages. | `Server.ts:195-207` | P1-T17 |
| GAP-API-10 | S3 | `sortBy=company` is ignored. | `Server.ts:201-207` | P1-T17 |
| GAP-API-11 | S3 | The detail endpoint returns inactive jobs without a flag, runs two queries in sequence, and has no `secondaryLocations`. | `Server.ts:280-344` | P1-T17 |
| GAP-API-12 | S3 | `page` is unbounded, and `:id` is not validated before the DB is queried. | `Server.ts:134, 213, 282` | P1-T17 |
| GAP-API-13 | S3 | There are no API tests, and the Prisma mock has no `findFirst`. | `tests/unit/*`; `__mocks__/@prisma/client.ts:16-24` | P1-T16 |
| GAP-API-14 | S3 | `api/index.ts` is not type-checked or linted. | `tsconfig.json` include; lint script | P2-T08 |
| GAP-API-15 | S3 | The SPA HTML document has no CSP or X-Frame-Options (only Express responses do). | `vercel.json`; live `GET /` | P2-T08 |
| GAP-API-16 | S4 | Error bodies have no `code` and no `requestId`. | various | P2-T05 |
| GAP-API-17 | S4 | Client IPs are logged on every request. | `Server.ts:44-49` | P2-T05 |
| GAP-API-18 | S3 | Facets return `departments: []` hard-coded, and countries with equal counts come back in no fixed order. | `Server.ts:362-368, 383` | P1-T17 |
| GAP-API-19 | S4 | The companies envelope differs from the jobs envelope (top-level vs `meta`). | `Server.ts:436-442` | P2-T05 (additive `meta`) |
| GAP-API-20 | S3 | There is no serverless Prisma/Neon pooling config. | `Server.ts:13` | P2-T09 |
| GAP-API-21 | S4 | A module-scope `setInterval` runs in a serverless function. | `Server.ts:60-68` | P2-T08 |
| GAP-API-22 | S2 | No composite index matches `active AND isListed (+filter) ORDER BY publishedAt DESC`. | `schema.prisma:85-95` | P1-T18 |
| GAP-API-23 | S4 | The UI types declare filters the server ignores (`company`, `department`, `location`, `city`). | `job-scrapper-ui/src/types/api.ts:92-103` | P5-T10 |

### 3.3 Cache (GAP-CACHE)

| ID | Sev | Gap | Task |
|---|---|---|---|
| GAP-CACHE-01 | S2 | Nothing writes servable data to Redis. | P2-T01, P2-T03, P2-T04 |
| GAP-CACHE-02 | S2 | 34k `job:*:hash` keys waste memory and the command budget. | P1-T04, P2-T03 (`cache:purge-legacy`) |
| GAP-CACHE-03 | S2 | The Redis client is unsuitable for serverless: it hangs while offline, is dead after 3 retries, and falls back to localhost. | P2-T02 |
| GAP-CACHE-04 | S2 | There is no cache observability (`X-Cache`, freshness, `/health`). | P2-T05, P2-T07 |
| GAP-CACHE-05 | S3 | The docs call Redis "Required" (`.env.example:5`), but the code treats it as optional. | P2-T09 |
| GAP-CACHE-06 | S3 | A free-tier database is archived after 30 days unused, and cache contents are not durable, so an empty cache must be a normal state. | P2-T03 (`cache:publish`), P3-T04 runbook |
| GAP-CACHE-07 | S2 | The free-tier command budget is small (Upstash docs say both 10,000/day and 500K/month; design for the stricter one). | 03 §2, P2-T05 |

### 3.4 Frontend (GAP-FE)

| ID | Sev | Gap | Evidence | Task |
|---|---|---|---|---|
| GAP-FE-01 | S1 | The default `salaryInterval: '1 YEAR'` hides about 63% of jobs. | `filterSlice.ts:11`; `jobsApi.ts:84` | P1-T20 |
| GAP-FE-02 | S1 | The country select is hard-coded to `US/GB/CA/DE/FR`. | `BrowsePage.tsx:150-156` | P1-T21 |
| GAP-FE-03 | S2 | Filters and page live only in Redux, so links aren't shareable and reload resets them. `syncFromUrl` is unused. | `filterSlice.ts:4-16, 65-67` | P5-T01 |
| GAP-FE-04 | S2 | The Companies page shows only the first 30 of about 1,747 companies, and "1,747" is hard-coded. | `CompaniesPage.tsx:33, 42` | P5-T03 |
| GAP-FE-05 | S2 | A client rate gate (10/min) sits on top of the server limit. A 429 has no recovery, and `Retry-After` is ignored. | `rateLimitSlice.ts:16-17`; `jobsApi.ts:34-65` | P5-T02 |
| GAP-FE-06 | S2 | Every detail error shows "not found", and there is no Retry anywhere. | `JobDetailPage.tsx:42-61` | P5-T02 |
| GAP-FE-07 | S2 | The mobile drawer dispatches on every tap, and "Apply Filters" only closes it. | `BrowsePage.tsx:115-165, 556-563` | P5-T01 |
| GAP-FE-08 | S2 | The SPA document has no security headers. | live `GET /` | P2-T08 |
| GAP-FE-09 | S2 | There is no UI test runner, so the BF-013 DOMPurify invariant has no test. | `job-scrapper-ui/package.json:6-10` | P1-T19 |
| GAP-FE-10 | S2 | There is no UI lint or typecheck script, and the AGENTS.md checks skip the UI. | — | P1-T19 |
| GAP-FE-11 | S3 | Counts are hard-coded (34,0xx / 1,74x), and the UI says "Updated Daily" but shows no freshness. | `Header.tsx:98, 231`; `BrowsePage.tsx:207`; `CompaniesPage.tsx:42`; `AboutPage.tsx:73`; `index.html:8` (2 numbers); "Updated Daily" at `Footer.tsx:56` | P5-T04 |
| GAP-FE-12 | S3 | WCAG 2.2 AA failures: missing labels, no h1, no `aria-pressed`/`aria-expanded`, no skip link. | see 06 §2 | P5-T05 |
| GAP-FE-13 | S3 | No per-page `<title>`, no robots.txt (it returns index.html), and no 404 route. | `App.tsx:23-28` | P5-T06 |
| GAP-FE-14 | S3 | DOMPurify uses its default config: description links navigate away, and inline styles are kept. | `JobDetailPage.tsx:209` | P5-T07 |
| GAP-FE-15 | S3 | Closed jobs still show Apply, in both places it appears. | `JobDetailPage.tsx:226-239` (desktop) and `:284-312` (mobile sticky bar) | P5-T07 |
| GAP-FE-16 | S3 | No scroll-to-top on page change, no mobile loading indicator, and no sort UI. | `BrowsePage.tsx:284-288, 520` | P5-T01 |
| GAP-FE-17 | S3 | The UI types drift from the real contract, and the JSDoc cites the deleted `documentation/frontend-design/08-…`. | `types/api.ts:1-3` | P5-T10 |
| GAP-FE-18 | S3 | The root build runs `npm install` rather than `npm ci` for the UI. | `package.json:24` | P3-T01 |
| GAP-FE-19 | S3 | A duplicate `job-scrapper-ui/vercel.json` catch-all would break `/v1` if that folder were deployed on its own. | `job-scrapper-ui/vercel.json:1-8` | P2-T08 |
| GAP-FE-20 | S3 | The Vite dev server binds to `0.0.0.0` with `allowedHosts: true`. | `vite.config.ts:11-12` | P5-T08 |
| GAP-FE-21 | S3 | The UI ships as one 221 kB gzip chunk with no lazy routes, and fonts block rendering. | build output | P5-T08 |
| GAP-FE-22 | S4 | The `.dark` class isn't applied on first load, and dead Tailwind classes remain in `index.html`. | `themeSlice.ts`; `index.html:14` | P5-T08 |
| GAP-FE-23 | S4 | `src/mocks/mockData.ts` is unused and uses ISO country codes. | — | P5-T10 |
| GAP-FE-24 | S4 | The About copy claims "no cookies or tracking" while the site loads Google Fonts, and the search placeholder promises keyword search. | `AboutPage.tsx:53`; `BrowsePage.tsx:207` | P5-T08 |
| GAP-FE-25 | S4 | Touch targets on mobile are smaller than 44 px. | `theme.ts:114` | P5-T05 |

### 3.5 Ops / CI (GAP-OPS)

| ID | Sev | Gap | Task |
|---|---|---|---|
| GAP-OPS-01 | S2 | There is no scheduler and no CI (no `.github/`). | P3-T01, P3-T02 |
| GAP-OPS-02 | S3 | Node is not pinned (no `.nvmrc`, no `engines`). | P3-T01 |
| GAP-OPS-03 | S3 | The default worker count depends on runner cores. A private repo runs on 2 cores, which would give 2 workers. | P3-T02 (`--workers=4`) |
| GAP-OPS-04 | S3 | There are no failure alerts. | P3-T02 |
| GAP-OPS-05 | S3 | There are no migrations (`db push` only). | P3-T02 (`db push --skip-generate`), Q-12 |
| GAP-OPS-06 | S3 | There is no exit-code contract: only 0/1, and the CSV path exits 0 on failure. | P1-T11, P1-T14, P2-T04 |
| GAP-OPS-07 | S3 | ts-node type-checks in every one of the 5 processes at startup. | P3-T02 (`TS_NODE_TRANSPILE_ONLY=true`) |
| GAP-OPS-08 | S3 | There is no DB connection budget for 5 processes plus serverless. | P0-T02, P2-T09 |
| GAP-OPS-09 | S3 | The Neon DB size against the 1 GB free limit is unknown. | P0-T04 |
| GAP-OPS-10 | S4 | Discovery never runs on a schedule (09 #13, #37). | P5-T11 (optional) |

### 3.6 Self-healing loop (GAP-LOOP)

| ID | Sev | Gap | Task |
|---|---|---|---|
| GAP-LOOP-01 | S2 | Nothing runs the fixer automatically after a scrape. | P4-T08 |
| GAP-LOOP-02 | S2 | There is no decision log (ADRs). | P4-T01 |
| GAP-LOOP-03 | S2 | There is no release doc or changelog, no git tags, and `package.json` is still at `1.0.0` (09 #40). | P4-T02 |
| GAP-LOOP-04 | S2 | Two bug-fix protocols compete (`AGENTS.md:19-23` has 4 steps, `10:11-29` has 6), and neither reads history first or uses a branch and PR. | P4-T03 |
| GAP-LOOP-05 | S2 | Nothing classifies a report as actionable or noise. | P1-T10 |
| GAP-LOOP-06 | S3 | There are no guardrails (max changes per run, a stop after 2 failed attempts, dedupe against open PRs). | P4-T08 |

### 3.7 Agent tooling (GAP-AG)

| ID | Sev | Gap | Task |
|---|---|---|---|
| GAP-AG-01 | S3 | `.claude/settings.local.json` is **not** tracked. `git ls-files` doesn't list it, and only the owner's global gitignore (`~/.config/git/ignore`) keeps it out. The repo `.gitignore` has no entry for it, so another contributor could commit it. There is also no shared `.claude/settings.json` (permissions or deny rules). Separately, the tracked `.codex/hooks.json`, which only Codex uses, runs the impeccable launcher on every Edit/Write and on Stop, and that launcher can download a binary (`.agents/skills/impeccable/scripts/impeccable:96-99`). | P1-T01 |
| GAP-AG-02 | S2 | There are no scraper, API, loop, docs or review agents. | P4-T04, P4-T05 |
| GAP-AG-03 | S3 | `impeccable` exists as two copies that have diverged (`.claude/skills/` and `.agents/skills/`), each with a 17 MB binary. | P4-T05 |
| GAP-AG-04 | S3 | `impeccable` is not pinned in `skills-lock.json`. | P4-T05 |
| GAP-AG-05 | S2 | Antigravity has no rules or subagents. It reads only `AGENTS.md`, which is wrong. | P1-T02, P4-T06 |
| GAP-AG-06 | S2 | The `CLAUDE.md` quick map duplicates `AGENTS.md` and the docs, and contradicts them. | P1-T02 |
| GAP-AG-07 | S3 | Antigravity Workflows stopped working on 2026-10-19, so procedures must be written as skills. | P4-T05, P4-T06 |
| GAP-AG-08 | S2 | Headless Antigravity (`agy`) documents no CI auth, so the CI fixer must run on Claude Code. | ADR in P4-T01, P4-T08 |
| GAP-AG-09 | S3 | Doc 10 is 27 KB, which is over Antigravity's 24 KB per-rule include cap. | P4-T06 |
| GAP-AG-10 | S3 | 32 absolute `file:///` links break includes and CI. | P1-T22 |
| GAP-AG-11 | S4 | Nothing proves that context actually loaded (no cold-start check). | P4-T09 |
| GAP-AG-12 | S4 | Hook logic is written inline in three different config shapes. | P4-T05 |

### 3.8 Documentation (GAP-DOC)

| ID | Sev | Gap | Evidence | Task |
|---|---|---|---|---|
| GAP-DOC-01 | S1 | The auto-loaded context says there is no server, no UI and no REST endpoints. | `CLAUDE.md:14`; `documentation/README.md:12, 51`; `01:16`; `03:3` | P1-T02 |
| GAP-DOC-02 | S2 | There is no API reference doc. | — | P2-T09 |
| GAP-DOC-03 | S2 | There is no UI doc. | — | P5-T09 |
| GAP-DOC-04 | S2 | There is no deployment or ops doc. | — | P3-T04 |
| GAP-DOC-05 | S2 | There is no system-wide architecture/flow doc. Doc 02 covers the scraper only. | — | P1-T22 (skeleton), P4-T03 |
| GAP-DOC-06 | S2 | There are no ADRs, no CHANGELOG and no tags. | — | P4-T01, P4-T02 |
| GAP-DOC-07 | S2 | Two protocols compete. | `AGENTS.md:19-23` vs `10:11-29` | P4-T03 |
| GAP-DOC-08 | S3 | More than 20 references to files deleted in `b515ad6` (`scripts/test-drive-upload.ts`, `BackfillJobFields.ts`). | README:176, 216; 06:30; 07:10 … | P1-T22 |
| GAP-DOC-09 | S3 | "Hash = 5 fields" appears in 3 places. It is actually 16. | `CLAUDE.md:62`; `02:173`; `06:50` vs `Scraper.ts:158-166` | P1-T02, P1-T22 |
| GAP-DOC-10 | S3 | The BF registry stops at BF-010, and the guard status for BF-011…013 overstates what tests cover. | `10:19, 38-50, 157, 170`; `11` §6 | P1-T22 |
| GAP-DOC-11 | S3 | Three docs say "MUI v6"; it is 9.5.0. | `AGENTS.md:14`; `README.md:26`; `10:149` | P1-T02 |
| GAP-DOC-12 | S3 | 32 absolute `file:///` links. | 02, 05, 06, 07 | P1-T22 |
| GAP-DOC-13 | S3 | Hard-coded line numbers and HEAD stamps have drifted. | `06:43-57` | P1-T22 |
| GAP-DOC-14 | S3 | The same facts are copied across 4 files, and the copies have already diverged. | `AGENTS.md`, `README.md`, `documentation/README.md`, `CLAUDE.md` | P1-T02 |
| GAP-DOC-15 | S3 | The README's setup, scripts, structure, env and perf sections are stale. | README | P1-T22 |
| GAP-DOC-16 | S3 | `.env.example` is stale (says Redis is "Required", has no `PORT`), and there is no UI `.env.example`. | `.env.example:5` | P1-T22, P2-T09 |
| GAP-DOC-17 | S4 | UI leftovers (dead JSDoc, unused mock, Tailwind classes). | — | P5-T10 |
| GAP-DOC-18 | S4 | Doc 09 has no API, UI or Ops sections. | `09:57-116` | P1-T22 |

### 3.9 Tests (GAP-TEST)

| ID | Sev | Missing guard | Task |
|---|---|---|---|
| GAP-TEST-01 | S2 | `runAll()`: streaming flush, deactivation args, company isolation | P1-T03, P1-T08 |
| GAP-TEST-02 | S2 | The BF-010 `createMany` fast path. The `ScraperCore` factory lacks `job.findMany`/`createMany`/`updateMany`. | P1-T03, P1-T04 |
| GAP-TEST-03 | S2 | `runClusterScrape`: IPC, `allSettled`, kill on timeout | P1-T11 |
| GAP-TEST-04 | S2 | Limiter early-exit (child-process test) | P1-T09 |
| GAP-TEST-05 | S1 | Null-clearing in the upsert and `createMany` payloads | P1-T05 |
| GAP-TEST-06 | S2 | The hash changes when any hashed field or the metadata changes | P1-T06 |
| GAP-TEST-07 | S3 | ErrorTracker v2 and the classifier | P1-T10 |
| GAP-TEST-08 | S2 | Publisher write order, failure cleanup, budget | P2-T03 |
| GAP-TEST-09 | S3 | 403/400 → GraphQL fallback, browser headers, failure info | P1-T12 |
| GAP-TEST-10 | S3 | `tests/` and `scripts/` are never type-checked (09 #44) | P3-T01 |
| GAP-TEST-11 | S2 | API routes: no tests at all (BF-012/013 show ❌) | P1-T16 |
| GAP-TEST-12 | S2 | UI: no tests at all | P1-T19, P5-* |
| GAP-TEST-13 | S3 | Agent shells parity (one source, two tools) | P4-T07 |

## 4. Doc 09 items checked against code

These items in [`../09-known-issues-and-tech-debt.md`](../09-known-issues-and-tech-debt.md) are still open:
- #7–#13, #29, #30, #33–#39
- #15, #17, #19–#21, #23
- #40–#42, #44–#49, #51, #52, #54–#57

**Stale entries** to fix in P1-T22:
- **#32:** the "issues thrown away" bullet is fixed (`AshbyClient.ts:243-244, 341`).
- **#43:** "the global mock has no `createMany`" is wrong (`__mocks__/@prisma/client.ts:18`). The real gap is in the `ScraperCore` factory.
- **#24, #50, #53:** they cite the deleted `test-drive-upload.ts`.
- **#31:** marked resolved, but descriptions and metadata are still not hashed (GAP-SCR-04).
- **#16:** says "not yet committed", but it is committed.
