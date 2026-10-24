# 04 · Backend API Plan (`src/api/Server.ts` on Vercel)

> **Goal:** a cache-first, read-only API that falls back to Postgres. It must keep the response contract the UI relies
> on today (§2). The cache design is in [03](./03-cache-design.md); the tasks are P1-T16…T18 and P2-T01…T09 in [12](./12-implementation-roadmap.md).

## 1. Module layout (target)

Every new file gets a JSDoc `@file` / `@summary` / `@tags` header.

| File | Responsibility |
|---|---|
| `src/api/Server.ts` | Express app: middleware order, routes, and `export default app`. `api/index.ts:6` imports this default export, so keep it. |
| `src/api/contract.ts` | `LIST_SELECT`, `DETAIL_SELECT`, `toJobListItem()`, `toJobDetail()`, `toCompanyItem()`, `matchesFilter()`, `buildJobsWhere()`, `buildOrderBy()`. **Shared with the publisher.** |
| `src/api/db/queries.ts` | `queryJobs()`, `queryJobById()`, `computeFacets()`, `queryCompanies()`, `queryMeta()`. **Shared with the publisher.** |
| `src/api/cache/ReadThrough.ts` | Pointer and manifest caches, the in-process LRU, `serveCached()`, and the BYPASS/MISS reasons from 03 §5. |
| `src/api/cache/Breaker.ts` | The per-instance circuit breaker and the budget-exhausted flag. |
| `src/lib/cache/keys.ts` | `canonicalJobsKey()`, `detailsShard()`, key-name constants, `isCacheableView()`. |
| `src/lib/cache/RedisClient.ts` | `createRedis({ role: 'api' \| 'publisher' })`. It returns `null` when `REDIS_URL` is unset. |
| `src/api/middleware/*.ts` | `requestId`, `securityHeaders`, `cors`, `dbGuard`, `cacheControl`, `errorHandler`. |

## 2. Response contract to preserve (the UI depends on it)

The source of truth is the frontend audit (06 §1) together with `job-scrapper-ui/src/types/api.ts` and the UI call
sites. Snapshot tests in P1-T16 pin these shapes **before** any refactor.

### `GET /v1/jobs`

**Params the UI sends:**
- `search`
- `workplaceType` (`Remote|Hybrid|OnSite`)
- `employmentType` (`FullTime|Contract|PartTime|Intern`)
- `country`
- `hasSalary=true`
- `salaryInterval`
- `sortBy=publishedAt`, `sortOrder=desc`
- `page`, `pageSize=25`

The server also accepts `salaryMin` and `isRemote`. Ignore unknown params; never reject them.

**Response:** `{data, meta:{total,page,pageSize,totalPages,hasNext,hasPrev}}`. Keys that are undefined are omitted,
exactly as `res.json` does today.

**Load-bearing item fields:** `id`, `title`, `applyUrl`, `companyName`, `companySlug`. The UI also reads `location`,
`workplaceType`, `employmentType`, `department`, `publishedAt`, `salaryMin`, `salaryMax`, `salaryCurrency` and
`salaryInterval`.

### `GET /v1/jobs/:id`

- `:id` is `Job.id` (UUID). An `ashbyId` must keep working too.
- Fields the UI reads: `title`, `companyName`, `companySlug`, `applyUrl`, the salary fields, `location`,
  `workplaceType`, `employmentType`, `team`, `descriptionHtml`, `descriptionPlain`.
- **Additive (new):** `active: boolean`, and `secondaryLocations: string[]` mapped from
  `metadata.secondaryLocations[].location ?? .locationName` (`AshbyClient.ts:45-48`). This matches the UI type at
  `types/api.ts:57`.
- Not found: `404 {error:'Job not found'}`.

### `GET /v1/facets`

- Shape: `{workplaceTypes[{value,count}], employmentTypes[...], countries[...] (top 20), departments[...], hasSalary:{yes,no}}`.
- `departments` is filled with the top 30. Ties are broken by `value` ascending.

### `GET /v1/companies`

- Shape: `{data:[{slug,name,logoUrl,jobCount}], total, page, pageSize, totalPages}`.
- **Additive:** a `meta` object with the same fields as `/v1/jobs` `meta`. Don't remove the top-level fields.
- **Snapshot the existing difference:** companies `totalPages` can be `0` on an empty result (`Server.ts:441`),
  while jobs is always ≥ 1 (`:260`). Keep the top-level value unchanged.

### `GET /v1/meta` (new)

