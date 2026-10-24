# 06 · Frontend Plan (`job-scrapper-ui/`)

> **Decision D-12:** `job-scrapper-ui/` (React 19.3.1, MUI 9.5.0, RTK Query, Vite 6.4.5) is the only frontend. The old
> Next.js design package `documentation/frontend-design/` was retired in commit `22afd64`, so do not plan a second app.
> This plan comes from a read-only audit plus an impeccable critique of the UI (score 12/20: a11y 2, performance 2,
> theming 3, responsive 3, implementation integrity 2).
> Tasks: P1-T19…T21 and P5-T01…T10 in [12](./12-implementation-roadmap.md).

## 1. Current state

**Stack** (installed versions from the lockfile; `job-scrapper-ui/package.json:11-31` declares caret ranges): react 19.3.1, @mui/material 9.5.0, @reduxjs/toolkit 2.13.0,
react-router-dom 7.18.4, dompurify 3.4.17, vite 6.4.5, typescript 5.9.3.

**Routes** (`App.tsx:23-28`): `/`, `/jobs/:id`, `/companies`, `/about`. There is no `*` route and no lazy loading.

**Store** (`store/index.ts:8-17`):
- `jobsApi` (RTK Query): `keepUnusedDataFor: 600`, all `refetchOn*` options off, and a client rate gate in
  `baseQueryWithRateLimit` (`jobsApi.ts:34-65`) that fakes a 429 once there have been 10 requests in 60 s.
- `filters`: Redux only; `syncFromUrl` is never used.
- `theme`
- `rateLimit`

**Missing tooling:** no tests, no lint, no typecheck script. `npx tsc --noEmit -p job-scrapper-ui` exits 0.

**Bundle:** a single JS chunk of 695,742 B (221,068 B gzip). Fonts load render-blocking from Google Fonts.

## 2. Problems by priority

**S1 (P1):**
- **FE-01:** the default view hides about 63% of jobs because of `salaryInterval: '1 YEAR'`.
- **FE-02:** the country filter is broken (ISO codes vs raw names).

**S2 (P1 tooling, otherwise P5):**
- FE-03 URL state
- FE-04 companies pagination
- FE-05/06 429 and error handling
- FE-07 mobile drawer
- FE-08 security headers on the document (owned by the API plan, P2-T08)
- FE-09/10 tests, lint, typecheck

**S3–S4:**
- FE-11 live counts
- FE-12 accessibility
- FE-13 SEO basics
- FE-14 DOMPurify configuration
- FE-15 closed jobs
- FE-16 scroll, loading and sort
- FE-17 type drift
- FE-20–25 performance, dev-server exposure and copy

Full evidence for each is in [01](./01-current-state-and-gap-analysis.md) §3.4.

## 3. Requests per page view

Server limit today: 10 requests per 60 s per IP, counted per instance. The client gate allows another 10 per tab.

| Action | API calls |
|---|---|
| Land on `/` | 1 (+1 once facets drive the country list) |
| Each filter or chip change, including each tap in the mobile drawer | 1 (unless cached) |
| Typing in search | 1 per 400 ms pause |
| Next page | 1 |
| Open a job | 1; going back is cached |
| Companies page | 1, plus 1 per search pause |

A typical first minute makes 10–11 calls, so users get blocked. After P2-T08 the server allows 120/min per IP at the
WAF, and the CDN absorbs repeat calls. **The client gate must then go away** (P5-T02).

## 4. Tasks

### P1 (make what exists correct)

#### P1-T19: UI tooling

**Files:**
- `job-scrapper-ui/package.json`, with the scripts `typecheck` (`tsc -b --noEmit`), `lint`, `test`, `test:e2e`
- `eslint.config.js`
- `vitest.config.ts`
- `src/test/setup.ts`
- root `package.json`: a `verify:ui` script that runs the UI typecheck, lint and test

