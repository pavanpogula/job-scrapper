---
trigger: glob
globs: "backend/src/core/**, backend/src/lib/**"
description: "Scraper core and library invariants"
---
<!-- GENERATED from docs/agents/rules/scraper-invariants.md - DO NOT EDIT DIRECTLY -->

# Scraper Invariants
When modifying scraper core or library components:
1. Consult `docs/bug-fix-log.md` and `docs/testing.md` §6.
2. Invariants BF-001 through BF-018+ must be preserved.
3. Test-driven development is required: author a failing test in `backend/tests/unit/` before applying any fix.
4. Only HTTP 429 triggers `sawRateLimit`; Retry-After header must be honored (capped at 10s).
5. Fallback rows must never overwrite primary rows (BF-016: fallback over primary guard; Ashby-only).
6. Preserve existing docstrings, interfaces, and error telemetry handling.
