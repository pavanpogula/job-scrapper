---
name: release-notes
description: "Add a CHANGELOG.md [Unreleased] entry for the current change (root cause, fix, guarding test, BF/ADR/GAP ids). Use before every fix or feature commit."
---

1. Read `git diff --cached --stat` and the BF, ADR, or GAP IDs associated with this change.
2. Under `## [Unreleased]`, add the entry to the appropriate section (Added, Changed, Fixed, Removed, Security).
3. Use the required bullet format:
   - `<What users/operators observe> (BF-xxx, ADR-xxxx, GAP-xxxx). Root cause: …; fix: …; guard: <test file> "<test name>".`
4. Stage `CHANGELOG.md` so it lands in the exact same commit. Do not commit or push from this skill.
