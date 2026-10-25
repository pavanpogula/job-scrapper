# Monorepo Restructure Plan — `backend/` + `frontend/`

## Context
Today the repo root *is* the backend: scraper + API share one root `package.json`/`src/`; the UI is bolted on as
`job-scrapper-ui/`; docs (`documentation/` + `docs/`), agent config (3 copies of every role, drifting rules),
data files (`JOBS.md`, `extracted-slugs.json`) and CI all sit at the root. One CI job tests everything; one Vercel
project serves UI + API. API types are not shared or checked (frontend contract test is vacuous; fixtures are DB rows).

**Outcome:** a clean private monorepo with two independent apps, per-app pipelines and deploys, two-level docs,
canonical agent config with per-app rules, strict typing, a real API contract check, and a fail-safe migration
with a tested rollback at every step. **No behaviour change** unless explicitly approved (P8b).

This plan was produced from 3 inventory agents + 1 design agent, then reviewed by 2 independent verifiers
(correctness; completeness/safety) and 1 cold-start dry-run agent. All HIGH/MED findings are folded in.

## Owner decisions (agreed)
- **D1** Two independent npm projects (no workspaces/turbo/pnpm, **no root package.json**): `backend/` (API +
  scraper + shared code + prisma + tests) and `frontend/` (from `job-scrapper-ui/`). Root keeps only repo-wide
  things: `README.md`, `AGENTS.md`, `CLAUDE.md`, `CHANGELOG.md` (single), `.github/`, `.claude/`, `.agents/`,
  `.codex/`, `skills-lock.json`, `.nvmrc`, `.gitignore`, `docs/`, `scripts/{ci,hooks,repo-tests,smoke,migration,agents,contract}`, `scripts/check-all.sh`.
- **D2** Scraper runs only in GitHub Actions (never via an API endpoint); scrape job `working-directory: backend` + sparse-checkout.
- **D3** Per-app CI workflows; frontend → Vercel; backend → its own Vercel project for now (EC2 later, out of scope).
- **D4** Each app owns its types; strict TS in both; `no-explicit-any` reaches error via a ratchet; generated
  contract fixtures + synced frontend copy + parity tests; agent rule keeps both in sync.
- **D5** Docs two-level: root `README.md` starts with a workflows/pipelines table, then links to `docs/README.md`
  (routing guide: what lives where, "for X check Y", full index). Details in `backend/docs`, `frontend/docs`, app READMEs. No orphans.
- **D6** Keep Claude Code + Antigravity + Codex + impeccable. Canonical role/rule text once in `docs/agents/`;
  generated shells per tool; drift test; nested `backend/` and `frontend/` `AGENTS.md` + `CLAUDE.md`.

## Owner decisions OPEN (record answers in PROGRESS.md; the default applies if the owner writes "default")
| # | Question | Default | Needed by |
|---|---|---|---|
| O1 | `JOBS.md` (5 MB) + `generate-readme.ts`: move to `backend/`, or stop tracking JOBS.md | move to `backend/` | P3a |
| O2 | Live fixer test after P3 (~$5 API spend) | skip; rely on deterministic gate | P3a |
| O3 | `toJobDetail` adds `createdAt/updatedAt` (behaviour change), or remove them from the UI type | remove from UI | P8a |
| O4 | Implement backend filters `company/department/location/city` + `sortBy=title`, or remove them from the UI | remove from UI | P8a |
| O5 | Companies `totalPages` 0 vs `max(1)` | `max(1)` on both endpoints (BF) | P8b |
| O6 | `/v1/meta` DB-path `lastScrapeAt` = request time → fix | fix (BF) | P8b |
| O7 | Playwright: add config + smoke e2e, or remove the deps | add smoke e2e | P10 |
| O8 | Versioning without a root package.json | one repo version in CHANGELOG + git tag; app `package.json` versions kept equal; `release` skill updated | P3a |
| O9 | Backend Vercel env scope (Preview gets prod DB/Redis like today?) + accept that the direct backend URL bypasses the WAF | Production + Preview (same as today); risk accepted in ADR-0014 | P3a |
| O10 | Soak before the point of no return | 2 successful scheduled scrapes + 1 fixture dispatch after P3a | P4b |
| O11 | Stop-the-line toggles: who flips them | owner, via repo Variables | P0a |
| O12 | Codex role shells (`.codex/agents/*.toml`) or "Codex = AGENTS.md + skills only" | AGENTS.md + skills only | P6a |
| O13 | May the fixer edit `backend/package.json`? | no (forbidden) | P1 |
| O14 | Unknown `/v1/*` routes return a JSON 404 (today: Express HTML 404) | yes (BF) | P8b |

## Design corrections (already folded into the phases)
- **A1 CI gating.** Every workflow triggers on every PR and push. A `changes` job (`fetch-depth: 0`) computes outputs. On a PR it runs `git diff --name-only origin/$GITHUB_BASE_REF...HEAD`. On a push it runs `git diff ${{github.event.before}}..HEAD`; when `before` is all zeros or the ref is `main`, everything is marked as changed. Real jobs use `if: needs.changes.outputs.X == 'true'`. A final, **uniquely named** gate job (`backend-gate`, `frontend-gate`, `repo-gate`) has `needs: all`, `if: always()`, and fails when `contains(needs.*.result, 'failure') || contains(needs.*.result, 'cancelled')`. Required checks are these 3 gates.
- **A2 Checkout.** The scrape and discovery jobs use cone sparse-checkout of `backend` + `scripts/ci`; root files such as `.nvmrc` are included automatically. The fixer job does a full checkout and has **no** working-directory default, because it runs from the repo root.
- **A3 Node cache.** `setup-node` uses `cache-dependency-path` set to `backend/package-lock.json`, `frontend/package-lock.json`, or both (the fixer needs both).
- **A4 Cache and artifact paths.** `actions/cache` and artifacts ignore `working-directory`, so use repo-root-relative `backend/output/...`. Until P10, `run-history.json` is **saved under both** the new key prefix (`scrape-history-v2-`) and the old one, and restored new-first then old. History therefore survives a revert in either direction.
- **A5 WAF.** The per-IP WAF rule stays on the frontend project, which sees client IPs. The backend gets a high global limit plus DbGuard. The direct backend URL bypasses the WAF, accepted per O9. `trust proxy 1` will log the frontend edge IP; don't raise it, because that would make it spoofable. Recorded in ADR-0014.
- **A6 Double CDN caching.** Proxying may cache at both layers; check `x-vercel-cache` in the P3a smoke test.
- **A7 Unused Vercel secrets.** `VERCEL_TOKEN` and `VERCEL_PROJECT_ID` are unused by code. Remove them from the scrape env in P3a and fix the claims in docs 07/14 in P5.
- **A8 Fixture path.** `InstallReportFixture.ts` strips a leading `backend/` from the fixture path; covered by a test.
- **A9 Fixer commands.** Every fixer-facing command string (skills `fix-from-error-report`, `verify-change`, `release`, plus `CLAUDE.md`, `AGENTS.md`, `.github/pull_request_template.md`, the `open-fix-pr.sh` body) moves to the `npm --prefix backend …` / `scripts/check-all.sh` forms **in P3a**, together with `--allowedTools`. A test checks every command the skill uses against the allow-list.
- **A10 Vercel deploy filter.** `ignoreCommand` = `[ -z "$VERCEL_GIT_PREVIOUS_SHA" ] && exit 1; git diff --quiet "$VERCEL_GIT_PREVIOUS_SHA" "$VERCEL_GIT_COMMIT_SHA" -- . ` (when unsure, it builds).
- **A11 `extracted-slugs.json`.** It is tracked even though it is ignored. Move it to `backend/` and anchor the ignore rule as `/backend/extracted-slugs*`.
- **A12 No root package.json.** `scripts/check-all.sh` replaces it.
- **A13 `exactOptionalPropertyTypes`.** Enable it in the frontend in P7 (6 errors) and in the backend in P9 (26 errors).
- **A14 Merge method per phase.** Moves (P2, P3a, P5) use **Rebase and merge**, with commit 1 = pure `git mv` and commit 2 = edits. All other phases use **Squash**. PROGRESS.md records each PR's `first..last` SHAs. Rollback is `git revert --no-edit <first>^..<last>` for rebase-merged PRs and `git revert --no-edit <squash-sha>` otherwise.
- **A15 Hooks.**
  - `post-commit-reminder.sh` filters on stdin `tool_input.command` matching `git commit`; drop the ineffective `if:`.
  - The Codex impeccable hook uses `$(git rev-parse --show-toplevel)`.
  - `.agents/hooks.json` is rewritten to the documented Antigravity schema, with a shape test.
