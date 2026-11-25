# 03 · External API Endpoints

> This project **exposes no HTTP endpoints**. Below is every external endpoint it **calls**, with exact parameters,
> real response shapes (verified live on 2026-10-22), and how the code handles errors. Request parameters, headers,
> timeouts and retry values were re-verified against `src/` on 2026-10-22.

| # | Service | Method & URL | Auth | Used by |
|---|---------|--------------|------|---------|
| 1 | Ashby Posting API | `GET https://api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=true` | none | `src/lib/AshbyClient.ts` (`Scraper.ts`, `ClusterScraper.ts` workers) |
| 2 | Ashby Posting API | `GET https://api.ashbyhq.com/posting-api/job-board/{slug}` | none | `src/lib/AshbyClient.ts` (`ScraperCSV.ts`) |
| 2b | Ashby Hosted GraphQL API (Fallback) | `POST https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams` | none | `src/lib/AshbyClient.ts` `fetchFromAshbyGraphQL()` (fallback on 404/403/400) |
| 2c | Ashby Hosted Board page | `GET https://jobs.ashbyhq.com/{slug}` (HTML) | none | `src/lib/AshbyClient.ts` `fetchOrganizationMetadata()` (`npm run discover -- --enrich`) |
| 2d | Greenhouse Job Board API (Jobs) | `GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true&pay_transparency=true` | none | `src/lib/ats/GreenhouseClient.ts` `fetchBoard()` (`Scraper.ts`, `ClusterScraper.ts`) |
| 2e | Greenhouse Job Board API (Board Info) | `GET https://boards-api.greenhouse.io/v1/boards/{token}` | none | `src/lib/ats/GreenhouseClient.ts` `fetchCompanyMetadata()` (`SeedGreenhouse.ts`, `EnrichCompanies.ts`) |
| 2f | Lever Postings API (Board Jobs) | `GET https://api.lever.co/v0/postings/{site}?mode=json` | none | `src/lib/ats/LeverClient.ts` `fetchBoard()`, `validateSite()` (`Scraper.ts`, `ClusterScraper.ts`, `SeedLever.ts`, `LeverDiscovery.ts`) |
| 2g | Lever Hosted Board page (HTML) | `GET https://jobs.lever.co/{site}` | none | `src/lib/ats/LeverClient.ts` `validateSite()`, `fetchCompanyMetadata()` (`SeedLever.ts`, `LeverDiscovery.ts`, `EnrichCompanies.ts`) |
| 3 | Wayback CDX | `GET http://web.archive.org/cdx/search/cdx` | none | `src/discovery/CdxWorker.ts`, `src/discovery/LeverDiscovery.ts` (+ manual download for `process:cdx`) |
| 3b | CommonCrawl Index | `GET https://index.commoncrawl.org/CC-MAIN-2024-51-index` | none | `src/discovery/CdxWorker.ts` `fetchCommonCrawlUrls()` (`npm run discover -- --common-crawl`) |
| 4 | Google Drive v3 | `files.create` (multipart upload), `files.list` | Service-account JWT | `src/lib/GoogleDriveOAuth.ts` |
| 5 | Google Drive v3 | `files.create`, `files.list` | User OAuth2 (Desktop app) | `src/lib/GoogleDriveUserOAuth.ts` |
| 6 | Google OAuth2 | consent URL / token exchange / refresh | OAuth client id+secret | `src/lib/GoogleDriveUserOAuth.ts` |
| — | Public job page (link only, not called) | `https://jobs.ashbyhq.com/{slug}/{jobId}` | — | CSV `Job Link` column |

**Shared headers — `BROWSER_HEADERS` (`src/lib/AshbyClient.ts`)**, sent on endpoints 1, 2, 2b and 2c:

| Header | Value |
|---|---|
| `User-Agent` | `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36` |
| `Accept` | `application/json, text/plain, */*` |
| `Accept-Language` | `en-US,en;q=0.9` |

---

## 1–2. Ashby Public Job Posting API

**Endpoint:** `GET https://api.ashbyhq.com/posting-api/job-board/{JOB_BOARD_NAME}`

| Param | Where | Values | Used |
|---|---|---|---|
| `{JOB_BOARD_NAME}` | path | company slug, e.g. `1password`, `abridge` (interpolated as-is, not URL-encoded) | all scrapers |
| `includeCompensation` | query | `true` / omitted | `Scraper.ts` (`includeCompensation: true`); `ScraperCSV.ts` passes `false` → omitted |

