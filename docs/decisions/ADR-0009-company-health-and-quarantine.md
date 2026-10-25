# ADR-0009: Persisted company health counters and the quarantine

- Status: Accepted
- Date: 2026-10-24
- Deciders: owner, scraper-bugfixer agent
- Related: D-10, GAP-SCR-06, GAP-DB-02

## Context
Companies occasionally change ATS providers, rebrand, or shutter their Ashby boards, returning HTTP 404. Transient network errors or rate limits also return non-200 responses. Deactivating a company immediately on a single fetch failure risks dropping active jobs during brief outages; conversely, failing to prune defunct boards wastes scraping resources and leaves phantom jobs in the database indefinitely.

## Options Considered
1. **Immediate deactivation on first failure**: Causes false-positive deactivation and job churn during transient network blips.
2. **Never deactivate automatically**: Accumulates dead boards, inflating scrape durations and skewing job metrics.
3. **Persisted health counters with quarantine threshold**: Track `consecutiveFails` and `consecutive404s` on the `Company` record in Postgres. Quarantine a company and deactivate its jobs only after 3 consecutive confirmed 404s. Raise an actionable report issue if non-404 failures persist for 7 runs without auto-deactivating.

## Decision
Adopt persisted company health counters (`consecutiveFails`, `consecutive404s`, `lastHttpStatus`, `quarantinedAt`) in Prisma. Quarantine a company only after 3 consecutive confirmed 404 responses, deactivating its jobs. Transient network errors never deactivate a company; if a company fails for 7 consecutive runs, an actionable S2 triage issue is raised.

## Consequences
- Protects against job churn during temporary outages.
- Automatically cleans up decommissioned ATS boards without human intervention.
- Guarded by tests in `tests/unit/CompanyHealth.test.ts`.
