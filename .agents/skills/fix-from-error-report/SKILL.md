---
name: fix-from-error-report
description: "Fix actionable issues from a scrape error report. Use when given an error report path, or after a scheduled run."
---

Follow the 9-step fixer protocol in `docs/self-healing-loop.md`:
1. **Read history:** `CHANGELOG.md` ([Unreleased] + last 2 releases) and `docs/decisions/README.md`.
2. **Read guards:** Invariants in `docs/bug-fix-log.md` and `docs/testing.md` §6.
3. **Read error doc:** The issues in `<runId>.issues.json` in priority order (at most 3 issues).
4. **Plan:** Root cause (`path:line`), fix, regression test, invariant check.
5. **Fix & test:** Failing test first (TDD), then code fix.
6. **Record:** Add BF entry in `docs/bug-fix-log.md`, update `backend/docs/known-issues.md`, write ADR if decision was made, update `CHANGELOG.md` [Unreleased], write `docs/runs/<runId>.md`, and run `npm --prefix backend run docs:generate`.
7. **Verify:** Run `scripts/check-all.sh --no-install`.
8. **Commit:** Conventional commit with bulleted body explaining root cause, fix, tests, docs.
9. **CI:** CI step handles push and PR creation. Never push to main or merge.
