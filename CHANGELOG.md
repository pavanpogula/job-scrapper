# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- **Double-Buffered Cache Generations (`jc:v1:*`):** Atomic cache publication pipeline swapping active generation pointers upon verified completion with 30% drop sanity gate (P2-T01, P2-T02, P2-T04, ADR-0003, GAP-CAC-02).
- **API Read-Through Service:** Express read-through service for jobs, companies, facets, and metadata backed by Upstash Redis with in-process LRU cache and circuit breaker fallback to Neon PostgreSQL (P2-T05, P2-T06, ADR-0001, ADR-0002, BF-018, GAP-API-03).
- **Detail Sharding & Negative Caching:** Detail queries mapped to 8 CRC32 shards with index fallback and 10-minute in-process negative LRU caching for confirmed 404 lookups (P2-T06, BF-018).
- **DbGuard Middleware & Edge Cache Headers:** Serverless PostgreSQL concurrency guard (max 3 concurrent queries, 503 backpressure, single-flight deduplication) and edge CDN cache-control headers (P2-T07, ADR-0011, GAP-API-05).
- **Telemetry Classifier & Error Report v2:** Structured error classification (`classifyReport`) generating `.issues.json` and v2 telemetry reports partitioned by month (`output/reports/<YYYY-MM>/<runId>.json`) (P1-T19, P1-T20).
- **CI Workflows & Scheduled Scrape:** GitHub Actions PR CI workflow (`ci.yml`) enforcing Node 24, typecheck, lint, tests, and UI verification, plus daily scheduled scrape workflow (`scrape-daily.yml`) running at 06:17 UTC with 4 worker processes and issue alerting (P3-T01, P3-T02, ADR-0010, GAP-CI-01).
- **Deployment & Operations Runbook:** Comprehensive documentation of free-tier quotas, secrets matrix, operational incident runbooks, and cost dashboards in `documentation/14-deployment-and-operations.md` (P3-T04).
- **Architecture Decision Records:** Established `documentation/decisions/` directory, template, and initial ADR index ADR-0001 through ADR-0012 (P4-T01, ADR-0001..0012, GAP-DOC-06).

### Changed
- **Enforced Node 24:** Added `.nvmrc` (`24`) and updated `package.json` engines to `>=24.0.0` (P3-T01).
- **Company Enrichment Backoff:** Updated `fetchOrganizationMetadata` to return structured status (`ok`, `not_found`, `rate_limited`, `error`) and back off via adaptive concurrency limiter on HTTP 429 (P3-T03, GAP-SCR-22).
- **Prisma Schema Additions:** Added `contentHash`, `pendingEmptySince`, `consecutiveFails`, `consecutive404s`, `lastHttpStatus`, and `quarantinedAt` columns to `Job` and `Company` models (P1-T04, P1-T05, P1-T06, ADR-0004, ADR-0009).

### Fixed
- **Limiter Event Loop Cooldown Retention (BF-014, SCR-09):** Removed `pauseTimer.unref()` in `Concurrency.ts` so active tasks finish during rate-limit pauses instead of terminating Node process prematurely. Guarded by `tests/unit/ConcurrencyExit.test.ts`.
- **Posting API Failure Classification & Retry-After (BF-015, SCR-11/12):** Scoped rate limiting strictly to HTTP 429, honored upstream `Retry-After` header capped at 10 s, and recorded structured `api_error` events on network/timeout exhaustion. Guarded by `tests/unit/AshbyClient.test.ts` and `tests/unit/ScraperRunAll.test.ts`.
- **GraphQL Overwrite Protection & Empty Board Deferral (BF-016, SCR-16/17):** Preserved rich REST job details from overwrite by fallback GraphQL records, and deferred job deactivation for companies with ≥ 5 jobs on single empty responses. Guarded by `tests/unit/ScraperRunAll.test.ts`.
- **Cache Publishing Isolation & Exit Codes (BF-017, CACHE-04, GAP-OPS-06):** Gated cache publishing on 100% worker success, emitted exit code 2 on publication or sanity gate failure, and properly recorded timestamps on `--skip-publish`. Guarded by `tests/unit/ClusterScraper.test.ts`.
- **API Salary Interval Filtering (BF-014, ADR-0007, GAP-API-01):** Backend query builder now ignores `salaryInterval` unless `salaryMin` or `salaryMax` is specified, preventing accidental omission of jobs without disclosed annual salaries. Guarded by `tests/unit/ApiServer.test.ts`.
- **Country Facet Normalization (BF-013, GAP-UI-01):** Implemented ISO-3166 alpha-2 country extraction and UI display name localization using `Intl.DisplayNames`. Guarded by `tests/unit/Country.test.ts` and UI test suites.

---

## [1.3.0] - 2026-10-23

### Added
- **Multi-Process Cluster Scraper (BF-008):** Parallel scraping across multiple OS worker processes with watchdog timeouts, SIGTERM handling, and aggregated telemetry output.
- **Verification Auditor (BF-009):** CLI command `npm run verify` (`src/utils/Verify.ts`) verifying database counts, salary distribution, and data integrity.
- **REST API Server (BF-012, BF-013):** Express REST API in `src/api/Server.ts` serving `/v1/jobs`, `/v1/jobs/:id`, `/v1/companies`, `/v1/facets`, and `/health`.
- **React 19 Web UI (BF-012, BF-013):** Modern web frontend in `job-scrapper-ui/` built with React 19, TypeScript, Vite, Tailwind CSS, and Redux Toolkit.
- **Company Enrichment & Discovery (BF-011):** CommonCrawl CDX index scraping (`src/discovery/CdxWorker.ts`) and logo/domain metadata extraction from Ashby board HTML.
- **Bulk Upsert & DB Optimization (BF-010):** Batch `createMany` fast path and database indexing.

### Changed
- **Query Builder Search Accumulation (BF-013):** Refactored API query builder to use `where.AND` preventing filter overwrite between text search and salary parameters.
- **Security Hardening (BF-013):** Added Content-Security-Policy headers, client IP resolution under trust proxy, and DOMPurify sanitization in frontend job description rendering.

### Fixed
- **Posting API Fallback to GraphQL (BF-001):** Automatic retry with exponential backoff and GraphQL fallback for boards returning 404/403/400.
- **JSONB Unicode & Surrogate Stripping (BF-002):** Stripped null bytes (`\u0000`), unpaired Unicode surrogates, and script tags before database insertion.
- **URL Validation & Canonical Fallback (BF-003):** Validated job application URLs with fallback to canonical Ashby job board URLs.
- **Validation Pre-Filter & Batch Fallback (BF-004):** Filtered malformed records before Prisma transactions with fallback to individual row persistence.
- **Salary Extraction & Null Clearing (BF-005):** Regex-based compensation parsing extracting min/max/currency/interval, properly clearing null values when compensation is removed upstream.
- **Department/Location Deduplication & Quarantine (BF-006):** In-memory deduplication of department and location records, streaming batch flushes, and 3-strike quarantine on dead boards.
- **CSV/Markdown Escaping (BF-007):** Quoted and sanitized special characters in CSV export mode (`src/core/ScraperCSV.ts`).
