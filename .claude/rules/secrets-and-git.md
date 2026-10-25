---
# Always-on rule
---
<!-- GENERATED from docs/agents/rules/secrets-and-git.md - DO NOT EDIT DIRECTLY -->

# Hard Invariants
1. **Secrets & Outputs:** Never read, print, stage, or commit `.env*`, `apikeys/`, `backend/apikeys/`, `output/`, `backend/output/`, or `.vercel/` values.
2. **Git Safety:** Agents never push to `main`/`master`, never merge, never force-push, push tags or delete branches, and never run raw `git push` or `gh`. Publish or update a task branch only with `scripts/agents/push-branch.sh` (fast-forward only; it prints the pull-request link). The owner reviews and merges.
3. **Mandatory Verification:** All changes must pass `scripts/check-all.sh --no-install`.
4. **Explorer Sync:** Regenerate `backend/docs/project-explorer.html` via `npm --prefix backend run docs:generate` on changes.
5. **Conventional Commits:** Commit using conventional prefixes with multi-line bulleted bodies.
