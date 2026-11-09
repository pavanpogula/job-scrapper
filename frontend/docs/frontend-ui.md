# 13 · Frontend Web Application (B.O.O.L.E.A.N)

The **B.O.O.L.E.A.N** web frontend (`frontend/`) is a high-density, performant job browsing portal built with **React 19**, **TypeScript**, **Vite**, **Redux Toolkit (RTK Query)**, and **Material UI (MUI 9)**.

---

## 1. Architectural Overview & Philosophy

- **Brand Identity:** User-facing product name is **B.O.O.L.E.A.N** (never expanding the acronym) with a prominent "B" mark and monospace wordmark.
- **No Authentication / Zero Friction:** Users browse, filter, search, and click "Apply Direct". There are no logins, candidate tracking, resume uploading, or intermediate applications.
- **Direct Employer ATS Links:** Every outbound application button navigates straight to the company's verified ATS job board (`applyUrl` / `boardUrl` for Ashby or Greenhouse) with `rel="noopener noreferrer"`. URLs are never hardcoded or constructed in client code.
- **Source Badge (`SourceBadge.tsx`):** A small, quiet indicator ("via Ashby" / "via Greenhouse") rendered on `JobCard`, `JobDetailPanel` header, and `CompanyHeader` (ADR-0021).
- **Source Filtering:** `JobFiltersBar` includes a "Source" filter pill (All / Ashby / Greenhouse) synchronized with `?source=` in URL params.
- **Desktop Two-Pane Ergonomics:** On desktop viewports (>= md), `/` renders a two-pane layout: a scrollable list (`JobList`) on the left and a sticky full-detail panel (`JobDetailPanel`) on the right. First job is auto-selected; URL syncs via `?jobId=`.
- **Mobile Responsive Ergonomics:** On mobile viewports (< md), list cards navigate directly to `/jobs/:id`, and filters collapse into an accessible bottom-sheet drawer.
- **Search box:** placeholder "Search by job title, company or location (all words must match)". Pressing Enter sets `q` and resets to page 1; matching rules are in `backend/docs/api.md` (BF-020).
- **URL as Source of Truth:** Filter parameters (`q`, `workplace`, `employment`, `country`, `company`, `postedWithin`, `remote`, `salary`, `sort`, `order`, `page`, `jobId`) are bidirectional: modifying UI controls updates browser URL search params, and direct links or browser back/forward buttons faithfully reconstruct the filter state.
- **Resilient Query State:** Uses `<QueryState>` wrapping network views to handle loading spinners, 404 not found states, 5xx retries, and automated 429 rate limit countdown auto-refetches based on `Retry-After` headers.

---

## 2. Routes & Page Architecture

All page routes are asynchronously chunked using `React.lazy` and wrapped in `<Suspense>` within `src/App.tsx`:

| Route Path | Component | Primary API Endpoints | Purpose |
|---|---|---|---|
| `/` | `BrowsePage` | `GET /v1/jobs`, `GET /v1/facets` | Search ledger, filter pills, desktop two-pane layout (`JobList` + `JobDetailPanel`), mobile drawer, and pagination. |
| `/jobs/:id` | `JobDetailPage` | `GET /v1/jobs/:id`, `GET /v1/jobs?company=:slug` | Full role description, compensation breakdown, verified employer details, closed-job status banner, and "More jobs at <company>" section. |
| `/companies` | `CompaniesPage` | `GET /v1/companies` | Directory of verified hiring companies with uncropped logo tiles, search filter, active job counts, and "Most hiring / A–Z" sort toggle. |
| `/companies/:slug` | `CompanyPage` (Overview tab) | `GET /v1/companies/:slug` | Company profile with hiring metrics, top departments, top locations, workplace mix, and salary transparency. |
| `/companies/:slug/jobs` | `CompanyPage` (Jobs tab) | `GET /v1/companies/:slug`, `GET /v1/jobs?company=:slug` | Company job openings with newest 10 carousel, then **every** job via API paging (50 per page, "Showing x–y of N") grouped by department per page; in-company search goes to the API (`company` + `search`, BF-020 rules), never a client-side filter of loaded rows; two-pane master/detail. Location counts show "10+" because the profile lists at most 10. |
| `/about` | `AboutPage` | — | Architectural principles, data integrity explanation, project information, and a "4. Founder" section with a LinkedIn preview card (`FounderCard`). |
| `*` | `NotFoundPage` | — | Fallback 404 error page with action button returning to the job index. |

