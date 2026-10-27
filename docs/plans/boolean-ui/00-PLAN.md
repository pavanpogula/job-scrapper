# Plan — B.O.O.L.E.A.N: LinkedIn-style jobs & company pages + rebrand

## Context
The live UI (https://job-scrapper-ui.vercel.app/?country=US) is a single long list of rows. The owner wants:
- a job-browsing experience **similar to LinkedIn Jobs**:
  - list on the left, selected job's details on the right;
  - clear job cards with logo, company, location, salary, freshness and Apply;
- **company pages**:
  - a richer companies directory;
  - each company opens its own page with a **Jobs tab** that shows jobs the same LinkedIn way;
- the app **renamed to B.O.O.L.E.A.N**;
- the work done with the repo's design skills, and every doc and agent file kept current.

The owner implements via an Antigravity session per PR; Claude reviews each PR.

**Today's facts:**
- **Routes:** `/`, `/jobs/:id`, `/companies` and `/about` (`frontend/src/App.tsx`).
- **Page sizes:** `BrowsePage.tsx` is 648 lines; `CompaniesPage.tsx` is 226 lines and links each company out to Ashby.
- **Branding:** the header says "Ashby Index" (`components/Header.tsx:97`); `index.html` title is "Ashby Job Board · Direct ATS Postings Index".
- **API gaps:** there is no company detail endpoint and no company filter on `/v1/jobs`. That filter was removed from the UI in P8a/O4 *because* the backend lacked it.
- **Data available per company:** slug, name, logoUrl and jobCount only. Jobs carry title, department, location, workplace, employment, salary, publishedAt/lastUpdatedAt, description (detail only) and team.

## Visual research (real Google Chrome via Playwright, 1440px + 390px)
**Our site today:**
- **Jobs page, desktop:** one full-width column of rows; the right ~60% of each row is empty.
- **Apply buttons:** a heavy "Apply Direct" button on *every* row. On a phone that doubles card height and makes long scrolls.
- **Noise:** a monospace `jobs.ashbyhq.com/<slug>` line on every card.
- **No company logos** on job cards.
- **Raw enum labels** such as "FullTime" and "OnSite".
- **Salary** in monospace blue, far right.
- **Six separate outlined selects** for filters; generic heading "Verified Ashby Job Postings".
- **Phone width:** the search placeholder is cut off.
- **Companies page:** the grid is OK, but wordmark logos are cropped into 40px squares (1Password shows "ass", 9amHealth "am ealt"). It shows a monospace slug, and the main action leaves the site ("Board ↗") instead of opening a company page.
- **Job detail:** decent, but has raw enum chips, a long monospace "Destination URL" block, and the company card links to "Browse all hiring companies" instead of that company.

**What to borrow (patterns, not branding):**
- **LinkedIn Jobs:**
  - search bar with keyword + location fields, and filter **pills** under it (Date posted, Company…);
  - result count sentence ("11,000+ Software Engineer jobs in United States");
  - left list cards: logo 48px · bold title · company · location · relative time; the selected card is tinted;
  - details on the right.
- **LinkedIn company page:**
  - banner band, big logo overlapping it, name, one meta line, primary "See jobs" button;
  - tabs **Overview / Jobs**;
  - job rows show salary and a green "1 hour ago";
  - right rail of similar companies.
- **YC Jobs:** a compact row of company · one-liner · time, with the title in link colour and a dot-separated meta line (Full-time · Engineering · $160K–$175K · Palo Alto).
- **Ashby board:** jobs **grouped by department** under headings, with a meta line "Dept • Location • Full time" and salary on a small second line. That's ideal for the company Jobs tab.

**LinkedIn signed-in, checked in the owner's real Chrome:**
- **Jobs search:**
  - compact top bar: keyword field + location field + Search;
  - pill row: Date posted ▾, Experience ▾, Salary ▾, Company ▾, Remote ▾, All filters;
  - **left list** under a coloured header ("software engineer in United States · 39,255 results"). Selected card: tinted background plus a left accent bar. Title in link colour, then company, then "City (On-site)", then a small signal line;
  - **right panel:**
    - small logo + company name, then a big title;
    - meta line "San Francisco, CA · 4 weeks ago · Over 100 clicked apply";
    - outlined chips (✓ On-site, ✓ Full-time);
    - primary **Apply ↗** + secondary Save, and share/more icons top-right.
- **Company → Jobs tab:**
  - **sticky compact header** on scroll: logo · name · tabs · actions;
  - horizontal **carousels** of job cards ("Recommended", **"Recently posted jobs"** with ‹ Previous / Next ›). Each card has logo, title, company, location and "2 days ago";
  - "See all jobs" opens the two-pane search filtered to that company;
  - right rail "Pages people also viewed".

**Additions this research adds to the plan:**
- **Company Jobs tab:**
  - a "Recently posted" carousel at the top (newest 10 via `postedWithin`/sort);
  - then the full list, grouped by department (Ashby style), with in-company search;
  - "See all in search" opens `/?company=<slug>` in the two-pane view.
- **Sticky compact company header** on scroll (logo · name · tabs).
- **Coloured results header** on the jobs list: "<query> in <country> · N results".
- **Selected card:** tint plus a 3px left accent in the brand colour.
- **Save** stays out of scope for v1, because there are no accounts. A later option is localStorage "Saved jobs".
- **Labels:** human labels via `lib/labels.ts` (Full-time, Part-time, On-site, Hybrid, Remote, Contract, Internship, "/yr" salary formatting).
- **Logos:** shown with `object-fit: contain`, inner padding and a neutral tile, so wordmarks aren't cropped; initials fallback.
- **Cards:**
  - **no** per-card Apply button and **no** URL line; the whole card selects or opens the job;
  - Apply lives in the detail panel, with a small external-link icon on hover.
- **Date posted pill** (Past 24h / Past week / Past month) needs `postedWithin` in PR A.
- **Company Jobs tab:** jobs grouped by department (collapsible) with a count per group, plus the same filters.
- **Company page right rail:** "More companies hiring in <top department>". Optional; drop it if it adds a backend call.
- **Detail panel:** the "Destination URL" block is replaced by a secondary "View original posting" link.

## Decisions (defaults — owner can veto at approval)
1. **"Similar to LinkedIn" means its layout patterns, not its brand.** No LinkedIn logo, colours or copy; B.O.O.L.E.A.N keeps its own visual identity.
2. **The rename is user-facing only.**
   - Renamed: the UI wordmark, `<title>`/meta, About/Footer copy, favicon, the README and doc titles, and `AGENTS.md`/context product name.
   - **Unchanged:** the repo name, package names, Vercel project names/URLs, API paths, Redis keys and the scraper User-Agent. Changing those would break deploys and caches.
   - The acronym is shown as-is; no expansion is invented.
3. **"Required skills" means the repo's design skills:**
   - `impeccable`: init → PRODUCT.md, shape, new-work, document → DESIGN.md, critique, audit, polish;
   - `design-taste-frontend`: app-screens run and inspector;
   - `emil-design-eng`: motion and polish details;
   - `frontend-design`.
   - ⚠️ So **do not merge** the pushed branch `chore/remove-unused-skills`; it deletes two of these. Close it or let it be.
4. **Two PRs, backend first:**
   - PR A adds the company API and must be **deployed before** PR B's UI uses it.
   - PR A also lands the already-approved P8b items **O5** (companies `totalPages ≥ 1`) and **O14** (JSON 404 for unknown `/v1/*`), because they touch the same endpoints. O6 stays in P8b.

---

## PR A — Company API (`feat/company-pages-api`, squash; behaviour change → ADR-0019)
1. **`GET /v1/companies/:slug`** returns `CompanyProfileDTO`:
   - fields: `{ slug, name, logoUrl, jobCount, withSalary, latestPublishedAt, workplaceTypes[], employmentTypes[], departments[] (top 10), locations[] (top 10) }`, where each breakdown is a `FacetCountDTO`;
   - counts cover active and listed jobs only;
   - returns 404 JSON `{error:'Company not found'}` for unknown or non-ACTIVE companies, or a bad slug (validate `^[a-z0-9-]{1,100}$`);
   - implemented in `backend/src/api/db/queries.ts` (`queryCompanyProfile`) with Prisma `groupBy`/`count`, reusing `FacetCountDTO` and the existing facet helpers.
2. **`GET /v1/jobs?company=<slug>`:**
   - exact `companySlug` filter that combines with search and all filters;
   - add `company` to `JobQueryParams`/`parseJobQueryParams` (`backend/src/api/types.ts`) and to `KNOWN_PARAMS` plus `parseJobsQuery` in `backend/src/lib/cache/keys.ts`;
   - `isCacheableView` stays false for it (DB path); the index `@@index([companySlug, active])` already exists.
3. **`GET /v1/companies?sort=jobs|name`** (default `name`): "most hiring" ordering for the directory.
   - **O5:** `totalPages = max(1, ceil(total/limit))`. Check Publisher's company pages still match (CacheParity).
4. **O14:** a catch-all `app.use('/v1', …)` returns JSON `{error:'Not found'}` 404 for unknown routes.
4b. **`GET /v1/jobs?postedWithin=1d|7d|30d`:** filters on `COALESCE(lastUpdatedAt, publishedAt) >= now − window` (ADR-0018 fields), for the LinkedIn-style "Date posted" pill.
   - Unknown values are ignored.
   - Normalised in the cache keys; never pre-rendered.
   - Covered by the real-Postgres integration tests.
5. **Cache-Control:** the new route gets the same edge policy as `/v1/companies`, via `middleware/cacheControl.ts`. Search views stay un-pre-rendered.
6. **Tests:**
   - ApiServer cases for the new route, filter, sort, 404 and O14;
   - extend `tests/integration/Search.test.ts` (real Postgres) with `company=` correctness and pagination;
   - ContractFixtures cases `company-profile.found`, `company-profile.not-found`, `jobs.company`;
   - run `npm run contract:fixtures` and `node scripts/contract/sync-fixtures.mjs`;
   - snapshots change only where intended, with each change explained.
7. **Docs:**
   - `backend/docs/api.md`;
   - ADR-0019 "Company profile endpoint and company job filter";
   - BF IDs for O5 and O14 in `docs/bug-fix-log.md`, plus `docs/agents/context.md` endpoints line. Mind the **6144-byte budget**: the file is at 6105 now, so shorten wording elsewhere if needed;
   - PROGRESS.md (O5/O14 done; P8b now only O6), CHANGELOG, `docs:generate`.
8. **Rollout:** merge → Deploy to Vercel `app=backend` (smoke) → verify `/v1/companies/openai` and `/v1/jobs?company=openai` live.

## PR B — B.O.O.L.E.A.N UI (`feat/boolean-ui`, squash; after PR A is live)
**Design process (skills, in order):**
1. impeccable `init`: PRODUCT.md (who: job seekers browsing direct ATS postings; mode **Operate**; brand B.O.O.L.E.A.N).
2. `shape` for the jobs screen, job detail, companies directory and company page.
3. new-work.
4. Read `reference/craft-floor.md` before every UI edit.
5. design-taste-frontend **app-screens** references for dense list/detail screens.
6. emil-design-eng for motion (hover, selection, panel transitions; honour `prefers-reduced-motion`).
7. Finish with impeccable `document` (writes DESIGN.md from the shipped code), then `critique` + `audit` + `polish`.
8. Commit PRODUCT.md and DESIGN.md where the skill places them.

Stack stays **React 19 + MUI 9 + Redux Toolkit** (frontend-invariants: no Tailwind). Tokens go in `frontend/src/theme/theme.ts`, in light and dark.

**Screens:**
- **Jobs (`/`)**, LinkedIn pattern:
  - **Top bar:** keyword search (BF-020 semantics, existing placeholder), country select, filter "pills" (Workplace, Employment, Salary, Remote) and sort.
  - **Desktop ≥ md:** two panes.
    - **Left:** scrollable `JobList` of `JobCard`s (logo 48px with initials fallback, title, company link, location · workplace, salary chip, "Posted/Updated …" from `formatJobFreshness`), result count, and numbered pagination at the bottom.
    - **Right:** sticky `JobDetailPanel` for the selected job: header with logo, title, company link, location, freshness and Apply (external) button; chips; sanitized description (`lib/sanitize.ts`); an "About the company" card linking to `/companies/:slug`.
    - The selection lives in the URL as `?jobId=` (shareable; Back works), and the first job is auto-selected on desktop.
  - **Mobile:** list only; tapping opens `/jobs/:id`. Filters sit in a bottom-sheet drawer (reuse the current drawer logic).
- **Job page (`/jobs/:id`)** renders the same `JobDetailPanel` full-width, plus "More jobs at <company>" via `?company=`.
- **Companies (`/companies`):**
  - a grid of `CompanyCard`s (logo, name, "N open jobs", View jobs);
  - search plus sort "Most hiring / A–Z" (`sort=jobs|name`);
  - cards link to **`/companies/:slug`**; the "Ashby board" link moves to a secondary action.
- **Company page (`/companies/:slug`):**
  - **Header:** banner band, logo, name, job count, "View on Ashby".
  - **Tabs (in the URL):**
    - **Home** (`/companies/:slug`): overview from `CompanyProfileDTO`, i.e. top departments and locations, workplace mix, salary-transparency share, latest posting.
    - **Jobs** (`/companies/:slug/jobs`): the same two-pane `JobList` + `JobDetailPanel` filtered by `company=slug`, with in-company search and filters.
  - Unknown company → a friendly 404 state.
- **Rebrand:**
  - `BrandMark` wordmark "B.O.O.L.E.A.N" in Header and Footer;
  - `index.html` title and meta ("B.O.O.L.E.A.N · Direct jobs from company career boards");
  - new `favicon.svg` (a "B" mark);
  - About page copy.

**Code structure (reuse first):**
- **New components:**
  - `components/brand/BrandMark.tsx`;
  - `components/common/CompanyAvatar.tsx`, extracted from the logo/initial logic in `CompaniesPage.tsx:133-150` and `JobDetailPage.tsx:97`;
  - `components/jobs/{JobCard,JobList,JobDetailPanel,JobFiltersBar}.tsx`;
  - `components/companies/{CompanyCard,CompanyHeader,CompanyOverview}.tsx`;
  - `pages/CompanyPage.tsx`.
- **Move helpers to `lib/`:** `formatSalary` and `formatCountryOption` (now exported from `BrowsePage.tsx`). Keep re-exports so existing tests still compile, or update their imports.
- **Reuse:** `useJobFilters` (+ `parseSortParam`), `formatJobFreshness`/`formatDetailFreshness`, `sanitizeHtml`, `QueryState`, RTK Query `jobsApi`.
- **`jobsApi`:**
  - add `getCompanyProfile(slug)` and `company` in `JobsQueryParams`;
  - `prefetch` job detail on card hover/focus for an instant right pane.
- **Types:** `frontend/src/types/api.ts` gets `CompanyProfile` and `company?: string`, matched to the backend DTO. The contract test is extended over the new fixtures from PR A.
- **Routes:** `App.tsx` adds `/companies/:slug` and `/companies/:slug/jobs` (lazy).
- **Size:** `BrowsePage.tsx` shrinks to a composition of the new components.

**Quality floor:**
- **Accessibility:**
  - list is `role=list`, the selected card has `aria-current`;
  - keyboard: Tab/Enter, with ↑/↓ optional;
  - focus moves to the detail heading on select;
  - results count goes in a polite live region;
  - AA contrast in both themes.
- **Loading and empty states:** skeletons, plus empty/error states via `QueryState`.
- **Layout:** no layout shift on panel switch.
- **Performance:** lazy route chunks kept; bundle growth noted in the PR.

**Tests (Vitest + MSW):**
- `JobCard` render (logo fallback, salary, freshness, company link).
- Two-pane selection:
  - first job auto-selected;
  - clicking sets `?jobId=`;
  - Back restores it;
  - mobile navigates to `/jobs/:id`.
- `CompanyPage`: Home/Jobs tabs via URL, jobs request carries `company=slug`, 404 state.
- Companies sort toggle sends `sort=jobs`.
- Brand: document title and header show B.O.O.L.E.A.N.
- **Keep existing suites green:** searchBox, jobFreshness, countryFacets, sortParams, contract. Update selectors only where markup legitimately changed.

**Docs/agents:**
- `frontend/docs/frontend-ui.md` (routes, layout, components);
- `frontend/docs/testing.md`, `frontend/README.md`, root `README.md`, `AGENTS.md`, `frontend/AGENTS.md`;
- `docs/agents/context.md` product name (byte budget!), then `node scripts/agents/sync-shells.mjs`;
- `docs/agents/rules/frontend-design.md` (point to PRODUCT.md/DESIGN.md);
- `docs/system-architecture-and-flows.md`;
- ADR-0020 "B.O.O.L.E.A.N brand and LinkedIn-style job browsing";
- CHANGELOG;
- `docs:generate`.
- Before/after screenshots (desktop + mobile, light + dark) in the PR body.

**Rollout:** merge → Deploy to Vercel `app=frontend` → smoke + a visual check.

**Visual acceptance:**
- PR B must fix every "Our site today" problem in the Visual research section.
- Before/after screenshots at 1440px and 390px in light and dark: jobs, job detail, companies, company Overview and company Jobs.
- Claude re-shoots the same pages in Chrome during review.

## Verification (both PRs)
- `scripts/check-all.sh --no-install`, `node --test 'scripts/repo-tests/**/*.test.mjs'`, `node scripts/agents/sync-shells.mjs --check`.
- PR A only:
  - `npm --prefix backend run test:integration` against a local Postgres;
  - contract fixtures regenerated and synced.
- Claude review per PR:
  - worktree checks and a scope check;
  - for PR B, run the app locally (`npm --prefix frontend run dev` against the live API) and review screenshots at 390px / 1280px in both themes.
- After deploy: live checks of `/v1/companies/<slug>`, `/v1/jobs?company=<slug>`, the jobs two-pane flow, and the company Jobs tab.

## Antigravity prompts
The final copy-paste prompts (PR A, then PR B) are given in chat after approval. They encode exactly the sections above plus the standing hard rules:
- never touch secrets;
- never push `main`; publish only with `scripts/agents/push-branch.sh`;
- don't run scrapes, deploys or prod DB commands;
- add no new `any`;
- commit before running check-all.
