# ADR-0003: Immutable cache generations with an atomic pointer swap, and the publisher as the single writer

- Status: Accepted
- Date: 2026-10-24
- Deciders: owner, api-cache agent
- Related: D-03, GAP-CAC-02

## Context
Publishing cache updates while clients are concurrently querying Redis can result in partial reads, missing index keys, or mismatched facet counts. In-place cache mutation is susceptible to split-brain states if a publisher crashes midway through updating thousands of keys.

## Options Considered
1. **In-place cache mutation**: Overwrite keys individually (`SET jc:v1:job:...`). Risk of tearing and inconsistent views across jobs, facets, and company listings.
2. **Double-buffered immutable generations**: Write the entire scraped dataset into an inactive generation key space (`jc:v1:gen:B:*`), detail diffing against the active generation (`gen:A`), and atomically swap the active generation pointer key (`jc:v1:active_gen`) upon complete success.

## Decision
Implement double-buffered generations (`A` and `B`). The scraper/publisher is the sole writer. It populates the staging generation, validates a sanity drop check (< 30% drop in active jobs), and atomically switches `jc:v1:active_gen` to the new generation, leaving the old generation as an instant rollback buffer.

## Consequences
- Guaranteed zero partial reads or inconsistent states for API consumers.
- Atomic pointer swap (`SET jc:v1:active_gen <newGen>`) takes 1 Redis command.
- Scraper failures or crashes leave the existing active cache generation completely intact and uncorrupted.
- Guarded by tests in `tests/unit/Publisher.test.ts` and `tests/unit/CacheKeys.test.ts`.
