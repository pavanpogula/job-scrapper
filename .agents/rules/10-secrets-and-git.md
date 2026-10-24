---
trigger: always_on
---

# Hard Invariants
1. **Secrets & Outputs:** Never read, print, stage, or commit `.env`, `apikeys/`, or `output/` values.
2. **Git Safety:** Agents never push to `main` and never merge. Work only on task or feature branches.
3. **Mandatory Verification:** All changes must pass `npx tsc --noEmit -p . && npx tsc --noEmit -p tsconfig.test.json && npm run lint && npm test && npm run verify:ui`.
4. **Explorer Sync:** Regenerate `docs/project-explorer.html` via `npm run docs:generate` on changes.
5. **Conventional Commits:** Commit using conventional prefixes with multi-line bulleted bodies.