- **A16 No `gh` locally.** The owner changes branch protection in the UI; smoke scripts use Node `fetch`.
- **A17 Repo-level tests.** These use Node 24 `node --test 'scripts/repo-tests/**/*.test.mjs'` with zero dependencies. YAML is read by a small indentation-based extractor (`scripts/repo-tests/_yaml-lite.mjs`) that has its own tests against the real workflows. `actionlint` runs **only** in the repo-ci job (pinned version + sha256 checksum), never in `check-all.sh`, so the fixer needs no network access for it.
- **A18 Secret hygiene (P0a).**
  - `.gitignore` adds `.env*`, `!.env.example`, `.vercel/`, `**/apikeys/`, `**/output/`.
  - `.claude/settings.json` denies `Read(**/.env*)`, `Read(**/apikeys/**)`, `Read(**/.vercel/**)`, `Read(**/output/**)`.
  - A repo test asserts `git check-ignore` matches these paths.
  - `smoke.mjs` never sends `x-health-token` and never stores response bodies, only statuses and header names.
- **A19 Fixer scope hardening (P1).** `check-fixer-scope.sh` compares `scripts`, `dependencies`, `devDependencies` and `overrides` as JSON (`node -e`) between the base and HEAD for any `package.json`, and fails on any change (O13). This replaces today's weak grep at line 66.

Measured baseline:
- 351 tracked files.
- `any`: about 147 in `src/` and about 144 in `tests/`.
- Strict-flag error counts (backend / frontend):

| Flag | Backend | Frontend |
|---|---|---|
| `noUncheckedIndexedAccess` | 19 | 1 |
| `noImplicitReturns` | 5 | 0 |
| `noImplicitOverride` | 0 | 0 |
| `exactOptionalPropertyTypes` | 26 | 6 |

---

## Phase order (one branch and one PR each, cut from an up-to-date `main`, strictly sequential)
| Phase | Branch | Content | Merge |
|---|---|---|---|
| P0a | `plan/mono-p0a-foundation` | PLAN/PROGRESS, baseline scripts, smoke script, repo-test harness, `check-all.sh`, gitignore and deny hardening, stop-the-line toggles | squash |
| P0b | `plan/mono-p0b-safety-tests` | ApiGolden, PathResolution, GenerateDocs refactor and test, ApiNoStatic, vercel-config, workflows, move-manifest; **official baseline capture** | squash |
| P1 | `plan/mono-p1-repo-tests` | AgentShells and FixerScope move into `scripts/repo-tests`; fixer-scope hardening (A19) | squash |
| P2 | `plan/mono-p2-frontend-rename` | `job-scrapper-ui/` → `frontend/`; add `check` script and `engines` to frontend | rebase |
| P3a | `plan/mono-p3a-backend-move` | Root code → `backend/`; Vercel split; workflows, `scripts/ci`, fixer scope; skill and command strings (A9) | rebase |
| P3b | `plan/mono-p3b-backend-followups` | `.claude`/`.agents` rule globs and settings paths, layout and fixer-allowed-tools tests, remaining doc path strings | squash |
| P4a | `plan/mono-p4a-ci-split` | Add `backend-ci`, `frontend-ci`, `repo-ci` alongside `ci.yml` | squash |
| P4b | `plan/mono-p4b-ci-remove-legacy` | Delete `ci.yml`. **Point of no return:** only after the O10 soak | squash |
| P5 | `plan/mono-p5-docs` | `documentation/` → `docs/` + app docs; README routing; links test | rebase |
| P6a | `plan/mono-p6a-agents-canonical` | Canonical rules and roles, generator, generated shells, drift test | squash |
| P6b | `plan/mono-p6b-agents-nested-hooks` | Nested AGENTS/CLAUDE, nested deny settings, hooks fixes and tests | squash |
| P7 | `plan/mono-p7-types-backend` | DTOs, typed mappers/queries/Server, any-ratchet, strict flags, lint `tests/` + `scripts/` | squash |
| P8a | `plan/mono-p8a-contract-parity` | Contract fixtures, sync, frontend alignment (no behaviour change; O3/O4 removals) | squash |
| P8b-N | `plan/mono-p8b-<bf-slug>` | One PR per approved behaviour change (O5, O6, O14, and O3/O4 if "implement") | squash |
| P9-N | `plan/mono-p9-any-<area>` | Remove the remaining `any`, area by area; the last PR flips the rule to error globally | squash |
| P10 | `plan/mono-p10-cleanup` | Remove shims, dead code, Playwright per O7, CHANGELOG duplicate headings; archive the migration docs | squash |

### `scripts/check-all.sh` (defined in P0a, layout-aware)
- **Layout:** `backend` if `backend/package.json` exists, otherwise `root`.
- **Flags:** `--no-install` skips `npm ci`. The default runs `npm ci` in each app.
- **root layout:**
  - `npx prisma generate`
  - `npx tsc --noEmit -p .`
  - `npx tsc --noEmit -p tsconfig.test.json`
  - `npm run lint`
  - `npm test`
  - `npm run verify:ui`
  - `npm run build`
  - `npm run docs:generate && git diff --exit-code -I 'Auto-generated on' -- docs/`
- **backend layout:** `npm --prefix backend run check:all`, then `npm --prefix frontend run check`.
  - backend `check:all` = `prisma generate`, `typecheck`, `typecheck:test`, `lint`, `test`, `build`, `docs:check`.
  - `docs:check` = `docs:generate && git diff --exit-code -I 'Auto-generated on' -- docs/`, run from `backend/`, so the pathspec is relative to `backend/`.
  - frontend `check` = `typecheck && lint && test && build`.
- **Both layouts, then:**
  - `node --test 'scripts/repo-tests/**/*.test.mjs'`
  - preflight warnings if a root `node_modules`, `.env` or `apikeys/` still exists after P3a.
- Exit code is non-zero if any step fails. It prints a summary table.

### Baseline and comparison contract (P0a scripts, P0b official capture)
- **`capture-baseline.mjs`** writes `docs/monorepo-migration/baseline/`. It contains no secrets and no response bodies.

