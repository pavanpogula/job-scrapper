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
- `src/test/contract.test.ts`: Validates data structures returned by mocked endpoints against UI contract expectations.
- `src/test/sanitize.test.ts`: Tests HTML sanitization and safe text rendering.
- `src/test/defaultQuery.test.ts`: Verifies search parameter serialization and default query states.
- `src/test/countryFacets.test.tsx`: Integration test with MSW asserting country display names and filter dispatch.
- `src/test/formatJobFreshness.test.ts`: Unit tests for the job freshness label helper (Updated / Posted / First seen, relative and absolute dates, clock skew, invalid input; ADR-0018).
- `src/test/jobFreshness.test.tsx`: Integration test with MSW asserting job cards render the freshness label as `<time>` elements, including the `publishedAt` fallback for cache bodies without the new fields.

---

## 4. Verification Gate

Before committing any frontend changes, verify with:
```bash
scripts/check-all.sh --no-install
```
This runs `npm run check` in `frontend/` alongside backend checks and repo-level tests.
