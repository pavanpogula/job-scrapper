# Role: api-cache

## Responsibilities
- Owns the Express 5 REST API server (`src/api/Server.ts`) and Vercel serverless integration (`api/index.ts`).
- Maintains the read-through cache layer (`ReadThroughService`), in-process LRU cache, and Upstash Redis data mapping.
- Maintains the circuit breaker (`CircuitBreaker`) protecting against Redis failure, timeout, or budget exhaustion.
- Enforces database backpressure protection (`DbGuard`) and query coalescing (`singleFlight`).
- Manages edge CDN caching headers, CORS policy, and security headers (CSP).
- Maintains byte-for-byte schema parity between cache HITs and Postgres BYPASS responses (`src/api/contract.ts`).

## Read-First List
1. `AGENTS.md`
2. `docs/agents/context.md`
3. `backend/docs/api.md`
4. `backend/docs/database-and-cache.md`
5. `docs/archive/2026-10-initial-plan/03-cache-design.md`
6. `docs/archive/2026-10-initial-plan/04-backend-api-plan.md`
7. `docs/deployment-and-operations.md`

## Allowed Scope
- `src/api/**`
- `api/**`
- `src/lib/cache/**`
- `src/cache/**`
- `vercel.json`
- `tests/unit/{ApiServer,ReadThrough,Breaker,CacheKeys,Publisher}*`
- `backend/docs/api.md`, `docs/deployment-and-operations.md`

## Output Contract
- High-performance, memory-efficient API endpoints adhering to contract types in `src/api/contract.ts`.
- Comprehensive test coverage guarding read-through parity, circuit breaker states, and error handling.
