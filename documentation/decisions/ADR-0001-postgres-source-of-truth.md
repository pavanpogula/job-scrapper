# ADR-0001: Postgres is the source of truth; the cache-first API falls back to Postgres

- Status: Accepted
- Date: 2026-10-24
- Deciders: owner, api-cache agent
- Related: D-01, BF-017, GAP-API-03, GAP-CAC-04

## Context
The application serves job postings, company directories, and facets to web users. Earlier designs considered using Redis as an independent primary data store or cache without fallback, which risked serving stale data or throwing 500s when Redis was empty, cold, or down.

## Options Considered
1. **Redis as primary read store without fallback**: Very fast, but fails completely on cache cold starts, eviction, or Redis outages.
2. **Postgres as source of truth with Redis read-through and circuit breaker fallback**: The API reads from Upstash Redis (`jc:v1:*`); on miss, outage, or circuit open, it falls back to Neon PostgreSQL.

## Decision
Neon PostgreSQL is the sole authoritative source of truth. The Express API implements a read-through cache layer over Redis (`ReadThroughService`) guarded by a circuit breaker (`CircuitBreaker`). When Redis is empty, unavailable, or in cooldown, requests fall back seamlessly to PostgreSQL queries.

## Consequences
- The API remains 100% available even if Redis is unreachable or unseeded.
- Neon compute-hour usage must be protected via `DbGuard` concurrency limits and edge CDN cache-control headers.
- Guarded by tests in `tests/unit/ReadThrough.test.ts` and `tests/unit/Breaker.test.ts`.