---

## 3. State Management & Data Flow

- **RTK Query (`src/store/api/jobsApi.ts`):** Handles all server communication, query deduplication, and in-memory cache retention (10-minute TTL).
  - `getJobs(params)`
  - `getJobById(id)`
  - `getFacets()`
  - `getCompanies({ search, page, pageSize, sort })`
  - `getCompanyProfile(slug)`
  - `getMeta()`
- **Filter Slice (`src/store/slices/filterSlice.ts`):** Stores normalized filter parameters in memory and synchronizes with URL parameters via `src/hooks/useJobFilters.ts`.
- **Theme Slice (`src/store/slices/themeSlice.ts`):** Persists dark/light preference in `localStorage` and toggles `.dark` CSS class on `document.documentElement`.
- **Supported Query Parameters & Sort Orders:**
  - Search query (`search`), Workplace type (`workplaceType`), Employment type (`employmentType`), Country (`country`), Company slug (`company`), Posted recency (`postedWithin`), Remote flag (`isRemote`), Compensation filters (`hasSalary`, `salaryMin`, `salaryInterval`).
  - Sort keys: `publishedAt` (default), `salary`, `company`.
- **Human-Readable Labels (`src/lib/labels.ts`):**
  - Maps raw ATS enums (`FullTime`, `OnSite`, etc.) to human labels (`Full-time`, `On-site`, etc.) and formats salary intervals (`$140k – $180k/yr`).
- **Uncropped Logos (`src/components/common/CompanyAvatar.tsx`):**
  - Neutral tile with `object-fit: contain` and deterministic initial fallback, eliminating logo clipping.
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

### Brand logo
- The logo is a vector redraw of the original B.O.O.L.E.A.N Instagram logo (black monitor with green binary, keyboard, speckled navy background, `{B·O·O·L·E·A·N}` wordmark). Files live in `frontend/public/brand/`; their URLs are in `BRAND` in `frontend/src/lib/site.ts`.
- `boolean-mark.svg` (64×64, no wordmark, one row `0101` so it still reads at 16-28 px) is the browser-tab icon and the image in `components/brand/BrandMark.tsx` (header and footer; decorative `alt=""`, the wordmark text sits next to it).
- `boolean-logo.svg` (full logo) is shown on the About page with a text description.
- `apple-touch-icon.png` (180×180) and `boolean-logo-512.jpg` (link previews, `og:image` in `index.html`) are rendered from the SVGs. After editing an SVG, re-render them (any headless browser screenshot at that size).
- Guarded by `src/test/brandMark.test.tsx`.

### Founder credit
- Founder details live in one place: `frontend/src/lib/site.ts` (`FOUNDER`). Edit there, not in components.
- `components/brand/FounderCredit.tsx` renders the footer line "Founded by <name>" with a small LinkedIn icon (every page) and the About page `FounderCard` (photo avatar, name, "Founder · B.O.O.L.E.A.N", profile URL, "View on LinkedIn").
- Links open in a new tab with `rel="noopener noreferrer"` and an accessible name that says so. The avatar shows `frontend/public/founder.jpg`, a self-hosted 320×320 crop of the founder's LinkedIn profile photo (LinkedIn's own image links are signed and expire, so they are never hotlinked); initials are the fallback if it fails to load. LinkedIn blue is used only on the icon (lightened in dark mode for contrast).
