---
trigger: glob
globs: "src/api/**, api/**, src/lib/cache/**, src/cache/**"
description: "API and caching invariants"
---

# API & Cache Invariants
1. Redis reads are read-through with fallback to PostgreSQL; Redis errors must never result in HTTP 500.
2. API contract in `src/api/contract.ts` must maintain byte-level parity between cache HIT and PostgreSQL responses.
3. List queries never select `metadata`.
4. `salaryInterval` is ignored unless `salaryMin` or `salaryMax` is set.
5. All database access in serverless routes must pass through `DbGuard` middleware.
