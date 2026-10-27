# Backend Testing Guide

> **Scope:** Backend test suite (`backend/tests/`), Jest configuration, Prisma/Redis mocks, test execution, and regression invariants.

---

## 1. Running Backend Tests

All backend test commands are executed from the repository root with `npm --prefix backend` or directly inside `backend/`:

| Goal | Command |
|---|---|
| Full backend check | `npm --prefix backend run check:all` |
| Whole Jest suite | `npm --prefix backend test` |
| Verbose test output | `npm --prefix backend test -- --verbose` |
| Quiet mode | `npm --prefix backend test -- --silent` |
| Specific test file | `npm --prefix backend test -- tests/unit/Sanitizer.test.ts` |
| By test name pattern | `npm --prefix backend test -- -t "three-strike NOT_FOUND"` |
| Watch mode | `npm --prefix backend test -- --watch` |
| Typecheck tests | `npm --prefix backend run typecheck:test` |
| Lint backend code | `npm --prefix backend run lint` |
| Update contract fixtures | `npm --prefix backend run contract:fixtures` |

---

## 2. Mocking Architecture

- **Prisma Client:** Mocked globally in `backend/__mocks__/@prisma/client.ts`. Prevents tests from connecting to real database instances.
- **Redis Client:** In-memory fake client in `backend/tests/helpers/fakeRedis.ts`.
- **Ashby API:** Fetch requests and responses are mocked via standard Jest spies or HTTP mock adapters.
- **Google Drive:** OAuth and JWT flows are intercepted in unit tests (`tests/unit/GoogleDrive.test.ts`).

---

## 3. Test Structure & Categories

- `backend/tests/unit/`: Fast unit tests covering scrapers, sanitizers, circuit breakers, cache keys, and API controllers.
- `backend/tests/contract/`: Deterministic supertest suite (`ContractFixtures.test.ts`) validating API endpoint contracts and asserting cache HIT == MISS parity (BF-019).
- `backend/tests/e2e/`: End-to-end scraper pipeline and discovery pipeline tests.
- `backend/tests/fixtures/`: Fixed JSON payloads for error reports, API mocks, and contract fixtures.
- `backend/tests/helpers/`: Test factories and mock utilities.

---

## 4. Verification Gate

Before committing any backend changes, run:
```bash
scripts/check-all.sh --no-install
```
This runs `npm run check:all` in `backend/` alongside frontend checks and repo-level tests.
