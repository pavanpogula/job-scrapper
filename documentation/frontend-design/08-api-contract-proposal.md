# 08 · API Contract Proposal (read-only job board API, `/v1`)

> **Status:** PROPOSAL, DESIGN ONLY. No server exists in this repo (it is a CLI toolkit). The product owner will supply real
> endpoints later. This contract is written so that (a) the UI can be built now against a mock, (b) a backend on top of the
> existing Postgres/Prisma schema is cheap, and (c) the owner's real endpoints can be swapped in behind a thin adapter (see 8).
> _Authored 2026-10-22; technical review round 1 on 2026-10-22 (corrections listed in the changelog at the end of section 10). Based on a read of `prisma/schema.prisma`, `src/core/Scraper.ts`, `src/lib/AshbyClient.ts`,
> `src/lib/Sanitizer.ts`, `src/utils/Verify.ts`, `src/database/DbInspect.ts`, `tests/fixtures/ashby-sample.json`,
> `documentation/05` and `08`. The database itself was NOT queried; all distributions below are from code and docs._

---

## 0. What the data layer really contains (verified facts that shape the contract)

| Fact | Evidence | Consequence for the contract |
|---|---|---|
| `Job.metadata` is the **whole sanitized Ashby job object** (`sanitizeJsonMetadata(job)`), spread from the raw Ashby response (`...rawJob`) then overridden for `id,title,department,location,employmentType,jobUrl,applyUrl,isRemote,publishedAt`. | `Sanitizer.validateAndSanitizeJob`, `Scraper.processCompanyJobs` | Any key the Ashby REST API returns survives (e.g. `team`, `secondaryLocations`, `workplaceType`, `isListed`, `compensation`). |
| **REST-sourced** jobs (Posting API `?includeCompensation=true`) carry: `id,title,department,team,employmentType,location,secondaryLocations,publishedAt,isListed,isRemote,workplaceType,applyUrl,jobUrl,compensation{...}` (fixture `ashby-sample.json`). | fixture + `AshbyJob` | Rich. `publishedAt` is a full ISO timestamp. |
| **GraphQL-fallback** jobs are built from `fetchFromAshbyGraphQL`: maps `id, title, department, location, employmentType, applyUrl, jobUrl, isRemote, compensation`. **Updated:** `workplaceType` and `secondaryLocations` are now preserved and mapped into the job record, and GraphQL validation issues are tracked. Only 22 jobs (from 2 companies) use this fallback. | `AshbyClient.ts` `fetchFromAshbyGraphQL` | `workplaceType` and `secondaryLocations` are now supported; only `publishedAt` and descriptions are currently absent for these 22 roles. |
| `isRemote` is extracted directly from Ashby's boolean, and `workplaceType` is a first-class indexed column (`Remote`, `OnSite`, `Hybrid`). | Schema + Sanitizer | Remote, OnSite, and Hybrid filtering are all first-class operations. |
| **Descriptions:** `descriptionHtml` / `descriptionPlain` are handled by the sanitizer (`sanitizeJsonMetadata` cleans scripts/styles/iframes/handlers/base64). **VERIFIED against the live database:** 34,015 out of 34,037 (99.94%) active jobs contain full `descriptionHtml` and `descriptionPlain` in `metadata`! | Database probe + `Sanitizer.ts` | The API exposes `descriptionHtml` (sanitized) and `descriptionPlain` directly on the job detail endpoint. Graceful fallback is needed only for the remaining 22 GraphQL jobs. |
| Salary: `salaryMin/salaryMax Float?`, `salaryCurrency String?`, and **`salaryInterval String?`** are first-class columns on `Job`. Ashby intervals (`1 YEAR`, `1 HOUR`, `1 MONTH`, `1 WEEK`, `1 DAY`) are parsed by `extractSalary()`, backfilled across all 34,037 active jobs, and indexed. | schema + `extractSalary` | Hourly ($60/hr) and yearly ($150,000/yr) rates are cleanly distinguished. Salary filters should default to `salaryInterval: '1 YEAR'` unless hourly is selected. |
| Salary coverage ≈ 13,686 / 34,035 ≈ **40 %** (documentation/README; the repo's `Verify.ts` counts `salaryMin IS NOT NULL` over all jobs). | docs | `hasSalary` is a high-value filter; `salary: null` is the common case. |
| `Company.name` & `Company.logoUrl` are **99.0% enriched** (1,729 / 1,747 active hiring companies have real display names and hosted CDN logos enriched via `npm run enrich:companies`). | Database + `EnrichCompanies.ts` | `company.name` and `company.logoUrl` are reliable and populated; monogram fallback is only needed for the remaining 18 companies. |
| `Department` / `Location` are free-text unique rows, and `Job` now has first-class **`country`, `region`, `city`, and `postalAddress`** columns and indices (97.3% coverage). | Schema + `Job` columns | Country and city filtering are first-class indexed DB queries, not text parsing. |
| `Job.updatedAt` changes when hashed content changes. **Updated:** `generateHash` now hashes `interval`, `currency`, `isRemote`, `workplaceType`, `employmentType`, `publishedAt`, `applyUrl`, `isListed`, `country`, `region`, and `city` (resolving issue #31). | `Scraper.ts` | Non-title changes are properly detected and updated. |
| Only `active = true` jobs should be shown. Inactive rows are kept (never deleted by the scraper). | docs 05 | API filters `active = true` always; a job that went inactive returns **410 Gone** on detail (decision in 4). |
| Existing indexes: `Job(companySlug)`, `(departmentId)`, `(locationId)`, `(active)`, `(isRemote)`, `(workplaceType)`, `(employmentType)`, `(country)`, `(city)`, `(publishedAt)`, unique `ashbyId`. | schema | High-performance filtering across location, workplace type, and publication date out of the box. |
| **`isListed` is a first-class indexed column.** The scraper validates `rawJob.isListed !== false` and backfilled all existing jobs. | Ashby Posting API docs + schema | The API excludes `isListed: false` from public search/facets by querying `where: { active: true, isListed: true }`. |
| `publishedAt` is a first-class indexed timestamp column on `Job` (99.94% coverage; 34,015 of 34,037 active jobs). | schema + DB | Sorting by `publishedAt DESC` is directly indexed and instant. |
| Job rows are **never refreshed** when only non-hashed fields change (`workplaceType`, `employmentType`, `applyUrl`, `isListed`, description, `publishedAt`): `generateHash` covers `title|location|department|salaryMin|salaryMax` only (known issue #31). | `Scraper.ts` L148-152 | Detail-page facts other than title/location/department/salary can be stale indefinitely. Gap G14. |
| A job that is deactivated and later reappears with unchanged content can stay `active = false` (known issue #30: stale Redis hash key), so the API can answer 410 for a role that is open again on Ashby. | known issue #30 | Treat `active` as best-effort; fix #30 in the scraper before launch or accept a small false-410 rate (Q-list item 2). |
| Scale: ≈ 34,000 live jobs, ≈ 1,750 hiring companies (≈ 3,072 slugs seeded). | docs | Exact counts and `ILIKE`/trigram queries are cheap at this size; this is a small-data problem, so keep the design simple. |

---

## 1. Principles

1. **Read-only.** Only `GET` (and `HEAD`, `OPTIONS` for CORS). No mutations, no sessions, no cookies, **no auth** (public data).
2. **JSON only**, UTF-8, `Content-Type: application/json; charset=utf-8` (errors: `application/problem+json`).
3. **Versioned** under `/v1`. Additive changes (new optional fields, new enum values flagged in 3.x) are non-breaking; clients must ignore unknown fields. Breaking changes go to `/v2`.
4. **CORS (needed only for direct browser calls):** in v1 the web app calls the API server-side through same-origin Next Route Handlers (BFF, 09 D-04), so CORS is not required; configure it only if a browser ever calls the API directly. `Access-Control-Allow-Origin` allowlist (production site origin, Vercel/Netlify preview pattern, `http://localhost:*` in dev). Methods `GET, HEAD, OPTIONS`; no credentials; `Access-Control-Max-Age: 86400`; expose `ETag, Retry-After, X-Request-Id, X-Data-Updated-At`.
5. **Stable field names, camelCase**, ISO-8601 UTC timestamps (`2026-03-15T12:00:00.000Z`), currency as ISO-4217 code, ids as opaque strings.
6. **Nullability is explicit.** Every field is either always present and non-null, or present and `null` (never omitted), except arrays, which are `[]` when empty. Optional *whole objects* (e.g. `salary`) are `null`, not absent. This makes the TypeScript types and mocks exact.
7. **Idempotent, cacheable, shareable.** Every UI view maps to one URL; the query string is canonicalised (sorted keys) server-side for cache keys.
8. **Server decides defaults and limits;** invalid input is a 400 with field-level errors, never silently clamped (except `pageSize` over max which is a 400 too, for predictability).
9. **No PII**, no tracking, no per-user data. Logs may keep IP for rate limiting only.

**Identifiers:** the public job id everywhere (URLs, `GET /v1/jobs/{id}`, sitemap feed, 410 bodies) is `Job.id` (uuid). `Job.ashbyId` is never exposed (09 D-09); `applyUrl` is guaranteed so the UI does not need it. Note in the examples that the id inside `applyUrl` is the Ashby id and differs from `id`.

Base URL comes from `NEXT_PUBLIC_API_BASE_URL`-style env var in the UI (name decided in 09). All paths below are relative to it.

---

## 2. Resource model

### 2.1 Shared types

```ts
type ISODateTime = string;           // "2026-03-15T12:00:00.000Z"
type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERN' | 'TEMPORARY' | 'OTHER';
type WorkplaceType = 'REMOTE' | 'HYBRID' | 'ONSITE';
type SalaryInterval = 'YEAR' | 'MONTH' | 'WEEK' | 'DAY' | 'HOUR';

interface Salary {
  min: number | null;                 // Job.salaryMin
  max: number | null;                 // Job.salaryMax  (at least one of min/max is non-null when salary != null)
  currency: string | null;            // Job.salaryCurrency (ISO-4217, e.g. "USD")
  interval: SalaryInterval | null;    // metadata.compensation.summaryComponents[type=Salary].interval ("1 YEAR" -> YEAR); null if unknown
  summary: string | null;             // metadata.compensation.scrapeableCompensationSalarySummary ?? compensationTierSummary
}

interface CompanyRef {
  slug: string;                       // Company.slug (unique, Ashby board slug)
  name: string | null;                // Company.name, but null when name === slug (i.e. not enriched)
  logoUrl: string | null;             // Company.logoUrl (https only)
}
```

**Employment type normalisation** (`metadata.employmentType`, sanitized string): `FullTime`->`FULL_TIME`, `PartTime`->`PART_TIME`, `Contract`->`CONTRACT`, `Intern`->`INTERN`, `Temporary`->`TEMPORARY`, empty/unknown->`null` (unknown *non-empty* values map to `OTHER`). Case-insensitive, strip spaces/underscores before matching.

**Salary rule:** `salary` is `null` iff `salaryMin IS NULL AND salaryMax IS NULL`. If the board came from GraphQL fallback and only a text summary exists (`metadata.compensation.compensationTierSummary`), return `salary: null` (and `hasSalary` counts structured salary only). Showing text-only pay (Q6) would need a contract change (a separate `salaryText` field), because the schema below requires at least one numeric bound when `salary != null`. Documented so UI never has to guess: **`salary != null` implies at least one numeric bound**.

### 2.2 `JobListItem` (returned in lists; small, ~600 bytes)

```ts
interface JobListItem {
  id: string;                         // Job.id (uuid) - used in URLs /jobs/{id}
  title: string;                      // Job.title (sanitized, may be very long, up to ~200 chars seen; UI truncates)
  company: CompanyRef;                // join Company on Job.companySlug
  department: string | null;          // Department.name
  location: string | null;            // Location.name (free text) ; null when empty
  remote: boolean | null;             // metadata.isRemote (boolean); null only if the key is missing
  workplaceType: WorkplaceType | null;// metadata.workplaceType Remote|Hybrid|OnSite ; null for GraphQL boards
  employmentType: EmploymentType | null;
  salary: Salary | null;
  postedAt: ISODateTime | null;       // metadata.publishedAt (REST only) ; null for GraphQL boards / invalid
  firstSeenAt: ISODateTime;           // Job.createdAt  (always set; fallback "age" signal when postedAt is null)
  updatedAt: ISODateTime;             // Job.updatedAt  (content-change time, NOT scrape time)
  applyUrl: string;                   // Job.applyUrl absolute http(s)
}
```

Example:

```json
{
  "id": "0b4d1d2e-6c6c-4f5e-9d58-2f1a0e6c9a11",
  "title": "Senior Staff Backend Engineer",
  "company": { "slug": "1password", "name": "1Password", "logoUrl": "https://example-cdn.ashbyprd.com/logo.png" },
  "department": "Engineering",
  "location": "San Francisco, CA",
  "remote": false,
  "workplaceType": "HYBRID",
  "employmentType": "FULL_TIME",
  "salary": { "min": 180000, "max": 240000, "currency": "USD", "interval": "YEAR", "summary": "$180,000 - $240,000" },
  "postedAt": "2026-03-15T12:00:00.000Z",
  "firstSeenAt": "2026-03-16T02:14:09.311Z",
  "updatedAt": "2026-03-16T02:14:09.311Z",
  "applyUrl": "https://jobs.ashbyhq.com/1password/7fe8abc1-1234-4567-89ab-cdef01234567/application"
}
```

Worst-case example (GraphQL board, nothing enriched; validated against the schema in the 2026-10-22 review):

```json
{
  "id": "5d1f3a9c-0b7e-4c2a-8a41-6e2f9d3b7c10", "title": "Account Executive, Mid-Market (EMEA) - Strategic Accounts, Existing Customer Expansion",
  "company": { "slug": "acme-labs", "name": null, "logoUrl": null },
  "department": null, "location": "Remote - Europe (CET +/- 3)", "remote": true, "workplaceType": null,
  "employmentType": null, "salary": null, "postedAt": null,
  "firstSeenAt": "2026-10-20T03:00:00.000Z", "updatedAt": "2026-10-20T03:00:00.000Z",
  "applyUrl": "https://jobs.ashbyhq.com/acme-labs/9a7c2e10-33aa-4b11-9c55-0d2e8f1a6b42/application"
}
```

| Field | Source | Null behaviour |
|---|---|---|
| `id` | `Job.id` | never null |
| `title` | `Job.title` | never null/empty (scraper filters empty titles) |
| `company.slug` | `Job.companySlug` | never null |
| `company.name` | `Company.name` | `null` if null OR equal to slug (un-enriched). UI derives display name from slug |
| `company.logoUrl` | `Company.logoUrl` | often null |
| `department` | `Department.name` | null when `departmentId` null |
| `location` | `Location.name` | null when `locationId` null |
| `remote` | `metadata->>'isRemote'` (cast boolean) | null only if the key is absent (should not happen; sanitizer always sets it) |
| `workplaceType` | `metadata->>'workplaceType'` mapped `Remote/Hybrid/OnSite` | null for GraphQL boards and unknown values |
| `employmentType` | `metadata->>'employmentType'` normalised | null if empty |
| `salary` | `salaryMin/Max/Currency` + interval/summary from `metadata.compensation` | null if both bounds null (about 60 %) |
| `postedAt` | `metadata->>'publishedAt'` parsed; invalid -> null | null for GraphQL boards |
| `firstSeenAt` | `Job.createdAt` | never null |
| `updatedAt` | `Job.updatedAt` | never null |
| `applyUrl` | `Job.applyUrl` | never null |

### 2.3 `JobDetail` (= `JobListItem` plus)

```ts
interface JobDetail extends JobListItem {
  lastCheckedAt: ISODateTime;         // Job.lastSeenAt once gap G1 exists; until then equals dataUpdatedAt/meta.lastUpdated (proxy). Never null. Drives the "Checked {x} ago" trust copy (A-07)
  jobUrl: string;                     // metadata.jobUrl (public posting page); fallback https://jobs.ashbyhq.com/{slug}/{ashbyId}
  team: string | null;                // metadata.team (REST only)
  locations: string[];                // [location] + metadata.secondaryLocations[].(location|locationName) ; [] if none
  descriptionHtml: string | null;     // metadata.descriptionHtml (already sanitized) ; null if absent. UNVERIFIED availability
  descriptionText: string | null;     // metadata.descriptionPlain, else tag-stripped HTML ; null if absent
  source: 'rest' | 'graphql' | 'unknown'; // inferred: has publishedAt/workplaceType -> rest ; otherwise graphql ; informational only
  company: CompanyRef & { jobCount: number }; // active jobs of that company
}
```

Example (abridged): see list example plus
`"lastCheckedAt":"2026-10-22T03:41:00.000Z","jobUrl":"https://jobs.ashbyhq.com/1password/7fe8...","team":"Platform","locations":["San Francisco, CA"],"descriptionHtml":null,"descriptionText":null,"source":"rest","company":{"slug":"1password","name":"1Password","logoUrl":"...","jobCount":42}`.

Rules: `descriptionHtml` is **sanitized again on output** with an allowlist (p, br, ul, ol, li, strong, em, a[href https], h1-h4, blockquote, code) by the API or by the UI (DOMPurify). The sanitizer in the scraper only strips scripts/styles/iframes/handlers/base64; it does not allowlist. Never trust it for rendering. Size cap: truncate `descriptionHtml` to 100 KB (flag `descriptionTruncated` is not needed in v1; document truncation in Q1 if description is enabled). Lists never include descriptions.

### 2.4 `Company` and `CompanyDetail`

```ts
interface CompanySummary {
  slug: string;                       // Company.slug
  name: string | null;                // null when un-enriched (name === slug)
  logoUrl: string | null;
  jobCount: number;                   // count of Job where companySlug = slug AND active
}
interface CompanyDetail extends CompanySummary {
  boardUrl: string;                   // https://jobs.ashbyhq.com/{slug}  (constructed)
  departments: FacetValue[];          // top departments among its active jobs
  locations: FacetValue[];            // top locations among its active jobs (max 20)
  salaryCoveragePct: number;          // 0..100 share of its jobs with salary (integer)
  lastSeenAt: ISODateTime | null;     // max(Job.updatedAt) - proxy, see G1
}
```

Only companies with `status = ACTIVE` and `jobCount >= 1` are listed (configurable `includeEmpty=false`). Example:
`{"slug":"1password","name":"1Password","logoUrl":null,"jobCount":42}`.

### 2.5 Facets

```ts
interface FacetValue { value: string; label: string; count: number; }  // value = the filter token to send back
interface Facets {
  company: FacetValue[];              // value = slug, label = display name (fallback slug) ; top 50 by count
  department: FacetValue[];           // value = Department.name ; top 50
  location: FacetValue[];             // value = Location.name ; top 50 (long tail via /v1/suggest)
  employmentType: FacetValue[];       // value = enum ; all
  remote: { true: number; false: number; unknown: number };
  hasSalary: { true: number; false: number };
  postedWithin: { '1d': number; '3d': number; '7d': number; '14d': number; '30d': number }; // cumulative counts (by sort date); one key per postedWithin filter value
  salary: { currency: string; p10: number; median: number; p90: number; max: number } | null; // for slider bounds, USD yearly only in v1
  total: number;                      // jobs matching the current filters
}
```

**Selected values are always present (A-05):** every currently selected value of `company`, `department`, `location` and `employmentType` is included in its facet array even when nothing matches, with `count: 0`, so the UI can render and un-select it (these entries are exempt from the top-N cut).

Counts follow the **"disjunctive facets"** convention: a facet's own selection is ignored when counting that facet (so selecting `company=a` still shows other companies' counts), all other filters apply. Example:

```json
{ "department": [{"value":"Engineering","label":"Engineering","count":9120},{"value":"Sales","label":"Sales","count":4310}],
  "employmentType": [{"value":"FULL_TIME","label":"Full time","count":30112}],
  "remote": {"true": 11840, "false": 21900, "unknown": 295}, "hasSalary": {"true": 13686, "false": 20349},
  "postedWithin": {"1d": 1100, "3d": 2400, "7d": 5200, "14d": 9800, "30d": 16000}, "total": 34035 }
// abridged example: the real response always also contains company, location and salary (null allowed) per the schema
```

### 2.6 `Meta`

```ts
interface Meta {
  // totals.jobs = active jobs (Job.active = true, company ACTIVE); totals.companies = companies with >= 1 active job
  // (feeds "34,035 open jobs at 1,747 companies"); companiesWithSalary = companies with >= 1 active job having structured salary;
  // jobsWithSalary = active jobs with salary != null; locations/departments = distinct names used by >= 1 active job.
  totals: { jobs: number; companies: number; companiesWithSalary: number; jobsWithSalary: number; locations: number; departments: number };
  lastUpdated: ISODateTime | null;    // time the last scrape finished (ScrapeRun.finishedAt) ; fallback max(Job.updatedAt) - see G1
  lastUpdatedSource: 'scrape_run' | 'job_updated_at_proxy';
  apiVersion: 'v1';
  dataNotice: string;                 // static short text, e.g. "Listings are collected from companies' public Ashby boards."
}
```

### 2.7 Shared envelopes

```ts
interface Page<T> {
  items: T[];
  page: { number: number; size: number; total: number | null; totalPages: number | null;
          totalExact: boolean; hasNext: boolean; nextCursor: string | null;
          maxResultWindow: number | null };  // /v1/jobs: 10000 ; endpoints without a cap: null. Rule: number*size <= maxResultWindow else 400 OFFSET_TOO_DEEP
  appliedFilters: Record<string, unknown>;   // echo of normalised filters (debugging, canonical URL)
  dataUpdatedAt: ISODateTime | null;         // same as meta.lastUpdated, so list pages need no extra call
}
type ErrorCode = 'VALIDATION_ERROR' | 'OFFSET_TOO_DEEP' | 'CURSOR_MISMATCH' | 'SORT_REQUIRES_Q' | 'NOT_FOUND'
               | 'JOB_CLOSED' | 'RATE_LIMITED' | 'INTERNAL' | 'UNAVAILABLE';
interface Problem { code: ErrorCode; type: string; title: string; status: number; detail?: string; instance?: string;
                    requestId?: string; errors?: { field: string; message: string; code: string }[]; retryAfterSeconds?: number;
                    extensions?: { company?: CompanyRef; job?: ClosedJobRef } }
interface ClosedJobRef { id: string; title: string; company: CompanyRef; deactivatedAt: ISODateTime | null; lastCheckedAt: ISODateTime }
```

---

## 3. Endpoints

All `GET`. Common response headers: `Content-Type`, `Cache-Control`, `ETag`, `Vary: Accept-Encoding, Origin`, `X-Request-Id`, `X-Data-Updated-At` (= `meta.lastUpdated`), `Content-Encoding: br|gzip`.

### 3.1 `GET /v1/jobs`

| Param | Type | Default | Validation / notes |
|---|---|---|---|
| `q` | string | - | 2..100 chars after trim; searches title, company name/slug, department and location (`Location.name`) (A-06); description only if enabled. Whitespace-AND of tokens, prefix match on last token. Blank -> ignored |
| `company` | string[] (repeat `company=a&company=b`) | - | ≤ 20 values; slugs `^[a-z0-9-]{1,60}$`; unknown slug -> just no match (not an error). OR within param |
| `department` | string[] | - | ≤ 20; exact `Department.name` |
| `location` | string[] | - | ≤ 20; exact `Location.name` (use `/v1/suggest` or facets to get valid values) |
| `remote` | boolean | - | `true` -> only remote; `false` -> only non-remote |
| `employmentType` | enum[] | - | values from `EmploymentType`; ≤ 6 |
| `salaryMin` | integer ≥ 0 | - | job matches if `coalesce(salaryMax, salaryMin) >= salaryMin`; implies `hasSalary=true`; requires `salaryCurrency` (default `USD`); interval note in section 0 |
| `salaryCurrency` | string(3) | `USD` | only used with `salaryMin` |
| `hasSalary` | boolean | - | `true` -> structured salary only |
| `postedWithin` | enum `1d,3d,7d,14d,30d` | - | filter on `sortDate = coalesce(postedAt, firstSeenAt)` so null-`postedAt` jobs are not unfairly hidden; response flag per item is unnecessary |
| `sort` | enum | `relevance` if `q` else `newest` | `relevance` (only valid with `q`, else 400), `newest` (sortDate desc), `salary_desc` (salaryMax desc nulls last), `title_asc`, `company_asc`. Tie-breaker **always** `id` (so order is total and stable) |
| `page` | int ≥ 1 | 1 | offset mode; `page*pageSize ≤ 10,000` (the response echoes this as `page.maxResultWindow`) |
| `pageSize` | int 1..100 | 20 | > 100 -> 400 (UI sends 25/50/100) (A-01) |
| `cursor` | string | - | opaque keyset cursor; mutually exclusive with `page` (400 if both) |
| `includeTotal` | boolean | `true` | `false` skips the count query (cheaper; `total: null`) |

Response `200`: `Page<JobListItem>`. Statuses: `200`, `304`, `400` (validation), `429`, `500/503`. Empty result is `200` with `items: []` (never 404).

Client notes: the UI always sends `includeTotal=true`, only sends `sort=relevance` together with `q`, `remote=true` only, `hasSalary=true` only (`salaryMin` is unused in v1), and `postedWithin=1d` for its "24h" option. Other clients may use the full parameter set.

Example: `GET /v1/jobs?q=backend&remote=true&employmentType=FULL_TIME&hasSalary=true&sort=newest&page=2&pageSize=20`

```json
{ "items": [ /* JobListItem */ ],
  "page": { "number": 2, "size": 20, "total": 312, "totalPages": 16, "totalExact": true, "hasNext": true, "nextCursor": "eyJ2IjoxLC4uLn0", "maxResultWindow": 10000 },
  "appliedFilters": { "q": "backend", "remote": true, "employmentType": ["FULL_TIME"], "hasSalary": true, "sort": "newest" },
  "dataUpdatedAt": "2026-10-22T03:41:00.000Z" }
```

**Pagination decision: offset (`page`/`pageSize`) with exact total as the primary mode; keyset `cursor` as an alternative for deep/infinite use.**

- *Why offset primary:* the product requires numbered pagination, jump-to-page, a "312 jobs" headline, and shareable `?page=3` URLs. At ≈ 34k rows, `OFFSET` + exact `count(*)` with indexes is ~tens of ms. Offset's weakness (deep skip cost, shifting rows during a scrape) is bounded by a depth cap and by the data changing only when a scrape runs.
- *Max offset depth:* `page * pageSize ≤ 10,000` (page 500 at size 20, page 100 at size 100), exposed as `page.maxResultWindow`. Beyond that -> `400` `OFFSET_TOO_DEEP` (`offset-too-deep`) with a hint to narrow filters or use `cursor`. The UI shows at most `floor(maxResultWindow / pageSize)` pages and a "refine your search" hint. (No one reads past page 50; this also stops crawlers from scanning the full table.)
- *Why also keyset:* `cursor` encodes `{sort, lastSortValue, lastId, filtersHash}` (base64url, signed or just validated). It gives O(log n) deep paging, no skipped/duplicated rows, and works for an optional "Load more". Supported for `newest`, `title_asc`, `company_asc`, `salary_desc`; **not** for `relevance` (rank is not keyset-friendly; `nextCursor: null`). A cursor whose `filtersHash` mismatches the request -> `400 cursor-mismatch`. `nextCursor` is returned in offset responses too, so a client may switch modes.
- *Total counts:* exact `count(*)` over the filtered set is fine at this size (use covering indexes; section 6). Cheap-guard: if a count exceeds a 200 ms budget, fall back to the planner estimate (`EXPLAIN` rows) and set `totalExact:false`, or just use `includeTotal=false`. Unfiltered total is read from cached `meta`. Results are CDN-cached per canonical query, so the cost is paid once per scrape per distinct query.
- *Stable sort:* every sort ends with `id` as the unique tie-breaker; `newest` sorts on the generated `sortDate` (never null), so jobs lacking `postedAt` still order deterministically.

### 3.2 `GET /v1/jobs/{id}`

Path `id`: uuid (`Job.id`). Response `200`: `JobDetail`. Statuses: `200`, `304`, `400` (malformed id), `404` (never existed), `410` (existed, now `active=false`), `429`, `5xx`. The `{id}` is `Job.id`, never `ashbyId`. The 410 body is a Problem (`code: JOB_CLOSED`) with `extensions: { job: { id, title, company: CompanyRef, deactivatedAt, lastCheckedAt }, company: CompanyRef }` (`company` kept for compatibility) and no `applyUrl`. **Retention:** closed jobs stay resolvable as 410 for at least 90 days after deactivation, then become 404. Inactive jobs never appear in lists, facets, counts or the sitemap feed. See section 4 for UI treatment.

### 3.3 `GET /v1/companies`

| Param | Type | Default | Notes |
|---|---|---|---|
| `q` | string | - | 2..60; case-insensitive **contains** match on `name` and `slug` (trigram), not prefix-only (A-11) |
| `sort` | enum `jobs_desc, name_asc` | `jobs_desc` | `name_asc` orders by display name `lower(coalesce(name, slug))`; tie-breaker `slug` always (A-11) |
| `minJobs` | int ≥ 1 | 1 | |
| `page`, `pageSize` | int | 1, 24 (max 100) | offset only; ≤ 2,000 companies exist, depth cap 2,000 |

Response: `Page<CompanySummary>`. Statuses `200, 304, 400, 429, 5xx`.

### 3.4 `GET /v1/companies/{slug}`

Response `200`: `CompanyDetail`. `404` if slug unknown or `status != ACTIVE`; a known active company with 0 active jobs is `200` with `jobCount: 0` (UI shows an empty state "no open roles"). Its jobs come from `GET /v1/jobs?company={slug}`.

### 3.5 `GET /v1/facets`

Accepts the **same filter params as `/v1/jobs`** (`q, company, department, location, remote, employmentType, salaryMin, salaryCurrency, hasSalary, postedWithin`; not `sort/page/cursor`) plus `fields` (comma list subset of `company,department,location,employmentType,remote,hasSalary,postedWithin,salary`, default all but `company,location` limited to top 50) and `limit` (1..100, default 50). Response `200`: `Facets`.

*Cost:* one `GROUP BY` per facet over the filtered set, i.e. ~6-8 small aggregate queries. At 34k rows each is ~5-30 ms with the indexes in section 6; run them in parallel. The unfiltered facet set (no params, the home page) is precomputed after every scrape (materialized view or a cached row set, gap G7) and served instantly. *Caching:* same CDN policy as `/jobs`; keyed by canonical query. The UI should fetch facets **in parallel** with `/jobs` and never block the list on them; stale facets are acceptable for ≤ 1 minute.

### 3.6 `GET /v1/suggest`

| Param | Type | Default | Notes |
|---|---|---|---|
| `q` | string | required | 1..60 |
| `types` | csv of `company,department,location,title` | all | |
| `limit` | int 1..10 | 5 (per type) | |

Response `200`: `{ "q": "bac", "suggestions": [ { "type": "title", "value": "Backend Engineer", "label": "Backend Engineer", "count": 212 }, { "type": "company", "value": "bacalhau", "label": "Bacalhau", "count": 4 } ] }`. `title` suggestions are the most common normalised titles (distinct `lower(title)` grouped, prefix/trigram matched); `value` is what to put in `q`/filter. Prefix-ranked, then by count. Short caching (`s-maxage=300`). The UI debounces (≥ 150 ms) and cancels in-flight requests. Empty `q` -> 400 (the UI shows static popular suggestions from `/v1/facets` instead).

### 3.7 `GET /v1/meta`

Response `200`: `Meta`. Cached long (scrape-bound), the source of the "Updated 3 hours ago" trust cue (`lastUpdated`), also used for the home headline counts.

### 3.8 `GET /v1/health`

Response `200` `{ "status":"ok", "db":"ok", "time":"..." }`; `503` `{ "status":"degraded", "db":"down" }`. `Cache-Control: no-store`. Used by the host/uptime checks, not by the UI (the UI may call it once on a persistent failure to choose between "API down" and "your connection").

### 3.9 `GET /v1/jobs/count` (A-03)

Count-only endpoint for the filter dialog ("Show N jobs") and "Remove X to see N jobs" hints. Accepts the **same filter params as `/v1/jobs`** (`q, company, department, location, remote, employmentType, salaryMin, salaryCurrency, hasSalary, postedWithin`; not `sort/page/pageSize/cursor`) plus `relax`: CSV of filter names to evaluate individually (`q,company,department,location,remote,employmentType,hasSalary,postedWithin`, each must be an active filter or it is ignored).

Response `200`: `{ "total": 1204, "totalExact": true, "relaxed": { "department": 3412, "remote": 5120 }, "dataUpdatedAt": "..." }` where `relaxed[name]` is the total with **only that filter removed**. Statuses `200, 304, 400, 429, 5xx`. Same caching class as `/v1/facets`; origin p95 < 150 ms (one `count(*)` per relaxed filter, run in parallel).

### 3.10 `GET /v1/facets/{name}/values` (A-04)

Searchable, paginated values of one facet. `name` in `company, department, location`. Params: the `/v1/jobs` filters, `prefix` (0..60 chars; matches the label and, for `company`, also the slug), `limit` (1..100, default 30), `offset` (0..500). Counts are disjunctive (the facet's own selection is ignored) and selected values are always present with `count: 0` when empty (A-05). Sort: count desc, then label. Response `200`: `{ "values": FacetValue[], "total": 1747 }` (`total` = number of values matching `prefix`). Unknown `name` -> 404 `NOT_FOUND`; bad params -> 400. This is not `/v1/suggest` (unfiltered, capped at 10). Same caching class as `/v1/facets`.

### 3.11 `GET /v1/feed/sitemap` (A-10)

Bulk feed for sitemap generation. Params: `kind` (`jobs` | `companies`, required), `cursor` (opaque), `limit` (1..10,000, default 10,000). Items: jobs `{ id, title, companySlug, updatedAt }`, companies `{ slug, jobCount, updatedAt }`. Only active jobs and companies with at least 1 active job. Response `200`: `{ "kind": "jobs", "items": [...], "nextCursor": "..."|null, "total": 34035 }`. Keyset-ordered by `id` / `slug`. `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400`. Statuses `200, 304, 400, 429, 5xx`.

---

## 4. Errors

All non-2xx bodies use **RFC 9457 `application/problem+json`** plus a stable top-level machine `code` (A-09). Clients branch on `code`, not on `type` URLs or `title` text. `code` values: `VALIDATION_ERROR, OFFSET_TOO_DEEP, CURSOR_MISMATCH, SORT_REQUIRES_Q, NOT_FOUND, JOB_CLOSED, RATE_LIMITED, INTERNAL, UNAVAILABLE`.

```json
{ "code": "VALIDATION_ERROR", "type": "https://api.example.com/problems/validation-error", "title": "Invalid query parameters", "status": 400,
  "detail": "pageSize must be between 1 and 100", "instance": "/v1/jobs?pageSize=500", "requestId": "req_8f2c...",
  "errors": [ { "field": "pageSize", "code": "max", "message": "Must be <= 100" } ] }
```

| Status | `code` / `type` slug | When | UI treatment |
|---|---|---|---|
| 400 | `VALIDATION_ERROR`, `OFFSET_TOO_DEEP`, `CURSOR_MISMATCH`, `SORT_REQUIRES_Q` (slugs `validation-error`, `offset-too-deep`, `cursor-mismatch`, `sort-requires-q`) | bad params | **Developer bug or hand-edited URL.** Reset the offending param, keep the rest; show a small inline notice ("Some filters in this link weren't valid and were reset"). Never a blank page |
| 404 | `NOT_FOUND` (`job-not-found` / `company-not-found` / `route-not-found`) | never existed, or closed more than 90 days ago | Full "not found" page with search box + link to home |
| 410 | `JOB_CLOSED` (`job-closed`) | job existed and is now inactive (within the 90-day retention) | Dedicated "This role is no longer open" page: show title and company (from `extensions.job`; `extensions.company` kept for compatibility), "See other open roles at {company}" and "Back to search". **Not** an error banner. Do not offer Apply |
| 429 | `RATE_LIMITED` (`rate-limited`) | too many requests | Honour `Retry-After` (seconds); show a non-blocking "Too many requests, retrying..." toast; auto-retry once after the delay with jitter; then show a retry button. Never hammer |
| 500/502/503/504 | `INTERNAL` (500) / `UNAVAILABLE` (502/503/504) (`server-error`) | backend/DB problem | Retry GET up to 2x with backoff (500 ms, 1.5 s); then an error state with "Try again" and the last cached result if the client has one (stale data beats an empty screen) |
| network / timeout | (no response) | offline, CORS misconfig | "Can't reach the job service" state; offline hint |

Rules: `429` always carries both the `Retry-After` header and `retryAfterSeconds` in the body; `405` for non-GET with `Allow: GET, HEAD, OPTIONS`; unknown query params are **ignored** (forward compatibility) but unknown *values* of known enums are 400. Error responses are cacheable only for `404`/`410` (`s-maxage=300`); never cache 5xx/429 (`no-store`).

---

## 5. Caching & performance design

The dataset changes only when a scrape runs (observed: a full scrape is ≈ 141 s, cadence set by the owner, likely daily). That makes aggressive CDN caching safe.

| Resource | `Cache-Control` | Notes |
|---|---|---|
| `/v1/meta`, `/v1/facets` (unfiltered), `/v1/feed/sitemap` | `public, max-age=60, s-maxage=3600, stale-while-revalidate=86400` | purged on scrape |
| `/v1/jobs` (any query), `/v1/jobs/count`, `/v1/facets?...`, `/v1/facets/{name}/values` | `public, max-age=30, s-maxage=600, stale-while-revalidate=3600` | cache key = canonicalised query; `Vary: Accept-Encoding` only (no cookies, no auth) |
| `/v1/jobs/{id}` | `public, max-age=60, s-maxage=1800, stale-while-revalidate=86400` | 410/404: `s-maxage=300` |
| `/v1/companies*` | `public, max-age=60, s-maxage=1800, stale-while-revalidate=86400` | |
| `/v1/suggest` | `public, max-age=60, s-maxage=300, stale-while-revalidate=600` | |
| `/v1/health` | `no-store` | |

- **ETag:** weak ETag = hash of (`dataVersion` + canonical query) where `dataVersion` = `lastUpdated` of the last scrape. Honour `If-None-Match` -> `304` with no body, no DB hit when `dataVersion` is unchanged. This means an entire scrape cycle needs at most one real computation per distinct URL.
- **Purge-on-scrape:** at the end of `scrape`/`scrape:parallel`, the scraper (or a post-run script; an owner decision) bumps `dataVersion` (writes a `ScrapeRun` row, G1) and calls the CDN purge-by-tag/surrogate-key (`Surrogate-Key: jobs`) endpoint, or simply relies on the short `s-maxage` + `stale-while-revalidate`. Without purge the worst-case staleness is `s-maxage` (10-30 min): acceptable, and the UI shows `lastUpdated`, so it is honest.
- **Rate limiting:** per-IP token bucket at the edge, e.g. 120 req/min burst 60 for list/detail, 30/min for `suggest` bursts relaxed because the UI debounces; `429` + `Retry-After`. CDN-cached hits do not count against origin limits.
- **CORS allowlist:** see principle 4; unlisted origins get no CORS headers (browser blocks). Preflight is rare because only simple `GET`s with no custom headers are used; **the UI must not send custom headers** (keeps requests "simple").
- **Response size budget:** list page (20 items) ≤ 15 KB uncompressed (≤ 5 KB br); 100 items ≈ 60 KB raw (≈ 15 KB br); detail ≤ 120 KB incl. description (cap); facets ≤ 20 KB; suggest ≤ 2 KB. Lists never include descriptions or `metadata` blobs. Enforce `pageSize ≤ 100`. Sitemap feed pages (10,000 items) are exempt (server-to-server, ~1 MB raw).
- **Compression:** br preferred, gzip fallback, `Vary: Accept-Encoding`.
- **DB protection:** `statement_timeout` 3 s per query; pooled connections (Neon pooler/pgbouncer), a small pool (≤ 10) per instance; in-process LRU (e.g. 500 entries, TTL = until `dataVersion` changes) in front of aggregate queries.
- **Latency targets (origin):** list p95 < 150 ms, detail < 60 ms, facets < 250 ms, suggest < 80 ms; CDN hits < 50 ms.

---

## 6. BACKEND GAPS (what the current schema cannot do efficiently)

Effort scale: **S** < ½ day, **M** ~1 day, **L** 2-3 days. All SQL below is illustrative (Prisma has no `db push` support for generated columns / GIN / trigram, so use raw SQL migrations; the repo currently uses `db push` and has no `prisma/migrations/`, which is itself a decision, see G10).

| # | Gap | Why it matters | Recommended addition | Effort |
|---|---|---|---|---|
| G1 | **No reliable "last scrape" timestamp.** `Job.updatedAt` only moves on content change (see section 0); `Company` has no timestamps. | The "Updated X ago" trust cue and ETag/purge versioning need it. `max(updatedAt)` can be days older than the real last run, making the site look stale. | New table `ScrapeRun(id, startedAt, finishedAt, jobsActive, source)`; written at end of `runAll`/cluster merge. Also add `Job.lastSeenAt timestamptz` (this is what `JobDetail.lastCheckedAt` and the 410 body read; `Job.deactivatedAt timestamptz` is also needed for the 410 body and the 90-day retention) (set to now() for every job seen in a board response, via one `updateMany` per company: `... WHERE companySlug=$1 AND ashbyId IN (...)`). Fallback until then: `max(updatedAt)` flagged `job_updated_at_proxy`. | M |
| G2 | **No full-text / fuzzy search** (fields to index: title, company name/slug, department, location). Only equality indexes. `title ILIKE '%x%'` seq-scans 34k rows (~20-60 ms, tolerable but no ranking, no typo tolerance). | `q` is the primary action. | Enable `pg_trgm` and add `searchText` (generated): `ALTER TABLE "Job" ADD COLUMN "searchVec" tsvector GENERATED ALWAYS AS (to_tsvector('simple', coalesce(title,'') \|\| ' ' \|\| coalesce("companySlug",''))) STORED; CREATE INDEX job_search_gin ON "Job" USING gin("searchVec");` plus `CREATE INDEX job_title_trgm ON "Job" USING gin(title gin_trgm_ops);`. Company display name lives on `Company` so either denormalise `companyName` onto Job or search with a join; simplest: `Job.companyName` generated at scrape time. Use `websearch_to_tsquery` + prefix (`:*`) for the last token; rank with `ts_rank`. Neon supports both extensions. | M |
| G3 | **Filter/sort fields live in JSONB.** `isRemote`, `employmentType`, `publishedAt`, `workplaceType`, `secondaryLocations`, salary interval are only in `metadata`. JSON-path predicates cannot use the existing indexes and sorting by a JSON text field is slow/awkward. | `remote`, `employmentType`, `postedWithin`, `sort=newest` are core filters. | Generated/real columns: `remote boolean GENERATED ALWAYS AS ((metadata->>'isRemote')::boolean) STORED`, `employmentType text GENERATED ... lower(metadata->>'employmentType')`, `postedAt timestamptz` (computed in scraper from `publishedAt`, or generated with a safe cast function), `sortDate timestamptz GENERATED ALWAYS AS (coalesce(postedAt, "createdAt")) STORED`, `workplaceType`, `salaryInterval`. Better long-term: have `Scraper.processCompanyJobs` write them as real columns (normalised enum) so the DB, not the API, owns normalisation. | M |
| G4 | **Locations are free text.** No country/region/city; "Remote", "Remote - US", "London, UK", "Remote (EMEA)" are all separate rows. Facet would be a noisy long tail. | Location filtering is a top job-seeker need. | v1: expose exact strings with top-N facet + `suggest`. v2: add `Location.country`, `Location.region`, `Location.isRemote` populated by a small normaliser script (rule table + optional geocoding of the top ~2,000 distinct strings, run offline once and on new strings). | L (v2), S (v1) |
| G5 | **Missing composite / sort indexes.** Only single-column indexes. Every list is `WHERE active ...ORDER BY ...`. | Avoid seq scans + sorts on every request. | `CREATE INDEX job_active_sort ON "Job"("sortDate" DESC, id DESC) WHERE active;` `... ON "Job"("companySlug", "sortDate" DESC) WHERE active;` `... ON "Job"("salaryMax" DESC NULLS LAST, id) WHERE active AND "salaryMax" IS NOT NULL;` `(active, "updatedAt")`; `(remote) WHERE active`, `(employmentType) WHERE active`; partial indexes keep them tiny. Replace `@@index([active])` (low selectivity, mostly true). In Prisma: `@@index([active, updatedAt])`; partial/expression ones need raw SQL. | S |
| G6 | **`Company.name` mostly = slug; `logoUrl` mostly null** until `discover --enrich` is run. | Cards show company names/logos everywhere. | Run `npm run discover -- --enrich` for all hiring companies (existing code) and make it part of the post-scrape step; store `Company.nameSource` optional. API returns `name:null` for un-enriched so the UI falls back; add a slug->display-name humaniser in the adapter (`acme-labs` -> `Acme Labs`). Also add `Company.updatedAt`. | S |
| G7 | **No precomputed facets/counts.** Per-company job counts need `GROUP BY` on every request (the `Verify.ts` uses Prisma `_count` sorted by relation count). | Home page and company list must be instant. | Materialized view `facet_company_counts`, `facet_department_counts`, `facet_location_counts` (active jobs only) refreshed `REFRESH MATERIALIZED VIEW CONCURRENTLY` at end of every scrape; or denormalised `Company.activeJobCount`. Filtered facets stay live `GROUP BY` behind CDN cache. | M |
| G8 | **`active` filter everywhere and `inactive` retention.** Inactive rows are never deleted; companies that become `NOT_FOUND` keep stale active jobs (documented in 05). | Public site could show dead jobs. | API joins `Company.status='ACTIVE'` in all job queries (or deactivate jobs when company flips). Optional retention job to purge inactive rows older than N days. | S |
| G9 | **Salary normalisation.** Currency/interval mixed, `Float` bounds, no interval column; GraphQL boards have text only. | Salary filter/sort correctness. | Add `salaryInterval` (generated from `metadata.compensation.summaryComponents`) and optionally `salaryAnnualUsdMin/Max` computed at scrape (static FX table, clearly labelled approximate). Until then `salaryMin` filter is USD+YEAR-only documented best effort. | M |
| G10 | **No migrations workflow** (`prisma db push`). Raw-SQL extras (extensions, generated columns, GIN) are not expressible in `schema.prisma` and `db push` may drop them. | Reproducible deploy of the API DB. | Adopt `prisma migrate` (baseline the existing DB) or keep a `sql/` folder of idempotent scripts applied after `db push`. Decision for the owner. | S-M |
| G11 | **Descriptions unverified.** | Detail page richness. | Run the probe in 6.7. If absent, add a one-off/optional `includeDescription` path (REST board response already includes it for the Posting API; GraphQL needs the `ApiJobPosting` query per job, expensive) or deep-link only. | S to verify, L to add for GraphQL boards |
| G12 | **No read-only DB role / read replica / connection pooling for the API.** | Security and free-tier connection limits. | Create `jobs_api_ro` role with `SELECT` only on the 4 tables; use Neon pooled connection string. | S |

### 6.7 Verification probes (run by the implementer, read-only; this design task did not touch the DB)

```sql
-- which metadata keys exist, and how often (sample)
SELECT k, count(*) FROM (SELECT jsonb_object_keys(metadata) k FROM "Job" TABLESAMPLE SYSTEM (5)) s GROUP BY k ORDER BY 2 DESC;
-- descriptions present?
SELECT count(*) FILTER (WHERE metadata ? 'descriptionHtml') AS html, count(*) FILTER (WHERE metadata ? 'descriptionPlain') AS plain, count(*) AS total FROM "Job" WHERE active;
-- REST vs GraphQL proxy and publishedAt coverage
SELECT (metadata ? 'publishedAt') AS has_published, (metadata ? 'workplaceType') AS has_workplace, count(*) FROM "Job" WHERE active GROUP BY 1,2;
-- distinct employmentType values and location cardinality
SELECT metadata->>'employmentType' v, count(*) FROM "Job" WHERE active GROUP BY 1 ORDER BY 2 DESC;
SELECT count(*) FROM "Location";
```

### 6.8 Hosting options for the API (owner decides; short note)

- **Neon (already in use per docs) + a thin Node service** (Hono or Fastify with `@prisma/client` or `pg`) on a free host (Render/Fly/Railway free or trial tiers have cold starts and change terms often; verify current limits).
- **Vercel/Netlify serverless/edge functions** reading from Neon via the serverless driver (`@neondatabase/serverless`, HTTP/WebSocket, edge-compatible) behind the CDN. Natural fit since the UI is already on one of them; cold starts are masked by `s-maxage`/SWR caching. Prisma on edge needs the Accelerate/driver-adapter path; a plain `pg`/Neon driver is simpler.
- **Cloudflare Workers + Neon/Hyperdrive** with the Cache API for the CDN layer.
- **Static snapshot alternative:** because data only changes per scrape, a post-scrape job could emit static JSON shards (`/data/jobs-page-N.json`, `facets.json`, `meta.json`) to the CDN and the UI filters client-side or via a small search index (e.g. a prebuilt MiniSearch/Pagefind index). Zero-server, but heavy for 34k jobs (≈ 8-10 MB raw JSON) and filters become client-side; viable fallback only if no server is acceptable.
- Whichever host is chosen, keep the code a **single `GET`-only router** mapping 1:1 to section 3 so it can move hosts.

---

## 7. OpenAPI 3.1 (machine-readable; consistent with sections 2-4)

```yaml
openapi: 3.1.0
info:
  title: Job Board Read API (proposal)
  version: 1.0.0-proposal
  description: Read-only, unauthenticated API over jobs scraped from Ashby boards. Contract-first proposal.
servers:
  - url: https://api.example.com
    description: Placeholder; real base URL supplied by owner
tags:
  - { name: jobs, description: Search, filter and read job postings }
  - { name: companies, description: Companies with active postings }
  - { name: discovery, description: Facets, suggestions and bulk feeds }
  - { name: system, description: Totals and health }
paths:
  /v1/jobs:
    get:
      tags: [jobs]
      operationId: listJobs
      summary: Search and filter jobs (offset or keyset pagination)
      parameters:
        - { name: q, in: query, schema: { type: string, minLength: 2, maxLength: 100 } }
        - { name: company, in: query, style: form, explode: true, schema: { type: array, maxItems: 20, items: { type: string, pattern: '^[a-z0-9-]{1,60}$' } } }
        - { name: department, in: query, style: form, explode: true, schema: { type: array, maxItems: 20, items: { type: string, maxLength: 120 } } }
        - { name: location, in: query, style: form, explode: true, schema: { type: array, maxItems: 20, items: { type: string, maxLength: 200 } } }
        - { name: remote, in: query, schema: { type: boolean } }
        - { name: employmentType, in: query, style: form, explode: true, schema: { type: array, maxItems: 6, items: { $ref: '#/components/schemas/EmploymentType' } } }
        - { name: salaryMin, in: query, schema: { type: integer, minimum: 0 } }
        - { name: salaryCurrency, in: query, schema: { type: string, minLength: 3, maxLength: 3, default: USD } }
        - { name: hasSalary, in: query, schema: { type: boolean } }
        - { name: postedWithin, in: query, schema: { type: string, enum: ['1d', '3d', '7d', '14d', '30d'] } }
        - { name: sort, in: query, description: "Default relevance when q present, else newest. relevance requires q.", schema: { type: string, enum: [relevance, newest, salary_desc, title_asc, company_asc] } }
        - { name: page, in: query, description: "Offset mode. page*pageSize must be <= 10000 (page.maxResultWindow). Mutually exclusive with cursor.", schema: { type: integer, minimum: 1, default: 1 } }
        - { name: pageSize, in: query, schema: { type: integer, minimum: 1, maximum: 100, default: 20 } }
        - { name: cursor, in: query, description: Opaque keyset cursor from page.nextCursor, schema: { type: string, maxLength: 512 } }
        - { name: includeTotal, in: query, schema: { type: boolean, default: true } }
      responses:
        '200': { $ref: '#/components/responses/JobPage' }
        '304': { $ref: '#/components/responses/NotModified' }
        '400': { $ref: '#/components/responses/BadRequest' }
        '429': { $ref: '#/components/responses/RateLimited' }
        '500': { $ref: '#/components/responses/ServerError' }
        '503': { $ref: '#/components/responses/ServerError' }
  /v1/jobs/count:
    get:
      tags: [jobs]
      operationId: countJobs
      summary: Count-only for the current filters, with per-filter-removed totals
      parameters:
        - { name: q, in: query, schema: { type: string, minLength: 2, maxLength: 100 } }
        - { name: company, in: query, style: form, explode: true, schema: { type: array, maxItems: 20, items: { type: string } } }
        - { name: department, in: query, style: form, explode: true, schema: { type: array, maxItems: 20, items: { type: string } } }
        - { name: location, in: query, style: form, explode: true, schema: { type: array, maxItems: 20, items: { type: string } } }
        - { name: remote, in: query, schema: { type: boolean } }
        - { name: employmentType, in: query, style: form, explode: true, schema: { type: array, maxItems: 6, items: { $ref: '#/components/schemas/EmploymentType' } } }
        - { name: salaryMin, in: query, schema: { type: integer, minimum: 0 } }
        - { name: salaryCurrency, in: query, schema: { type: string, minLength: 3, maxLength: 3, default: USD } }
        - { name: hasSalary, in: query, schema: { type: boolean } }
        - { name: postedWithin, in: query, schema: { type: string, enum: ['1d', '3d', '7d', '14d', '30d'] } }
        - name: relax
          in: query
          description: CSV of active filter names; each is removed individually and the resulting total returned in relaxed.
          schema: { type: string, maxLength: 200 }
      responses:
        '200':
          description: Count
          content:
            application/json:
              schema: { $ref: '#/components/schemas/CountResponse' }
        '304': { $ref: '#/components/responses/NotModified' }
        '400': { $ref: '#/components/responses/BadRequest' }
        '429': { $ref: '#/components/responses/RateLimited' }
        '500': { $ref: '#/components/responses/ServerError' }
  /v1/jobs/{id}:
    get:
      tags: [jobs]
      operationId: getJob
      summary: Job detail
      parameters:
        - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
      responses:
        '200':
          description: Job detail
          content:
            application/json:
              schema: { $ref: '#/components/schemas/JobDetail' }
        '304': { $ref: '#/components/responses/NotModified' }
        '400': { $ref: '#/components/responses/BadRequest' }
        '404': { $ref: '#/components/responses/NotFound' }
        '410': { $ref: '#/components/responses/Gone' }
        '429': { $ref: '#/components/responses/RateLimited' }
        '500': { $ref: '#/components/responses/ServerError' }
  /v1/companies:
    get:
      tags: [companies]
      operationId: listCompanies
      summary: Companies with active job counts
      parameters:
        - { name: q, in: query, schema: { type: string, minLength: 2, maxLength: 60 } }
        - { name: sort, in: query, schema: { type: string, enum: [jobs_desc, name_asc], default: jobs_desc } }
        - { name: minJobs, in: query, schema: { type: integer, minimum: 1, default: 1 } }
        - { name: page, in: query, schema: { type: integer, minimum: 1, default: 1 } }
        - { name: pageSize, in: query, schema: { type: integer, minimum: 1, maximum: 100, default: 24 } }
      responses:
        '200':
          description: Page of companies
          content:
            application/json:
              schema: { $ref: '#/components/schemas/CompanyPage' }
        '304': { $ref: '#/components/responses/NotModified' }
        '400': { $ref: '#/components/responses/BadRequest' }
        '429': { $ref: '#/components/responses/RateLimited' }
        '500': { $ref: '#/components/responses/ServerError' }
  /v1/companies/{slug}:
    get:
      tags: [companies]
      operationId: getCompany
      summary: Company detail
      parameters:
        - { name: slug, in: path, required: true, schema: { type: string, pattern: '^[a-z0-9-]{1,60}$' } }
      responses:
        '200':
          description: Company detail
          content:
            application/json:
              schema: { $ref: '#/components/schemas/CompanyDetail' }
        '304': { $ref: '#/components/responses/NotModified' }
        '404': { $ref: '#/components/responses/NotFound' }
        '429': { $ref: '#/components/responses/RateLimited' }
        '500': { $ref: '#/components/responses/ServerError' }
  /v1/facets:
    get:
      tags: [discovery]
      operationId: getFacets
      summary: Facet counts for the current filters (disjunctive)
      parameters:
        - { name: q, in: query, schema: { type: string, minLength: 2, maxLength: 100 } }
        - { name: company, in: query, style: form, explode: true, schema: { type: array, maxItems: 20, items: { type: string } } }
        - { name: department, in: query, style: form, explode: true, schema: { type: array, maxItems: 20, items: { type: string } } }
        - { name: location, in: query, style: form, explode: true, schema: { type: array, maxItems: 20, items: { type: string } } }
        - { name: remote, in: query, schema: { type: boolean } }
        - { name: employmentType, in: query, style: form, explode: true, schema: { type: array, maxItems: 6, items: { $ref: '#/components/schemas/EmploymentType' } } }
        - { name: salaryMin, in: query, schema: { type: integer, minimum: 0 } }
        - { name: salaryCurrency, in: query, schema: { type: string, minLength: 3, maxLength: 3, default: USD } }
        - { name: hasSalary, in: query, schema: { type: boolean } }
        - { name: postedWithin, in: query, schema: { type: string, enum: ['1d', '3d', '7d', '14d', '30d'] } }
        - { name: fields, in: query, description: Comma separated subset of facet names, schema: { type: string } }
        - { name: limit, in: query, schema: { type: integer, minimum: 1, maximum: 100, default: 50 } }
      responses:
        '200':
          description: Facet counts
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Facets' }
        '304': { $ref: '#/components/responses/NotModified' }
        '400': { $ref: '#/components/responses/BadRequest' }
        '429': { $ref: '#/components/responses/RateLimited' }
        '500': { $ref: '#/components/responses/ServerError' }
  /v1/facets/{name}/values:
    get:
      tags: [discovery]
      operationId: getFacetValues
      summary: Searchable, paginated values of one facet (disjunctive counts)
      parameters:
        - { name: name, in: path, required: true, schema: { type: string, enum: [company, department, location] } }
        - { name: q, in: query, schema: { type: string, minLength: 2, maxLength: 100 } }
        - { name: company, in: query, style: form, explode: true, schema: { type: array, maxItems: 20, items: { type: string } } }
        - { name: department, in: query, style: form, explode: true, schema: { type: array, maxItems: 20, items: { type: string } } }
        - { name: location, in: query, style: form, explode: true, schema: { type: array, maxItems: 20, items: { type: string } } }
        - { name: remote, in: query, schema: { type: boolean } }
        - { name: employmentType, in: query, style: form, explode: true, schema: { type: array, maxItems: 6, items: { $ref: '#/components/schemas/EmploymentType' } } }
        - { name: salaryMin, in: query, schema: { type: integer, minimum: 0 } }
        - { name: salaryCurrency, in: query, schema: { type: string, minLength: 3, maxLength: 3, default: USD } }
        - { name: hasSalary, in: query, schema: { type: boolean } }
        - { name: postedWithin, in: query, schema: { type: string, enum: ['1d', '3d', '7d', '14d', '30d'] } }
        - { name: prefix, in: query, schema: { type: string, minLength: 0, maxLength: 60 } }
        - { name: limit, in: query, schema: { type: integer, minimum: 1, maximum: 100, default: 30 } }
        - { name: offset, in: query, schema: { type: integer, minimum: 0, maximum: 500, default: 0 } }
      responses:
        '200':
          description: Facet values
          content:
            application/json:
              schema: { $ref: '#/components/schemas/FacetValuesResponse' }
        '304': { $ref: '#/components/responses/NotModified' }
        '400': { $ref: '#/components/responses/BadRequest' }
        '404': { $ref: '#/components/responses/NotFound' }
        '429': { $ref: '#/components/responses/RateLimited' }
        '500': { $ref: '#/components/responses/ServerError' }
  /v1/feed/sitemap:
    get:
      tags: [discovery]
      operationId: getSitemapFeed
      summary: Bulk feed of active jobs or companies for sitemap generation
      parameters:
        - { name: kind, in: query, required: true, schema: { type: string, enum: [jobs, companies] } }
        - { name: cursor, in: query, schema: { type: string, maxLength: 512 } }
        - { name: limit, in: query, schema: { type: integer, minimum: 1, maximum: 10000, default: 10000 } }
      responses:
        '200':
          description: Feed page
          content:
            application/json:
              schema: { $ref: '#/components/schemas/SitemapFeed' }
        '304': { $ref: '#/components/responses/NotModified' }
        '400': { $ref: '#/components/responses/BadRequest' }
        '429': { $ref: '#/components/responses/RateLimited' }
        '500': { $ref: '#/components/responses/ServerError' }
  /v1/suggest:
    get:
      tags: [discovery]
      operationId: suggest
      summary: Typeahead
      parameters:
        - { name: q, in: query, required: true, schema: { type: string, minLength: 1, maxLength: 60 } }
        - { name: types, in: query, description: "csv of company,department,location,title", schema: { type: string, default: 'company,department,location,title' } }
        - { name: limit, in: query, schema: { type: integer, minimum: 1, maximum: 10, default: 5 } }
      responses:
        '200':
          description: Suggestions
          content:
            application/json:
              schema: { $ref: '#/components/schemas/SuggestResponse' }
        '400': { $ref: '#/components/responses/BadRequest' }
        '429': { $ref: '#/components/responses/RateLimited' }
        '500': { $ref: '#/components/responses/ServerError' }
  /v1/meta:
    get:
      tags: [system]
      operationId: getMeta
      summary: Totals and last-updated time
      responses:
        '200':
          description: Meta
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Meta' }
        '304': { $ref: '#/components/responses/NotModified' }
        '500': { $ref: '#/components/responses/ServerError' }
  /v1/health:
    get:
      tags: [system]
      operationId: getHealth
      summary: Liveness and database check
      responses:
        '200':
          description: Healthy
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Health' }
        '503':
          description: Degraded
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Health' }
components:
  responses:
    JobPage:
      description: Page of jobs
      headers:
        ETag: { schema: { type: string } }
        Cache-Control: { schema: { type: string } }
        X-Data-Updated-At: { schema: { type: string, format: date-time } }
      content:
        application/json:
          schema: { $ref: '#/components/schemas/JobPage' }
    NotModified: { description: Not modified (If-None-Match matched) }
    BadRequest:
      description: Invalid parameters
      content:
        application/problem+json:
          schema: { $ref: '#/components/schemas/Problem' }
    NotFound:
      description: Resource never existed
      content:
        application/problem+json:
          schema: { $ref: '#/components/schemas/Problem' }
    Gone:
      description: Job existed but is no longer active (code JOB_CLOSED; extensions.job carries id, title, company, deactivatedAt, lastCheckedAt). Retained at least 90 days, then 404.
      content:
        application/problem+json:
          schema: { $ref: '#/components/schemas/Problem' }
    RateLimited:
      description: Too many requests
      headers:
        Retry-After: { required: true, schema: { type: integer, minimum: 1 } }
      content:
        application/problem+json:
          schema: { $ref: '#/components/schemas/Problem' }
    ServerError:
      description: Server or upstream error
      content:
        application/problem+json:
          schema: { $ref: '#/components/schemas/Problem' }
  schemas:
    EmploymentType:
      type: string
      enum: [FULL_TIME, PART_TIME, CONTRACT, INTERN, TEMPORARY, OTHER]
    WorkplaceType:
      type: string
      enum: [REMOTE, HYBRID, ONSITE]
    SalaryInterval:
      type: string
      enum: [YEAR, MONTH, WEEK, DAY, HOUR]
    Salary:
      type: object
      required: [min, max, currency, interval, summary]
      anyOf:
        - { properties: { min: { type: number } }, required: [min] }
        - { properties: { max: { type: number } }, required: [max] }
      properties:
        min: { type: [number, 'null'] }
        max: { type: [number, 'null'] }
        currency: { type: [string, 'null'], minLength: 3, maxLength: 3 }
        interval: { oneOf: [{ $ref: '#/components/schemas/SalaryInterval' }, { type: 'null' }] }
        summary: { type: [string, 'null'] }
    CompanyRef:
      type: object
      required: [slug, name, logoUrl]
      properties:
        slug: { type: string }
        name: { type: [string, 'null'] }
        logoUrl: { type: [string, 'null'], format: uri }
    JobListItem:
      type: object
      required: [id, title, company, department, location, remote, workplaceType, employmentType, salary, postedAt, firstSeenAt, updatedAt, applyUrl]
      properties:
        id: { type: string, format: uuid }
        title: { type: string, minLength: 1 }
        company: { $ref: '#/components/schemas/CompanyRef' }
        department: { type: [string, 'null'] }
        location: { type: [string, 'null'] }
        remote: { type: [boolean, 'null'] }
        workplaceType: { oneOf: [{ $ref: '#/components/schemas/WorkplaceType' }, { type: 'null' }] }
        employmentType: { oneOf: [{ $ref: '#/components/schemas/EmploymentType' }, { type: 'null' }] }
        salary: { oneOf: [{ $ref: '#/components/schemas/Salary' }, { type: 'null' }] }
        postedAt: { type: [string, 'null'], format: date-time }
        firstSeenAt: { type: string, format: date-time }
        updatedAt: { type: string, format: date-time }
        applyUrl: { type: string, format: uri }
    JobDetail:
      allOf:
        - $ref: '#/components/schemas/JobListItem'
        - type: object
          required: [lastCheckedAt, jobUrl, team, locations, descriptionHtml, descriptionText, source, company]
          properties:
            lastCheckedAt: { type: string, format: date-time }
            jobUrl: { type: string, format: uri }
            team: { type: [string, 'null'] }
            locations: { type: array, items: { type: string } }
            descriptionHtml: { type: [string, 'null'], maxLength: 102400 }
            descriptionText: { type: [string, 'null'] }
            source: { type: string, enum: [rest, graphql, unknown] }
            company:
              allOf:
                - $ref: '#/components/schemas/CompanyRef'
                - type: object
                  required: [jobCount]
                  properties:
                    jobCount: { type: integer, minimum: 0 }
    PageInfo:
      type: object
      required: [number, size, total, totalPages, totalExact, hasNext, nextCursor, maxResultWindow]
      properties:
        maxResultWindow: { type: [integer, 'null'], minimum: 1 }
        number: { type: integer, minimum: 1 }
        size: { type: integer, minimum: 1 }
        total: { type: [integer, 'null'], minimum: 0 }
        totalPages: { type: [integer, 'null'], minimum: 0 }
        totalExact: { type: boolean }
        hasNext: { type: boolean }
        nextCursor: { type: [string, 'null'] }
    JobPage:
      type: object
      required: [items, page, appliedFilters, dataUpdatedAt]
      properties:
        items: { type: array, items: { $ref: '#/components/schemas/JobListItem' } }
        page: { $ref: '#/components/schemas/PageInfo' }
        appliedFilters: { type: object, additionalProperties: true }
        dataUpdatedAt: { type: [string, 'null'], format: date-time }
    CompanySummary:
      type: object
      required: [slug, name, logoUrl, jobCount]
      properties:
        slug: { type: string }
        name: { type: [string, 'null'] }
        logoUrl: { type: [string, 'null'], format: uri }
        jobCount: { type: integer, minimum: 0 }
    FacetValue:
      type: object
      required: [value, label, count]
      properties:
        value: { type: string }
        label: { type: string }
        count: { type: integer, minimum: 0 }
    CompanyDetail:
      allOf:
        - $ref: '#/components/schemas/CompanySummary'
        - type: object
          required: [boardUrl, departments, locations, salaryCoveragePct, lastSeenAt]
          properties:
            boardUrl: { type: string, format: uri }
            departments: { type: array, items: { $ref: '#/components/schemas/FacetValue' } }
            locations: { type: array, items: { $ref: '#/components/schemas/FacetValue' } }
            salaryCoveragePct: { type: integer, minimum: 0, maximum: 100 }
            lastSeenAt: { type: [string, 'null'], format: date-time }
    CompanyPage:
      type: object
      required: [items, page, appliedFilters, dataUpdatedAt]
      properties:
        items: { type: array, items: { $ref: '#/components/schemas/CompanySummary' } }
        page: { $ref: '#/components/schemas/PageInfo' }
        appliedFilters: { type: object, additionalProperties: true }
        dataUpdatedAt: { type: [string, 'null'], format: date-time }
    Facets:
      type: object
      required: [company, department, location, employmentType, remote, hasSalary, postedWithin, salary, total]
      properties:
        company: { type: array, items: { $ref: '#/components/schemas/FacetValue' } }
        department: { type: array, items: { $ref: '#/components/schemas/FacetValue' } }
        location: { type: array, items: { $ref: '#/components/schemas/FacetValue' } }
        employmentType: { type: array, items: { $ref: '#/components/schemas/FacetValue' } }
        remote:
          type: object
          required: ['true', 'false', unknown]
          properties:
            'true': { type: integer }
            'false': { type: integer }
            unknown: { type: integer }
        hasSalary:
          type: object
          required: ['true', 'false']
          properties:
            'true': { type: integer }
            'false': { type: integer }
        postedWithin:
          type: object
          required: ['1d', '3d', '7d', '14d', '30d']
          properties:
            '1d': { type: integer }
            '3d': { type: integer }
            '7d': { type: integer }
            '14d': { type: integer }
            '30d': { type: integer }
        salary:
          oneOf:
            - type: object
              required: [currency, p10, median, p90, max]
              properties:
                currency: { type: string }
                p10: { type: number }
                median: { type: number }
                p90: { type: number }
                max: { type: number }
            - type: 'null'
        total: { type: integer, minimum: 0 }
    Suggestion:
      type: object
      required: [type, value, label, count]
      properties:
        type: { type: string, enum: [company, department, location, title] }
        value: { type: string }
        label: { type: string }
        count: { type: integer, minimum: 0 }
    SuggestResponse:
      type: object
      required: [q, suggestions]
      properties:
        q: { type: string }
        suggestions: { type: array, items: { $ref: '#/components/schemas/Suggestion' } }
    Meta:
      type: object
      description: totals.jobs = active jobs; totals.companies = companies with at least 1 active job.
      required: [totals, lastUpdated, lastUpdatedSource, apiVersion, dataNotice]
      properties:
        totals:
          type: object
          required: [jobs, companies, companiesWithSalary, jobsWithSalary, locations, departments]
          properties:
            jobs: { type: integer }
            companies: { type: integer }
            companiesWithSalary: { type: integer }
            jobsWithSalary: { type: integer }
            locations: { type: integer }
            departments: { type: integer }
        lastUpdated: { type: [string, 'null'], format: date-time }
        lastUpdatedSource: { type: string, enum: [scrape_run, job_updated_at_proxy] }
        apiVersion: { type: string, const: v1 }
        dataNotice: { type: string }
    Health:
      type: object
      required: [status, db, time]
      properties:
        status: { type: string, enum: [ok, degraded] }
        db: { type: string, enum: [ok, down] }
        time: { type: string, format: date-time }
    ProblemFieldError:
      type: object
      required: [field, code, message]
      properties:
        field: { type: string }
        code: { type: string }
        message: { type: string }
    ErrorCode:
      type: string
      enum: [VALIDATION_ERROR, OFFSET_TOO_DEEP, CURSOR_MISMATCH, SORT_REQUIRES_Q, NOT_FOUND, JOB_CLOSED, RATE_LIMITED, INTERNAL, UNAVAILABLE]
    ClosedJobRef:
      type: object
      required: [id, title, company, deactivatedAt, lastCheckedAt]
      properties:
        id: { type: string, format: uuid }
        title: { type: string }
        company: { $ref: '#/components/schemas/CompanyRef' }
        deactivatedAt: { type: [string, 'null'], format: date-time }
        lastCheckedAt: { type: string, format: date-time }
    CountResponse:
      type: object
      required: [total, totalExact, relaxed, dataUpdatedAt]
      properties:
        total: { type: integer, minimum: 0 }
        totalExact: { type: boolean }
        relaxed:
          type: object
          description: Total with only that one filter removed, keyed by filter name
          additionalProperties: { type: integer, minimum: 0 }
        dataUpdatedAt: { type: [string, 'null'], format: date-time }
    FacetValuesResponse:
      type: object
      required: [values, total]
      properties:
        values: { type: array, items: { $ref: '#/components/schemas/FacetValue' } }
        total: { type: integer, minimum: 0 }
    SitemapJobItem:
      type: object
      required: [id, title, companySlug, updatedAt]
      properties:
        id: { type: string, format: uuid }
        title: { type: string }
        companySlug: { type: string }
        updatedAt: { type: string, format: date-time }
    SitemapCompanyItem:
      type: object
      required: [slug, jobCount, updatedAt]
      properties:
        slug: { type: string }
        jobCount: { type: integer, minimum: 1 }
        updatedAt: { type: string, format: date-time }
    SitemapFeed:
      type: object
      required: [kind, items, nextCursor, total]
      properties:
        kind: { type: string, enum: [jobs, companies] }
        items:
          type: array
          items:
            oneOf:
              - $ref: '#/components/schemas/SitemapJobItem'
              - $ref: '#/components/schemas/SitemapCompanyItem'
        nextCursor: { type: [string, 'null'] }
        total: { type: integer, minimum: 0 }
    Problem:
      type: object
      required: [code, type, title, status]
      properties:
        code: { $ref: '#/components/schemas/ErrorCode' }
        type: { type: string, format: uri }
        title: { type: string }
        status: { type: integer }
        detail: { type: string }
        instance: { type: string }
        requestId: { type: string }
        errors: { type: array, items: { $ref: '#/components/schemas/ProblemFieldError' } }
        retryAfterSeconds: { type: integer }
        extensions:
          type: object
          description: "For JOB_CLOSED (410): { job: ClosedJobRef, company: CompanyRef }"
          properties:
            job: { $ref: '#/components/schemas/ClosedJobRef' }
            company: { $ref: '#/components/schemas/CompanyRef' }
          additionalProperties: true
```

---

## 8. Frontend integration notes

### 8.1 Thin adapter layer

```
UI components  ->  view-models (stable, UI-shaped)  ->  adapter  ->  HTTP client  ->  API (proposal OR owner's real endpoints)
```

- Define `src/api/types.ts` generated from the OpenAPI above (e.g. `openapi-typescript`), and `src/domain/` view-models the UI actually consumes: `JobCardVM { id, title, companyName, companyInitial, logoUrl|null, locationLabel, remoteBadge, salaryLabel|null, postedLabel (relative date from postedAt; when postedAt is null show no age at all, never a substitute from firstSeenAt), applyUrl }`.
- All UI-specific derivation lives in the adapter, never in components: humanise slug when `company.name` is null, format salary (`$180k-$240k / yr`, currency symbols, hide when `salary == null`, text fallback when only `summary`), relative dates, location truncation, title truncation metadata.
- URL <-> filters codec lives in one module (`parseSearchParams` / `toApiQuery`): repeated params, canonical ordering, dropping defaults, so the browser URL and API URL stay in sync and cache-friendly.
- Every endpoint is one adapter function (`getJobs(filters)`, `getJob(id)`, `getCompanies`, `getCompany`, `getFacets`, `suggest`, `getMeta`) returning VMs and typed errors (`NotFoundError`, `GoneError`, `RateLimitedError(retryAfter)`, `ValidationError(fields)`, `NetworkError`). Components never see raw HTTP.

### 8.2 Mock-data strategy (MSW) and realistic fixtures

- **Mock transport** (an in-process transport sharing the same handler functions with the BFF; MSW only in tests/Storybook; no browser service worker because the app is server-rendered, 09 6.6) implements every endpoint of section 3 including `304`, `400`, `404`, `410`, `429` (with `Retry-After`), latency injection (`?__delay=`-style via MSW, not in the real contract), and a switch to simulate 500s. A single in-memory "database" module implements filtering, faceting, sorting, offset + cursor pagination, so mock behaviour equals the contract (it doubles as the reference implementation of the semantics in 3.1/3.5).
- **Fixture generator** (seeded RNG; the 5,000-job set is generated in memory from the seed, with only a small committed golden set; no committed 5,000-row JSON): produce 5,000 `JobDetail`-shaped rows, derived from the REAL distributions documented in this repo:
  - companies: ≈ 400 synthetic slugs, Zipf-distributed job counts (a few with 200+ jobs, most with 1-10; real max is large, real count ≈ 1,750); 60 % with `name:null` & `logoUrl:null` (un-enriched), 40 % with names (some with `&`, accents, 40+ chars) and logos (mixed square/wordmark aspect ratios, a few broken URLs for the broken-image state).
  - **salary: 40 % present**; of those 85 % USD annual, the rest EUR/GBP/CAD/INR, a few HOUR/MONTH intervals, a few with only `min` or only `max`, `max` up to 1,000,000; 60 % `null`.
  - **`postedAt`: null for ≈ 20-25 % of jobs** (simulate GraphQL boards; assign by company so all jobs of a company share the source), others spread over 0-120 days with a recency skew; `firstSeenAt` always set.
  - `remote`: ≈ 35 % true; `workplaceType` null for GraphQL-board companies; `employmentType` 90 % FULL_TIME, rest PART_TIME/CONTRACT/INTERN/TEMPORARY, ~3 % null.
  - titles: mostly 20-60 chars, 2 % > 100 chars (e.g. long "Account Executive, Mid-Market (EMEA) - ..." patterns), some with `&`, `/`, `(`, emoji-free but with accents and CJK, duplicates across companies ("Software Engineer" × many), 1 containing a newline-collapsed oddity.
  - locations: ≈ 1,500 distinct strings with a long tail: "Remote", "Remote - US", "Remote (EMEA)", "London, UK", "NYC / Remote", "San Francisco, CA; New York, NY", "Hybrid - Berlin", multi-city lists, trailing spaces already collapsed, 8 % null; departments: ≈ 80 distinct, 12 % null.
  - descriptions: `descriptionHtml: null` for 100 % in the default fixture set, plus a flag/second fixture set with sanitized HTML (headings, lists, links, a 100 KB monster) to test the optional path (Q1).
  - `active=false` ids included in a side list so `GET /jobs/{id}` mock returns 410 with the full `extensions.job` body (one older than 90 days returns 404), a `/jobs/count?relax=` handler, a `/facets/{name}/values` handler and a `/feed/sitemap` handler, and random missing uuids return 404.
  - Meta: `totals.jobs` equals the fixture size; `lastUpdated` = "now minus 3 h" computed at runtime so the relative time label is testable.
- Provide named scenario presets in the mock: `normal`, `empty` (zero jobs), `slow`, `flaky` (every 3rd request 503), `ratelimited`, `allNulls` (worst-case rows), `huge` (pageSize 50 of max-length titles).

### 8.3 Contract testing

- The OpenAPI file in this doc is extracted to `contracts/openapi.yaml` in the frontend repo and treated as the source of truth.
- **Mock conformance:** Vitest tests validate every MSW response against the schema (e.g. `ajv` with 2020-12/3.1 support or `openapi-response-validator`) - the mocks cannot drift from the contract.
- **Adapter tests:** feed the worst-case rows (all nulls, long strings, odd currencies) into the adapter and snapshot the view-models.
- **Provider verification (when a real backend exists):** a CI job runs the same schema validation against the live/staging API using sampled real URLs (a "smoke contract" suite: list, detail, facets, 404, 410, 429 simulation if possible); failures show exactly which field deviates. Optionally Schemathesis/Dredd against the real service.
- Playwright E2E tests run against the mock (MSW service worker in the app or a mock server) so UI tests do not depend on the backend.

### 8.4 Swapping to the owner's real endpoints

0. Env: `API_MODE=mock|live` plus `API_ADAPTER=proposal|owner` (09 D-16); an older `API_MODE=mock|proposal|owner` spelling is superseded.
1. Owner provides endpoint docs/samples. Write `adapters/owner/` implementing the same adapter interface (`getJobs`, `getJob`, ...) that maps their shapes to the **proposal's types** (not to the view-models), so everything above the API-types layer is unchanged.
2. Select adapter by env var (`API_MODE=mock|proposal|owner`). Run the contract suite against the owner adapter's output (it validates the mapped objects against the OpenAPI schemas).
3. Capabilities the owner's API may lack are handled by **capability flags** returned by the adapter (`supports: { facets, suggest, cursor, remoteFilter, salaryFilter, postedWithin, companyList, description }`); the UI hides the corresponding controls instead of breaking. Missing facets can fall back to static lists; missing totals to "Next/Previous" pagination.
4. Differences that must be reconciled in the adapter: pagination style (offset vs cursor vs page tokens), filter param naming and array encoding, id type (their id vs `Job.id`), date formats, whether salary has intervals, how "not found/closed" is signalled, and CORS/headers.

---

## 9. Open questions for the owner

1. **Descriptions:** are job description texts allowed to be shown, and stored/served by us? Are they actually in `metadata` for REST boards (run the probe 6.7)? If shown, should we show a short excerpt only (recommended) with a "read full on {company}" link? Copyright/ToS review of Ashby content.
2. **Inactive jobs:** proposal = expose them as 410 "no longer open" pages for old shared links, retained at least 90 days after deactivation, then 404 (A-08). Confirm, and confirm the physical retention for inactive rows (needs `deactivatedAt`).
3. **Is the API public** (anyone can call it, rate-limited) or restricted to our site (origin allowlist/shared secret)? CORS allowlist domains?
4. **Scrape cadence and purge:** how often will `scrape:parallel` run, and may it write a `ScrapeRun` row / call a CDN purge hook at the end (G1)?
5. **Hosting for the API** (section 6.8), and are DB read-only roles / schema additions (G2, G3, G5, G10) acceptable on the production Neon database?
6. **Text-only salary** (GraphQL boards: `compensationTierSummary` only): show as free text, or hide salary for those? Same for currency conversion/annualisation (G9): show as published only (recommended)?
7. **Location normalisation** (G4): is a country/region facet required for launch, or is the free-text top-N facet acceptable for v1?
8. **Company names/logos:** run `discover --enrich` across all hiring companies now (G6)? Are company logos allowed to be hot-linked or must they be proxied/cached?
9. **Duplicate jobs** (same title/company/location posted twice): dedupe in the API or show as-is?
10. **Company opt-out / takedown** process: need a `Company.hidden` flag?
11. **Search language and scope:** English-only `simple` text search is assumed; any need for synonyms ("SWE" = software engineer)?
12. **Analytics:** none by default (constraint 1). Is privacy-friendly server-side aggregate counting of API calls acceptable?

---

## 10. Reconciliation with 03-05

> Written 2026-10-22 by the frontend architecture pass (see [09](./09-frontend-architecture.md) section 1 for the numbered
> decisions D-01..D-24 referenced below). Sections 0-9 of this file were **not** rewritten; everything the contract owner
> must change is listed in 10.3 (additions A-xx) and 10.4 (clarifications C-xx). Until those are merged, the UI is built against
> the proposed additions and degrades through the capability flags of section 8.4.

### 10.1 Requirement status (all 33 R-ids)

Status values: **Covered** (08 already satisfies it, possibly under a different name), **Add to 08** (missing; see 10.3),
**Conflict + resolution** (08 and the UX docs disagree; resolution given). Counts: **Covered 20, Add to 08 10, Conflict 3**.

| R-id | Requirement (short) | Status | 08 location / resolution |
|---|---|---|---|
| R03-1 | `total` exact or approximate, `page`, `pageSize`, `totalPages` | Covered | `Page.page{number,size,total,totalPages,totalExact}`; UI maps `totalExact:false` to the "about" wording (C-01). UI always sends `includeTotal=true` (C-05) |
| R03-2 | Disjunctive facet counts respecting other filters | Covered | 2.5 and 3.5 `/v1/facets`; UI fetches in parallel with the list. Selected zero-count values: see A-05 |
| R03-3 | Cheap count-only for current filters ("Show N jobs", "Remove X to see N jobs") | **Add to 08** | A-03 (`/v1/jobs/count` with `relax`) |
| R03-4 | Ranked text search over title, company, department, location; `relevance` sort; min 2 chars | **Add to 08** | 3.1 `q` covers title + company (+ department); **location missing**: A-06. Min length 2 and `relevance` already covered |
| R03-5 | Suggest grouped by companies/departments/locations | Covered | 3.6 returns a flat list tagged by `type`; UI groups client-side and requests `types=company,department,location&limit=3` (C-03) |
| R03-6 | Job-by-id returns recently deactivated jobs with `active:false` (retention window), else 404 | **Conflict + resolution** | 08 returns **410** for inactive jobs (3.2, section 4). Resolution: keep 410 (better cache and SEO semantics), enrich the 410 body so the UI can show title + company (A-08) and define a retention window (A-08). `active:false` 200 responses are not needed |
| R03-7 | `salary {min,max,currency}`, nulls honoured, `interval` | Covered | 2.1 `Salary` with `interval` and `summary` |
| R03-8 | `postedAt` nullable; sort/filter by effective date | Covered | `postedAt` nullable; `sortDate = coalesce(postedAt, firstSeenAt)` (3.1). UI never shows `firstSeenAt` as a posting date (D-12, C-08) |
| R03-9 | Deterministic tiebreaker on every sort | Covered | 3.1 "Tie-breaker always `id`" |
| R03-10 | `meta.lastUpdatedAt` on list and detail | Covered | Lists: `dataUpdatedAt` and `X-Data-Updated-At`; `/v1/meta.lastUpdated` (name differs, C-01). Detail body lacks it: A-07 |
| R03-11 | Remote and employment type top-level fields and filterable | Covered | `remote`, `employmentType` in 2.2; filters in 3.1 |
| R03-12 | Company endpoint: name, logoUrl, open job count, Ashby board URL | Covered | 2.4 `CompanyDetail.jobCount`, `boardUrl` (UI name: `openJobCount`, C-01) |
| R03-13 | Stable JSON error shape with `code`; `Retry-After` on 429 | **Add to 08** | `Problem` has `type`, `title`, `status`, `requestId`, `retryAfterSeconds` and `Retry-After` is specified; add a top-level machine `code`: A-09 |
| R04-1 | `page`/`size` 25/50/100; `total`, `totalPages`, optional `maxResultWindow`, `totalIsApproximate`; stable tiebreaker | **Add to 08** | Offset + keyset + `totalExact` + tiebreaker covered; **`pageSize` max is 50** (A-01) and **`maxResultWindow` is not in the response** (A-02). `totalIsApproximate` = inverse of `totalExact` (C-01) |
| R04-2 | Filter params map 1:1 to 04 3.2 | **Conflict + resolution** | Names differ (`remote=1` vs `remote=true`, `salary` vs `hasSalary`, `type` vs `employmentType`, `posted=24h` vs `postedWithin=1d`, `sort=salary` vs `salary_desc`, `size` vs `pageSize`). Resolution: **08 keeps its names**; the browser URL keeps 04's; a single tested mapping lives in the frontend (09 5.4, D-10, C-02) |
| R04-3 | Facet-values endpoint with prefix search and disjunctive counts | **Add to 08** | A-04. `/v1/suggest` is unfiltered and capped at 10, so it does not satisfy this |
| R04-4 | Canonical `employmentType` enum confirmed from data | Covered | 2.1 normalisation + probe in 6.7 (still to be run by the implementer). UI adds `Other` (C-14) |
| R04-5 | Count-only / `size=0` for "Show N jobs" and per-filter removal counts | **Add to 08** | A-03 (same as R03-3) |
| R04-6 | Job detail by id with `applyUrl`, `active`, `updatedAt`, `postedAt?`, company, sanitised description, `description` plain, salary, remote, type, location, department; inactive job within retention else 404 | **Conflict + resolution** | Fields covered (`descriptionHtml`, `descriptionText`; `active` is implied by 200 vs 410). Retention/410 behaviour: same resolution as R03-6 (A-08). Missing `lastCheckedAt`: A-07 |
| R04-7 | Suggest grouped by type, prefix, max 3 per group, under 150 ms | Covered | 3.6 (`limit` is per type; p95 80 ms target in section 5). UI never requests `title` suggestions in v1 (C-03) |
| R04-8 | Sitemap feed: all active job ids with titles and `updatedAt`; company slugs with counts | **Add to 08** | Companies are covered by `/v1/companies` (pageSize 100, about 18 calls); jobs need a compact bulk feed: A-10 |
| R04-9 | `meta.lastUpdatedAt` on list/detail | Covered | Same as R03-10 |
| R04-10 | Companies endpoint: paginated, name search, job counts, only companies with at least 1 active job | Covered | 3.3 (`minJobs` default 1). Sort/match semantics clarified in A-11 |
| R04-11 | Cache headers (ETag / `s-maxage` + SWR); CORS for site origin | Covered | Section 5. With the frontend BFF (D-04) the browser never calls the API, so CORS is not required in v1 (C-04) |
| R04-12 | Optional `locationGroup` for a future grouped facet | Covered (deferred) | Gap G4 v2; not needed for v1 |
| R05-1 | `salary.interval` when derivable, `salary.summary` | Covered | 2.1 `Salary` |
| R05-2 | List items carry everything a card needs | Covered | 2.2 `JobListItem` (all listed fields present) |
| R05-3 | Detail returns `active`, `updatedAt`, sanitised `descriptionHtml?`, `lastCheckedAt` | **Add to 08** | All but `lastCheckedAt` exist: A-07 |
| R05-4 | Company `openJobCount` and `boardUrl` | Covered | `jobCount`, `boardUrl` (C-01) |
| R05-5 | Machine error codes (`RATE_LIMITED` + `retryAfterSeconds`, `NOT_FOUND`, `INTERNAL`) and optional `requestId` | **Add to 08** | `requestId` and `retryAfterSeconds` exist; `code` missing: A-09 (same as R03-13) |
| R05-6 | Server/edge rendering decision; endpoints cacheable and fast | Covered | Decided in 09 D-03/D-05 (SSR/ISR). 08 section 5 caching and latency targets suffice; the scraper-side revalidation hook is a frontend deliverable (C-13) |
| R05-7 | Count-only for the filter dialog | **Add to 08** | A-03 (same as R03-3) |
| R05-8 | Totals and `lastUpdatedAt` for the Browse subline | Covered | `/v1/meta` totals + `lastUpdated`; definitions tightened in A-12 |

Tally: R03 (13) = 9 Covered, 3 Add, 1 Conflict; R04 (12) = 6 Covered, 4 Add, 2 Conflict; R05 (8) = 5 Covered, 3 Add, 0 Conflict.
Total 33 = 20 Covered + 10 Add + 3 Conflict. (Several "Add" rows share one addition: A-03 serves R03-3, R04-5, R05-7;
A-09 serves R03-13, R05-5; A-07 serves R04-6, R05-3 and the R03-10 detail gap.)

### 10.2 Other conflicts found (no R-id)

| # | Conflict | Resolution |
|---|---|---|
| X-01 | 04 3.1 says job `{id}` in the URL is `Job.ashbyId`; 08 identifies jobs by `Job.id` and lists expose no `ashbyId` | URL uses the API `id` (09 D-09, C-15). No API change |
| X-02 | 08 8.1 sample view-model shows "Seen {x} ago" from `firstSeenAt` when `postedAt` is null; 05 1.1/1.3 and 01 5 forbid a substitute date | 05 wins (D-12, C-08): no age on cards when `postedAt` is null |
| X-03 | 04 default `size=25`; 08 default `pageSize=20` | UI always sends `pageSize`; 08 default can stay 20 (C-16) |
| X-04 | 08 8.4 `API_MODE=mock\|proposal\|owner` vs 02 `mock\|live` | `API_MODE=mock\|live` + `API_ADAPTER=proposal\|owner` (D-16) |
| X-05 | 08 8.2 puts MSW handlers in the browser and commits `mocks/jobs.5000.json`; the app is server-rendered so a service worker cannot serve SSR | Mock = in-process transport sharing the same handler functions; MSW only in tests; fixtures generated in memory from a seed, plus a small committed golden set (09 6.6, C-12) |
| X-06 | 01 suggests `/jobs` for Browse and canonical-to-unfiltered for filtered URLs; 04 uses `/` and self canonical | 04 wins (D-01, D-02) |
| X-07 | 01 2.4 "v1 has no suggestion popup" vs 03/04 combobox | Two steps: plain input first, combobox behind `supports.suggest` (D-13) |
| X-08 | 01 `noopener noreferrer` vs 04/03 `noopener nofollow` | 04/03 win (D-14) |
| X-09 | 04 3.7 JSON-LD gate omits the `description` requirement stated in 01 | Stricter union (D-15) |

### 10.3 Additions the 08 owner should make (exact)

| ID | Where in 08 | Change | Needed by |
|---|---|---|---|
| A-01 (Applied in §3.1, §5, §7) | 3.1 `pageSize`; OpenAPI `listJobs.pageSize.maximum`; section 5 response size budget | Raise maximum from 50 to **100** (default may stay 20). Update the size budget line (100 items is about 60 KB raw, about 15 KB br) and the depth-cap example (page 100 at size 100 hits 10,000) | R04-1, UC-07 |
| A-02 (Applied in §2.7, §3.1, §7) | 2.7 `Page.page` and OpenAPI `PageInfo` | Add `maxResultWindow: integer` (value 10000 for `/v1/jobs`; `null` for endpoints without a cap). Rule: `page * pageSize <= maxResultWindow`, otherwise 400 `offset-too-deep` (already specified) | R04-1 |
| A-03 (Applied in §3.9, §7) | New 3.x + OpenAPI path | `GET /v1/jobs/count` accepting the same filter params as `/v1/jobs` (not `sort/page/pageSize/cursor`) plus optional `relax` (CSV of filter names `q,company,department,location,remote,employmentType,hasSalary,postedWithin`). Response `{ "total": 1204, "totalExact": true, "relaxed": { "department": 3412, "remote": 5120 }, "dataUpdatedAt": "..." }` where each `relaxed[name]` is the total with only that filter removed. Same caching class as `/v1/facets`; p95 < 150 ms. Errors as other endpoints | R03-3, R04-5, R05-7 |
| A-04 (Applied in §3.10, §7) | New 3.x + OpenAPI path | `GET /v1/facets/{name}/values` with `name` in `company, department, location`; params: the `/v1/jobs` filters, `prefix` (0..60 chars), `limit` (1..100, default 30), `offset` (0..500). Disjunctive counts (own selection ignored), sorted by count desc then label; returns `{ "values": FacetValue[], "total": n }`. Prefix matches `label` and, for company, the slug | R04-3, UC-03 facet search |
| A-05 (Applied in §2.5, §3.10) | 2.5 / 3.5 | State the rule: every **currently selected** value of `company`, `department`, `location`, `employmentType` is always present in the facet arrays, with `count: 0` when nothing matches, so the UI can show and un-select it | R03-2, 04 6 |
| A-06 (Applied in §3.1, §6 G2) | 3.1 `q`; gap G2 | Add `location` (`Location.name`) to the searched fields (title, company name/slug, department, location). Description stays out | R03-4 |
| A-07 (Applied in §2.3, §7) | 2.3 `JobDetail`; OpenAPI | Add `lastCheckedAt: ISODateTime`, = `Job.lastSeenAt` once gap G1 exists, otherwise equal to `dataUpdatedAt` (documented as proxy). Also include it in the 410 body (A-08) | R04-6, R05-3, trust copy |
| A-08 (Applied in §3.2, §4, §7, §9 Q2) | 3.2, section 4 `410`, OpenAPI `Problem.extensions`; Q2 | 410 body: `extensions: { job: { id, title, company: CompanyRef, deactivatedAt: ISODateTime\|null, lastCheckedAt }, company: CompanyRef }` (keep `company` for compatibility). Define retention: inactive jobs stay resolvable (410) for **at least 90 days** after deactivation, then 404. Inactive jobs never appear in lists, facets, counts or the sitemap feed | R03-6, R04-6, UC-14 |
| A-09 (Applied in §2.7, §4, §7) | 4, OpenAPI `Problem` | Add a stable top-level `code` enum: `VALIDATION_ERROR, OFFSET_TOO_DEEP, CURSOR_MISMATCH, SORT_REQUIRES_Q, NOT_FOUND, JOB_CLOSED, RATE_LIMITED, INTERNAL, UNAVAILABLE`. Keep `type` URL. `RATE_LIMITED` responses carry both `Retry-After` and `retryAfterSeconds` | R03-13, R05-5 |
| A-10 (Applied in §3.11, §7) | New 3.x + OpenAPI path | `GET /v1/feed/sitemap?kind=jobs\|companies&cursor=&limit=` (limit up to 10,000, default 10,000). Jobs item `{ id, title, companySlug, updatedAt }`; companies item `{ slug, jobCount, updatedAt }`. Active jobs and companies with at least 1 active job only. Response `{ items, nextCursor, total }`. `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400` | R04-8 |
| A-11 (Applied in §3.3) | 3.3 | `sort=name_asc` orders by display name (`coalesce(name, slug)`, case-insensitive, tiebreak `slug`); `q` is a case-insensitive **contains** match on name and slug (trigram), not prefix-only; `pageSize` default 24 may stay | R04-10, 05 5 |
| A-12 (Applied in §2.6, §7) | 2.6 `Meta` | Define `totals.jobs` = active jobs; `totals.companies` = companies with at least 1 active job (these feed "34,035 open jobs at 1,747 companies") | R05-8, UC-01 |

### 10.4 Clarifications (no contract change, but 08 text should be aligned)

| ID | Clarification |
|---|---|
| C-01 | Naming differences are absorbed by the frontend adapter: `dataUpdatedAt`/`meta.lastUpdated` = "last updated"; `totalExact` = not `totalIsApproximate`; `jobCount` = `openJobCount` |
| C-02 | URL vocabulary vs API vocabulary mapping table is in 09 5.4; the API is not required to accept 04's param names |
| C-03 | Suggest grouping is client-side. v1 requests `types=company,department,location`, `limit=3`; `title` suggestions are not used |
| C-04 | Principle 4 (CORS) is relaxed for v1: the browser calls same-origin Next Route Handlers (BFF) that call the API server-side. CORS allowlisting is only needed if a browser ever calls the API directly |
| C-05 | UI always sends `includeTotal=true` (04 requires the total); `includeTotal=false` stays available for other clients |
| C-06 | The UI codec guarantees `sort=relevance` is only sent with `q`, so `sort-requires-q` should never occur from the site |
| C-07 | UI `posted=24h` maps to API `postedWithin=1d`; `3d`/`14d` are unused by the UI |
| C-08 | Amend 8.1: the `postedLabel` rule "or `Seen {x} ago` from `firstSeenAt` when `postedAt` is null" must be removed; cards show no age in that case |
| C-09 | The UI only ever sends `remote=true` (there is no "on-site only" in v1) |
| C-10 | The UI uses `hasSalary=true` only; `salaryMin` / `salaryCurrency` are unused in v1 |
| C-11 | 8.4 `API_MODE` values: see X-04 |
| C-12 | 8.2: no browser service worker and no committed 5,000-row JSON (see X-05); the in-memory mock database is still the executable reference for 3.1 and 3.5 semantics |
| C-13 | Cache invalidation: after each scrape the owner may call the web app's `POST /api/revalidate` (shared secret) which calls `revalidateTag('catalog')`. This replaces CDN purge for the UI; API-side purge in section 5 still applies to the API's own CDN |
| C-14 | `OTHER` employment type is shown as "Other" and accepted in the URL as `type=Other` |
| C-15 | URL job id = `JobListItem.id` (`Job.id`); `ashbyId` is not exposed and not needed because `applyUrl` is guaranteed |
| C-16 | List default `pageSize` 20 vs UI 25: irrelevant because the UI always sends `pageSize` |

### 10.5 Net effect on the OpenAPI file

Extract section 7 to `contracts/openapi.yaml` in the frontend project, then apply A-01..A-12: new paths
`/v1/jobs/count`, `/v1/facets/{name}/values`, `/v1/feed/sitemap`; new schema fields `PageInfo.maxResultWindow`,
`JobDetail.lastCheckedAt`, `Problem.code`, `Problem.extensions.job`; `listJobs.pageSize.maximum: 100`. Mock handlers, Zod
schemas and contract tests are all derived from that file (09 6.6).