**Client config — `fetchAshbyBoardWithFallback(slug, { includeCompensation = false, maxRetries = 2, baseDelayMs = 300 })` (`src/lib/AshbyClient.ts`):**
- axios `GET`, `timeout: 10000` ms, `BROWSER_HEADERS`.
- Up to `maxRetries + 1 = 3` attempts. Retries only when `isRetryableError(err)` is true: HTTP `429`, `500`, `502`,
  `503`, `504`, or error codes `ECONNABORTED`, `ETIMEDOUT`, `ECONNRESET`. Delay before retry *n* (0-based) is
  `baseDelayMs · 2ⁿ + random(0–99)` ms → ≈300 ms, ≈600 ms.
- `rateLimited: true` in the result if **any** attempt got `429` **or `403`**.
- On a final `404`, `403` or `400` → falls back to endpoint 2b (`fetchFromAshbyGraphQL()`).
- On `200`: `sanitizeJobBatch(data.jobs || [], slug)` (`src/lib/Sanitizer.ts`) → `{ validJobs, issues }`; returns
  `{ slug, jobs: validJobs, notFound: false, rateLimited, source: 'rest', validationIssues: issues }`.

### Response (200)

```jsonc
{
  "apiVersion": "1",
  "jobs": [
    {
      "id": "uuid",                        // → Job.ashbyId, CSV link
      "title": "Senior Engineer",          // → Job.title, CSV
      "department": "Engineering",         // → Department.name, CSV
      "team": "Platform",                  // (stored only inside metadata)
      "employmentType": "FullTime",        // FullTime | PartTime | Intern | Contract | Temporary
      "location": "San Francisco",         // → Location.name, CSV
      "secondaryLocations": [ { "location": "NYC Office", "address": { "postalAddress": { ... } } } ],
      "publishedAt": "2025-07-11T22:30:33.442+00:00", // → CSV Published Date (YYYY-MM-DD via sanitizePublishedDate)
      // Note on timestamps: Ashby exposes NO update timestamp on REST (only publishedAt), GraphQL (publishedDate only;
      // requesting updatedAt is a schema error), or JSON-LD (datePosted only). Job last-updated time is detected
      // deterministically by the scraper when job contentHash changes (ADR-0018).
      "isListed": true,
      "isRemote": false,                   // sanitizer also forces true when location contains "remote"
      "workplaceType": "Hybrid",           // OnSite | Remote | Hybrid
      "address": { "postalAddress": { "addressLocality": "San Francisco", "addressRegion": "California", "addressCountry": "USA" } },
      "jobUrl": "https://jobs.ashbyhq.com/<slug>/<id>",
      "applyUrl": "https://jobs.ashbyhq.com/<slug>/<id>/application", // → Job.applyUrl
      "shouldDisplayCompensationOnJobPostings": true,
      "descriptionHtml": "<p>…</p>",       // sanitized by sanitizeJobDescriptionHtml() inside metadata
      "descriptionPlain": "…",             // sanitized by sanitizeJobDescriptionPlain() inside metadata
      // only present with includeCompensation=true:
      "compensation": {
        "compensationTierSummary": "$205K – $300K • Offers Equity",
        "scrapeableCompensationSalarySummary": "$205K - $300K",
        "compensationTiers": [
          { "id": "…", "tierSummary": "…", "title": null, "additionalInformation": null,
            "components": [ { "id": "…", "summary": "Base Salary $205K – $300K", "compensationType": "Salary",
                              "interval": "1 YEAR", "currencyCode": "USD", "minValue": 205000, "maxValue": 300000 } ] }
        ],
        "summaryComponents": [
          { "compensationType": "Salary", "interval": "1 YEAR", "currencyCode": "USD", "minValue": 205000, "maxValue": 300000 },
          { "compensationType": "EquityCashValue", "interval": "1 YEAR", "currencyCode": "USD", "minValue": null, "maxValue": null }
        ]
      }
    }
  ]
}
```

> **Compensation extraction (`extractSalary` in `src/lib/AshbyClient.ts`):** first match wins —
> (1) `compensation.summaryComponents` entry with `compensationType === 'Salary'` and a non-null `minValue`/`maxValue`;
> (2) the first such component inside `compensation.compensationTiers[].components`; (3) legacy `compensationTier
> { min, max, currency }`; else `{}`. Feeds `Job.salaryMin`, `Job.salaryMax`, `Job.salaryCurrency`, and `contentHash`.
> `interval` is ignored (hourly and yearly amounts are stored the same way).

### Error behaviour

