# 13 · Frontend Web Application

The **Ashby Job Scraper** web frontend (`frontend/`) is a high-density, performant, achromatic job browsing portal built with **React 19**, **TypeScript**, **Vite**, **Redux Toolkit (RTK Query)**, and **Material UI (MUI 6)**.

---

## 1. Architectural Overview & Philosophy

- **No Authentication / Zero Friction:** Users browse, filter, search, and click "Apply Direct". There are no logins, candidate tracking, resume uploading, or intermediate applications.
- **Direct Employer ATS Links:** Every outbound application button navigates straight to the company's verified Ashby ATS job board (`https://jobs.ashbyhq.com/<companySlug>/<ashbyId>`) with `rel="noopener noreferrer"`.
- **URL as Source of Truth:** Filter parameters (`q`, `workplace`, `employment`, `country`, `salary`, `sort`, `page`) are bidirectional: modifying UI controls updates browser URL search params, and direct links or browser back/forward buttons faithfully reconstruct the filter state.
- **Resilient Query State:** Uses `<QueryState>` wrapping network views to handle loading spinners, 404 not found states, 5xx retries, and automated 429 rate limit countdown auto-refetches based on `Retry-After` headers.

---

## 2. Routes & Page Architecture

All page routes are asynchronously chunked using `React.lazy` and wrapped in `<Suspense>` within `src/App.tsx`:

| Route Path | Component | Primary API Endpoints | Purpose |
|---|---|---|---|
| `/` | `BrowsePage` | `GET /v1/jobs`, `GET /v1/facets` | Search ledger, facet filtering, mobile drawer, sort controls, and pagination. |
| `/jobs/:id` | `JobDetailPage` | `GET /v1/jobs/:id` | Full role description, compensation breakdown, verified employer details, closed-job status banner, and outbound apply actions. |
| `/companies` | `CompaniesPage` | `GET /v1/companies` | Directory of verified hiring companies with search filter, active job counts, and direct links to employer Ashby portals. |
| `/about` | `AboutPage` | — | Architectural principles, data integrity explanation, and project information. |
| `*` | `NotFoundPage` | — | Fallback 404 error page with action button returning to the job index. |

---

## 3. State Management & Data Flow

- **RTK Query (`src/store/api/jobsApi.ts`):** Handles all server communication, query deduplication, and in-memory cache retention (10-minute TTL).
  - `getJobs(params)`
  - `getJobById(id)`
  - `getFacets()`
  - `getCompanies({ search, page, pageSize })`
  - `getMeta()`
- **Filter Slice (`src/store/slices/filterSlice.ts`):** Stores normalized filter parameters in memory and synchronizes with URL parameters via `src/hooks/useJobFilters.ts`.
- **Theme Slice (`src/store/slices/themeSlice.ts`):** Persists dark/light preference in `localStorage` and toggles `.dark` CSS class on `document.documentElement`.
- **Supported Query Parameters & Sort Orders (O4 Alignment):**
  - Search query (`search`), Workplace type (`workplaceType`), Employment type (`employmentType`), Country (`country`), Remote flag (`isRemote`), Compensation filters (`hasSalary`, `salaryMin`, `salaryInterval`).
  - Sort keys: `publishedAt` (default), `salary`, `company`. Legacy `title` sort and unsupported query parameters (`company`, `department`, `location`, `city`) were removed to align strictly with backend API capabilities.
- **Client Rate Gate Removed (ADR-0011):** The legacy in-memory 10 req/min client-side gate was completely removed in favor of edge Vercel WAF rules and server-side `DbGuard` backpressure.

---

## 4. Security & Sanitization

- **DOMPurify Hook:** All raw HTML descriptions received from ATS APIs are sanitized through `src/lib/sanitize.ts` using DOMPurify before rendering via `dangerouslySetInnerHTML`.
- **Invariants Guarded:**
  - `script`, `iframe`, `object`, and form tags are stripped.
  - Inline `style` attributes are strictly forbidden (`FORBID_ATTR: ['style']`).
  - Anchor tags automatically receive `target="_blank"` and `rel="noopener noreferrer nofollow ugc"` via `afterSanitizeAttributes` hook.

---

## 5. Job Freshness Display & Formatting

- **Helper:** `src/lib/formatJobFreshness.ts` computes relative freshness labels, tooltips, and semantic `<time dateTime={...}>` timestamps based on `lastUpdatedAt`, `lastUpdatedSource`, and `publishedAt`.
- **Card Badges (BrowsePage):**
  - Displays `"Updated <relative>"` for detected changes (`'detected'`) and Ashby update timestamps (`'ashby'`), with tooltip `"Posted <date>"` when `publishedAt` differs.
  - Displays `"Posted <relative>"` for `'published'` or legacy rows.
  - Displays `"First seen <relative>"` for `'firstSeen'`.
  - Relative thresholds: `<1m` -> `"just now"`, `<60m` -> `"<m>m ago"`, `<24h` -> `"<h>h ago"`, `<30d` -> `"<d>d ago"`, `>=30d` -> short date (e.g. `"Mar 4, 2026"`).
- **Detail View (JobDetailPage):**
  - Displays `"Posted <date> · Updated <date>"` when both publication and update dates exist and differ.

---

## 6. Configuration & Environment Variables

| Variable | Default (Dev) | Production (Vercel) | Description |
|---|---|---|---|
| `VITE_API_BASE_URL` | `""` (proxied via Vite to `http://localhost:3001`) | `""` (same origin `/v1`) or edge API domain | API base URL prefix |
| `VITE_ENABLE_JOBPOSTING_JSONLD` | `"false"` | `"false"` | Enables Schema.org JobPosting structured data (off by default per Google Employer Policy) |

---

## 6. Testing Guide

Run the full UI verification suite from repository root:
```bash
npm run verify:ui
```
This executes:
1. `npm --prefix frontend run typecheck` (`tsc -b --noEmit`)
2. `npm --prefix frontend run lint` (ESLint 9 with react-hooks and jsx-a11y)
3. `npm --prefix frontend run test` (Vitest suites covering facet formatting, default query parameters, DOMPurify sanitization, and API contract parity)
