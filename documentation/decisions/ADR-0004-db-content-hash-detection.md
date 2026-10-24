# ADR-0004: Remove Redis change detection in favour of the DB contentHash

- Status: Accepted
- Date: 2026-10-24
- Deciders: owner, scraper-architect agent
- Related: D-04, GAP-CAC-03, GAP-SCR-02

## Context
Earlier designs attempted to compute diffs and detect job changes by querying Redis hashes during the scrape run. This tightly coupled the scraper's persistence stage to Redis availability, multiplied Redis network round-trips, and exhausted free-tier command quotas.

## Options Considered
1. **Redis-based change detection during scrape**: Query Redis keys to determine if a job changed before persisting to DB. Fails if Redis is down and wastes thousands of Redis commands.
2. **PostgreSQL contentHash comparison**: Compute a deterministic SHA-256 hash of core job fields (`title`, `descriptionHtml`, `locationName`, `departmentName`, `employmentType`, `compensationTier`, etc.) and store it in `Job.contentHash` in Postgres. Use Postgres upserts and hash checks to detect updates.

## Decision
Remove Redis change detection entirely from the scrape loop. PostgreSQL's `contentHash` column is the single source of change detection for jobs. The scraper only interacts with PostgreSQL, and the cache publisher handles synchronization after scrape completion.

## Consequences
- Scraper operates completely independently of Redis availability or command limits.
- Database upserts only mutate timestamps (`updatedAt`) when `contentHash` differs.
- Guarded by tests in `tests/unit/ContentHash.test.ts`.
