---
paths: ["backend/src/core/**", "backend/src/lib/**"]
---

Before editing any scraper core or library files, you MUST:
1. Consult `documentation/10-bug-fix-and-improvement-log.md` and `documentation/11-testing-guide.md` §6 to verify you will not break any established regression invariants (BF-001 through BF-018+).
2. Follow test-driven development: author a failing regression test in `backend/tests/unit/` before applying any fix.
3. Preserve existing docstrings, interfaces, and error telemetry handling.
