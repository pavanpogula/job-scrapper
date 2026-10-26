# Monorepo Migration Progress

## Global Status & Context

### Vercel Deployment IDs
- **Pre-P3 Production Deployment ID (frontend/current):** `https://job-scrapper-ha6lchynl-boolean6.vercel.app`
- **Backend Promotion ID (P3a):** preview `FJ6yV1tzi` (commit `5643349`) promoted to production on 2026-10-25; backend prod domain `https://job-scrapper-api-eight.vercel.app` (plain `job-scrapper-api.vercel.app` is owned by someone else). Backend smoke 9/9 passed.

### Stop-the-Line Toggles (O11)
- `SCRAPE_ENABLED`: `true`
- `FIXER_ENABLED`: owner to set back to `true` (fixer auto-skips without `ANTHROPIC_API_KEY`)
- `DISCOVERY_ENABLED`: `false` on purpose (see `BACKLOG.md`: weekly discovery only sees 1,000 archived URLs per run)

### Owner Decisions (Recorded)
| # | Decision | Selected Value / Policy |
|---|---|---|
| **O1** | `JOBS.md` (5 MB) + `generate-readme.ts` location | **default** (move `JOBS.md` + `generate-readme.ts` to `backend/`) |
| **O2** | Live fixer test after P3 (~$5 API spend) | **default** (skip live fixer test; rely on deterministic gate) |
| **O3** | `toJobDetail` createdAt/updatedAt | **default** (remove `createdAt/updatedAt` from UI JobDetail type) |
| **O4** | Backend filters `company/department/location/city` + `sortBy=title` | **default** (remove unsupported filters / `sortBy=title` from UI) |
| **O5** | Companies `totalPages` 0 vs `max(1)` | **default** (`totalPages = max(1)` on both endpoints, as a BF) |
| **O6** | `/v1/meta` DB-path `lastScrapeAt` | **default** (fix `/v1/meta` `lastScrapeAt` on DB path, as a BF) |
| **O7** | Playwright config & tests | **default** (add Playwright config + one smoke e2e) |
| **O8** | Versioning without root `package.json` | **default** (single repo version in CHANGELOG + tag; app `package.json` versions kept equal; `release` skill updated) |
| **O9** | Backend Vercel env scope & WAF | **default** (backend Vercel env in Production + Preview; WAF-bypass risk accepted in ADR-0014) |
| **O10** | Soak before point of no return | **default** (2 scheduled scrapes + 1 fixture dispatch after P3a before P4b; waived by owner on 2026-10-25) |
| **O11** | Stop-the-line toggles manager | **default** (owner flips `SCRAPE_ENABLED` / `FIXER_ENABLED` / `DISCOVERY_ENABLED` repo Variables) |
| **O12** | Codex integration style | **default** (Codex = nested `AGENTS.md` + skills only; recorded in ADR-0013) |
| **O13** | Fixer package.json edit permission | **default** (fixer may NOT edit any `package.json`) |
| **O14** | Unknown `/v1/*` routes response | **default** (unknown `/v1/*` routes return JSON 404, as a BF) |

### Local-Machine Checklist
- [ ] P2: Remove untracked `job-scrapper-ui/` leftovers (`node_modules/`, `dist/`).
- [ ] P3a: Relocate local files:
  ```bash
  mv .env backend/.env
  mv apikeys backend/apikeys
  mv output backend/output
  rm -rf node_modules
  npm --prefix backend ci && npm --prefix frontend ci
  ```

---

## Phase Execution Checklist

