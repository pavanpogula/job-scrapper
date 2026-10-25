# ADR-0015: Synchronized API contract fixtures and type parity between backend and frontend

- Status: Accepted (Planned for Phase P8a)
- Date: 2026-10-25
- Deciders: owner, scraper-architect agent
- Related: O3, O4, O5, O6, O14, P8a

## Context
Across early iterations of the project, minor contract divergences emerged between the backend Express REST responses and frontend TypeScript interfaces (e.g., frontend expected `createdAt`/`updatedAt` on `JobDetail` which the backend omitted, and UI exposed unsupported query parameters such as `sortBy=title`, `company`, `department`, `location`, `city`). We need a reliable mechanism to ensure strict type and runtime contract parity without introducing a coupled shared package build step.

## Options Considered
1. **Shared NPM Package (`@job-scrapper/types`):** Publish or link a shared TypeScript library across workspaces. Requires root monorepo build orchestration (turborepo, nx, etc.), adding build tooling overhead and risking version drift between local dev and CI.
2. **Synchronized Contract Fixtures & Parity Tests:** Maintain contract fixtures (`backend/tests/fixtures/contract/` and `frontend/src/test/fixtures/contract/`) synchronized by automated checks. Align types directly in code and assert parity in CI.

## Decision
Adopt Option 2: Synchronized contract fixtures and automated parity testing (to be fully completed in Phase P8a):
- Remove `createdAt` and `updatedAt` from frontend `JobDetail` type (O3 default).
- Remove unsupported filter parameters (`sortBy=title`, `company`, `department`, `location`, `city`) from frontend query types (O4 default).
- Unify `totalPages` calculation to `Math.max(1, ...)` across jobs and companies endpoints (O5 default).
- Fix `/v1/meta` `lastScrapeAt` computation on the database fallback path (O6 default).
- Enforce that unknown `/v1/*` routes return JSON 404 rather than default Express HTML (O14 default).
- Validate parity with automated tests comparing fixture payloads and type definitions.

## Consequences
- Guarantees 100% runtime contract safety across the backend/frontend boundary.
- Zero extra build tooling or package publishing overhead.
- Frontend and backend retain independent TypeScript build configurations.
