# ADR-0011: Rate limiting: one Vercel WAF rule plus dbGuard; the in-memory and client limiters are removed

- Status: Accepted
- Date: 2026-10-24
- Deciders: owner, api-cache agent
- Related: D-16, BF-016, GAP-API-05, GAP-API-06

## Context
Previous API code implemented an in-memory sliding window rate limiter in Express, and the frontend enforced an aggressive client-side rate gate of 10 requests/minute. In serverless deployment (Vercel), each function execution creates a fresh memory space, rendering in-memory state useless across lambdas while client-side gates erroneously throttled legitimate browsing users searching across facets.

## Options Considered
1. **Distributed rate limiting via Redis (`INCR` on each request)**: Adds 1 Redis command per API call, rapidly exhausting Upstash 10k/day command quotas.
2. **In-memory express rate limiting**: Does not work across serverless lambdas.
3. **Edge WAF rate limiting combined with local DbGuard backpressure**: Enforce global edge rate limiting at the Vercel WAF layer (120 req / 60 s / IP on `/v1/`), remove in-memory and frontend gates, and protect Postgres against connection pool exhaustion using an in-process concurrency guard (`DbGuard`).

## Decision
Remove the in-memory Express rate limiter and the client-side throttling gate. Delegate edge volumetric rate limiting to Vercel WAF rules, and implement `DbGuard` middleware in the Express API to reject database requests with HTTP 429 when concurrent active DB queries reach capacity.

## Consequences
- Legitimate users are no longer blocked by client throttling when applying multiple filters.
- Upstash Redis commands are preserved purely for content caching.
- Neon compute units are guarded against connection storms.
- Guarded by tests in `tests/unit/ApiServer.test.ts` and `src/api/middleware/dbGuard.ts`.
