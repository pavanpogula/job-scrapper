# Agent Context

Authoritative quick context for AI coding agents. Last updated: 2026-10-23 (P1-T02).

## Components & Entry Points
- **Scraper:** `src/core/Scraper.ts` (single process / IPC worker), `src/core/ClusterScraper.ts` (parallel OS worker coordinator), `src/core/ScraperCSV.ts` (streaming CSV exporter).
- **Cache Publisher:** `src/cache/Publisher.ts` (planned: P2).
- **Backend API:** `src/api/Server.ts` (Express 5 REST API), `api/index.ts` (Vercel serverless entry point).
- **Frontend UI:** `job-scrapper-ui/` (React 19, TypeScript, Vite, Redux Toolkit, MUI).

## CLI Commands
- `npm run scrape:parallel [-- --workers=N]`: Multi-worker parallel scrape into PostgreSQL.
- `npm run scrape`: Single-process scrape.
- `npm run scrape:csv`: Stream active jobs to dated CSV in `output/`.
- `npm run api:start`: Run Express REST API server locally on port 3001.
- `npm run verify`: Audit database counts, active/inactive ratios, and sample data integrity.
- `npm run cache:publish` (planned: P2): Publish pre-rendered cache generation to Redis.
- `npm run report:classify` (planned: P1-T10): Classify scrape report into actionable vs noise.
- `npm run verify:ui` (planned: P1-T19): Run UI typecheck, lint, and tests.

## Data & Cache Facts
- **Change Detection:** PostgreSQL `contentHash` comparison in `batchUpsertJobs` (Redis change detection removed in P1-T04 per D-06).
- **Cache Generations:** Today there is no `jc:v1` cache; the API queries PostgreSQL directly. Cache-first architecture using Upstash Redis `jc:v1:*` keys is planned: P2.
- **REST Endpoints:** `/v1/jobs`, `/v1/jobs/:id`, `/v1/companies`, `/v1/facets`, `/health`. (`/v1/meta` is planned: P2).
- **Telemetry:** Each run writes `output/latest-error-report.json`. (Structured run-id report history in `output/reports/<YYYY-MM>/<runId>.json` is planned: P1-T10).

## Regression Invariants (doc 10)
- **BF-001:** GraphQL fallback on 404/403/400 (guarded: partial in `AshbyClient.test.ts`).
- **BF-002:** Strip null bytes and lone surrogates (guarded: partial in `Sanitizer.test.ts`).
- **BF-003:** Strip dangerous HTML tags and inline scripts (guarded: `Sanitizer.test.ts`).
- **BF-004:** Filter corrupt job payloads and isolate batch failures (guarded: partial in `Sanitizer.test.ts`).
- **BF-005:** Salary extraction and structured interval parsing (guarded: partial in `Sanitizer.test.ts`).
- **BF-006:** In-flight deduplication and stale job deactivation (guarded: ❌ none, harness in P1-T03).
- **BF-007:** Filter duplicate job IDs within batch (guarded: `Sanitizer.test.ts`).
- **BF-008:** IPC worker telemetry merging in cluster mode (guarded: partial in `ClusterScraper.test.ts`).
- **BF-009:** CSV scraper telemetry forwarding to ErrorTracker (guarded: partial in `ScraperCSV.test.ts`).
- **BF-010:** `createMany` fast-path for new jobs (guarded: ❌ none, harness in P1-T03).
- **BF-011:** Structured column population from Ashby metadata (guarded: partial in `ScraperCore.test.ts`).
- **BF-012:** Express REST API pagination and RTK Query client caching (guarded: ❌ none, tests in P1-T16).
- **BF-013:** Filter AND-accumulation query builder, DOMPurify XSS defense, CSP headers, `/v1/facets` (guarded: ❌ none, tests in P1-T16).

## Top Gotchas
1. **Modules executing on import:** `DbMenu.ts`, `DbInspect.ts`, `GenerateDocs.ts` run on import—never import them into other modules.
2. **Typecheck & lint scope:** `tsc -p .` and `npm run lint` cover `src/` only today (expansion planned: P3-T01).
3. **Exit codes:** Scrapers exit 0 on success, 1 on hard failure (exit 2 for publish failure/gate planned: P2-T04).
4. **`JOBS.md`:** 5 MB committed snapshot—never read entirely into memory.