**Pinned versions** (npm registry, checked by the audit on 2026-10-23; the round-1 validator could not re-check them).
Before pinning, run `npm view <pkg> version peerDependencies engines`, especially for vitest 5's `vite` peer range
against the installed Vite 6.4.5:
- vitest + @vitest/coverage-v8 5.0.5
- jsdom 30.1.3, which needs Node ^22.22.2, ^24.15 or ≥26; CI uses Node 24
- @testing-library/react 16.3.3, dom 10.4.2, user-event 14.6.8, jest-dom 7.0.1
- msw 3.0.3
- @playwright/test 1.64.1 + @axe-core/playwright 4.14.0
- eslint **9.39.5**. Stay on 9, because eslint-plugin-jsx-a11y 6.10.2 doesn't support 10.
- typescript-eslint 8.72.0, eslint-plugin-react-hooks 7.1.1, eslint-plugin-jsx-a11y 6.10.2

**AGENTS.md:** add `npm run verify:ui` to the mandatory checks.

**Acceptance:** `npm --prefix job-scrapper-ui run typecheck`, `run lint` and `test` each exit 0, and so does
`npm run verify:ui`.

#### P1-T20: the default view shows all jobs (FE-01)

**Change:** `filterSlice.ts:11` initializes `salaryInterval` to `undefined`. `jobsApi.ts` sends `salaryInterval` only
together with `salaryMin`.

**Acceptance:**
- Unit test: the default query string is exactly `page=1&pageSize=25&sortBy=publishedAt&sortOrder=desc`, in sorted order.
- After deploy, `meta.total` from `/v1/jobs` equals `/health.activeJobs`.

#### P1-T21: country options come from facets (FE-02, UI half)

**Change:** in `BrowsePage.tsx`, or in an extracted `FilterControls.tsx`:
- Use `useGetFacetsQuery()` to fill the country select from `countries[].value`.
- Label each option with `new Intl.DisplayNames(['en'], {type:'region'}).of(code)`, **inside try/catch**, falling back
  to the raw value. `.of()` throws `RangeError` for a malformed region code such as "United States", and some may still
  be in the DB before the backfill.

**Dependency:** ships together with P1-T15 (scraper ISO normalization and backfill).

**Acceptance:**
- An MSW-mocked facet value renders as an option, and choosing it sends `country=<code>`.
- A raw value such as "United States" renders without crashing.
- `grep -rnE '"(US|GB|CA|DE|FR)"' job-scrapper-ui/src/pages` finds nothing. Mocks are excluded until P5-T10.

### P5 (after the P2 API contract is frozen)