| Situation | Real API response | Result of `fetchAshbyBoardWithFallback()` | `Scraper.ts` | `ScraperCSV.ts` |
|---|---|---|---|---|
| Posting API disabled, hosted board live | `404`/`403`/`400` on REST, GraphQL returns `jobBoard` | `source: 'graphql'`, jobs from GraphQL | stores jobs, `graphqlFallbacksUsed++` + `graphql_fallback` event | writes rows, same telemetry |
| Unknown / removed board | `404` body `Not Found` (text), GraphQL `jobBoard: null` | `notFound: true`, `source: 'none'` | `companiesNotFound++`, `recordNotFoundStrike(slug, 3)` (NOT_FOUND on 3rd strike) | `companiesNotFound++`, no DB change |
| `403`/`400` and GraphQL also fails | — | `notFound: false`, `source: 'none'`, `rateLimited: true` if 403 | 0 jobs, limiter throttles | `[]`, limiter throttles |
| Board exists, no openings | `200 { jobs: [] }` | `source: 'rest'`, `jobs: []` | 0 jobs, company stays ACTIVE; existing active jobs are deactivated | `[]` |
| Timeout (>10 s), 429, 5xx, `ECONNRESET` | — | retried (3 attempts total); then `source: 'none'` (`rateLimited: true` if any attempt was 429) | 0 jobs, no `api_error` event (a 429 still bumps `rateLimitsEncountered` and throttles the limiter) | `[]`, same as `Scraper.ts` |
| Other errors (e.g. 401, DNS failure) | — | not retried; `source: 'none'` | silently 0 jobs | silently `[]` |

---

## 2b. Ashby Hosted GraphQL API (fallback)

**Endpoint:** `POST https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams` — the API that the public
`jobs.ashbyhq.com/<slug>` page itself uses. Called by `fetchFromAshbyGraphQL(slug)` (`src/lib/AshbyClient.ts`).

| Item | Value |
|---|---|
| Headers | `BROWSER_HEADERS` + `Content-Type: application/json`, `Origin: https://jobs.ashbyhq.com`, `Referer: https://jobs.ashbyhq.com/<encodeURIComponent(slug)>` |
| Timeout | `10000` ms, **no retry** |
| Body | `{ operationName: 'ApiJobBoardWithTeams', variables: { organizationHostedJobsPageName: slug }, query }` |
| Query fields | `jobBoard: jobBoardWithTeams(organizationHostedJobsPageName)` → `teams { id name parentTeamId }`, `jobPostings { id title teamId locationId locationName workplaceType employmentType secondaryLocations { locationId locationName } compensationTierSummary }` |

**Response:** `{ "data": { "jobBoard": { "teams": [...], "jobPostings": [...] } } }`. If `data.jobBoard` is missing or
`jobPostings` is not an array → `{ boardExists: false, jobs: [] }`; any thrown error is also treated as `boardExists: false`.

**Mapping to `AshbyJob`:** `department` = team name looked up from `teamId`; `location` = `locationName`;
`applyUrl` = `https://jobs.ashbyhq.com/{slug}/{id}/application`; `jobUrl` = `https://jobs.ashbyhq.com/{slug}/{id}`;
`isRemote` = `workplaceType === 'Remote'`; `compensation` = `{ compensationTierSummary }` only. Jobs are then run through
`sanitizeJobBatch()`, but its `issues` are **discarded** (the fallback result carries no `validationIssues`).
GraphQL-sourced jobs therefore have **no `publishedAt`** (empty CSV `Published Date`) and **no numeric salary**
(`extractSalary()` returns `{}` because only the summary string is fetched).

## 2c. Ashby Hosted Board page (organization metadata)

`fetchOrganizationMetadata(slug)` → `GET https://jobs.ashbyhq.com/<encodeURIComponent(slug)>` (`BROWSER_HEADERS`,
`timeout: 10000`). Extracts `window.__appData = {...};` with a regex, `JSON.parse`s it, and returns
`{ name: organization.name, logoUrl: organization.theme.logoWordmarkImageUrl || organization.theme.logoSquareImageUrl }`,
or `null` on any failure. Used only by `enrichCompanyMetadata()` in `src/discovery/CdxWorker.ts`.

---

## 2d–2e. Greenhouse Public Job Board API (`src/lib/ats/GreenhouseClient.ts`)

**Endpoints (verified live on 2026-10-26/27 across airbnb, stripe, discord, figma, gitlab):**
- **Jobs:** `GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true&pay_transparency=true`
  - One call per board returns every published job, no auth, no pagination.
  - Unknown board → `404 {"status":404,"error":"Job not found"}`.
- **Board Info:** `GET https://boards-api.greenhouse.io/v1/boards/{token}`
  - Returns `{"name":"Discord","content":"..."}` (no logo URL in v1).
  - Unknown board → `404 {"status":404,"error":"Job board not found"}`.
  - **Important (BF-023):** Because the 404 body text differs between `/jobs` (`"Job not found"`) and `/v1/boards/{t}` (`"Job board not found"`), `notFound` is decided strictly by **HTTP status 404**, never by message text.