| File | Content | Generated by |
|---|---|---|
| `files.txt` | tracked file list | `git ls-files` |
| `jest-tests.json` | `[{key, status}]`, where `key` = `<test path relative to the backend root, without a backend/ prefix> > <fullName>` | `jest --json` |
| `vitest-tests.json` | same shape | `vitest run --reporter=json` |
| `tsc.json` | `{root: n, tests: n}` error counts | tsc output, counting `error TS` |
| `lint.json` | `{errors, warnings}` | `eslint -f json` |
| `any-counts.json` | `{file: count}` | eslint `no-explicit-any` in JSON mode |
| `strict-flags.json` | `{flag: count}` | `tsc --noEmit --<flag>` |
| `build.json` | `{fileCount, byExt}` | frontend `dist` (no hashed names) |
| `prod-smoke.json` | statuses and header names only | `smoke.mjs` output |

- **`compare-results.mjs --phase PN`**
  1. Runs the same captures into `docs/monorepo-migration/results/PN/`.
  2. Maps keys through `move-map.json`, which has the shape `{"prefixes":[{"from","to","phase"}],"deleted":[{"path","phase","reason"}]}`.
  3. Applies `moved-tests.json`, with entries of the form `{"from": key, "to": "node:<file> > <name>"}`.
  4. Asserts:
     - the test-key set is a superset of the baseline;
     - pass counts are at least the baseline;
     - tsc and lint errors are at most the baseline;
     - `any` counts per file are at most the baseline.
  5. Exits 0 when all checks pass and 1 otherwise, printing a diff.

### PROGRESS.md template (P0a)
For each phase:
- [ ] status
- branch
- PR number
- merge method
- `first..last` SHAs
- owner decisions used
- verification evidence: command + summary line
- owner actions: done/pending
- the **exact rollback command(s)**
- the rollback chain if later phases have merged

Global sections:
- Vercel deployment IDs: the pre-P3 production deployment ID, and the backend promotion ID.
- Toggle state.
- The local-machine checklist.

---

### P0a — Foundation (no moves, no behaviour change)
**Add:**
- **Migration docs.**
  - `docs/monorepo-migration/PLAN.md`: this file, verbatim.
  - `PROGRESS.md`: from the template above.
  - `scripts/migration/{capture-baseline,compare-results}.mjs`, `move-map.json` (starts empty), `moved-tests.json`.
- **`scripts/smoke/smoke.mjs <baseUrl> [--backend] [--bypass-token-env=VAR]`.** Prod URL is `https://job-scrapper-ui.vercel.app`; read-only GET requests only. It checks:

| Path | Expected |
|---|---|
| `/` and `/jobs/x` | 200 `text/html` (frontend mode) |
| `/v1/jobs?pageSize=1` | 200 `{data, meta}` |
| `/v1/jobs/<first id>` | 200 |
| `/v1/jobs/not-a-uuid` | **404** |
| `/v1/facets`, `/v1/companies`, `/v1/meta` | 200 |
| `/health` | 200 or 503 JSON, `cache-control: no-store` |
| `/v1/nope` | 404; content type is **recorded, not asserted**, until O14 |

  - Header checks: CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, and `cache-control` on `/v1/jobs`.
  - It prints `x-vercel-cache`.
- **Repo-test harness.**
  - `scripts/repo-tests/_lib.mjs`: repo root via `git rev-parse --show-toplevel`, plus `gitLsFiles()`.
  - `_yaml-lite.mjs` and its test.
  - `secrets-ignore.test.mjs` (A18).
- `scripts/check-all.sh`.
- `.gitignore` and `.claude/settings.json` hardening (A18).
- **Stop-the-line toggles (O11).**
  - `scrape-daily.yml` scrape job: `if: vars.SCRAPE_ENABLED != 'false'`. Fixer job: `&& vars.FIXER_ENABLED != 'false'`.
  - `discover-weekly.yml`: `if: vars.DISCOVERY_ENABLED != 'false'`.
  - In the `scrape` step, skip `enrich:companies` when `fixture_report` is set.
  - `toggles.test.mjs` asserts these guards exist.
- `ci.yml`: add a final step that runs `node --test 'scripts/repo-tests/**/*.test.mjs'`.
- `.mjs` files get `// @ts-check` and a JSDoc `@file/@summary/@tags` header. `.sh` files get a comment header. CI runs `node --check` on each `.mjs`.

**Verify:**
- `scripts/check-all.sh`
- `node scripts/smoke/smoke.mjs https://job-scrapper-ui.vercel.app`, recorded in PROGRESS.md

**Rollback:** `git revert <squash-sha>`.

**Owner after merge:**
- Create repo Variables `SCRAPE_ENABLED`, `FIXER_ENABLED` and `DISCOVERY_ENABLED`, all set to `true`.
- Record the current Vercel production deployment ID in PROGRESS.md.
- Note whether "Verify & Test" is a required check.
- Close or record any open `auto-fix/*` PRs.