`{activeJobs, hiringCompanies, withSalary, lastScrapeAt, generation}`. The UI uses it to stop hard-coding counts (06 FE-11).

### Errors

- Additive shape: `{error:"<wording unchanged>", code, requestId, retryAfterSeconds?, message?}`.
- `code` is one of `BAD_REQUEST|NOT_FOUND|RATE_LIMITED|UPSTREAM_UNAVAILABLE|INTERNAL`.
- A 429 keeps the readable `message`, because the UI shows it verbatim.

**Safe to add:** headers and new fields.

**Not safe:**
- renaming or removing the load-bearing fields;
- changing what `id` means;
- re-wrapping the `/v1/jobs` response;
- changing the country value format without a matching UI change. P1-T15 and P1-T21 ship together.

## 3. Request pipeline

```
requestId → securityHeaders → cors(allow-list) → [route]
  lists/facets/companies/meta: ReadThrough.serveCached(key) ─HIT/STALE→ send
                                  └─MISS/BYPASS→ dbGuard → queries.* → send
  detail: validateId (UUID) → HGET jc:v1:details:<detailsShard(id)> → HIT | dbGuard → queryJobById (OR id/ashbyId)
→ cacheControl(by status & X-Cache) → errorHandler (maps to {error,code,requestId})
```

### Timing budgets

| Stage | Budget | Behaviour |
|---|---|---|
| Redis command | 150 ms | — |
| Redis total per request | 300 ms | Then fall back to Postgres |
| Cold Redis connect | 1000 ms | If exceeded, serve from Postgres. The next request tries the connect again. |
| Postgres query | 8 s | Then `503 {code:'UPSTREAM_UNAVAILABLE', retryAfterSeconds:5}` |

### `dbGuard`

- At most 3 concurrent DB fallbacks per instance, matching `connection_limit=3`.
- Up to 10 more are queued.
- Beyond that, return 503 with `Retry-After: 5`.

### Single-flight

Identical DB-fallback queries in one instance share one promise, keyed by the canonical key.

### Redis client (`role: 'api'`)

ioredis with:
- `lazyConnect:true`, `enableOfflineQueue:false`, `maxRetriesPerRequest:0`
- `commandTimeout:150`, `connectTimeout:1000`
- `enableReadyCheck:false`, `retryStrategy: t => Math.min(t*200, 2000)` (never gives up)
- `keepAlive:10000`, `connectionName:'api'`, and `tls` implied by the `rediss://` URL

It is a module-scope singleton, so it is reused across invocations. It disconnects after 60 s idle, using an
`unref`'d timer. There is **no `dotenv` side effect and no localhost fallback** outside `NODE_ENV=development`.

**Connect explicitly.** With `lazyConnect:true` and `enableOfflineQueue:false`, ioredis 5.8.2 **rejects the first
command** on a cold client with "Stream isn't writeable…". After `disconnect()` the client status is `end`, every
command is rejected with "Connection is closed", and nothing reconnects automatically.

So `ReadThrough` calls `await redis.connect()` before issuing commands whenever `redis.status` is `wait` or `end`. It
races the connect against the 1000 ms budget. On timeout, the request falls back to Postgres and the next request
tries to connect again. Under `connectTimeout:1000` the attempt is not continued in the background.

## 4. Correctness fixes before the cache (P1-T17)

1. **`salaryInterval` (GAP-API-01).** Ignore it unless `salaryMin` is a valid number. Record this as a BF entry and an
   ADR. The UI also stops sending it (P1-T20).
2. **`select` (GAP-API-05).** The list uses `LIST_SELECT` only and never selects `metadata` or `postalAddress`.
3. **`orderBy` (GAP-API-09/10).**
   - Default: `[{publishedAt:{sort:'desc',nulls:'last'}},{createdAt:'desc'},{id:'asc'}]`.
   - `sortBy=salary` uses `salaryMin` with nulls last.
   - `sortBy=company` sorts by `companySlug`.
   - Every sort ends with `{id:'asc'}`.
4. **Input validation (GAP-API-12).** `page` is clamped to 5000; beyond the last page the API returns an empty page,
   not a 400. A detail id that is not a UUID gets a 404 without touching the cache or the DB. Ashby ids are UUIDs too.
5. **Detail (GAP-API-11).**
   - Replace the second, dependent count query (`Server.ts:300`, which needs `companySlug` from the first) with a single
     query: `include: { company: { select: { …, _count: { select: { jobs: { where: { active: true } } } } } } }`.
   - Return `active`, and map `secondaryLocations` from metadata.
