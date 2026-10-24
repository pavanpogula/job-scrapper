---
trigger: glob
globs:
  - "src/core/**"
  - "src/lib/**"
---

# Scraper Invariants
When modifying scraper core or library components:
1. Consult `documentation/10-bug-fix-and-improvement-log.md` and `documentation/11-testing-guide.md` §6.
2. Invariants BF-001 through BF-018+ must be preserved.
3. Test-driven development is required: author a failing test in `tests/unit/` before applying any fix.
4. Only HTTP 429 triggers `sawRateLimit`; Retry-After header must be honored (capped at 10s).
5. GraphQL fallback rows must never overwrite rich REST fields.
