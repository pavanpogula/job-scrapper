# 05 · Database & Cache

Schema file: [prisma/schema.prisma](file:///Users/pavanreddy/Documents/anti-gravity/job-scrapper/prisma/schema.prisma) ·
Provider: **PostgreSQL** (`DATABASE_URL`) · Client: `prisma-client-js` · Sync method: `npx prisma db push` (no migrations folder).

## 1. ER Diagram

```mermaid
erDiagram
    Company ||--o{ Job : "slug = companySlug"
    Department |o--o{ Job : "id = departmentId"
    Location |o--o{ Job : "id = locationId"

    Company {
        String id PK "uuid()"
        String slug UK "e.g. 1password"
        String name "nullable, = slug today"
        String logoUrl "nullable, never set"
        CompanyStatus status "ACTIVE | NOT_FOUND | REDIRECTED"
        DateTime createdAt
    }
    Department {
        String id PK
        String name UK
    }
    Location {
        String id PK
        String name UK
    }
    Job {
        String id PK "uuid()"
        String ashbyId UK "Ashby job id"
        String title
        String applyUrl
        String companySlug FK
        String departmentId FK "nullable"
        String locationId FK "nullable"
        Float salaryMin "nullable"
        Float salaryMax "nullable"
        String salaryCurrency "nullable"
        Json metadata "raw Ashby job"
        String contentHash "md5"
        Boolean active "default true"
        DateTime createdAt
        DateTime updatedAt "@updatedAt"
    }
```

## 2. Models

### `enum CompanyStatus`
| Value | Set by | Meaning |
|---|---|---|
| `ACTIVE` | default, `Seed.ts` | Scraped by both scrapers |
| `NOT_FOUND` | `Scraper.ts` on HTTP 404 | Excluded from future scrapes (no automatic recovery) |
| `REDIRECTED` | — (unused) | Reserved |

### `Company`
- `slug` is the **natural key** used everywhere (FK target for `Job.companySlug`, Ashby path param).
- `name` is a placeholder = slug; `logoUrl` is never populated.

### `Department` / `Location`
- Lookup tables keyed by unique `name` (raw string from Ashby, e.g. `"Remote"`, `"London, UK"`). Not normalized further
  (no country/city split; `secondaryLocations`, `address`, `workplaceType` aren't modeled).

### `Job`
- `ashbyId` unique → upsert key.
- `metadata` = full raw Ashby job object (incl. `descriptionHtml`, so rows are large). Only written on **create**.
- `contentHash` = `md5("${title}|${location}|${department}|${compensationTier?.min}|${compensationTier?.max}")`.
- `active` is always `true` (nothing sets it false).
- Indexes: `companySlug`, `departmentId`, `locationId`, `active`.
- No `onDelete` cascade → deleting a `Company` requires deleting its jobs first (done in `DbClean.ts`).

## 3. API → DB Field Mapping (in `Scraper.ts`)

| Ashby field | DB column | Notes |
|---|---|---|
| `id` | `Job.ashbyId` | |
| `title` | `Job.title` | updated on change |
| `applyUrl` | `Job.applyUrl` | create only |
| `department` | `Department.name` → `Job.departmentId` | upsert + in-memory cache |
| `location` | `Location.name` → `Job.locationId` | upsert + in-memory cache |
| `compensationTier.min/max/currency` | `salaryMin/Max/Currency` | ⚠️ field doesn't exist → always NULL (see 09 #1) |
| *(entire object)* | `Job.metadata` | create only |
| — | `Job.companySlug` | from the company being scraped |

## 4. Redis Cache

Client: [src/lib/Redis.ts](file:///Users/pavanreddy/Documents/anti-gravity/job-scrapper/src/lib/Redis.ts) (shared singleton).

| Setting | Value |
|---|---|
| URL | `REDIS_URL` or fallback `redis://localhost:6379` (supports `rediss://` e.g. Upstash) |
| `lazyConnect` | `true` — `Scraper.initRedis()` calls `connect()` explicitly |
| Retry | up to 3 retries (50/100/150 ms), then gives up → cache disabled for the run |
| Errors | `ECONNREFUSED` silenced; others logged |

**Key schema**

| Key | Value | TTL | Written | Read |
|---|---|---|---|---|
| `job:{ashbyId}:hash` | md5 content hash | 7 days (604,800 s) | after each 100-job DB batch, via pipeline | `filterChangedJobs()` (one `GET` per job, sequential) |

Only `Scraper.ts` uses Redis. If the key matches the new hash the job is skipped entirely (no DB write). Because TTL is 7
days, every job is re-upserted at least weekly.

> Current `.env` has **no `REDIS_URL`**, so it falls back to localhost; if no local Redis is running, the scraper prints
> `Redis: ⚠️ Disabled` and upserts every job every run.

## 5. Useful SQL (for `db:menu` option 7)

```sql
SELECT "companySlug", COUNT(*) FROM "Job" GROUP BY 1 ORDER BY 2 DESC LIMIT 20;
SELECT status, COUNT(*) FROM "Company" GROUP BY 1;
SELECT title, metadata->'compensation'->>'scrapeableCompensationSalarySummary' AS pay FROM "Job"
 WHERE metadata->'compensation' IS NOT NULL LIMIT 20;
SELECT l.name, COUNT(*) FROM "Job" j JOIN "Location" l ON l.id = j."locationId" GROUP BY 1 ORDER BY 2 DESC LIMIT 20;
```