### P0b — Safety tests + official baseline
| Test | Location | Mechanics / asserts |
|---|---|---|
| ApiGolden | `tests/unit/ApiGolden.test.ts` | Jest snapshots of `/v1/*` and `/health` through supertest. MISS uses the stateful prisma mock; HIT is seeded with fakeRedis via `publishCacheGeneration`. Uses `jest.setSystemTime(FIXED)` only, with no fake timers on nextTick/setImmediate. Cases: default, filters, pagination edges, pageSize cap, non-UUID id → 404, missing id → 404, empty companies, meta, health with and without a token. Leaves out non-`/v1` routes. `VERCEL_GIT_COMMIT_SHA` is unset, and services are reset in `beforeEach`. |
| PathResolution | `tests/unit/PathResolution.test.ts` | `process.chdir(tmp)`, then `jest.isolateModules` to require the modules that compute paths at import (`GoogleDrive*`). Asserts `output/`, `apikeys/` and `extracted-slugs.json` resolve under cwd. `generate-readme.ts` is asserted `__dirname`-relative. |
| GenerateDocs | `tests/unit/GenerateDocs.test.ts` | Refactor both roots (`:82` and `:494`) into `generate({root, outFile})`, behind a `require.main === module` guard (`:541`). The tmp output contains `src/api/Server.ts` and `schema.prisma`, excludes `node_modules`, the UI and `.claude`, and has a file count of at least `baseline/files.txt`'s `.ts` count minus the excluded dirs. |
| ApiNoStatic | extend `ApiServer.test.ts` | `jest.isolateModules` with `fs.existsSync` mocked to false for the dist path: `GET /` returns 404, and `/v1/jobs` returns 200. A second case with it true serves the SPA (today's behaviour). |
| vercel-config | `scripts/repo-tests/vercel-config.test.mjs` | Every `vercel.json` parses. `/v1` and `/health` rewrites come before the catch-all. Required headers are present. Each `functions` key exists on disk. The outputDirectory equals the vite `build.outDir` (default `dist`) of its app. Layout-aware. |
| workflows | `scripts/repo-tests/workflows.test.mjs` | Via `_yaml-lite`: npm `run:` steps have the right working-directory; cache, artifact and `scripts/ci` paths exist; `cache-dependency-path` is set; the fixer job has no working-directory default; toggles are present. |
| move-manifest | `scripts/repo-tests/move-manifest.test.mjs` | Every path in `baseline/files.txt`, after the `move-map` prefixes are applied, is tracked, or is listed in `deleted`. |

Then run `capture-baseline.mjs`. This **official** capture includes the new tests and is committed.

**Verify:** `check-all.sh`, then `compare-results --phase P0b` (this must pass against itself).

**Rollback:** revert the squash.

**Owner after merge:** `git tag pre-monorepo <squash-sha> && git push origin pre-monorepo`.

### P1 — Repo-level tests out of jest + fixer-scope hardening
- Rewrite `tests/unit/AgentShells.test.ts` as `scripts/repo-tests/agent-shells.test.mjs`, and `FixerScope.test.ts` as `fixer-scope.test.mjs`. Keep the same assertions one-to-one, record the mapping in `moved-tests.json`, and delete the jest versions. Add the deletions to `move-map.deleted`.
- Apply A19 (JSON comparison in `check-fixer-scope.sh`).
- New fixer-scope cases, run against a temp git repo:
  - an allowed file passes;
  - a forbidden file fails;
  - a `dependencies` version bump fails;
  - a `scripts` edit fails;
  - one case for **every file the `fix-from-error-report` skill tells the fixer to write**, which must pass.

**Verify:**
- `check-all.sh`
- `compare-results --phase P1`

**Rollback:** revert the squash.

### P2 — Frontend rename
- **Commit 1:** `git mv job-scrapper-ui frontend`.
- **Commit 2:**
  - root `package.json`: `verify:ui` and `build` use `--prefix frontend`;
  - `vercel.json`: `outputDirectory: frontend/dist`;
  - `Server.ts:335` dist path;
  - tsconfig excludes;
  - GenerateDocs `EXCLUDED_DIRS` gains `frontend`;
  - rule paths in `.agents/rules/40-frontend.md`;
  - the frontend role shells;
  - `frontend/package.json` `name: "frontend"`, then `npm install --package-lock-only` in `frontend/`;
  - **add** `"check": "npm run typecheck && npm run lint && npm run test && npm run build"` and `"engines": {"node": ">=24.0.0"}`;
  - doc, README, agent and PR-template links;
  - `move-map` prefix `job-scrapper-ui/` → `frontend/`.
  - **Keep** the domain `job-scrapper-ui.vercel.app` in the CORS default `Server.ts:29`, `Hardening.test.ts` and `robots.txt`.

**Verify:**
- `check-all.sh`
- `compare-results`
- `git grep -n 'job-scrapper-ui/'` → empty
- `git grep -n 'job-scrapper-ui' | grep -v 'vercel.app'` → empty
- `smoke.mjs <Vercel PR preview>`

**Rollback:** `git revert <first>^..<last>`, plus Vercel Instant Rollback if prod was affected.

**Owner (local):** `rm -rf job-scrapper-ui` to remove the leftover untracked `node_modules` and `dist`.

### P3a — Backend move + Vercel split (production-affecting)
**Preconditions:**
- O1, O2, O8 and O9 are answered.
- No open `auto-fix/*` PRs.
- Merge window is Monday to Saturday, 08:00–20:00 UTC.
- Nothing else merges until the post-merge checks pass.

**Commit 1 (pure moves):**
```
mkdir -p backend/scripts backend/docs
git mv src tests prisma __mocks__ api jest.config.js tsconfig.json tsconfig.test.json .eslintrc.json \
       package.json package-lock.json .env.example extracted-slugs.json backend/
git mv scripts/GenerateDocs.ts scripts/generate-readme.ts backend/scripts/
git mv JOBS.md backend/                                   # O1 default
git mv docs/project-explorer.html docs/GOOGLE_DRIVE_SETUP.md backend/docs/
```

**Commit 2 (edits):**
- **`backend/package.json`.**
  - Remove `verify:ui`.
  - `build` becomes `prisma generate`.
  - Add `typecheck`, `typecheck:test`, `check:all` and `docs:check`.
  - Set the version per O8.
- **`Server.ts`.** Remove the static block (lines 334–344) and the now-unused `fs`/`path` imports at lines 9–10. Update ApiNoStatic so that only the "404 on /" case remains.
- **`GenerateDocs`.** Root is now the backend, and output goes to `backend/docs/project-explorer.html`.
- **`InstallReportFixture.ts`.** Apply A8, with a test.
- **`.gitignore`.** Add `/backend/extracted-slugs*`. The unanchored patterns already cover `backend/`.
- **`backend/vercel.json`.**
  - `version: 2`, `regions: [iad1]`, `buildCommand: npm run build`, `outputDirectory: public`.
  - `functions: {"api/index.ts": {maxDuration: 15}}`.
  - headers: nosniff, Referrer-Policy, XFO.
  - rewrites: `/v1/(.*)` and `/health` → `/api/index`.
  - `ignoreCommand` per A10.
  - Add `backend/public/.gitkeep`.
- **`frontend/vercel.json`.**
  - `framework: vite`, `buildCommand: npm run build`, `outputDirectory: dist`.
  - The current CSP header set.
  - rewrites: `/v1/:path*` → `https://<backend-prod-domain>/v1/:path*`, `/health` → the same domain, `/(.*)` → `/index.html`.
  - `ignoreCommand` per A10.
  - Delete the root `vercel.json`; add its deletion to `move-map`.
- **`ci.yml`** (still a single job):
  - backend steps run with `working-directory: backend`;
  - `npm --prefix frontend ci` and `npm --prefix frontend run check`;
  - both lockfiles in `cache-dependency-path`;
  - the docs diff is `npm --prefix backend run docs:check`;
  - the repo-tests step stays.
- **`scrape-daily.yml`.**
  - *scrape job:*
    - `jobs.scrape.defaults.run.working-directory: backend`;
    - sparse-checkout `backend` + `scripts/ci`;
    - `cache-dependency-path`;
    - dual cache restore/save (A4);
    - artifacts at `backend/output/reports/**`;
    - `../scripts/ci/alert-issue.sh`;
    - remove `VERCEL_TOKEN` and `VERCEL_PROJECT_ID` (A7);
    - update the `fixture_report` description.
  - *fixer job* (full checkout, repo-root cwd):
    - `npm --prefix backend ci && npm --prefix frontend ci && npm --prefix backend exec prisma generate`;
    - download artifacts into `backend/output/reports`;
    - prompt: `/fix-from-error-report backend/output/reports/*/<id>.issues.json`;
    - `--allowedTools`:
      - `Bash(npm --prefix backend run typecheck)`
      - `Bash(npm --prefix backend run typecheck:test)`
      - `Bash(npm --prefix backend run lint)`
      - `Bash(npm --prefix backend test)`
      - `Bash(npm --prefix backend test -- *)`
      - `Bash(npm --prefix frontend run check)`
      - `Bash(npm --prefix backend run docs:generate)`
      - the existing git commands;
    - deterministic gate: `scripts/check-all.sh --no-install`.
- **`discover-weekly.yml`.** Job-level working-directory, sparse-checkout, `cache-dependency-path`.
- **`scripts/ci/open-fix-pr.sh` and `record-fix-attempt.sh`.** `find backend/output/reports`, with a fallback to `output/reports` until P10. Update the command text in the PR body.
- **`check-fixer-scope.sh`.**
  - *Allowed:*
    - `^backend/src/`
    - `^backend/tests/`
    - `^backend/prisma/schema\.prisma`
    - `^backend/docs/project-explorer\.html`
    - `^backend/AGENTS\.md`
    - `^documentation/` (until P5)
    - `^CHANGELOG\.md`
    - `^README\.md`
    - `^AGENTS\.md`
  - *Forbidden:*
    - `^\.github/`
    - `^\.claude/settings\.json`
    - `^\.agents/hooks\.json`
    - `vercel\.json$`
    - `^frontend/`
    - `package(-lock)?\.json$` (O13)
- **A9 command strings.** Update skills `fix-from-error-report/SKILL.md:13`, `verify-change/SKILL.md:9` and `release/SKILL.md:10` (the release version per O8), `CLAUDE.md`, `AGENTS.md:15` and `.github/pull_request_template.md` to `scripts/check-all.sh` or the exact allow-listed forms.
- **Agent path globs needed for correctness now.** `.claude/rules/scraper-invariants.md:2` and every glob in `.agents/rules/*` gain the `backend/` prefix.
- **`move-map`.** Add prefixes for every moved path.

**New tests:**
- `fixer-allowed-tools.test.mjs`:
  - every `Bash(...)` in `--allowedTools` maps to an existing npm script;
  - every command written in `fix-from-error-report/SKILL.md` is on the allow-list.
- `single-check-command.test.mjs`: AGENTS.md, CLAUDE.md, skills, roles and the PR template contain no check-command variant other than the canonical ones.
- `no-api-imports-scraper` (an eslint `no-restricted-imports` rule in the backend, plus a repo test): `src/api/**` and `api/**` never import `src/core`, `src/discovery` or `child_process`. This guards D2.

**Pre-merge verify:**
- `check-all.sh`
- `compare-results --phase P3a`: an exact key superset after the move map is applied.
- `npm --prefix backend run api:start`, then `smoke.mjs http://localhost:3001 --backend`.
- Backend preview: `smoke.mjs <backend-preview> --backend --bypass-token-env=VERCEL_BYPASS`. `/`, `/v1/*` and `/health` work.
- Frontend preview, on a **temporary staging Vercel project** `job-scrapper-web-staging` with Root `frontend`, whose rewrites point at the backend preview URL through a branch-only env-substituted copy: `smoke.mjs <staging-url>`. Check `x-vercel-cache` and the backend log for `req.ip`.

**Cutover sequence (owner, in order — see the runbook):** promote the backend → smoke the backend prod URL → set `SCRAPE_ENABLED`, `FIXER_ENABLED` and `DISCOVERY_ENABLED` to `false` → merge (rebase) → set the existing project's Root Directory to `frontend` → redeploy the merge commit **once** → smoke prod.

**Post-merge verify:**
- Prod smoke against both URLs.
- `scrape-daily` `workflow_dispatch` with `fixture_report=tests/fixtures/reports/actionable.json`, `skip_publish=true`, `skip_fixer=true`, with `SCRAPE_ENABLED` temporarily `true` for the dispatch. Expect classify `actionable=true`, the artifact present, and the cache saved under both keys.
- `discover-weekly` dispatch with `common_crawl=false`.
- Optional fixer run per O2.
- Re-enable the toggles.

**Rollback**, written into PROGRESS.md before the merge:
1. Set the toggles to `false`.
2. Instant Rollback the frontend project (or `vercel promote <recorded pre-P3 id>`). The old deployment contains its own API function.
3. Set Root Directory back to `.`.
4. `git revert --no-edit <first>^..<last>` on branch `revert/p3a`; the owner merges it.
5. Leave the backend project idle.
6. Dual-cache keeps history.
7. Re-enable the toggles after a fixture dispatch passes.

**Owner local checklist:**
```
mv .env backend/.env
mv apikeys backend/apikeys
mv output backend/output
rm -rf node_modules            # stale root deps hide missing backend deps
npm --prefix backend ci && npm --prefix frontend ci
```

### P3b — Backend follow-ups (no production impact)
- `.claude/settings.json`: allow-list in prefix form, plus deny rules for `./backend/.env*` and `./backend/apikeys/**`. The global `**` patterns from P0a stay.
- `layout.test.mjs`:
  - the root contains only allow-listed entries, with `documentation/` allowed until P5;
  - there is no `src/`, `tests/`, `package.json` or `vercel.json` at the root.
- Remaining path strings in `documentation/` and `README.md`, found with: `git grep -nE '(^|[ "\x27(\x60])(src|tests|prisma|api|scripts/GenerateDocs)/' -- ':!backend' ':!frontend' ':!CHANGELOG.md' ':!docs/monorepo-migration' ':!documentation/plan'` → must be empty.

**Rollback:** revert the squash.

### P4a / P4b — CI split
| Workflow | Jobs | Path filter (via `changes`) |
|---|---|---|
| `backend-ci.yml` | `changes` → `verify` (typecheck, typecheck:test, lint, test, build, docs:check, any-ratchet once P7 lands) → `backend-gate` | `backend/**`, `.nvmrc`, the workflow itself |
| `frontend-ci.yml` | `changes` → `verify` (`npm run check`) → `frontend-gate` | `frontend/**`, `.nvmrc`, the workflow itself |
| `repo-ci.yml` | `repo-tests` (always), `actionlint` (pinned), `fixer-scope` (head ref `auto-fix/**`) → `repo-gate` | always |

- Triggers: PR and push on `main`, `plan/**`, `auto-fix/**`.
- Test: every gate's `needs` covers every other job in its workflow, with `if: always()` and a failure/cancel check.

**Owner:** set the required checks to `backend-gate`, `frontend-gate` and `repo-gate`.

**Verify:**
- a frontend-only PR: backend verify is skipped and `backend-gate` is green;
- a backend PR: both run;
- a push to `main`: everything runs.

**P4b** deletes `ci.yml` and its step in the fixer gate. It is allowed only after the O10 soak, which is recorded in PROGRESS.md.

**Rollback chain after P4b:**
1. Revert P4b.
2. Revert P4a.
3. Revert P3b.
4. Revert P3a (P3a rollback steps).
5. Restore the "Verify & Test" required check.

### P5 — Docs restructure
| Old | New |
|---|---|
| documentation/README.md | docs/README.md (routing guide + full index) |
| 01-overview | docs/overview.md |
| 02 architecture-and-workflows | backend/docs/architecture-and-workflows.md |
| 03 external-apis | backend/docs/external-apis.md |
| 04 cli-commands | backend/docs/cli-commands.md |
| 05 database-and-cache | backend/docs/database-and-cache.md |
| 06 module-reference | backend/docs/module-reference.md |
| 07 configuration-and-setup | backend/docs/configuration.md (fix the VERCEL_* claims) |
| 08 outputs-and-artifacts | backend/docs/outputs-and-artifacts.md |
| 09 known-issues | backend/docs/known-issues.md + frontend/docs/known-issues.md |
| 10 bug-fix log | docs/bug-fix-log.md (repo-wide BF IDs) |
| 11 testing-guide | backend/docs/testing.md + frontend/docs/testing.md + docs/testing.md (map, incl. repo-tests) |
| 12 backend-api | backend/docs/api.md (links to types.ts and contract fixtures) |
| 13 frontend-ui | frontend/docs/frontend-ui.md |
| 14 deployment-and-operations | docs/deployment-and-operations.md (two projects, toggles, rollback runbook) |
| 15 system-architecture-and-flows | docs/system-architecture-and-flows.md |
| 16 self-healing-loop | docs/self-healing-loop.md |
| documentation/runs/ (fixer output, may not exist yet) | docs/runs/ |
| decisions/* (14 files) | docs/decisions/*, plus ADR-0013 monorepo layout, ADR-0014 Vercel split + WAF + trust proxy, ADR-0015 type contract + fixtures |
| agents/* | docs/agents/{context,roster,roles/*} |
| plan/* (13) | docs/archive/2026-10-initial-plan/* (historical banner) |
| backend/docs/GOOGLE_DRIVE_SETUP.md | backend/docs/google-drive-setup.md |

**Root `README.md`** (about 80 lines):
1. `## Workflows & pipelines` comes **first**. It is a table: workflow, trigger, what it does, file, doc link.
2. Then a short repo map.
3. Then a link to `docs/README.md` and to each app's README.

Fix the stale "Redis change detection" claim.

**`docs/README.md`:**
1. Workflows (detailed)
2. Repo map
3. "If you need X → look in Y" table for agents
4. Full doc index
5. ADR index
6. Archive (includes `docs/monorepo-migration/`)

**App READMEs:** setup, scripts, env, docs index.

**Also in this phase:**
- Fixer scope allows `^docs/bug-fix-log\.md`, `^docs/decisions/`, `^docs/runs/`, `^backend/docs/known-issues\.md`, `^backend/docs/testing\.md`.
- `^frontend/docs/` stays forbidden.
- Every fixer-skill doc path is covered by a fixer-scope case.
- Update the doc paths in the skills (`fix-from-error-report`, `record-decision`, `review-run`, `release`).
- `CLAUDE.md` imports `@docs/agents/context.md`.
- Update the `agent-shells` test constants to the new paths.
- Fix the comments at `RedisClient.ts:18` and `frontend/src/types/api.ts:3`.
- Remove `^documentation/` from the fixer scope and the layout allow-list.

**Test** `docs-links.test.mjs`:
- every relative link and `@import` resolves;
- every `.md` under `docs/`, `backend/docs/` and `frontend/docs/` is reachable from `docs/README.md` (the archive uses lenient mode);
- the first `##` in the root README is Workflows;
- `git grep documentation/` is empty outside `docs/archive`, CHANGELOG history and `docs/monorepo-migration`.

**Rollback:** `git revert <first>^..<last>`.

### P6a — Agents canonical + generated shells
- **Canonical files:** `docs/agents/{context.md, roster.md, roles/*.md, rules/*.md}`.
- **Rule frontmatter:** `id`, `scope` (repo|backend|frontend), `always`, `applies_to[]`, `description`.
- **Generator** `scripts/agents/sync-shells.mjs`:
  - writes every shell with a `GENERATED from <canonical path>` banner and an **inlined** canonical body;
  - `--check` mode is used by `agent-shells.test.mjs`. It does a byte comparison, checks that the banner names an existing canonical file, and that the body equals that file's body. This replaces the old "body references role path" assertion.
  - The other P1 assertions stay.
- **Shell formats:**

| Shell | Frontmatter |
|---|---|
| Claude agent `.claude/agents/<role>.md` | `name`, `description`, `tools: Read, Grep, Glob, Edit, Write, Bash` (read-only roles drop Edit/Write), `model: inherit`, `maxTurns`, `skills` |
| Antigravity agent `.agents/agents/<role>.md` | `tools: [view_file, grep_search, run_command, replace_file_content]`, `model: inherit`, `commandExecutionPolicy: sandbox` |
| Claude rule `.claude/rules/<id>.md` | `paths: [...]`. Always-on rules get no `paths`. **The `context` rule is not generated for Claude**, because CLAUDE.md already imports it (avoids double load). |
| Antigravity rule `.agents/rules/NN-<id>.md` | `trigger: glob\|always_on`, `globs: "a, b"`, `description`. The test asserts the trigger is valid and that glob rules have globs. |
| Codex | per O12 default: nested AGENTS.md plus skills only. Recorded in ADR-0013. |

- **Rules:**

| id | scope | trigger | globs |
|---|---|---|---|
| context | repo | always (Antigravity only) | – |
| secrets-and-git | repo | always | – |
| changelog-and-commits | repo | always | – |
| api-contract-sync | repo | glob | `backend/src/api/**`, `frontend/src/types/**`, `frontend/src/store/api/**`, `backend/tests/fixtures/contract/**`, `frontend/src/test/fixtures/contract/**` |
| ci-and-workflows | repo | glob | `.github/**`, `scripts/ci/**` |
| scraper-invariants | backend | glob | `backend/src/core/**`, `backend/src/lib/**` |
| api-cache | backend | glob | `backend/src/api/**`, `backend/api/**`, `backend/src/cache/**`, `backend/src/lib/cache/**` |
| prisma-schema | backend | glob | `backend/prisma/**` |
| frontend-invariants | frontend | glob | `frontend/**` (MUI; fix the Tailwind drift) |
| frontend-design | frontend | glob | `frontend/src/**/*.tsx` (→ impeccable skill) |

- **api-contract-sync rule text.** Any HTTP response-shape change MUST, in the same PR, do all of the following. A shape change means adding, removing or renaming a field, or changing its nullability, an enum, pagination, or the error body.
  1. Update `backend/src/api/types.ts` and the mapper.
  2. Run `npm --prefix backend run contract:fixtures` and commit `backend/tests/fixtures/contract/*`.
  3. Run `node scripts/contract/sync-fixtures.mjs` and commit the frontend copy.
  4. Update `frontend/src/types/api.ts` until `npm --prefix frontend run check` passes.
  5. Add a CHANGELOG entry tagged `contract`.
  6. If cached bodies change, the PR notes that the owner must deploy the backend and then dispatch `scrape-daily publish_only=true`.

  Also: make changes additive first; never remove a field the deployed frontend reads in the same release; the auto-fixer never changes response shapes.
- Root `AGENTS.md` stays at or under 6144 bytes, the stale "planned: P4-T04" goes, and there is one canonical check command.
- **Impeccable** files stay unchanged (exempt list). The test asserts the `.claude/skills/*` symlinks resolve and that the `skills-lock.json` entries exist.

**Rollback:** revert the squash.

### P6b — Nested agent files + hooks
- **`backend/AGENTS.md`** (at most 3 KB): scope, `npm run check:all`, cwd invariants, docs pointers, type-sync summary.
- **`backend/CLAUDE.md`:** `@AGENTS.md` plus at most 10 lines.
- **`frontend/`:** the same pair, plus an impeccable/design pointer.
- **Launch-location safety.**
  - Add a minimal `backend/.claude/settings.json` and `frontend/.claude/settings.json` with the same deny rules, so a session started inside an app is still protected.
  - The nested CLAUDE/AGENTS files say "prefer launching at the repo root".
  - A test asserts the deny lists match the root.
- **Hooks (A15).**
  - `hooks.test.mjs` feeds sample stdin: no output for `ls`; a reminder when a commit lacks the CHANGELOG; the Codex impeccable hook runs from `frontend/` as cwd.
  - Add a shape test for `.agents/hooks.json`.
- **Antigravity check.** Verify nested `AGENTS.md` and `commandExecutionPolicy` against the docs. Per-app scoping for Antigravity relies on the glob rules either way.

**Rollback:** revert the squash.

### P7 — Backend types + strictness (no behaviour change)
1. **`backend/src/api/types.ts`.** Add `JobListItemDTO`, `JobDetailDTO`, `CompanySummaryDTO`, `CompaniesResponseDTO`, `PaginationMetaDTO`, `JobsResponseDTO`, `FacetCountDTO`, `FacetsResponseDTO`, `MetaResponseDTO`, `HealthResponseDTO` and `ErrorResponseDTO {error, code?, retryAfterSeconds?}`. Each gets JSDoc covering nullability and units.
2. **Typing the API layer.**
   - Mappers use `import type { Prisma }` and `Prisma.JobGetPayload<{select: typeof LIST_SELECT}>`. This is safe under ts-jest `isolatedModules`, and tsc resolves the real types. **Ban `Prisma.validator`**, because the mock lacks it.
   - Type the `queries.ts` returns.
   - Make `ReadThrough` generic: `serveView<T>`, `serveDetail<T>`.
   - Type the Server handlers.
   - Replace `catch (err: any)` with `isHttpError(e: unknown)`.
   - Replace `req.query as any` with a parsed `JobQueryParams`.
3. **Any-ratchet.** Add `backend/scripts/any-ratchet.mjs` and a frontend copy.
   - It runs eslint in JSON mode with `no-explicit-any: error` over `src`, `api`, `tests` and `scripts`, and compares against `.any-baseline.json`.
   - It fails if any file's count rises or a new file contains `any`.
   - `--update` may only lower counts.
   - Wired into backend-ci, frontend-ci and `check:all`.
4. **ESLint.** Set `no-explicit-any: error` for `src/api/**` and `api/**`, and add `tests/` and `scripts/` to the backend lint (ratcheted).
5. **Compiler flags.** In both apps: `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noUncheckedIndexedAccess`. In the frontend also `exactOptionalPropertyTypes`.
6. **Tests.**
   - Add `tests/unit/ApiTypes.test.ts`, with type-level `Equal<>` checks run by `typecheck:test`.
   - **ApiGolden snapshots must not change:** `git diff --exit-code main -- 'backend/tests/**/__snapshots__/**'`.

**Rollback:** revert the squash.

### P8a — Contract fixtures + frontend alignment (no behaviour change)
- **`backend/tests/contract/ContractFixtures.test.ts`.**
  - Uses supertest against seeded mocks, `jest.setSystemTime` only, with `VERCEL_GIT_COMMIT_SHA` unset and services reset per test.
  - `UPDATE_CONTRACT_FIXTURES=1` (script `contract:fixtures`) writes `backend/tests/fixtures/contract/<endpoint>.<case>.json`. Without it, the test compares against those files.
  - **HIT == MISS** is asserted for jobs, job detail, facets and companies. Meta is compared without `generation` and `lastScrapeAt`. `/health` is excluded, because it isn't cached and has a variable `latencyMs`.
- **Sync.** `scripts/contract/sync-fixtures.mjs` copies the fixtures to `frontend/src/test/fixtures/contract/`. `contract-sync.test.mjs` asserts the same file set with identical bytes.
- **Frontend `contract.test.ts`.**
  - Fixtures are checked with `satisfies JobsResponse` and the like, which the typecheck enforces.
  - An exact runtime key-set check uses exhaustive key tuples (`as const satisfies readonly (keyof T)[]` plus a type-level check that the tuple's union equals `keyof T`).
  - Delete the DB-row fixtures and the `as unknown` casts, and add them to `move-map.deleted`.
- **Type-only fixes:**
  - `companyName: string | null`, with a render fallback;
  - `company` can be null, and there is a top-level `companyJobCount`;
  - remove `postalAddress`, `FacetCount.label` (use `Intl.DisplayNames` instead) and `JobsResponse.facets`;
  - add a `HealthResponse` type;
  - for O3 and O4, if the default applies, remove the fields from the UI types and the UI controls.

**Rollback:** revert the squash.

### P8b-N — Approved behaviour changes (one PR each)
- **Changes covered:** O5, O6 and O14, plus O3 and O4 if the owner chose "implement".
- **Each PR includes:**
  - a BF ID in `docs/bug-fix-log.md`;
  - the golden-snapshot diff;
  - regenerated and synced fixtures;
  - a CHANGELOG entry;
  - frontend type updates.
- **Deploy order:**
  1. Merge.
  2. Wait for the backend deploy to go live.
  3. Owner dispatches `scrape-daily publish_only=true`.
  4. Run the smoke test.
- **Rollback order:**
  1. Instant Rollback of the backend.
  2. Revert the PR.
  3. Dispatch `publish_only` again.

  Never publish new-shape cache bodies before the backend that serves them is live.

### P9-N — Remove remaining `any`
- **Order**, highest counts first, one PR per area:
  1. `core/Scraper.ts`
  2. `cache/Publisher.ts` and `api/cache/ReadThrough.ts`
  3. `lib/*` and `database/*`
  4. test helpers (`prismaFactory.ts`, `fakeRedis.ts`, with a typed `DeepPartial<T>`)
  5. the remaining tests and frontend
- Each PR lowers the ratchet baseline.
- **Final PR:** set `no-explicit-any: error` globally in both eslint configs, delete the ratchet, and enable backend `exactOptionalPropertyTypes`.

### P10 — Cleanup
- **Remove:**
  - the dual-cache legacy key and the `output/reports` fallback;
  - `frontend/src/mocks/mockData.ts` (dead code);
  - the staging Vercel project (owner).
- **Archive:** move `move-manifest.test.mjs`, `scripts/migration/` and `docs/monorepo-migration/` into `docs/archive/`.
- Playwright per O7.
- Dedupe the CHANGELOG `[Unreleased]` headings.

---

## Vercel cutover runbook (P3a)
1. **Before the PR:** the P0a smoke and the pre-P3 production deployment ID are recorded in PROGRESS.md.
2. **Owner creates `job-scrapper-api`.**
   - Root Directory `backend`, framework Other, Node 24.
   - Env vars per O9: `DATABASE_URL`, `REDIS_URL`, `CORS_ORIGINS`, `HEALTH_TOKEN`.
   - Production Deployment Protection off.
   - A global WAF limit.
3. **Owner creates the temporary `job-scrapper-web-staging`** with Root Directory `frontend`.
4. **PR previews:**
   - backend preview smoke, using the bypass token if preview protection is on;
   - staging frontend smoke, with its rewrites pointed at the backend preview;
   - check `req.ip` and `x-vercel-cache`.
5. **Owner promotes the backend P3a preview to production:** "Promote to Production" or `vercel promote <preview-url>`. Then run `smoke.mjs https://job-scrapper-api.vercel.app --backend`. The backend prod domain now exists **before** the merge, and `frontend/vercel.json` already points at it.
6. **Set the toggles to `false`.** Merge (rebase). Set the existing project's Root Directory to `frontend`. Redeploy the merge commit **once**.
7. **Production checks:**
   - `smoke.mjs https://job-scrapper-ui.vercel.app`;
   - `/v1/meta` shows the same generation as the baseline;
   - WAF hits `/v1` (frontend firewall logs).
8. **Rollback**, within seconds:
   1. Instant Rollback of the frontend project to the recorded deployment. Hobby plan allows only the immediately previous deployment, which is why there must be **no second redeploy before verifying**; otherwise use `vercel promote <id>`.
   2. Set Root Directory back to `.`.
   3. `git revert` the range.
   4. Re-promote afterwards, because auto-promotion pauses after a rollback.
9. **After 7 days of stability:** remove the DB and Redis env vars from the frontend project.

## Risk register
| # | Risk | L/I | Detection | Mitigation | Rollback |
|---|---|---|---|---|---|
| 1 | Daily scrape breaks after P3a | M/H | fixture dispatch; workflows test; actionlint | A2–A4, toggles off during cutover, merge window | toggles off → revert range |
| 2 | Required checks never report | H/M | first P4a PR | A1 uniquely named gates; P4a/b split | owner edits protection |
| 3 | Prod API down during split | M/H | preview + staging + prod smoke | backend promoted before merge; single redeploy | Instant Rollback |
| 4 | WAF bypass / shared IP bucket | M/M | `req.ip` logs, WAF logs | A5, DbGuard, ADR-0014 | single-project rollback |
| 5 | Repo tests pass with wrong root | H/M | move-manifest + layout tests | P1 before P3a; `git rev-parse` root | revert |
| 6 | Files lost in move | L/H | move-manifest | `git mv` only; `deleted` list | revert range |
| 7 | cwd-relative dirs written to the wrong place | M/M | PathResolution + layout + preflight | job-level working-directory | revert |
| 8 | Fixer broken or over-privileged after moves | M/H | fixer-allowed-tools, skill-command and fixer-scope tests | A9, A19, O13; `FIXER_ENABLED` toggle | toggle off; revert |
| 9 | Cache HIT/MISS divergence | M/H | CacheParity + contract HIT==MISS, smoke | additive-first; deploy then `publish_only` | backend rollback → revert → `publish_only` |
| 10 | Secrets committed or read (Vercel CLI, `.env.local`) | M/H | secrets-ignore test | A18 | rotate secret; history purge |
| 11 | Rule drift / Antigravity rules silently dropped | M/L | `sync-shells --check`, trigger validation | generated shells | revert |
| 12 | Hook spam or misfire | H/L | hooks stdin test | A15 | revert hook |
| 13 | Revert of P3a impossible after later phases | M/H | PROGRESS rollback chain | O10 soak before P4b; documented chain | chain revert |
| 14 | Local env broken (`.env`, `apikeys`, stale `node_modules`) | H/L | check-all preflight warnings | owner checklist | – |
| 15 | Vercel deploy skipped by ignoreCommand | M/M | prod smoke after each merge | A10 uses PREVIOUS_SHA | manual redeploy |

## Additional tests (summary)
| Phase | Tests |
|---|---|
| P0a | secrets-ignore, toggles, `_yaml-lite`, `node --check` on `.mjs` |
| P0b | ApiGolden, PathResolution, GenerateDocs, ApiNoStatic, vercel-config, workflows, move-manifest |
| P1 | fixer-scope on a temp repo, including the JSON package.json checks and every skill-written path |
| P2 | `job-scrapper-ui` greps |
| P3a | fixer-allowed-tools + skill commands, single-check-command, no-api-imports-scraper, InstallReportFixture prefix |
| P3b | layout |
| P4a | gate-needs |
| P5 | docs-links / orphans / workflows-first |
| P6a | agent-shells drift + triggers + symlinks + sizes |
| P6b | hooks stdin + shape, nested deny parity |
| P7 | ApiTypes, any-ratchet, snapshots unchanged |
| P8a | ContractFixtures HIT==MISS, contract-sync, frontend exact key-set |
| post-deploy | `smoke.mjs` |

---

## How to have a new agent implement this
**P0a kickoff prompt.** This one is special: PLAN.md isn't in the repo yet.
> You are implementing Phase P0a of the monorepo migration in /Users/pavanreddy/Documents/anti-gravity/job-scrapper.
> Read the plan at /Users/pavanreddy/.claude/plans/snoopy-stirring-kite.md in full, plus root `AGENTS.md` and
> `CLAUDE.md`. Never read `.env*`, `apikeys/`, `output/` contents. Create branch `plan/mono-p0a-foundation` from
> up-to-date `main`. Commit 1: copy the plan verbatim to `docs/monorepo-migration/PLAN.md` and create
> `PROGRESS.md` from the template in the plan (fill in owner decisions I give you; leave others "pending"). Then
> implement the P0a section exactly. Run `scripts/check-all.sh` and the smoke command, and paste real output
> summaries into PROGRESS.md. Update CHANGELOG [Unreleased]; run docs:generate; JSDoc headers on new files;
> Conventional Commits with bulleted bodies. Never push, merge, tag, or change GitHub/Vercel settings — end with
> the owner-action list and a drafted PR description. If reality differs from the plan, stop and ask.

**Kickoff prompt for every later phase** (replace PN/slug):
> You are implementing Phase PN of the monorepo migration in /Users/pavanreddy/Documents/anti-gravity/job-scrapper.
> First read `docs/monorepo-migration/PLAN.md` (the PN section plus "Owner decisions", "Design corrections",
> "Risk register"), `docs/monorepo-migration/PROGRESS.md`, root `AGENTS.md`, and `backend/AGENTS.md` /
> `frontend/AGENTS.md` if present. Never read `.env*`, `apikeys/`, `backend/apikeys/`, `output/` contents.
> Stop and report if: the previous phase is not ticked merged in PROGRESS.md and present in `git log origin/main`;
> or any owner decision PN needs is "pending" (ask me; use the default only if I wrote "default"). Create branch
> per the phase table from up-to-date `main`. Use `git mv` for moves; pure moves in their own commit first. No
> behaviour change outside scope; never edit snapshots/fixtures unless the phase says so. Run `scripts/check-all.sh`
> and `node scripts/migration/compare-results.mjs --phase PN`, plus the phase's extra verifications; paste real
> summaries into PROGRESS.md along with the rollback command(s). Update CHANGELOG [Unreleased], docs:generate,
> JSDoc headers, Conventional Commits. Never push, merge, tag, or change GitHub/Vercel settings — finish with the
> owner-action list and a drafted PR description. If reality differs from the plan, stop and ask; do not improvise.

**Recommended review after each phase:** start a second, fresh session with "Review branch plan/mono-PN-… against
`docs/monorepo-migration/PLAN.md` section PN; run `scripts/check-all.sh` and compare-results; report deviations."
(or `/code-review`) before you push.

**Definition of done (every phase).** Each item is checked by the command or artifact shown.
| Item | Check |
|---|---|
| Only this phase's files changed | `git diff --stat main...` |
| All checks pass | `scripts/check-all.sh` exits 0 |
| Results match the baseline | `compare-results` exits 0 |
| Snapshots unchanged (except approved P8b) | `git diff --exit-code main -- '**/__snapshots__/**'` |
| Retired paths gone | the phase's grep patterns return nothing |
| CHANGELOG updated | `git diff main -- CHANGELOG.md` is non-empty |
| New files have headers | head check for `@file` in new `.ts`, `.mjs`, `.sh` |
| PROGRESS.md complete | SHAs, evidence, owner actions, rollback commands |
| PR description drafted | written for the owner |

Phase-specific extras:
- **P3a:** local + backend-preview + staging smoke, promotion recorded, dispatch results.
- **P4a:** proof of a skipped job with a green gate.
- **P5:** no orphan docs.
- **P6a:** `sync-shells --check` passes.
- **P8a/b:** owner decisions recorded before coding.
