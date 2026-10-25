---
id: secrets-and-git
scope: repo
always: true
applies_to: []
description: "Hard invariants for secrets, outputs, verification, and git safety"
---
# Hard Invariants
1. **Secrets & Outputs:** Never read, print, stage, or commit `.env*`, `apikeys/`, `backend/apikeys/`, `output/`, `backend/output/`, or `.vercel/` values.
2. **Git Safety:** Agents never push to `main` and never merge. Work only on task or feature branches.
3. **Mandatory Verification:** All changes must pass `scripts/check-all.sh --no-install`.
4. **Explorer Sync:** Regenerate `backend/docs/project-explorer.html` via `npm --prefix backend run docs:generate` on changes.
5. **Conventional Commits:** Commit using conventional prefixes with multi-line bulleted bodies.
