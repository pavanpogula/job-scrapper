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
| Search integration tests (real PostgreSQL) | `TEST_DATABASE_URL=postgresql://test:test@localhost:5432/search_test npm --prefix backend run test:integration` |

### 1.1 Real-database integration tests (`tests/integration/`)

The Prisma mock cannot evaluate text filters, so search correctness (BF-020) is proven against a real PostgreSQL:

- `npm test` skips `tests/integration/` (see `jest.config.js`); `npm run test:integration` runs it with `jest.integration.config.js`, which uses the real Prisma client.
- The suite needs `TEST_DATABASE_URL` and **refuses any host other than `localhost`/`127.0.0.1`**. It runs `prisma db push` and wipes the job tables in that database, so never point it at a shared database. Without the variable the suite is skipped with a warning.
- CI (`backend-ci.yml`) starts a `postgres:17.5` service container and always runs the suite.
- Locally, start a throwaway database first, for example `docker run --rm -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=search_test -p 5432:5432 postgres:17.5`.
- `tests/integration/searchReference.ts` is an independent statement of the search rule (it must not import `src/lib/search.ts`); `searchSeed.ts` holds the hand-written edge-case jobs.

---

## 2. Mocking Architecture

- **Prisma Client:** Mocked globally in `backend/__mocks__/@prisma/client.ts`. Prevents tests from connecting to real database instances.
- **Redis Client:** In-memory fake client in `backend/tests/helpers/fakeRedis.ts`.
- **Ashby API:** Fetch requests and responses are mocked via standard Jest spies or HTTP mock adapters.
- **Google Drive:** OAuth and JWT flows are intercepted in unit tests (`tests/unit/GoogleDrive.test.ts`).

---

## 3. Test Structure & Categories

- `backend/tests/unit/`: Fast unit tests covering scrapers, sanitizers, circuit breakers, cache keys, and API controllers.
- `backend/tests/e2e/`: End-to-end scraper pipeline and discovery pipeline tests.
- `backend/tests/fixtures/`: Fixed JSON payloads for error reports and test cases.
- `backend/tests/helpers/`: Test factories and mock utilities.

---

## 4. Verification Gate

Before committing any backend changes, run:
```bash
scripts/check-all.sh --no-install
```
This runs `npm run check:all` in `backend/` alongside frontend checks and repo-level tests.