**Client & WAF Behaviour:**
- Sends `BROWSER_HEADERS` plus `Accept-Encoding: gzip` (stripe: 5.5 MB raw → 1.9 MB gzip), `timeout: 15000` ms.
- Shares retry/backoff logic with Ashby via `src/lib/ats/http.ts` (`isRetryableError`, `parseRetryAfterSeconds` capped at 10 s, `computeRetryDelayMs`, `classifyFetchFailure`).
- Only HTTP `429` sets `rateLimited: true` (BF-015/BF-023).
- `200` with `jobs: []` returns an empty board with `fetchMode: 'primary'` (existing empty-board deferral in `Scraper.ts` applies).
- Tokens are case-insensitive (lower-cased on lookup). EU boards (`job-boards.eu.greenhouse.io/{t}`) are served by the same `boards-api.greenhouse.io` API host; their `absolute_url` preserves the EU host, which `canonicalUrls` prefers when it is a `*.greenhouse.io` host. `boards.greenhouse.io/*` 301-redirects to `job-boards.greenhouse.io/*`.

**Job Fields & Normalization (`normalizeGreenhouseJob`):**
- `id` (numeric, globally unique across boards) → `externalId: String(id)`, `legacyKey: "greenhouse:" + id` (stored in `Job.ashbyId`).
- `internal_job_id` repeats across distinct job posts — **never** dedupe on `internal_job_id`.
- `title`, `company_name`, `updated_at` (stored in `raw` metadata only; `sourceUpdatedAt` is `null` in v1 per ADR-0021 so internal edits do not trigger false freshness updates), `first_published` (converted to ISO UTC `publishedAt`).
- `location.name`: free text (`"Remote - USA"`, `"A • B"`, `"A; B"`, `"N/A"`). Primary `location` is the first segment split on `•`, `;`, or ` or ` (`"N/A"` → `""`); remaining segments go to `secondaryLocations`.
- Country / region / city (`postal`): the job's own `location.name` (first segment) is parsed first; if it names a country it wins, even when the office list disagrees (a job in "Dublin, Ireland" with a Berlin office is Ireland). When an office has the same country and city, that office's fuller region name is used. If the text has no country ("Denver", "Remote"), the `offices[].location` list is used, preferring the office whose city equals the job's city, then the first one. Parsing is from the right (`last = country`, `first = city`, `middle = region`) with these rules: a trailing US ZIP (`NC - 27410`, `TX 78701`, `10036`) is dropped, a trailing US state code or full state name maps to `US` (never New Caledonia, Albania, Israel or the country Georgia), `Remote - X` prefixes are stripped, and address-style parts (`Name - 900 Hobbs Rd - Greensboro`) keep the last ` - ` segment as the city. Also handled: `City ST` without a comma (`Atlanta GA`), Canadian province codes (`Toronto, ON` -> CA), a trailing period (`PA.`), `US, Georgia` (a US marker before it makes it the state), a company suffix after the country (`United Kingdom - Deliveroo`) and slash lists (`Sao Paulo / SP / Brazil`).
- `content`: **HTML-entity-escaped** (`&lt;`, `&gt;`, `&quot;`, `&amp;`, `&#39;`, numeric entities) — unescaped **exactly once** via single-pass `decodeHtmlEntities` before `sanitizeJobDescriptionHtml` and `sanitizeJobDescriptionPlain`. The raw escaped `content` is dropped from `raw` metadata so descriptions are never stored twice.
- `pay_input_ranges[]` (returned only when `pay_transparency=true`): integer **cents** (`min_cents` / `max_cents` ÷ 100), `currency_type`, and interval `'1 HOUR'` when `title` (or fallback `blurb`) matches `/\bhourly\b|per hour/i`, else `'1 YEAR'`.
- `raw` (`Job.metadata`) carries `descriptionHtml`, `descriptionPlain`, `jobUrl`, `team: null`, `secondaryLocations`, `_source: 'rest'`, `_ats: 'greenhouse'`, `_normVersion: 1`, `updated_at`, `departments`, `offices`, and `metadata`.

---

## 2f–2g. Lever Public Postings API & Hosted Board (`src/lib/ats/LeverClient.ts`)