### [x] P0a — Foundation (merged)
- **Branch:** `plan/mono-p0a-foundation`
- **PR:** `PR #2`
- **Merge method:** `squash`
- **Commit SHAs (first..last):** `429c26d`
- **Owner decisions used:** O11
- **Verification evidence:**
  - `scripts/check-all.sh --no-install`: Passed 9/9 steps (Prisma generate, root typecheck, test typecheck, lint, Jest test suite [36 suites / 252 tests], UI verify, build, docs check, repo-tests [7/7 tests]).
  - `node scripts/smoke/smoke.mjs https://job-scrapper-ui.vercel.app`: 10/11 endpoints verified (`/` 200, `/jobs/sample-slug` 200, `/v1/jobs?pageSize=1` 200, `/v1/jobs/:id` 200, `/v1/jobs/not-a-uuid` 404, `/v1/facets` 200, `/v1/meta` 200, `/health` 200, `/v1/nope` 404, `/v1/companies` 500 on currently deployed Vercel instance, security headers verified).
  - `node --test 'scripts/repo-tests/**/*.test.mjs'`: Passed 7/7 tests in 129ms (`secrets-ignore`, `toggles`, `_yaml-lite`).
- **Owner actions:**
  - [x] Set GitHub repo Variables: `SCRAPE_ENABLED=true`, `FIXER_ENABLED=true`, `DISCOVERY_ENABLED=true`
  - [x] Record current Vercel production deployment ID in PROGRESS.md
  - [x] Note whether "Verify & Test" is a required check in branch protection (none on main)
  - [x] Close or record any open `auto-fix/*` PRs (none open)
- **Rollback command:** `git revert --no-edit 429c26d`
- **Rollback chain:** N/A (first phase)

### [x] P0b — Safety tests + official baseline (merged)
- **Branch:** `plan/mono-p0b-safety-tests`
- **PR:** #3
- **Merge method:** `squash`
- **Commit SHAs:** `fa3a3a6`
- **Owner decisions used:** None
- **Verification evidence:**
  - `node scripts/migration/compare-results.mjs --phase P0b`: Jest 274/274 (0 missing), Vitest 14/14, TS root=0/tests=0, ESLint 0 err/1 warn.
  - `./scripts/check-all.sh --no-install`: All 9 steps passed (Prisma generate, Root typecheck, Test typecheck, Lint root and API, Jest test suite, Verify UI, Build application, Docs generate & diff check, Repo-level tests [10 passed]).
- **Owner actions:** `git tag pre-monorepo fa3a3a6 && git push origin pre-monorepo` (completed)
- **Rollback command:** `git revert --no-edit fa3a3a6`
- **Rollback chain:** `revert P0b`

### [x] P1 — Repo-level tests out of jest + fixer-scope hardening (merged)
- **Branch:** `plan/mono-p1-repo-tests`
- **PR:** #4
- **Merge method:** `squash`
- **Commit SHAs:** `6323c7b`
- **Owner decisions used:** O13
- **Verification evidence:**
  - `node scripts/migration/compare-results.mjs --phase P1`: Jest 264/274 (0 missing, 10 moved), Vitest 14/14, TS root=0/tests=0, ESLint 0 err/1 warn.
  - `node --test scripts/repo-tests/*.test.mjs`: 25/25 tests passed (including 8 agent-shells tests and 7 fixer-scope tests).
  - `./scripts/check-all.sh --no-install`: All 9 steps passed cleanly.
- **Owner actions:** None
- **Rollback command:** `git revert --no-edit 6323c7b`
- **Rollback chain:** `revert P1`

### [x] P2 — Frontend rename (merged)
- **Branch:** `plan/mono-p2-frontend-rename`
- **PR:** #5
- **Merge method:** `rebase`
- **Commit SHAs (first..last):** `88848da`
- **Owner decisions used:** None
- **Verification evidence:**
  - `scripts/check-all.sh --no-install`: Passed all 9 verification steps cleanly (Prisma generate, root typecheck, test typecheck, lint, Jest [37 suites / 264 tests], Vitest UI verify [5 suites / 14 tests], build, docs check, repo-tests [25/25 tests]).
  - `node scripts/migration/compare-results.mjs --phase P2`: Passed (Jest 264, Vitest 14, TS 0 errors, ESLint 0 errors / 1 warning, dist inspected, production smoke verified).
  - Production DB Schema Alignment: On 2026-10-25, owner executed `npx prisma db push` applying `CompanyHealth` table to Neon PostgreSQL. Smoke check verified 11/11 endpoints passed (`/v1/companies` returned 200).
