# Agent Context

Authoritative quick context for AI coding agents. Last updated: 2026-10-27 (ADR-0021).

## Components & Entry Points
- **Scraper:** `backend/src/core/Scraper.ts` (single process / IPC worker), `backend/src/core/ClusterScraper.ts` (parallel OS worker coordinator), `backend/src/core/ScraperCSV.ts` (streaming CSV exporter).
- **Cache Publisher:** `backend/src/cache/Publisher.ts` (atomic generation swap, sanity gating, details diffing), `backend/src/cache/CacheCli.ts`.
- **Backend API:** `backend/src/api/Server.ts` (Express 5 REST API), `backend/src/api/contract.ts`, `backend/src/api/db/queries.ts`, `backend/src/api/cache/ReadThrough.ts` (LRU + Redis read-through), `backend/src/api/middleware/dbGuard.ts` (concurrency guard & deduplication), `backend/src/api/middleware/cacheControl.ts` (CDN caching headers), `backend/api/index.ts` (Vercel serverless entry point).
- **Frontend UI:** `frontend/` (React 19, TypeScript, Vite, Redux Toolkit, MUI 9; B.O.O.L.E.A.N).

## CLI Commands
- `npm run scrape:parallel [-- --workers=N]`: Multi-worker parallel scrape into PostgreSQL with automatic cache publish.
- `npm run scrape`: Single-process scrape.
- `npm run scrape:csv`: Stream active jobs to dated CSV in `output/`.
- `npm run api:start`: Run Express REST API server locally on port 3001.
- `npm run verify`: Audit database counts, active/inactive ratios, and sample data integrity.
- `npm run cache:publish [--dry-run] [--force]`: Publish pre-rendered cache generation to Redis.
- `npm run cache:status`: Inspect active generation, last scrape, and last publish telemetry.
- `npm run cache:purge-legacy`: Clean up un-namespaced historical keys.
- `npm run report:classify`: Classify scrape report into actionable vs noise.
- `npm --prefix frontend run check`: Run UI typecheck, lint, tests, and build.

## Data & Cache Facts
- **Change Detection:** PostgreSQL `contentHash` comparison over 17 explicit fields in `batchUpsertJobs` (Redis change detection removed in P1-T04 per D-06).
- **Freshness Detection:** `lastUpdatedAt` and `lastUpdatedSource` (`'ashby'|'detected'|'published'|'firstSeen'`) on `Job`; content-hash changes trigger `'detected'` without altering `computeJobContentHash` (ADR-0018).
- **Cache Generations:** Upstash Redis `jc:v1:*` keys. Double-buffered atomic generation swap via MULTI/EXEC. Detail rows sharded across 8 hashes (`CRC32(id) % 8`).
- **REST Endpoints:** `/v1/jobs`, `/v1/jobs/:id`, `/v1/companies`, `/v1/companies/:slug`, `/v1/facets`, `/v1/meta`, `/health` (shallow, 0 DB/Redis warm). Unknown `/v1/*` returns JSON 404 (O14).
- **Backpressure & Concurrency:** `DbGuard` limits active database queries to 3 with queue size 10 (returns 503 + Retry-After on backpressure). Coalesces concurrent identical DB queries via `singleFlight`.
- **Telemetry:** Each run writes `output/reports/<YYYY-MM>/<runId>.json` (ErrorTracker v2) and `output/latest-<mode>.json`.
- **Multi-source (ADR-0021):** `Job.source`/`externalId`, `Company.source`/`atsToken`; `ashbyId` = legacy global key.

## Regression Invariants (doc 10)
- **BF-001…BF-010:** BF-001 GraphQL fallback (`AshbyClient.test.ts`), BF-002 strip null/HTML (`Sanitizer.test.ts`), BF-003 URL canonical (`Sanitizer.test.ts`), BF-004 validation pre-filter (`ScraperRunAll.test.ts`), BF-005 salary intervals (`AshbyClient.test.ts`, `ScraperRunAll.test.ts`), BF-006 dedupe/quarantine (`CompanyHealth.test.ts`), BF-007 batch duplicate IDs (`Sanitizer.test.ts`), BF-008 coordinator allSettled (`ClusterScraper.test.ts`), BF-009 CSV naming (`ScraperCSV.test.ts`), BF-010 createMany fast-path (`ScraperRunAll.test.ts`).
- **BF-011:** Structured columns and 17-field content hash (guarded: `ContentHash.test.ts`).
- **BF-012:** Express REST API pagination, rate limiting, security headers (guarded: `ApiServer.test.ts`).
- **BF-013:** Filter AND-accumulation, `/v1/facets`, DOMPurify XSS defense (guarded: `ApiServer.test.ts`, UI tests).
- **BF-014:** Limiter pause timer retains event loop (guarded: `ConcurrencyExit.test.ts`).
- **BF-015:** 429 rate limit scoping, Retry-After header, api_error forwarding (guarded: `AshbyClient.test.ts`, `ScraperRunAll.test.ts`).
- **BF-016:** GraphQL source preservation against REST overwrite and empty board deferral (guarded: `ScraperRunAll.test.ts`).
- **BF-017:** Cache publishing orchestration, worker failure isolation, and exit code contract (guarded: `ClusterScraper.test.ts`, `Publisher.test.ts`, `ScraperRunAll.test.ts`).
- **BF-018:** API cache read-through parity, detail sharding, negative 404 LRU cache (guarded: `ReadThrough.test.ts`, `Hardening.test.ts`, `HealthMeta.test.ts`).
- **BF-019:** Cache bodies equal DB-path bodies, all company pages are cached, and an idle API Redis client connects before its first command (guarded: `CacheParity.test.ts`, `HealthMeta.test.ts`).
- **BF-020:** Search: every word starts a word in title/company/department/location, any order (guarded: `Search.test.ts` on real Postgres, `SearchTokenize.test.ts`).

## Top Gotchas
1. **Modules executing on import:** `DbMenu.ts`, `DbInspect.ts`, `GenerateDocs.ts` run on import—never import them into other modules.
2. **Verification commands:** `scripts/check-all.sh --no-install` runs verification across backend and frontend.
3. **Exit codes:** Scrapers exit 0 on clean success, 1 on hard failure, 2 on scrape success with cache publication failure or sanity gate tripping.
4. **`JOBS.md`:** 5 MB committed snapshot—never read entirely into memory.
5. **Deploys:** Deploys are manual: Vercel git deploys are off, so a push or merge never changes the live site; the owner runs the **Deploy to Vercel** workflow (`.github/workflows/deploy.yml`, ADR-0016). Never re-enable git deploys or add a push trigger to `deploy.yml`.