**Endpoints (verified live on 2026-11-16 across palantir, spotify, zoox, matchgroup, veeva, outreach, binance, AIFund, arcteryx.com, 1840&Company):**
- **Postings List:** `GET https://api.lever.co/v0/postings/{site}?mode=json`
  - Returns a JSON array of every published posting in one call (no auth; paging via `&limit=N&skip=M` exists but is unused in v1). No `gzip`/`br` compression support.
  - Unknown site → `404 {"ok":false,"error":"Document not found"}`.
  - Live site with 0 open jobs → `200 []` (seen on `lever`, `wealthsimple`, `whoop`, `shieldai`).
  - **Non-array `200` body** fails loudly (`failure.code = 'unexpected_body'`, `fetchMode = 'none'`).
- **Hosted Board HTML:** `GET https://jobs.lever.co/{site}` (with `Accept: text/html,application/xhtml+xml,*/*;q=0.8`).
  - Used by `validateSite(token)` and `fetchCompanyMetadata(ref)`.
  - **Dead boards:** some sites (e.g. `AIFund`, `1840&Company`) return `200` on `/v0/postings/{site}` while `jobs.lever.co/{site}` returns `404` (`validateSite` returns `'dead_board'`).
  - **Logo vs banner trap:** `og:image` is the `1200x630` banner (even on the same S3 host); `extractLeverLogo()` extracts only the header `<img>` with `alt` ending in `logo` on `lever-client-logos.s3.<region>.amazonaws.com` or `lever-client-logos.s3.amazonaws.com` (`og:image` is never used). Company name is read from `<title>`.

**Site Naming, Rate Pacing & Scope:**
- Site names are **case-sensitive** (`spotify` → `200`, `Spotify` → `404`) and may contain `.` and `&` (`arcteryx.com`, `1840&Company`): tokens are preserved verbatim in `Company.atsToken`, URL-encoded via `encodeURIComponent(token)` in API/board URLs, and allocated a permanent slug via `allocateCompanySlug()` (`lv--<sanitized>`, appending `-2`, `-3`, … only on collision).
- `api.lever.co/robots.txt` declares `Crawl-delay: 1`: `LeverClient` serializes all HTTP starts through a per-instance pacer (`minIntervalMs` default `1000`, `initialDelayMs` default `0`, `timeout` `60000` ms) and `Scraper.getLimiter('lever')` forces concurrency `1`. In `scrape:parallel`, workers receive `leverMinIntervalMs = 1000 * workerCount` and staggered `leverInitialDelayMs = (workerId - 1) * 1000` so aggregate traffic stays ≤ 1 req/s.
- Retryable errors (`429`, `500`, `502`, `503`, `504`, `ECONNABORTED`, `ETIMEDOUT`, `ECONNRESET`) wait on the pacer on every retry (`maxRetries = 2`, `baseDelayMs = 300`, `Retry-After` capped at 10 s); only HTTP `429` sets `rateLimited: true`.
- EU boards (`api.eu.lever.co`, `jobs.eu.lever.co`) return `404` on `api.lever.co` and are out of scope in v1.

**Job Fields & Normalization (`normalizeLeverJob`):**
- `id` (UUID) → `externalId`, `legacyKey: "lever:" + id` (stored in `Job.ashbyId`), deduped by `id` per board. Missing/invalid `id` or empty/placeholder `text` → filtered with a `ValidationIssue`.
- `categories.department` → `department`, falling back to `categories.team` when `department` is absent; `categories.location` / `categories.allLocations[0]` → primary `location` (`postal`/`country` parsed via shared `parsePlace()`, preferring explicit `raw.country`); `allLocations.slice(1)` → `secondaryLocations` in `raw`.
- `categories.commitment` maps case-insensitively (`Scholarship` → `Intern`, `Seasonal`/`Fixed-Term`/`Short Term`/`Temp` → `Temporary`, `Freelance`/`Contract` → `Contract`, `Full-Time`/`Permanent`/`Full Time/Part Time` → `FullTime`, `Part-Time`/`PT` → `PartTime`; `"International"` does not match `Intern`), falling back to `inferEmploymentTypeFromTitle(title)`.
- `createdAt` (epoch milliseconds) → ISO UTC `publishedAt`; `sourceUpdatedAt: null` (Lever exposes no updated-at timestamp).
- `description`, `lists[]` (`<ul>` wrapper when bare `<li>`), `salaryDescription`, and `additional` (already raw HTML, **never** HTML-entity-unescaped) are joined, sanitized via `sanitizeJobDescriptionHtml` / `sanitizeJobDescriptionPlain`, and dropped from extra `raw` metadata (`lists`, `opening`, `openingPlain`, `descriptionBody`, `descriptionBodyPlain`, `additional`, `additionalPlain`, `salaryDescription`, `salaryDescriptionPlain` are omitted from `raw`).
- `salaryRange` uses plain currency units (no `/ 100`): `per-year-salary` → `'1 YEAR'`, `per-month-salary` → `'1 MONTH'`, `per-hour-wage` → `'1 HOUR'`, `one-time` → `null` salary.