- **Owner actions:** Local cleanup `rm -rf job-scrapper-ui`
- **Rollback command:** `git revert --no-edit 88848da` (+ Vercel instant rollback if prod affected)
- **Rollback chain:** `revert P2` -> `revert P1`

### [x] P3a — Backend move + Vercel split (merged 2026-10-25, PR #6 rebase + PR #7 deploy trigger)
- **Branch:** `plan/mono-p3a-backend-move`
- **PR:** #6
- **Merge method:** `rebase` (rebase-merge rewrites SHAs: record the new first..last from `git log origin/main` right after merging)
- **Commit SHAs (first..last), on main:** `750394d..14a2608` (move, edits, domain fix, smoke fix, PROGRESS note); follow-up PR #7 squash `e91e778` (frontend README)
- **Owner decisions used:** O1, O2, O8, O9
- **Verification evidence:**
  - `scripts/check-all.sh --no-install`: Passed all steps cleanly (`backend check:all`, `frontend check`, and 29 repo-level tests).
  - `node scripts/migration/compare-results.mjs --phase P3a`: Passed (Jest 264/274 [0 missing, 10 moved], Vitest 14/14, TS root=0/tests=0, ESLint 0 errors / 1 warning, production smoke 11/11 passed).
  - Architectural Invariants: Added `scripts/repo-tests/no-api-imports-scraper.test.mjs` and ESLint `no-restricted-imports` preventing API coupling to scraper/discovery modules.
  - Fixer Safety: Added `scripts/repo-tests/fixer-allowed-tools.test.mjs` and updated `scripts/ci/check-fixer-scope.sh` for `backend/` paths.
  - Unified Checks: Added `scripts/repo-tests/single-check-command.test.mjs` verifying canonical check commands.