6. **Facets (GAP-API-18).** Fill `departments` with the top 30, and give countries a deterministic order by count
   descending, then value ascending.
7. **`/health` (GAP-API-04).** Make it cheap in P1, then fully shallow in P2 (§5).
   - **P1:** `activeJobs` counts `active AND isListed`, the same `where` as `/v1/jobs`. Today it counts `active` only
     (`Server.ts:109`), so the two can differ.
   - **P1:** the count is cached in-process for 10 min, so pingers don't keep Neon awake.
   - **P2 (P2-T07):** the count comes from the cache generation's `meta` field instead, with no DB call.
8. **`x-forwarded-uri` middleware (GAP-API-06).**
   - First check on a Vercel preview deploy that `req.originalUrl` starts with `/v1` without the middleware. If it
     does, delete the middleware.
   - If it doesn't, change the rewrite to `/api/index?__path=/v1/$1` and route on `__path`.
   - Either way, a client-supplied `X-Forwarded-Uri` must have no effect (test).
   - **This blocks CDN caching (P2-T08).**

## 5. `/health` v2 (P2-T07)

Default request: no DB call, `Cache-Control: no-store`, always 200. Example response:

```json
{"status":"ok|degraded","activeJobs":34023,"version":"<VERCEL_GIT_COMMIT_SHA|dev>","time":"…",
 "cache":{"configured":true,"state":"ok|not_configured|unreachable|no_generation|missing_generation|circuit_open|budget_exhausted",
          "generation":"g…","builtAt":"…","latencyMs":3,"mode":"double_buffer"},
 "data":{"lastScrapeAt":"…","ageHours":5.2,"fresh":true,"stale":false},
 "db":{"checked":false}}
```

- `activeJobs` stays at the top level for backward compatibility. It is read from the generation's `meta` field and
  counts active **and** listed jobs.
- With no generation, it falls back to the P1 in-process cached DB count, at most one count per 10 min per instance,
  and `status` is `degraded`.
- `?deep=1` with the header `X-Health-Token: <HEALTH_TOKEN>` also runs `SELECT 1`. It returns 503 only if both the
  cache and the DB fail. Without the token, `deep` is ignored.

## 6. Rate limiting, CORS, caching headers, Vercel config (P2-T08)

### Rate limiting

- **Primary:** one Vercel WAF rate-limit rule (Hobby allows 1). It applies to path prefix `/v1/`, uses a fixed 60 s
  window, allows **120 requests per IP**, and returns the default 429.
  - The owner creates it in the dashboard in P0-T05. Whether `vercel.json` can declare it is UNVERIFIED.
  - Because the WAF answers in front of the CDN, cached responses count toward the limit too.
  - The WAF's own 429 has no JSON body, and the UI must handle that (06).
- Delete the in-memory limiter and its `setInterval` (`Server.ts:51-104`). Keep the `dbGuard` (§3).

### CORS

- `CORS_ORIGINS` defaults to `https://job-scrapper-ui.vercel.app,http://localhost:3000`.
- Methods: `GET, HEAD, OPTIONS`.
- Exposed headers: `X-Cache, X-Cache-Reason, X-Cache-Generation, X-Data-Updated-At, Retry-After, X-Request-Id`.

### `Cache-Control`

| Response | Header |
|---|---|
| 200 lists, facets, companies, meta | `public, max-age=60, s-maxage=300, stale-while-revalidate=3600, stale-if-error=86400` plus `Vercel-Cache-Tag: jobs-v1` |
| 200 with `X-Cache: BYPASS` | `public, max-age=30, s-maxage=60, stale-while-revalidate=600` |
| 200 detail | `public, max-age=300, s-maxage=3600, stale-while-revalidate=86400` plus the tag |
| 404 detail | `public, s-maxage=300` |
| 4xx, 5xx, 429, `/health` | `no-store` |

### `vercel.json`

- Add `"regions":["iad1"]`. The owner confirms that Neon and Upstash are in us-east (Q-05).
- Add `"functions":{"api/index.ts":{"maxDuration":15}}`.
- Add a `headers` block for `/(.*)` (the SPA document):
  - a CSP with **no** `script-src 'unsafe-inline'`, keeping `style-src 'unsafe-inline'` for Emotion;
  - `X-Frame-Options: DENY`;
  - `Referrer-Policy: strict-origin-when-cross-origin`;
  - `X-Content-Type-Options: nosniff`;
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
- Delete `job-scrapper-ui/vercel.json` (GAP-FE-19).