---

## 3. Wayback Machine CDX API

**Endpoint:** `GET http://web.archive.org/cdx/search/cdx` (plain HTTP, no timeout, no custom headers)

| Param | Value | Meaning |
|---|---|---|
| `url` | `jobs.ashbyhq.com/*` | all archived URLs under the Ashby jobs host |
| `output` | `json` | array-of-arrays response |
| `fl` | `original` | return only the original URL column |
| `collapse` | `urlkey` | dedupe identical URLs |
| `limit` | `1000` | ⚠️ default parameter of `fetchAshbyUrls(limit = 1000)` in `CdxWorker.ts`; never overridden |

**Response:**
```json
[["original"], ["https://jobs.ashbyhq.com/1password"], ["https://jobs.ashbyhq.com/1password/abc-uuid"], ...]
```
First row is the header (skipped). Slug = first path segment. Errors → logged, returns `[]`.

For the bulk path, the same URL (without `limit`) is downloaded manually and fed to `npm run process:cdx -- file.json`.

## 3b. CommonCrawl Index API (Ashby)

**Endpoint:** `GET https://index.commoncrawl.org/CC-MAIN-2024-51-index` (crawl ID hard-coded in `COMMON_CRAWL_INDEX_URL`)

| Param | Value |
|---|---|
| `url` | `jobs.ashbyhq.com/*` |
| `output` | `json` |
| `fl` | `url` |

`timeout: 15000`. **Response is JSONL** (one JSON object per line, e.g. `{"url": "https://jobs.ashbyhq.com/acme/…"}`);
the code splits on `\n`, parses each line and keeps `.url`. Non-string body or any error → `[]`. Reads up to `maxPages = 3` pages.

## 3c. CommonCrawl Paged CDX API (Greenhouse Discovery & Enrichment)

**Endpoints:**
- Latest crawl ID: `GET https://index.commoncrawl.org/collinfo.json` (extracts latest crawl id, e.g. `CC-MAIN-...`, falling back to `CC-MAIN-2024-51` on network failure)
- Common Crawl Index: `GET https://index.commoncrawl.org/{crawlId}-index`

**Greenhouse Discovery Behaviour (`src/discovery/CdxWorker.ts` with `--source=greenhouse`):**
- Crawls Greenhouse hosts: `job-boards.greenhouse.io`, `boards.greenhouse.io`, `job-boards.eu.greenhouse.io`, `boards.eu.greenhouse.io`.
- Unpaged queries for Greenhouse hosts return 504 Gateway Timeout; discovery queries `showNumPages=true` to retrieve total page count, then pages `page=0..N-1` with retry and exponential backoff. On 504 timeouts or failures, falls back to narrower prefixes (`a*`..`z*`, `0*`..`9*`).
- Token extraction: extracts first path segment lower-cased and `embed/job_board?for=<token>`; drops reserved segments (`embed`, `jobs`, `job_app`, `v1`, `api`, `static`, `assets`, etc.); enforces regex `^[a-z0-9][a-z0-9_-]{1,59}$`.
- Budget & Filtering: filters out tokens already present in the database with `source = 'GREENHOUSE'`. Validates at most 500 new tokens per run. Stops cleanly when the 20-minute time budget is reached.
- Validation: calls `GET https://boards-api.greenhouse.io/v1/boards/{token}` at ≤ 5 concurrent. 200 OK upserts `Company` with `slug = 'gh--' + token`, `source = 'GREENHOUSE'`, `atsToken = token`, `name`, `status = ACTIVE`. 404 drops the token. 429 backs off honoring `Retry-After`.
- Empty Greenhouse boards stay hidden from `/v1/companies`, `/v1/companies/:slug`, and Redis Publisher until jobs are scraped.

