# ADR-0018: Job last-updated time is detected by content-hash change

- Status: Accepted
- Date: 2026-10-26
- Deciders: owner, scraper-architect agent
- Related: BF-011, ADR-0004

## Context
Job board users expect to see when a job posting was last updated or posted to prioritize fresh listings. However, external Ashby endpoints expose no reliable update timestamp:
1. REST posting-api (`/posting-api/job-board/{slug}`) exposes only `publishedAt`.
2. GraphQL `JobPostingDetails` exposes only `publishedDate`; requesting `updatedAt` fails schema validation.
3. Job page JSON-LD metadata includes only `datePosted`.
Furthermore, our database column `Job.updatedAt` represents internal row modification time (`@updatedAt`), not posting modification time. Reusing it would cause every scraper touch or scrape run touch to masquerade as an employer update.

## Options Considered
1. **Reuse `Job.updatedAt`**: Treat row write time as last updated. Fails because routine re-touches and reactivation update this field, producing false "updated just now" indicators across all jobs.
2. **Periodic scrape-time diffing in Redis**: Diff stored Redis payload against scraped payload. Rejected in ADR-0004 due to tight coupling, high command usage, and quota limits.
3. **Dedicated `lastUpdatedAt` and `lastUpdatedSource` columns driven by contentHash diffing**: Add `Job.lastUpdatedAt` and `Job.lastUpdatedSource` columns. Compute updates deterministically during scrape: if Ashby provides a valid update timestamp, use it (`'ashby'`); if an existing job's `contentHash` changes, record the current scrape detection time (`'detected'`); for new jobs, fall back to `publishedAt` (`'published'`) or current scrape time (`'firstSeen'`). Existing unchanged jobs preserve their timestamp.

## Decision
Adopt Option 3. Track job freshness via two explicit nullable columns on `Job`: `lastUpdatedAt DateTime?` and `lastUpdatedSource String?` (`'ashby' | 'detected' | 'published' | 'firstSeen'`).
The `computeJobContentHash` helper and its 17 fields remain strictly immutable (BF-011). Changes to content hash trigger freshness detection without polluting the hash itself. Mappers and the frontend UI gracefully fall back to `publishedAt` when `lastUpdatedAt` is null for legacy rows.

## Consequences
- Every job card and detail page displays user-facing freshness (`"Updated 2d ago"`, `"Posted 5d ago"`, `"First seen 1h ago"`).
- `computeJobContentHash` and its invariant tests remain 100% untouched.
- Routine scraper touches (`toRawTouch`) never alter `lastUpdatedAt`.
- Timestamps are monotonic: clock skew or historical re-processing cannot rewind `lastUpdatedAt`.
- Guarded by unit tests in `backend/tests/unit/LastUpdated.test.ts`, integration tests in `backend/tests/unit/ScraperRunAll.test.ts`, and frontend tests in `frontend/src/test/formatJobFreshness.test.ts`.
