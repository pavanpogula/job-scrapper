# 03 · External API Endpoints

> This project **exposes no HTTP endpoints**. Below is every external endpoint it **calls**, with exact parameters,
> real response shapes (verified live on 2026-10-22), and how the code handles errors.

| # | Service | Method & URL | Auth | Used by |
|---|---------|--------------|------|---------|
| 1 | Ashby Posting API | `GET https://api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=true` | none | `src/lib/AshbyClient.ts` (`Scraper.ts`) |
| 2 | Ashby Posting API | `GET https://api.ashbyhq.com/posting-api/job-board/{slug}` | none | `src/lib/AshbyClient.ts` (`ScraperCSV.ts`) |
| 2b | Ashby Hosted GraphQL API (Fallback) | `POST https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams` | none | `src/lib/AshbyClient.ts` (fallback on 404/403/400) |
| 3 | Wayback CDX | `GET http://web.archive.org/cdx/search/cdx` | none | `src/discovery/CdxWorker.ts` (+ manual download for `process:cdx`) |
| 4 | Google Drive v3 | `files.create` (multipart upload), `files.list` | Service-account JWT | `src/lib/GoogleDriveOAuth.ts` |
| 5 | Google Drive v3 | `files.create`, `files.list` | User OAuth2 (Desktop app) | `src/lib/GoogleDriveUserOAuth.ts` |
| 6 | Google OAuth2 | consent URL / token exchange / refresh | OAuth client id+secret | `src/lib/GoogleDriveUserOAuth.ts` |
| — | Public job page (link only, not called) | `https://jobs.ashbyhq.com/{slug}/{jobId}` | — | CSV `Job Link` column |

---

## 1–2. Ashby Public Job Posting API

**Endpoint:** `GET https://api.ashbyhq.com/posting-api/job-board/{JOB_BOARD_NAME}`

| Param | Where | Values | Used |
|---|---|---|---|
| `{JOB_BOARD_NAME}` | path | company slug, e.g. `1password`, `abridge` | both scrapers |
| `includeCompensation` | query | `true` / omitted | `Scraper.ts` only |

**Client config (`src/lib/AshbyClient.ts`):** axios, `timeout: 12000` ms, Chrome `BROWSER_HEADERS`, exponential backoff + jitter on `429`/`5xx`/timeouts, automatic fallback to `POST https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams` on `404`/`403`/`400`, and `sanitizeJobBatch()` validation on all returned jobs.

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
      "publishedAt": "2025-07-11T22:30:33.442+00:00", // → CSV Published Date (date part)
      "isListed": true,
      "isRemote": false,
      "workplaceType": "Hybrid",           // OnSite | Remote | Hybrid
      "address": { "postalAddress": { "addressLocality": "San Francisco", "addressRegion": "California", "addressCountry": "USA" } },
      "jobUrl": "https://jobs.ashbyhq.com/<slug>/<id>",
      "applyUrl": "https://jobs.ashbyhq.com/<slug>/<id>/application", // → Job.applyUrl
      "shouldDisplayCompensationOnJobPostings": true,
      "descriptionHtml": "<p>…</p>",
      "descriptionPlain": "…",
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

> **Compensation extraction (`extractSalary` in `src/lib/AshbyClient.ts`):** Reads `compensation.summaryComponents.find(c => c.compensationType === 'Salary')` → `minValue`, `maxValue`, `currencyCode` (with fallback support for `compensationTiers` and legacy `compensationTier`), feeding `Job.salaryMin`, `Job.salaryMax`, `Job.salaryCurrency`, and `contentHash`.

### Error behaviour

| Situation | Real API response | `Scraper.ts` | `ScraperCSV.ts` |
|---|---|---|---|
| Unknown / removed board | `404` body `Not Found` (text) | sets `Company.status = NOT_FOUND` (errors ignored) and returns 0 jobs | returns `[]`, no DB change |
| Board exists, no openings | `200 { jobs: [] }` (e.g. `deel`, `reddit` at time of writing) | 0 jobs, company stays ACTIVE | `[]` |
| Timeout (>10 s), 429, 5xx, network | — | silently 0 jobs | silently `[]` |

---

## 3. Wayback Machine CDX API

**Endpoint:** `GET http://web.archive.org/cdx/search/cdx` (plain HTTP)

| Param | Value | Meaning |
|---|---|---|
| `url` | `jobs.ashbyhq.com/*` | all archived URLs under the Ashby jobs host |
| `output` | `json` | array-of-arrays response |
| `fl` | `original` | return only the original URL column |
| `collapse` | `urlkey` | dedupe identical URLs |
| `limit` | `1000` | ⚠️ hard-coded test limit in `CdxWorker.ts` |

**Response:**
```json
[["original"], ["https://jobs.ashbyhq.com/1password"], ["https://jobs.ashbyhq.com/1password/abc-uuid"], ...]
```
First row is the header (skipped). Slug = first path segment. Errors → logged, returns `[]`.

For the bulk path, the same URL (without `limit`) is downloaded manually and fed to `npm run process:cdx -- file.json`.

---

## 4. Google Drive v3 — Service Account (used by `scrape:csv --upload-cloud`)

File: `src/lib/GoogleDriveOAuth.ts` (despite the name, this is **JWT/service-account** auth).

| Item | Value |
|---|---|
| Credentials file | `apikeys/google-credentials.json` (needs `client_email`, `private_key`) |
| Scope | `https://www.googleapis.com/auth/drive` |
| Auth | `new google.auth.JWT({ email, key, scopes })` → `authorize()` |
| Upload call | `drive.files.create({ requestBody: { name, parents?: [folderId] }, media: { mimeType: 'text/csv', body: stream }, fields: 'id, webViewLink', supportsAllDrives: true })` |
| List call | `drive.files.list({ pageSize: 10, fields: 'files(id, name)', supportsAllDrives: true })` |
| Returns | `webViewLink` or `https://drive.google.com/file/d/{id}/view`; `null` on failure |

**Known limitation:** service accounts have **no storage quota** on personal ("My Drive") accounts → upload fails with
a "storage quota" error unless the target is a **Shared Drive**. Code prints the service-account email as a hint.

## 5–6. Google Drive v3 — User OAuth2 (used only by `scripts/test-drive-upload.ts`)

File: `src/lib/GoogleDriveUserOAuth.ts`.

| Item | Value |
|---|---|
| Client file | `apikeys/oauth-credentials.json` (`installed` or `web` → `client_id`, `client_secret`, `redirect_uris`) |
| Token cache | `apikeys/oauth-token.json` (written after consent / refresh) |
| Scope | `https://www.googleapis.com/auth/drive.file` (only files created by the app) |
| Flow | `generateAuthUrl({ access_type: 'offline' })` → user pastes code in terminal → `getToken(code)` → save token. On expiry: `refreshAccessToken()`; on refresh failure: delete token & restart consent |
| Upload | `files.create` with MIME by extension (`.csv, .txt, .json, .pdf`, else octet-stream), `fields: 'id, webViewLink, owners'` |
| List | `files.list({ pageSize: 10, fields: 'files(id, name, owners)', orderBy: 'modifiedTime desc' })` |

> Files uploaded this way are owned by the user and use the user's quota — this is the fix for the service-account quota
> problem, but `ScraperCSV.ts` has **not** been switched to it yet.