**Greenhouse Best-Effort Logo Enrichment (`src/lib/ats/GreenhouseClient.ts`, `src/utils/EnrichCompanies.ts`):**
- Hosted page: `GET https://job-boards.greenhouse.io/{token}` (HTML).
- Extracts `og:image` (or the header logo `<img>`) and accepts it only when it is an absolute `https://` URL on a `greenhouse.io` host under `/external_greenhouse_job_boards/logos/` (the board's uploaded logo). Boards without one (e.g. Figma, Robinhood) set `og:image` to a 1200×630 marketing banner on another CDN, which is rejected: the result is `null` and the UI displays company initials. HTML entities (`&amp;`) in the URL are decoded.
- Retried at most once per 7 days using `Company.lastCheckedAt`, capped at 200 companies per run in `enrich:companies`.

## 3d. Wayback Machine CDX API (Lever Discovery & Enrichment)

**Why Wayback CDX instead of Common Crawl:** `https://jobs.lever.co/robots.txt` declares `Disallow` for `CCBot`, so Common Crawl contains almost no Lever board URLs (524 URLs measured in `CC-MAIN-2026-43`). Lever discovery (`src/discovery/LeverDiscovery.ts`, invoked via `npm run discover -- --source=lever`) therefore harvests archived URLs from Wayback Machine CDX instead.

**Wayback CDX Prefix Queries:**
- Iterates prefixes `a…z`, `0…9`:
  `GET http://web.archive.org/cdx/search/cdx?url=jobs.lever.co/{p}&matchType=prefix&fl=original&collapse=urlkey&from=<currentYear-2>&limit=20000&showResumeKey=true`
- Continues with `&resumeKey=<key>` whenever a trailing resume key is returned, stopping at 50 % of `--time-budget-min` (default `100` min -> `50` min harvest / `50` min validation).
- Enforces `>= 1 s` pacing between Wayback requests. Transient `503`/`504`/timeouts (~40 % of Wayback prefix calls) are retried up to 3× via `fetchWithRetry()` with 30–60 s backoff and `429 Retry-After` honoring. If a primary prefix fails after all retries, it splits once into 40 two-character prefixes (`a0…a9`, `aa…az`, `a-`, `a.`, `a_`, `a%26`) and counts only sub-prefixes that finally fail.

**Token Extraction, Validation & Persistent State:**
- `extractLeverToken()` keeps only `jobs.lever.co` URLs (`jobs.eu.lever.co` is rejected; EU boards on `api.eu.lever.co` are out of scope for v1), safely `decodeURIComponent`-decodes the first path segment, preserves exact case (plus `.` and `&`, e.g. `AIFund`, `arcteryx.com`, `1840&Company`, `100ms`), enforces `/^[A-Za-z0-9][A-Za-z0-9._&-]{0,79}$/`, and rejects reserved segments (`img`, `css`, `js`, `assets`, `static`, `favicon.ico`, `robots.txt`, `sitemap.xml`, `v0`, `api`, `search`, `embed`) case-insensitively. Tokens are deduplicated case-sensitively (`assembly` and `Assembly` are tracked separately).
- Harvest cursors (`nextPrefix`, `resumeKey`, `completedAt`) and per-token outcomes are persisted in `backend/output/lever-discovery-state.json` (restored/saved in GitHub Actions cache `lever-discovery-v1-*`; never printed; missing/corrupt file starts fresh at `a`).
- Validation excludes tokens already present in `Company` (`source = 'LEVER'`, exact `atsToken` match), then checks never-validated tokens first followed by rejected tokens (`empty`, `not_found`, `dead_board`, `error`) older than 30 days (oldest first), capped at `--budget` (default `500`).
- Each candidate runs through `LeverClient.validateSite()` (`<= 1 req/s`, concurrency 1): a site is seeded **only** when `'live'` (API returns `>= 1` posting **and** `https://jobs.lever.co/{site}` returns `200`). Live sites get permanent collision-safe `lv--<sanitized>` slugs via `allocateCompanySlug()` and are upserted by `(source, atsToken)` (`status = 'ACTIVE'`; company display name/logo are fetched when `--enrich` and time remain, or left to `enrich:companies`).

**Lever Best-Effort Logo & Name Enrichment (`src/utils/EnrichCompanies.ts`, `src/lib/ats/LeverClient.ts`):**
- Queries active `LEVER` boards missing `logoUrl` or `name` (or `name = slug`), retried at most once per 7 days via `Company.lastEnrichedAt` (`>= 7 days` cooldown), capped at `200` companies per source per run.
- `extractLeverLogo()` extracts only the header `<img alt="… logo">` on `lever-client-logos.s3.<region>.amazonaws.com` or `lever-client-logos.s3.amazonaws.com` (never the `og:image` banner) and reads company display name from `<title>`.

---

## 4. Google Drive v3 — Service Account (used by `scrape:csv --upload-cloud`)

File: `src/lib/GoogleDriveOAuth.ts` (despite the name, this is **JWT/service-account** auth).

| Item | Value |
|---|---|
| Credentials file | `apikeys/google-credentials.json` (needs `client_email`, `private_key`) |
| Scope | `https://www.googleapis.com/auth/drive` |
| Auth | `new google.auth.JWT({ email, key, scopes })` → `authorize()`; missing file → prints setup steps, returns `null`; a failed `auth.authorize()` **throws** (`Error authorizing Google Drive API: …`), which propagates out of `uploadWithOAuth()` |
| Upload call | `drive.files.create({ requestBody: { name, parents?: [folderId] }, media: { mimeType: 'text/csv', body: stream }, fields: 'id, webViewLink', supportsAllDrives: true })` |
| List call | `drive.files.list({ pageSize: 10, fields: 'files(id, name)', supportsAllDrives: true })` |
| Returns | `webViewLink` or `https://drive.google.com/file/d/{id}/view`; `null` on failure |

**Known limitation:** service accounts have **no storage quota** on personal ("My Drive") accounts → upload fails with
a "storage quota" error unless the target is a **Shared Drive**. Code prints the service-account email as a hint.

## 5–6. Google Drive v3 — User OAuth2 (alternative user OAuth flow)

File: `src/lib/GoogleDriveUserOAuth.ts`.

| Item | Value |
|---|---|
| Client file | `apikeys/oauth-credentials.json` (`installed` or `web` → `client_id`, `client_secret`, `redirect_uris`; redirect defaults to `http://localhost`) |
| Token cache | `apikeys/oauth-token.json` (written after consent / refresh) |
| Scope | `https://www.googleapis.com/auth/drive.file` (only files created by the app) |
| Flow | `generateAuthUrl({ access_type: 'offline' })` → user pastes code in terminal → `getToken(code)` → save token. On expiry (`expiry_date < now`): `refreshAccessToken()`; on refresh failure: delete token & restart consent |
| Upload | `files.create` with MIME by extension (`.csv, .txt, .json, .pdf`, else `application/octet-stream`), `fields: 'id, webViewLink, owners'` |
| List | `files.list({ pageSize: 10, fields: 'files(id, name, owners)', orderBy: 'modifiedTime desc' })` |

> Files uploaded this way are owned by the user and use the user's quota — this is the fix for the service-account quota
> problem, but `ScraperCSV.ts` has **not** been switched to it yet.

---

## 7. Google Gemini API (`generateContent`, E3 — verified 2026-11-23)

*(Note: legacy `ai.google.dev/gemini-api/docs/*` pages 301-redirect to `aistudio.google.com/docs/*` as of 2026-11-23.)*

| Item | Detail |
|---|---|
| Endpoint | `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` |
| Client implementation | `src/enrichment/model/GeminiClient.ts` (`axios`, no Gemini SDK dependency) |
| Auth header | `x-goog-api-key: <GEMINI_API_KEY>` (header only, never query string) |
| Default model | `gemini-3.1-flash-lite` (stable; override via `GEMINI_MODEL`, e.g. `gemini-2.5-flash-lite` for past 2.5 users) |
| Context / Output limits | `gemini-3.1-flash-lite`: 1,048,576 input tokens / 65,536 output tokens (`maxOutputTokens: 512`, input trimmed to `6,000` chars) |
| Structured output | `generationConfig.responseMimeType: "application/json"` + `generationConfig.responseJsonSchema` (`minYears`, `clearanceRequired`, `yearsEvidence`, `clearanceEvidence`) |
| Temperature & Thinking | `temperature: 0`; `thinkingConfig: { thinkingLevel: 'minimal' }` sent only for `MINIMAL_THINKING_MODELS` (`gemini-3.1-flash-lite`, `gemini-3.5-flash-lite`), omitted otherwise (thinking tokens are billed as output) |
| Response parsing | `candidates[0].finishReason` must be `'STOP'`; joins `content.parts[].text`; parses and type-checks JSON (`'blocked'` or `'bad_json'` on invalid 200 responses, counting as `modelTried` without retrying) |
| Pricing (paid tier, per 1M tokens) | `gemini-3.1-flash-lite`: `$0.25` in / `$1.50` out (~`$0.00075` per call); `gemini-2.5-flash-lite`: `$0.10` / `$0.40`; `gemini-3.5-flash-lite`: `$0.30` / `$2.50` |
| Data use policy | Free tier: prompts may be used to improve Google products (**Yes**); Paid tier: **No** |
| Retry & Fatal Error Policy | Retry only transient `408` / `429` / `5xx` and socket timeouts (`ECONNABORTED`, `ETIMEDOUT`, `ECONNRESET`) up to `maxRetries = 3` (4 attempts) with exponential backoff + jitter (base `1,000` ms, honoring `Retry-After` capped at 10 s); never retry `400` (bad request), `402` (prepay balance $0), `403` (permission/revoked/billing), or `404` (`model_not_found`) — `fatal` immediately halts model calls for the remainder of the run without failing `enrich:jobs` |
| Secret Redaction | `ModelCallError` message includes only `kind`, optional `status`, and `attempts`; never attaches raw axios errors, `config`, headers, API keys, or posting text |
