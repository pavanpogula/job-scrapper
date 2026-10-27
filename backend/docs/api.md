# Backend API Reference

The **Ashby Job Scraper REST API** is an Express 5 application deployed on Vercel Serverless Functions (`api/index.ts` invoking `src/api/Server.ts`) and served locally via `npm run api:start`. It provides read-through cached endpoints for job search, facets, company directories, metadata, and service health.

---

## 1. Endpoints & Contract

The TypeScript DTOs and query parameters are formally defined in [`src/api/types.ts`](file:///Users/pavanreddy/Documents/anti-gravity/job-scrapper/backend/src/api/types.ts), providing compile-time type safety for all response schemas, request query parameters, and error envelopes.

All API responses use standard JSON payloads and HTTP status codes.

### `GET /v1/jobs`
Returns a paginated list of active and listed jobs matching filter criteria. Includes freshness fields `lastUpdatedAt` (ISO string or null) and `lastUpdatedSource` (`'ashby'`, `'detected'`, `'published'`, or `'firstSeen'`). Legacy rows where `lastUpdatedAt` is null automatically fall back to `publishedAt` with source `'published'`.

- **Parameters:**
  - `page` (number, default: 1): Page number (1-based, max: 5000).
  - `pageSize` (number, default: 25): Results per page (1..100).
  - `source` (string, optional): ATS source filter (`ashby` or `greenhouse`). Unknown values are ignored. Bypasses pre-rendered cache (`isCacheableView: false`).
  - `search` (string, optional): All-words search (BF-020). The text is split into lowercase words (max 8, edge punctuation removed; `c++`, `c#`, `node.js`, `r&d` kept). A job matches when **every** word starts a word in its title, company name, department or location, in any order (`senior engineer` finds "Staff Senior Software Engineer"; `sf` finds "Remote - SF" but not "Transfer"). `%` and `_` match literally. Searches are never served from the pre-rendered cache.
  - `company` (string, optional): Exact company slug filter (case-insensitive, trimmed). Combines with search (BF-020) and other filters. Bypasses pre-rendered cache (`isCacheableView: false`).
  - `postedWithin` (string, optional): One of `1d`, `7d`, `30d`. Filters jobs where `COALESCE(lastUpdatedAt, publishedAt) >= now - window` (ADR-0018 / ADR-0019). Unknown values are ignored. Bypasses pre-rendered cache.
  - `workplaceType` (string, optional): One of `Remote`, `Hybrid`, `OnSite`.
  - `employmentType` (string, optional): e.g. `FullTime`, `PartTime`, `Contract`.
  - `country` (string, optional): ISO-3166-1 alpha-2 code (e.g. `US`, `GB`).
  - `salaryMin` (number, optional): Minimum required salary threshold.
  - `salaryInterval` (string, optional): Ignored unless `salaryMin` is present; e.g. `1 YEAR`, `1 MONTH`.
  - `sortBy` (string, default: `publishedAt`): Sort field (`publishedAt`, `salary`, `company`).
  - `sortOrder` (string, default: `desc`): `asc` or `desc`.

- **Response:**
  ```json
  {
    "data": [
      {
        "id": "e4b52cb5-3d8a-4d2a-89a1-cb9cf540192a",
        "ashbyId": "c7a1e2f3-4b5c-6d7e-8f9a-0b1c2d3e4f5a",
        "source": "ashby",
        "externalId": "c7a1e2f3-4b5c-6d7e-8f9a-0b1c2d3e4f5a",
        "title": "Senior Infrastructure Engineer",
        "department": "Platform Engineering",
        "location": "San Francisco, CA",
        "workplaceType": "Hybrid",
        "employmentType": "FullTime",
        "country": "US",
        "salaryMin": 180000,
        "salaryMax": 240000,
        "salaryCurrency": "USD",
        "publishedAt": "2026-10-20T10:00:00.000Z",
        "lastUpdatedAt": "2026-10-20T10:00:00.000Z",
        "lastUpdatedSource": "published",
        "company": {
          "name": "Acme Corp",
          "slug": "acme-corp",
          "logoUrl": "https://cdn.example.com/acme.png"
        }
      }
    ],
    "page": 1,
    "pageSize": 25,
    "total": 34023,
    "totalPages": 1361
  }
  ```

### `GET /v1/jobs/:id`
Retrieves detailed information for a single job posting by UUID or fallback `ashbyId`.

- **Parameters:**
  - `id` (string, path): UUID or Ashby alphanumeric ID (also accepts `greenhouse:<id>` fallback). Non-UUID strings that cannot match format return 404 immediately with 0 I/O.
- **Response (200):**
  Full job object including `source` (`'ashby'` | `'greenhouse'`), `externalId`, `jobUrl`, `descriptionHtml`, `compensation`, and `company` with `source` and `boardUrl`. `ashbyId` is deprecated; clients should use `source` + `externalId`.
- **Response (404):**
  `{ "error": "Job not found" }` (cached in-process for 10 minutes).

### `GET /v1/facets`
Retrieves aggregated facet counts for filter controls across active jobs.

- **Response:**
  ```json
  {
    "sources": [
      { "value": "ashby", "count": 28400 },
      { "value": "greenhouse", "count": 5623 }
    ],
    "departments": [{ "value": "Engineering", "count": 1420 }],
    "workplaceTypes": [{ "value": "Remote", "count": 2840 }],
    "employmentTypes": [{ "value": "FullTime", "count": 4900 }],
    "countries": [{ "value": "US", "count": 3200 }]
  }
  ```

### `GET /v1/companies`
Paginated directory of active hiring companies.

- **Parameters:**
  - `page` (number, default: 1)
  - `pageSize` (number, default: 20)
  - `search` (string, optional)
  - `sort` (string, optional, default: `name`): `'jobs'` (most **open** jobs first — active and listed only, closed jobs never count — then name, then slug; served from the database, never from the pre-rendered A–Z pages, under its own cache key) or `'name'` (alphabetical by name, then slug).
- **Response:**
  `totalPages` is guaranteed to be at least 1 even when the company collection is empty (Owner decision O5 / BF-021).
  ```json
  {
    "data": [
      {
        "name": "Acme Corp",
        "slug": "acme-corp",
        "source": "ashby",
        "boardUrl": "https://jobs.ashbyhq.com/acme-corp",
        "logoUrl": "https://...",
        "jobCount": 42
      }
    ],
    "page": 1,
    "pageSize": 20,
    "total": 1500,
    "totalPages": 75
  }
  ```

### `GET /v1/companies/:slug`
Retrieves detailed profile information for an active company including job counts, salary availability, latest job publication timestamp, and top 10 departments and locations (ADR-0019). Served as an uncacheable DB view with identical CDN cache headers to `/v1/companies`.

- **Parameters:**
  - `slug` (string, path): Slug matching `/^[a-z0-9_-]{1,100}$/`.
- **Response (200):**
  ```json
  {
    "slug": "acme-corp",
    "name": "Acme Corp",
    "source": "ashby",
    "boardUrl": "https://jobs.ashbyhq.com/acme-corp",
    "logoUrl": "https://...",
    "jobCount": 42,
    "withSalary": 25,
    "latestPublishedAt": "2026-10-25T14:30:00.000Z",
    "workplaceTypes": [
      { "value": "Remote", "count": 25 },
      { "value": "Hybrid", "count": 17 }
    ],
    "employmentTypes": [
      { "value": "FullTime", "count": 42 }
    ],
    "departments": [
      { "value": "Engineering", "count": 30 },
      { "value": "Product", "count": 12 }
    ],
    "locations": [
      { "value": "San Francisco, CA", "count": 20 },
      { "value": "New York, NY", "count": 10 }
    ]
  }
  ```
- **Response (404):**
  `{ "error": "Company not found" }` (returned for non-existent companies, companies not in `ACTIVE` status, or invalid slug format).

### `GET /v1/meta`
Telemetry metadata on job corpus and scrape generation.

- **Response:**
  ```json
  {
    "data": {
      "activeJobs": 34023,
      "hiringCompanies": 1500,
      "withSalary": 12400,
      "lastScrapeAt": "2026-10-24T06:00:00.000Z",
      "generation": "g20261024T060000Z-7f3b"
    }
  }
  ```

### `GET /health`
Shallow health check endpoint (v2 schema) that performs 0 database and 0 Redis operations when warm.

- **Query Parameters:**
  - `deep=1`: Triggers a deep `SELECT 1` database query if and only if header `X-Health-Token` matches `process.env.HEALTH_TOKEN`.
- **Response (200):**
  ```json
  {
    "status": "ok",
    "activeJobs": 34023,
    "version": "cab8afe",
    "time": "2026-10-24T08:00:00.000Z",
    "cache": {
      "configured": true,
      "state": "ok",
      "generation": "g20261024T060000Z-7f3b",
      "builtAt": "2026-10-24T06:05:00.000Z",
      "latencyMs": 1,
      "mode": "double_buffer"
    },
    "data": {
      "lastScrapeAt": "2026-10-24T06:00:00.000Z",
      "ageHours": 2.0,
      "fresh": true,
      "stale": false
    },
    "db": {
      "checked": false
    }
  }
  ```

### Unknown Route Handling (O14 / BF-022)
Any unrecognized route under `/v1/*` returns HTTP 404 with standard JSON envelope `{ "error": "Not found" }` and `Cache-Control: no-store`.

---

## 2. HTTP Headers & CDN Caching

The API communicates cache lifecycle, debugging telemetry, and edge behavior through explicit headers.

| Header | Description / Values |
|---|---|
| `X-Cache` | `HIT` (served from LRU or Redis), `MISS` (served from PostgreSQL), `BYPASS` (cache disabled or degraded), `STALE` (scraped data newer than generation). |
| `X-Cache-Reason` | Sub-reason for cache outcome: `lru_hit`, `redis_hit`, `view_not_cached`, `page_not_cached`, `field_missing`, `not_configured`, `no_generation`, `circuit_open`, `budget_exhausted`. |
| `X-Cache-Generation` | ID of the active Redis generation (`jc:v1:current`). |
| `X-Data-Updated-At` | Timestamp when the underlying scrape run finished. |
| `Server-Timing` | Granular performance metrics (e.g. `redis;dur=4`, `db;dur=18`). |
| `Cache-Control` | Edge and browser caching policy (see matrix below). |
| `Vercel-Cache-Tag` | Purge tag `jobs-v1` attached to cacheable 200 responses. |
| `Retry-After` | Cooldown in seconds emitted on 429 or 503 backpressure. |

### Edge Caching Policy Matrix

| Response | `Cache-Control` Header | `Vercel-Cache-Tag` |
|---|---|---|
| **200 Lists, Facets, Companies, Meta** | `public, max-age=60, s-maxage=300, stale-while-revalidate=3600, stale-if-error=86400` | `jobs-v1` |
| **200 with `X-Cache: BYPASS`** | `public, max-age=30, s-maxage=60, stale-while-revalidate=600` | *(none)* |
| **200 Job Detail** | `public, max-age=300, s-maxage=3600, stale-while-revalidate=86400` | `jobs-v1` |
| **404 Job Detail** | `public, s-maxage=300` | *(none)* |
| **4xx, 5xx, 429, `/health`** | `no-store` | *(none)* |

---

## 3. Read-Through Architecture & Upstash Redis

Cached data is served via `src/api/cache/ReadThrough.ts` backed by Upstash Redis:

```
Request ──► [In-Process LRU (30s TTL)] ──(hit)──► Response (0 I/O)
                     │ (miss)
                     ▼
            [Circuit Breaker / Budget Check]
                     │ (healthy)
                     ▼
            [Upstash Redis (jc:v1:*)] ──(hit)──► Populate LRU ──► Response
                     │ (miss / bypass)
                     ▼
            [DbGuard & singleFlight]
                     │
                     ▼
            [Neon PostgreSQL] ──────────────────► Response (X-Cache: MISS)
```

### Redis Key Schema (`jc:v1:*`)

| Key Pattern | Redis Type | Purpose |
|---|---|---|
| `jc:v1:current` | `string` | Pointer storing current generation ID (`g<timestamp>-<hash>`). |
| `jc:v1:meta:lastScrapeAt` | `string` | ISO timestamp of the last completed scrape. |
| `jc:v1:meta:lastPublish` | `string` | JSON record with timing and shard metrics from the last publish. |
| `jc:v1:lock:publish` | `string` | 10-minute mutex preventing concurrent generation publishes. |
| `jc:v1:gen:<gen>` | `hash` | Precomputed views: `__manifest`, `meta`, `facets`, `companies?page=N`, canonical `jobs?<query>`. Values are gzip compressed. |
| `jc:v1:details:<shard>` | `hash` | Sharded job detail blobs (8 shards, 0..7) partitioned via `CRC32(job.id) % 8`. |
| `jc:v1:details:index` | `hash` | Secondary index mapping `ashbyId` to `job.id` for fast detail routing. |

---

## 4. Backpressure & Concurrency Control

### DB Guard (`src/api/middleware/dbGuard.ts`)
To protect serverless database connections during cache misses or cold starts:
- **Max Active Queries:** 3 concurrent database executions.
- **Queue Capacity:** 10 waiting requests.
- **Overflow Policy:** Excess requests immediately receive `503 Service Unavailable` with `Retry-After: 5`.

### Single-Flight Query Deduplication
Identical database queries occurring simultaneously are coalesced into a single database round-trip via `singleFlight(key, fn)`. Subsequent callers await the same in-flight Promise.

### Circuit Breaker (`src/api/cache/Breaker.ts`)
Tracks consecutive Redis errors:
- Tripped after 3 consecutive errors.
- Enters 30s cooldown before attempting a single probe request (`HALF_OPEN`).
- Automatically trips on Upstash quota limit errors (`budget_exhausted`).

---

## 5. PostgreSQL Fail-Safe & Connection Pooling

When Redis is disabled or experiencing cache misses, queries fall back to Neon PostgreSQL.

### Pooled Connections in Serverless
Vercel serverless functions must connect through the Neon pooled endpoint to prevent pool exhaustion:
```
postgresql://[user]:[password]@[host]-pooler.[region].neon.tech/[dbname]?sslmode=require&pgbouncer=true
```

### Critical Composite Indexes
The database uses specialized composite btree indexes for efficient sorting and filtering:
- `@@index([active, isListed, publishedAt(sort: Desc), createdAt(sort: Desc), id])`
- `@@index([active, isListed, workplaceType, publishedAt(sort: Desc)])`
- `@@index([active, isListed, employmentType, publishedAt(sort: Desc)])`
- `@@index([active, isListed, country, publishedAt(sort: Desc)])`
- `@@index([companySlug, active])`

---

## 6. Local Development & Testing

### Running the API Locally
```bash
npm run api:start
```
The server listens on `http://localhost:3001`. The Vite frontend proxy routes `/v1/*` and `/health` directly to this port during UI development.

### Running Test Suites
```bash
# Server endpoint and snapshot tests
npm --prefix backend test -- backend/tests/unit/ApiServer.test.ts

# Shallow health and meta tests
npm --prefix backend test -- backend/tests/unit/HealthMeta.test.ts

# Edge caching, CORS, and hardening tests
npm --prefix backend test -- backend/tests/unit/Hardening.test.ts

# Read-through cache integration tests
npm --prefix backend test -- backend/tests/unit/ReadThrough.test.ts

# API contract fixture and cache HIT == MISS parity tests
npm --prefix backend test -- tests/contract/ContractFixtures.test.ts
```

### Contract Fixtures & Parity Testing
Golden contract fixtures are generated from supertest against Express with deterministic fake timers and seeded mocks:
```bash
# Generate/update contract fixtures
npm --prefix backend run contract:fixtures

# Sync fixtures to frontend byte-for-byte
node scripts/contract/sync-fixtures.mjs
```
The test suite in `backend/tests/contract/ContractFixtures.test.ts` validates deterministic endpoint output shapes and guarantees cache HIT == MISS parity (BF-019). The repo-level guard `scripts/repo-tests/contract-sync.test.mjs` verifies that frontend fixtures remain in byte-for-byte lockstep with backend fixtures.
