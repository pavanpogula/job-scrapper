# ADR-0007: salaryInterval semantics: ignored unless salaryMin is set

- Status: Accepted
- Date: 2026-10-24
- Deciders: owner, scraper-bugfixer agent
- Related: D-07, BF-014, GAP-API-01

## Context
In earlier versions, the default frontend query sent `salaryInterval=yearly` even when no minimum salary filter was requested. The backend filter query interpreted this strictly and filtered out all jobs that did not specify `salaryInterval: 'Yearly'`, hiding approximately 63% of valid job postings.

## Options Considered
1. **Filter strictly on salaryInterval**: Matches only jobs with an exact interval match, hiding all postings without salary data.
2. **Ignore salaryInterval unless salaryMin or salaryMax is set**: Treat interval as a unit modifier for minimum/maximum numeric bounds. If no numeric salary threshold is requested, interval is ignored so all jobs remain visible.

## Decision
The backend query engine ignores `salaryInterval` unless `salaryMin` or `salaryMax` is explicitly specified. The frontend ceases sending default `salaryInterval=yearly` when the salary input is blank.

## Consequences
- Unfiltered job searches return all published jobs regardless of whether they disclose annual, hourly, or no salary data.
- Fixes BF-014 and prevents accidental job omission.
- Guarded by tests in `tests/unit/ApiServer.test.ts` ("ignores salaryInterval without salaryMin").
