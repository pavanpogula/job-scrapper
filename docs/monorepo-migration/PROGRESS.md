# Monorepo Migration Progress

## Global Status & Context

### Vercel Deployment IDs
- **Pre-P3 Production Deployment ID (frontend/current):** `https://job-scrapper-ha6lchynl-boolean6.vercel.app`
- **Backend Promotion ID (P3a):** `pending`

### Stop-the-Line Toggles (O11)
- `SCRAPE_ENABLED`: `true`
- `FIXER_ENABLED`: `true`
- `DISCOVERY_ENABLED`: `true`

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
| **O10** | Soak before point of no return | **default** (2 scheduled scrapes + 1 fixture dispatch after P3a before P4b) |
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

### [ ] P1 — Repo-level tests out of jest + fixer-scope hardening
- **Branch:** `plan/mono-p1-repo-tests`
- **PR:** `pending`
- **Merge method:** `squash`
- **Commit SHAs:** `c718161`
- **Owner decisions used:** O13
- **Verification evidence:**
  - `node scripts/migration/compare-results.mjs --phase P1`: Jest 264/274 (0 missing, 10 moved), Vitest 14/14, TS root=0/tests=0, ESLint 0 err/1 warn.
  - `node --test scripts/repo-tests/*.test.mjs`: 25/25 tests passed (including 8 agent-shells tests and 7 fixer-scope tests).
  - `./scripts/check-all.sh --no-install`: All 9 steps passed cleanly.
- **Owner actions:** None
- **Rollback command:** `git revert <squash-sha>`
- **Rollback chain:** `revert P1`

### [ ] P2 — Frontend rename
- **Branch:** `plan/mono-p2-frontend-rename`
- **PR:** `pending`
- **Merge method:** `rebase`
- **Commit SHAs (first..last):** `50d5248..b397907`
- **Owner decisions used:** None
- **Verification evidence:**
  - `scripts/check-all.sh --no-install`: Passed all 9 verification steps cleanly (Prisma generate, root typecheck, test typecheck, lint, Jest [37 suites / 264 tests], Vitest UI verify [5 suites / 14 tests], build, docs check, repo-tests [25/25 tests]).
  - `node scripts/migration/compare-results.mjs --phase P2`: Passed (Jest 264, Vitest 14, TS 0 errors, ESLint 0 errors / 1 warning, dist inspected, production smoke verified).
  - Grep verification: `git grep -n 'job-scrapper-ui/'` and `git grep -n 'job-scrapper-ui' | grep -v 'vercel.app'` return only the required move-map prefix entry in `scripts/migration/move-map.json` outside frozen baseline.
- **Owner actions:** Local cleanup `rm -rf job-scrapper-ui`
- **Rollback command:** `git revert --no-edit <first>^..<last>` (+ Vercel instant rollback if prod affected)
- **Rollback chain:** `revert P2`

### [ ] P3a — Backend move + Vercel split
- **Branch:** `plan/mono-p3a-backend-move`
- **PR:** `pending`
- **Merge method:** `rebase`
- **Commit SHAs (first..last):** `pending`
- **Owner decisions used:** O1, O2, O8, O9
- **Verification evidence:** `pending`
- **Owner actions:** Follow Vercel cutover runbook (promote backend, toggle vars, set root to frontend)
- **Rollback command:** See PLAN.md runbook §8 (Instant Rollback frontend, root to `.`, `git revert --no-edit <first>^..<last>`)
- **Rollback chain:** `revert P3a`

### [ ] P3b — Backend follow-ups
- **Branch:** `plan/mono-p3b-backend-followups`
- **PR:** `pending`
- **Merge method:** `squash`
- **Commit SHAs:** `pending`
- **Owner decisions used:** None
- **Verification evidence:** `pending`
- **Owner actions:** None
- **Rollback command:** `git revert <squash-sha>`
- **Rollback chain:** `revert P3b` -> `revert P3a`

### [ ] P4a — CI split
- **Branch:** `plan/mono-p4a-ci-split`
- **PR:** `pending`
- **Merge method:** `squash`
- **Commit SHAs:** `pending`
- **Owner decisions used:** None
- **Verification evidence:** `pending`
- **Owner actions:** Update branch protection to require `backend-gate`, `frontend-gate`, `repo-gate`
- **Rollback command:** `git revert <squash-sha>`
- **Rollback chain:** `revert P4a` -> `revert P3b` -> `revert P3a`

### [ ] P4b — CI remove legacy (Point of no return)
- **Branch:** `plan/mono-p4b-ci-remove-legacy`
- **PR:** `pending`
- **Merge method:** `squash`
- **Commit SHAs:** `pending`
- **Owner decisions used:** O10 (soak verification)
- **Verification evidence:** `pending`
- **Owner actions:** None
- **Rollback command:** `git revert <squash-sha>`
- **Rollback chain:** `revert P4b` -> `revert P4a` -> `revert P3b` -> `revert P3a`

### [ ] P5 — Docs restructure
- **Branch:** `plan/mono-p5-docs`
- **PR:** `pending`
- **Merge method:** `rebase`
- **Commit SHAs (first..last):** `pending`
- **Owner decisions used:** None
- **Verification evidence:** `pending`
- **Owner actions:** None
- **Rollback command:** `git revert --no-edit <first>^..<last>`
- **Rollback chain:** `revert P5` -> `revert P4b` -> ...

### [ ] P6a — Agents canonical + generated shells
- **Branch:** `plan/mono-p6a-agents-canonical`
- **PR:** `pending`
- **Merge method:** `squash`
- **Commit SHAs:** `pending`
- **Owner decisions used:** O12
- **Verification evidence:** `pending`
- **Owner actions:** None
- **Rollback command:** `git revert <squash-sha>`
- **Rollback chain:** `revert P6a` -> ...

### [ ] P6b — Nested agent files + hooks
- **Branch:** `plan/mono-p6b-agents-nested-hooks`
- **PR:** `pending`
- **Merge method:** `squash`
- **Commit SHAs:** `pending`
- **Owner decisions used:** None
- **Verification evidence:** `pending`
- **Owner actions:** None
- **Rollback command:** `git revert <squash-sha>`
- **Rollback chain:** `revert P6b` -> ...

### [ ] P7 — Backend types + strictness
- **Branch:** `plan/mono-p7-types-backend`
- **PR:** `pending`
- **Merge method:** `squash`
- **Commit SHAs:** `pending`
- **Owner decisions used:** None
- **Verification evidence:** `pending`
- **Owner actions:** None
- **Rollback command:** `git revert <squash-sha>`
- **Rollback chain:** `revert P7` -> ...

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
