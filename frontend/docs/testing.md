# Frontend Testing Guide

> **Scope:** Frontend test suite (`frontend/src/test/`), Vitest configuration, MSW network mocking, and component tests.

---

## 1. Running Frontend Tests

All frontend test commands are executed from the repository root with `npm --prefix frontend` or directly inside `frontend/`:

| Goal | Command |
|---|---|
| Full frontend check | `npm --prefix frontend run check` |
| Vitest test suite | `npm --prefix frontend test` |
| Vitest in watch mode | `npm --prefix frontend run test:watch` |
| Typecheck frontend | `npm --prefix frontend run typecheck` |
| Lint frontend | `npm --prefix frontend run lint` |
| Production build | `npm --prefix frontend run build` |

---

## 2. Test Environment & Tools

- **Runner:** Vitest with `jsdom` environment.
- **Component Testing:** React Testing Library (`@testing-library/react`).
- **Network Mocking:** Mock Service Worker (MSW) mocking `/v1/jobs`, `/v1/facets`, and `/v1/companies` endpoints.
- **Redux Store:** Configured with fresh store instances per test via `@reduxjs/toolkit`.

---

## 3. Test Suites

- `src/test/smoke.test.ts`: Sanity smoke test ensuring test environment and DOM setup function correctly.
- `src/test/contract.test.ts`: Compile-time `satisfies` and exhaustive runtime key-set validation asserting that UI DTO types match shared API contract fixtures (`frontend/src/test/fixtures/contract/`).
- `src/test/sanitize.test.ts`: Tests HTML sanitization and safe text rendering.
- `src/test/defaultQuery.test.ts`: Verifies search parameter serialization and default query states.
- `src/test/countryFacets.test.tsx`: Integration test with MSW asserting country display names and filter dispatch.
- `src/test/sortParams.test.ts`: URL `sort`/`order` parsing; unsupported values such as old `?sort=title` bookmarks (removed in P8a/O4) fall back to `publishedAt`/`desc`.
- `src/test/searchBox.test.tsx`: Search box round trip with MSW: Enter sends the trimmed text and resets to page 1, `c++`/`c#`/`r&d`/`100%`/`node.js` survive URL encoding, clear removes `q`, and Back restores the previous search (BF-020).
- `src/test/formatJobFreshness.test.ts`: Unit tests for the job freshness label helper (Updated / Posted / First seen, relative and absolute dates, clock skew, invalid input; ADR-0018).
- `src/test/jobFreshness.test.tsx`: Integration test with MSW asserting job cards render the freshness label as `<time>` elements, including the `publishedAt` fallback for cache bodies without the new fields.
- `src/test/jobCard.test.tsx`: Component tests for `JobCard` verifying human labels, uncropped logo / fallback initial, formatted salary, freshness `<time>` tags, company links, and omission of inline apply buttons (ADR-0020).
- `src/test/twoPaneAndFilters.test.tsx`: Integration tests for desktop two-pane layout, filter pills (`postedWithin`, `isRemote`, `hasSalary`), and `?company=` deep linking (ADR-0020).
- `src/test/companyJobsTab.test.tsx`: Company Jobs tab reaches every job: real total and "Showing x–y of N", API paging to the last page, in-company search sent to the API (`company` + `search`, page reset), and "10+ locations" for a capped list (ADR-0020).
- `src/test/companyPage.test.tsx`: Integration tests for `CompanyPage` Overview and Jobs tabs, department grouping, and 404 state (ADR-0020).
- `src/test/companiesDirectory.test.tsx`: Integration tests for `CompaniesPage` directory, uncropped logos, "Most hiring / A–Z" sort toggle, and `B.O.O.L.E.A.N` header brand mark (ADR-0020).

### Contract Fixture Parity
Frontend contract fixtures in `src/test/fixtures/contract/` are mirrored byte-for-byte from backend contract fixtures:
```bash
node scripts/contract/sync-fixtures.mjs
```
The repo test `scripts/repo-tests/contract-sync.test.mjs` verifies that frontend fixtures remain in byte-for-byte lockstep with backend contract fixtures.

---

## 4. Verification Gate

Before committing any frontend changes, verify with:
```bash
scripts/check-all.sh --no-install
```
This runs `npm run check` in `frontend/` alongside backend checks and repo-level tests.