- **Owner actions:** Follow Vercel cutover runbook. Done: created `job-scrapper-api` (Root `backend`), backend preview verified, promoted to production. Pending: staging frontend project `job-scrapper-web-staging` check, toggles off, merge, set old project Root Directory to `frontend`, single redeploy, prod smoke.
- **Rollback command:** See PLAN.md runbook §8 (Instant Rollback frontend, root to `.`, `git revert --no-edit 750394d^..e91e778` (revert PR #7 and the range together); then Vercel: old project Root Directory back to `.` and promote the pre-P3 deployment)
- **Cutover result (2026-10-25):** backend project `job-scrapper-api` (`https://job-scrapper-api-eight.vercel.app`) promoted before merge; old project Root Directory set to `frontend`; prod smoke 11/11 on `https://job-scrapper-ui.vercel.app` (CSP/XFO/nosniff/Permissions-Policy present through the proxy); `scrape-daily` fixture dispatch green (`tests/fixtures/reports/actionable.json`, skip_publish, skip_fixer).
- **Incidents / lessons:** (1) plain `job-scrapper-api.vercel.app` was taken, so the frontend rewrite uses the `-eight` domain. (2) After the merge the old project cancelled every build because `ignoreCommand` saw no change under `frontend/` (manual Redeploy is cancelled too); a real change under `frontend/` (PR #7) fixed it, and the site was down about 30 minutes with no users. If a redeploy is ever needed without changes, touch a file under `frontend/`. (3) A Vercel project must exist BEFORE the branch is pushed, or it never builds a preview.
- **Not verified:** `discover-weekly` dispatch (owner chose to defer; see `BACKLOG.md`). Soak (O10) counts from 2026-10-26: 2 scheduled scrapes + 1 fixture dispatch before P4b.
- **Rollback chain:** `revert P3a` -> `revert P2` -> `revert P1`

### [x] P3b — Backend follow-ups (merged 2026-10-25, PR #9 squash)
- **Branch:** `plan/mono-p3b-backend-followups`
- **PR:** #9
- **Merge method:** `squash`
- **Commit SHAs:** `af99478`
- **Owner decisions used:** None
- **Verification evidence:**
  - `scripts/check-all.sh --no-install`: Passed all 3 steps (`backend check:all`, `frontend check`, and 31 repo-level tests including layout invariants).
  - `node scripts/migration/compare-results.mjs --phase P3b`: All metrics match or improve upon baseline (Jest 264 passed [0 missing], Vitest 14 passed, TS 0 errors, ESLint 0 errors / 1 warning).
  - Monorepo Layout Test: `scripts/repo-tests/layout.test.mjs` verifies no legacy root files/directories exist and all tracked root entries are allow-listed.
  - Secret Hygiene & Prefix Settings: `.claude/settings.json` updated with prefix-form allow-list and explicit deny rules for `./backend/.env*` and `./backend/apikeys/**`; verified by `secrets-ignore.test.mjs`.
  - Documentation & Path Cleanup: Verified `git grep -nE '(^|[ "\x27(\x60])(src|tests|prisma|api|scripts/GenerateDocs)/' documentation/ README.md ':!documentation/plan'` returns empty.
  - Explorer Documentation: `npm --prefix backend run docs:check` verified with 0 git diff.
- **Owner actions:** None
- **Rollback command:** `git revert --no-edit af99478`
- **Rollback chain:** `revert P3b` -> `revert P3a`

### [x] P4a — CI split (merged 2026-10-25, PR #10 squash)
- **Branch:** `plan/mono-p4a-ci-split`
- **PR:** #10
- **Merge method:** `squash`
- **Commit SHAs:** `7fd7ad6`
- **Owner decisions used:** None
- **Verification evidence:**
  - `scripts/check-all.sh --no-install`: Passed all 3 steps (`backend check:all`, `frontend check`, and 35 repo-level tests).
  - `node scripts/migration/compare-results.mjs --phase P4a`: All metrics match or improve upon baseline (Jest 264 passed [0 missing], Vitest 14 passed, TS 0 errors, ESLint 0 errors / 1 warning).
  - CI Workflow Structure: Added `.github/workflows/backend-ci.yml`, `.github/workflows/frontend-ci.yml`, `.github/workflows/repo-ci.yml` with path-based changes filtering, unique gates (`backend-gate`, `frontend-gate`, `repo-gate`), and pinned `actionlint` v1.7.12.
  - Gate Coverage Invariant: `scripts/repo-tests/gate-needs.test.mjs` asserts that every gate's `needs` covers every other job in its workflow and enforces `if: always()` with status checks.
- **Owner actions:** Update branch protection to require `backend-gate`, `frontend-gate`, `repo-gate` (after PR merge)
- **Rollback command:** `git revert --no-edit 7fd7ad6`
- **Rollback chain:** `revert P4a` -> `revert P3b` -> `revert P3a`

### [x] P4b — CI remove legacy (Point of no return) (merged 2026-10-25, PR #11 squash)
- **Branch:** `plan/mono-p4b-ci-remove-legacy`
- **PR:** #11
- **Merge method:** `squash`
- **Commit SHAs:** `e6fa663`
- **Owner decisions used:** O10 (soak verification waived by owner)
- **O10 Soak Waiver:** O10 waived by owner on 2026-10-25; evidence available: manual real scrape green from backend/ (workers=4, 33,995 jobs), fixture dispatch green, prod smoke 11/11, split CI green on PR #10. No scheduled run since P3a yet. Scheduled scrape runs after this merge are the real soak and must be watched.
- **Verification evidence:**
  - `scripts/check-all.sh --no-install`: Passed all 3 steps (`backend check:all` with 264 Jest tests / 22 snapshots / typecheck / lint / docs check, `frontend check` with 14 Vitest tests / typecheck / lint / build, and 34 repo-level tests).
  - `node scripts/migration/compare-results.mjs --phase P4b`: All metrics match or improve upon baseline (Jest 264 passed [0 missing], Vitest 14 passed, TS 0 errors, ESLint 0 errors / 1 warning, production smoke 11/11 passed).
  - Monorepo Safety: `git diff --exit-code main -- '**/__snapshots__/**'` verified with 0 diff.
  - Move Manifest: `.github/workflows/ci.yml` registered in `scripts/migration/move-map.json` under `deleted`.
  - Invariant Guard: `scripts/repo-tests/workflows.test.mjs` asserts `.github/workflows/ci.yml` does not exist and asserts split workflows existence.
- **Owner actions:** Remove `Verify & Test` from required status checks in branch protection if present; confirm `backend-gate`, `frontend-gate`, `repo-gate` are required.
- **Rollback command:** `git revert --no-edit e6fa663`
- **Rollback chain:** `revert P4b` -> `revert P4a (7fd7ad6)` -> `revert P3b (af99478)` -> `revert P3a range (750394d^..e91e778)` -> restore "Verify & Test" check if set

### [x] P5 — Docs restructure (merged 2026-10-25, PR #12 rebase)
- **Branch:** `plan/mono-p5-docs`
- **PR:** #12
- **Merge method:** `rebase`
- **Commit SHAs (first..last), on main:** `ee71be1..93981d1` (pure move, edits/ADRs/tests, and review fix: docs-links self-skip + discovery cron)
- **Owner decisions used:** None
- **Verification evidence:**
  - `scripts/check-all.sh --no-install`: Passed all 3 steps (`backend check:all`, `frontend check`, and 39 repo-level tests).
  - `node scripts/migration/compare-results.mjs --phase P5`: All metrics match or improve upon baseline (Jest 264 passed [0 missing], Vitest 14 passed, TS 0 errors, ESLint 0 errors / 1 warning, production smoke 11/11 passed).
  - `scripts/repo-tests/docs-links.test.mjs`: Passed all 4 checks (first ## in root README is Workflows, zero `documentation/` references outside allowed files, all relative links & @imports resolve, all active docs reachable from `docs/README.md`).
  - Monorepo Safety: `git diff --exit-code main -- '**/__snapshots__/**'` verified with 0 diff.
  - Documentation Restructure: Moved all 54 legacy files in pure `git mv` commit 1 (`ee71be1`), created `backend/README.md`, `backend/docs/testing.md`, `frontend/docs/testing.md`, `frontend/docs/known-issues.md`, and updated root `README.md` and `docs/README.md`.
  - Architecture Decision Records: Added ADR-0013 (monorepo layout), ADR-0014 (Vercel split, WAF, trust proxy), ADR-0015 (type contract and fixtures); updated `docs/decisions/README.md`.
  - Fixer Scope Hardening: Allowed `docs/bug-fix-log.md`, `docs/decisions/`, `docs/runs/`, `backend/docs/known-issues.md`, `backend/docs/testing.md`; ensured `frontend/docs/` remains strictly forbidden.
- **Owner actions:** None
- **Rollback command:** `git revert --no-edit ee71be1^..93981d1`
- **Rollback chain:** `revert P5` -> `revert P4b (e6fa663)` -> `revert P4a (7fd7ad6)` -> `revert P3b (af99478)` -> `revert P3a range (750394d^..e91e778)`

### [x] P6a — Agents canonical + generated shells (merged 2026-10-25, PR #13 squash)
- **Branch:** `plan/mono-p6a-agents-canonical`
- **PR:** #13
- **Merge method:** `squash`
- **Commit SHAs:** `d53bc12`
- **Owner decisions used:** O12 (Codex = AGENTS.md + skills only)
- **Verification evidence:**
  - `scripts/check-all.sh --no-install`: Passed all 3 steps (`backend check:all`, `frontend check`, and 41 repo-level tests).
  - `node scripts/migration/compare-results.mjs --phase P6a`: All metrics match or improve upon baseline (Jest 264 passed [0 missing], Vitest 14 passed, TS 0 errors, ESLint 0 errors / 1 warning, production smoke 11/11 passed).
  - `scripts/agents/sync-shells.mjs --check`: Verified byte-for-byte fidelity against canonical files in `docs/agents/roles/*.md` and `docs/agents/rules/*.md`.
  - `scripts/repo-tests/agent-shells.test.mjs`: Passed all 10 tests (roster coverage, identical name/description, sync-shells --check, banner & body inlining, skills symlinks and skills-lock entries, valid triggers/globs, claude frontmatter/context non-generation, byte budgets, CLAUDE.md lines/imports, settings.local.json untracked).
  - `scripts/repo-tests/docs-links.test.mjs`: All 10 canonical rules and 6 roles reachable from `docs/README.md`.
  - Monorepo Safety: `git diff --exit-code main -- '**/__snapshots__/**'` verified with 0 diff.
  - Backend docs sync: `npm --prefix backend run docs:check` passed with 0 diff on `project-explorer.html`.
- **Owner actions:** None
- **Rollback command:** `git revert --no-edit d53bc12`
- **Rollback chain:** `revert P6a` -> `revert P5 range (ee71be1^..93981d1)` -> `revert P4b (e6fa663)` -> `revert P4a (7fd7ad6)` -> `revert P3b (af99478)` -> `revert P3a range (750394d^..e91e778)`

### [x] P6b — Nested agent files + hooks (merged)
- **Branch:** `plan/mono-p6b-agents-nested-hooks`
- **PR:** #14
- **Merge method:** `squash`
- **Commit SHAs (first..last):** `242840c..873664d`
- **Owner decisions used:** None
- **Verification evidence:**
  - `scripts/check-all.sh --no-install`: Passed all 3 steps (`backend check:all`, `frontend check`, and 47 repo-level tests).
  - `node scripts/migration/compare-results.mjs --phase P6b`: All metrics match or improve upon baseline (Jest 264 passed [0 missing], Vitest 14 passed, TS 0 errors, ESLint 0 errors / 1 warning, production smoke 11/11 passed).
  - `scripts/repo-tests/hooks.test.mjs`: Passed all 6 tests (post-commit-reminder stdin command filtering for non-commit commands, reminder injection when CHANGELOG.md is omitted from a commit, silence when CHANGELOG.md is present, Codex root evaluation via $(git rev-parse --show-toplevel) from frontend/ cwd, Antigravity PostToolUse schema validation, and nested settings deny list parity).
  - Nested Guides: Created `backend/AGENTS.md` (2,517 bytes), `backend/CLAUDE.md` (5 lines), `frontend/AGENTS.md` (2,255 bytes), and `frontend/CLAUDE.md` (5 lines) with launch-location advice, check commands, secret/git invariants, and design pointers.
  - Launch Safety: Added `backend/.claude/settings.json` and `frontend/.claude/settings.json` matching the root deny list, and updated `.gitignore` for `**/.claude/settings.local.json`.
  - Monorepo Safety: `git diff --exit-code main -- '**/__snapshots__/**'` verified with 0 diff.
  - Backend docs sync: `npm --prefix backend run docs:check` passed with 0 diff on `project-explorer.html`.
- **Owner actions:** None
- **Rollback command:** `git revert --no-edit 873664d 242840c`
- **Rollback chain:** `revert P6b` -> `revert P6a (d53bc12)` -> `revert P5 range (ee71be1^..93981d1)` -> `revert P4b (e6fa663)` -> `revert P4a (7fd7ad6)` -> `revert P3b (af99478)` -> `revert P3a range (750394d^..e91e778)`

### [ ] P7 — Backend types + strictness
- **Branch:** `plan/mono-p7-types-backend`
- **PR:** `pending`
- **Merge method:** `squash`
- **Commit SHAs:** `a074fad`
- **Owner decisions used:** All default
- **Verification evidence:**
  - `scripts/check-all.sh --no-install`: Passed all 3 steps (`backend check:all`, `frontend check`, and 59 repo-level tests).
  - `node scripts/migration/compare-results.mjs --phase P7`: All metrics match or improve upon baseline (Jest 269 passed [0 missing], Vitest 14 passed, TS root=0 tests=0 errors, ESLint 0 errors / 1 warning, production smoke 11/11 passed).
  - Snapshot Invariant: `git diff --exit-code origin/main -- 'backend/tests/**/__snapshots__/**'` verified with 0 diff.
  - Type Safety: Added `backend/src/api/types.ts` defining all public DTOs, query parameters, and HttpError guards. Added `backend/tests/unit/ApiTypes.test.ts` with bidirectional `Equal<>` checks run by `typecheck:test`.
  - Ratchet System: Added `backend/scripts/any-ratchet.mjs` and `frontend/scripts/any-ratchet.mjs` enforcing non-increasing `no-explicit-any` counts against `.any-baseline.json`. ESLint rule `@typescript-eslint/no-explicit-any: error` active on `backend/src/api/**` and `backend/api/**` with 0 errors.
  - Documentation & Rules: Updated canonical `docs/agents/rules/api-contract-sync.md`, synchronized agent shells via `sync-shells.mjs`, documented `types.ts` in `backend/docs/api.md`, and regenerated `backend/docs/project-explorer.html`.
- **Owner actions:** None
- **Rollback command:** `git revert <squash-sha>`
- **Rollback chain:** `revert P7` -> `revert P6b (873664d, 242840c)` -> `revert P6a (d53bc12)` -> `revert P5 range (ee71be1^..93981d1)` -> `revert P4b (e6fa663)` -> `revert P4a (7fd7ad6)` -> `revert P3b (af99478)` -> `revert P3a range (750394d^..e91e778)`

### [ ] P8a — Contract fixtures + frontend alignment
- **Branch:** `plan/mono-p8a-contract-parity`
- **PR:** `pending`
- **Merge method:** `squash`
- **Commit SHAs:** `pending`
- **Owner decisions used:** O3, O4
- **Verification evidence:** `pending`
- **Owner actions:** None
- **Rollback command:** `git revert <squash-sha>`
- **Rollback chain:** `revert P8a` -> ...

### [ ] P8b — Approved behaviour changes
- **Branch:** `plan/mono-p8b-<slug>`
- **PR:** `pending`
- **Merge method:** `squash`
- **Commit SHAs:** `pending`
- **Owner decisions used:** O5, O6, O14
- **Verification evidence:** `pending`
- **Owner actions:** Deploy backend -> dispatch `scrape-daily publish_only=true` -> smoke test
- **Rollback command:** Instant Rollback backend -> revert PR -> dispatch `publish_only`
- **Rollback chain:** `revert P8b` -> ...

### [ ] P9 — Remove remaining any
- **Branch:** `plan/mono-p9-any-<area>`
- **PR:** `pending`
- **Merge method:** `squash`
- **Commit SHAs:** `pending`
- **Owner decisions used:** None
- **Verification evidence:** `pending`
- **Owner actions:** None
- **Rollback command:** `git revert <squash-sha>`
- **Rollback chain:** `revert P9` -> ...

### [ ] P10 — Cleanup & Archive
- **Branch:** `plan/mono-p10-cleanup`
- **PR:** `pending`
- **Merge method:** `squash`
- **Commit SHAs:** `pending`
- **Owner decisions used:** O7
- **Verification evidence:** `pending`
- **Owner actions:** Delete temporary staging Vercel project
- **Rollback command:** `git revert <squash-sha>`
- **Rollback chain:** `revert P10` -> ...
