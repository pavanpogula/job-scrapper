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
| 3 | Wayback CDX | `GET http://web.archive.org/cdx/search/cdx` | none | `src/discovery/CdxWorker.ts` (+ manual download for `process:cdx`) |
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

## 3b. CommonCrawl Index API

**Endpoint:** `GET https://index.commoncrawl.org/CC-MAIN-2024-51-index` (crawl ID hard-coded in `COMMON_CRAWL_INDEX_URL`)

| Param | Value |
|---|---|
| `url` | `jobs.ashbyhq.com/*` |
| `output` | `json` |
| `fl` | `url` |

`timeout: 15000`. **Response is JSONL** (one JSON object per line, e.g. `{"url": "https://jobs.ashbyhq.com/acme/…"}`);
the code splits on `\n`, parses each line and keeps `.url`. Non-string body or any error → `[]`. No `page` parameter is
sent, so only the first page of index results is read.

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