### Type-checking `api/`

Add `api/**/*` to `tsconfig.json` `include` (adjust `rootDir` to `.`) and include `api/` in the lint script (GAP-API-14).

## 7. Postgres fail-safe (P1-T18, P2-T09)

### Composite indexes

These go in `prisma/schema.prisma` and are applied with `npx prisma db push`; the repo has no migrations directory.

1. `@@index([active, isListed, publishedAt(sort: Desc), createdAt(sort: Desc), id])`
2. `@@index([active, isListed, workplaceType, publishedAt(sort: Desc)])`
3. `@@index([active, isListed, employmentType, publishedAt(sort: Desc)])`
4. `@@index([active, isListed, country, publishedAt(sort: Desc)])`
5. `@@index([companySlug, active])`, which replaces `@@index([companySlug])`

Then:
- Drop the superseded single-column `active`, `workplaceType`, `employmentType`, `country`, `publishedAt` and
  `companySlug` indexes.
- Keep `departmentId`, `locationId`, `isRemote` and `city`.
- P1-T07 adds `Job.lastSeenAt` with `@@index([active, lastSeenAt])`.

Notes:
- A plain `DESC` btree index is `NULLS FIRST`, so `publishedAt(sort: Desc)` **cannot** serve `DESC NULLS LAST`.
  These indexes only narrow the `active`/`isListed`(+filter) rows, and Postgres then sorts the matching rows. That is
  cheap at 34k rows, so accept it. If it's needed later, add a raw-SQL index
  `("active","isListed","publishedAt" DESC NULLS LAST,"createdAt" DESC,"id")` via `npx prisma db execute`.
- Search stays a sequential `ILIKE` scan, estimated at 20–40 ms. Use `pg_trgm` only above 200k rows.

### Pagination and connections

- Keep OFFSET pagination: the UI uses numbered pages, and deep pages of the default view come from the cache anyway.
- Use Neon's pooled `-pooler` host with `sslmode=require&connection_limit=3&pool_timeout=10&connect_timeout=10`.
- Add `&pgbouncer=true` only if prepared-statement errors appear on a preview deploy (PgBouncer ≥ 1.22 with
  Prisma ≥ 5.10 shouldn't need it).

**Neon budget rule:** Neon Free gives 100 CU-h/month, and compute suspends after 5 min idle. A DB fallback must be
rare, which is why STALE is preferred over the DB and `/health` never touches the DB by default.

## 8. Environment variables (documented in doc 07 by P2-T09)

| Var | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | Vercel, Actions, local | Neon pooled URL (§7) |
| `REDIS_URL` | Vercel, Actions, local (optional) | `rediss://default:<token>@<host>:<port>` (Upstash) |
| `CORS_ORIGINS` | Vercel | Comma-separated allow-list |
| `HEALTH_TOKEN` | Vercel | Enables `/health?deep=1` |
| `CACHE_GZIP_PASSTHROUGH` | Vercel | `1` to stream stored gzip bytes |
| `CACHE_GEN_MAX_BYTES`, `CACHE_DETAILS_MAX_BYTES`, `CACHE_MAX_MEMORY_BYTES` | Actions | Publisher budgets (03 §2) |
| `VERCEL_TOKEN`, `VERCEL_PROJECT_ID` | Actions (optional) | CDN tag purge after a publish |
| `PORT` | local | `api:start` port, default 3001 |
| `SCRAPE_WORKER_TIMEOUT_MS` | Actions, local | Worker watchdog timeout, default 900000 |
| `TS_NODE_TRANSPILE_ONLY` | Actions | `true`; type-checking runs as its own step |

## 9. Tests

The test plan for these tasks is in [10](./10-testing-and-verification-plan.md) §2.

| Test | Scope | Task |
|---|---|---|
| supertest contract snapshots | Written before the refactor | P1-T16 |
| Parity: DB-path body = gunzipped cached field, byte for byte | ~60-job fixture | P2-T05 |
| Every BYPASS/MISS reason returns 200 with the right headers | Failure-mode tests | P2-T05 |
| `X-Forwarded-Uri` ignored, CORS allow-list, bad id → 404 with no I/O, `page=999999` clamped | Security | P1-T17, P2-T08 |
| Shallow health makes no Prisma call; deep requires the token | `/health` | P2-T07 |
