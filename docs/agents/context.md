# Agent Context

Authoritative quick context for AI coding agents. Last updated: 2026-11-24 (ADR-0023).

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
- **Multi-source (ADR-0021, ADR-0022):** `Job.source`/`externalId`, `Company.source`/`atsToken`; `ashbyId` = legacy key; Greenhouse via `GREENHOUSE_ENABLED` (per-source gate: drop > 30% from baseline >= 100); Lever via `LEVER_ENABLED`, staged scrape via `STAGED_SCRAPE` (both default off).
- **Job attributes (ADR-0023):** `experienceMinYears`, `clearanceRequired`, `attrs*` on `Job`; outside `contentHash`; not in the API until E4.

## Regression Invariants (doc 10)
- **BF-001…BF-020:** see `docs/testing.md` §6 (BF-011 17-field content hash, BF-013 filter AND, BF-017 publish + exit codes, BF-019 cache = DB bodies).
- **BF-023:** Greenhouse fetch & normalizer (`greenhouse:<id>` legacyKey, single unescape, cents/hourly salary, `_normVersion` freshness, `bySource` telemetry; guarded: `GreenhouseClient.test.ts`, `GreenhouseCoexistence.test.ts`).
- **BF-024:** Lever fetch & normalizer (`lever:<uuid>` legacyKey, ≤1 req/s pacer, cap 600 + `leverDeadlineMs`, `allocateCompanySlug`, `bySource.lever`; guarded: `LeverClient.test.ts`, `LeverCoexistence.test.ts`).
- **BF-025:** Staged scrape (`--staged`: one source per stage, failed stage never stops later ones, one publish; guarded: `StagedScrape.test.ts`).
- **BF-026:** Job attribute rules are pure; golden-set P/R ≥ 0.90 (guarded: `JobAttributesGolden.test.ts`).

## Top Gotchas
1. **Modules executing on import:** `DbMenu.ts`, `DbInspect.ts`, `GenerateDocs.ts` run on import—never import them into other modules.
2. **Verification commands:** `scripts/check-all.sh --no-install` runs verification across backend and frontend.
3. **Exit codes:** Scrapers exit 0 on clean success, 1 on hard failure, 2 on scrape success with cache publication failure or sanity gate tripping.
4. **`JOBS.md`:** 5 MB committed snapshot—never read entirely into memory.
5. **Deploys:** Deploys are manual: Vercel git deploys are off, so a push or merge never changes the live site; the owner runs the **Deploy to Vercel** workflow (`.github/workflows/deploy.yml`, ADR-0016). Never re-enable git deploys or add a push trigger to `deploy.yml`.