| Task | Goal (gaps) | Files | Acceptance |
|---|---|---|---|
| P5-T01 | URL as the source of truth (`?q=&workplace=&employment=&country=&salary=1&sort=&page=`), mobile drawer keeps a draft and applies once, scroll to top plus focus on the h1 on page change, `LinearProgress` while `isFetching`, sort select limited to what the server supports (FE-03, 07, 16) | `BrowsePage.tsx`, `hooks/useJobFilters.ts`, `filterSlice.ts` | Playwright: `/?q=engineer&workplace=Remote&page=2` sends the matching API request; reload keeps the state; back restores it; a page change scrolls to y=0; the drawer dispatches once |
| P5-T02 | Remove the client rate gate. A shared `<QueryState>` branches on 404, 429 and 5xx with Retry. On 429, read `Retry-After` (or `retryAfterSeconds`), show a countdown, then auto-refetch. Handle the WAF's 429, which has no body (FE-05, 06) | `components/QueryState.tsx`, `jobsApi.ts`, delete `rateLimitSlice.ts`, pages | Fake timers: `Retry-After: 3` shows a countdown, then refetches. 404 and 500 copy differ. `grep -rn "maximum 10 requests" src` finds nothing. |
| P5-T03 | Companies pagination from `totalPages`, the real `total`, an empty state (FE-04) | `CompaniesPage.tsx`, types | `totalPages: 59` renders 59 pages; page 2 requests `page=2`; no literal `1,747` |
| P5-T04 | Live counts and freshness from `GET /v1/meta` ("Updated 3 h ago") (FE-11) | Header, Footer, Browse, About, `index.html`, a `getMeta` endpoint | `grep -rnE "34,0[0-9]{2}\|1,74[0-9]" src index.html` finds nothing |
| P5-T05 | Accessibility: labels, `aria-pressed`/`aria-expanded`, one h1 per page, `role="status"` on counts, skip link, focus management, ≥44 px touch targets on `xs` (FE-12, 25) | all pages | axe: 0 serious or critical issues on every route in light and dark; jsx-a11y: 0 errors |
| P5-T06 | SEO basics: React 19 native `<title>`/`<meta>` per page, `public/robots.txt`, a `*` NotFound route. JobPosting JSON-LD sits behind `VITE_ENABLE_JOBPOSTING_JSONLD=false` by default, because Google's policy says only employers should supply it (D-13) (FE-13) | pages, `public/robots.txt`, `App.tsx` | Detail `<title>` is `"<title> at <company>"`; `/nope` renders Not Found; `curl $URL/robots.txt` starts with `User-agent` |
| P5-T07 | Sanitize once with `useMemo`, add a DOMPurify hook that sets `target=_blank rel="noopener noreferrer nofollow ugc"`, `FORBID_ATTR:['style']`. If `active:false`, show a "This job is closed" banner and disable **both** Apply buttons, desktop (`:226-239`) and mobile sticky bar (`:284-312`) (FE-14, 15) | `JobDetailPage.tsx`, `lib/sanitize.ts` | Unit tests: anchors get `rel`/`target`; `onerror` and `<script>` are stripped (this guards the BF-013 invariant); `active:false` disables Apply |
| P5-T08 | Performance and hygiene: `React.lazy` routes, a `manualChunks` split for MUI, self-hosted `@fontsource-variable/geist`, `loading="lazy"` logos, apply `.dark` on first load, remove dead Tailwind classes, make the dev server default to localhost, correct the About copy (FE-20, 21, 22, 24) | `App.tsx`, `vite.config.ts`, `index.html`, `main.tsx`, `AboutPage.tsx` | Entry chunk ≤160 kB gzip; `fonts.googleapis` is absent from `index.html` |
| P5-T09 | UI doc `documentation/13-frontend-ui.md`: routes, state, the API calls each page makes, env (`VITE_API_BASE_URL`), testing (DOC-03) | docs | The doc exists and is linked from `documentation/README.md` |
| P5-T10 | Types match `04` §2 exactly. Repoint the JSDoc in `types/api.ts:1-3` to `documentation/12-backend-api.md`. Move the mocks into `src/test/fixtures/` with real shapes. Add a contract test that shares fixtures with `tests/unit/ApiServer.test.ts` (FE-17, 23, API-23) | `types/api.ts`, fixtures | `grep -rn "frontend-design" job-scrapper-ui/src` finds nothing; the contract test passes |

**Serialization:**
- P5-T01, T05, T06 and T08 all touch most pages, so run them one after another in that order.
- P5-T02 and P5-T03 can run alongside them only if they don't edit the same page (Browse vs Companies).

## 5. UI tests

Test files to add:
- `src/store/api/jobsApi.test.ts`
- `pages/BrowsePage.test.tsx`: loading, empty, 500 and 429 states; facet countries; the drawer dispatches once
- `pages/JobDetailPage.test.tsx`: 404/429/500; the DOMPurify invariant
- `pages/CompaniesPage.test.tsx`
- `src/test/contract.test.ts`
- `e2e/browse.spec.ts`, `e2e/detail.spec.ts`, `e2e/a11y.spec.ts`: Playwright against `vite preview`, with `/v1` mocked
  through `page.route` fixtures

CI runs these in `ci.yml` (P3-T01) on Node 24 whenever a PR touches `job-scrapper-ui/**`, `src/api/**` or `vercel.json`.

## 6. Design constraints for the implementer

- **Product scope:** there are no logins and no personal features. Users only browse and click Apply, which opens the
  company's own Ashby page in a new tab with `rel="noopener noreferrer"`.
- **Design work:** use the `impeccable` skill for critique and polish. Don't redesign the visual identity in P5. The
  scope is correctness, a11y, performance and state.
- **Vercel Hobby is non-commercial:** no ads, no affiliate links, no paid placement (Q-14).
