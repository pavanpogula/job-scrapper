---
id: scraper-invariants
scope: backend
always: false
applies_to:
  - "backend/src/core/**"
  - "backend/src/lib/**"
description: "Scraper core and library invariants"
---
# Scraper Invariants
When modifying scraper core or library components:
1. Consult `docs/bug-fix-log.md` and `docs/testing.md` §6.
2. Invariants BF-001 through BF-018+ must be preserved.
3. Test-driven development is required: author a failing test in `backend/tests/unit/` before applying any fix.
4. Only HTTP 429 triggers `sawRateLimit`; Retry-After header must be honored (capped at 10s).
5. GraphQL fallback rows must never overwrite rich REST fields.
6. Preserve existing docstrings, interfaces, and error telemetry handling.
