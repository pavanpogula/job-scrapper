# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

- **fix(search)**: job search matches all words, in any order, at word starts (BF-020).
  - Root cause: `/v1/jobs` treated the whole search text as one substring, so `senior engineer` returned 106 jobs instead of including the 678 "Senior Software Engineer" jobs, `software engineer senior` returned 0, and `SF` matched inside words such as "Transfer".
  - Fix: new `backend/src/lib/search.ts` (`tokenizeSearch`, `buildSearchWhere`, `canonicalSearch`, `escapeLike`) used by `queryJobs`; every word must start a word in title, company, department or location; LIKE wildcards escaped; cache keys canonicalise equivalent searches. `/v1/companies` search unchanged.
  - Tests: new real-PostgreSQL tier `backend/tests/integration/Search.test.ts` (`npm run test:integration`, `jest.integration.config.js`, localhost-only guard) comparing 50+ queries against an independent reference matcher, filter intersections, and full pagination walks; `backend-ci.yml` runs it against a `postgres:17.5` service container. Plus `SearchTokenize.test.ts` and frontend `searchBox.test.tsx`. 91 of the 171 integration tests fail on the old code.
  - UI: search placeholder now says "Search by job title, company or location (all words must match)".
  - Docs: BF-020 in `docs/bug-fix-log.md` and `docs/agents/context.md`, `docs/testing.md`, `backend/docs/testing.md`, `backend/docs/api.md`, `frontend/docs/frontend-ui.md`, `frontend/docs/testing.md`.

- **test(contract)**: Phase P8a API contract fixtures and frontend alignment.
  - Golden contract fixtures: added `backend/tests/contract/ContractFixtures.test.ts` running supertest against Express with deterministic fake timers (`2026-03-01T12:00:00.000Z`) and seeded mocks, asserting response shapes and cache HIT == MISS parity (BF-019). Generates 9 fixtures into `backend/tests/fixtures/contract/` via `UPDATE_CONTRACT_FIXTURES=1`.
  - Added npm script `"contract:fixtures"` in `backend/package.json` (excluded from Claude auto-approve allow-list).
  - Fixture synchronization: implemented `scripts/contract/sync-fixtures.mjs` to copy backend contract fixtures byte-for-byte to `frontend/src/test/fixtures/contract/`. Added repo test `scripts/repo-tests/contract-sync.test.mjs` verifying fixture lockstep.
  - Frontend contract tests: rewrote `frontend/src/test/contract.test.ts` with compile-time `satisfies` checks and exhaustive runtime key-set validation using type-level `Equal<X, Y>` assertions and zero type casts.
  - Frontend type & query alignment (O3 & O4): updated `frontend/src/types/api.ts` to reflect backend response shapes (`companyName: string | null` with UI fallbacks, `company: CompanyDetail | null`, `companyJobCount: number`, `HealthResponse` matching backend DTO; removed `postalAddress`, `FacetCount.label`, and `JobsResponse.facets`). Removed `createdAt` and `updatedAt` from `JobDetail` (O3 default). Removed unsupported query filters (`company`, `department`, `location`, `city`) and `sortBy=title` from UI controls and query params (O4 default), while keeping backend-supported `sortBy=company`.
  - Fixture cleanup: removed legacy DB-row fixtures `frontend/src/test/fixtures/sample-job.json` and `sample-company.json`, recording both under `"deleted"` in `scripts/migration/move-map.json`.
  - Preserved backend behaviour: zero changes to `backend/src/**` and zero diff in `backend/tests/**/__snapshots__/**`.
  - Review follow-up: `useJobFilters` now validates the URL `sort`/`order` params (`parseSortParam`, `parseOrderParam`), so old `?sort=title` bookmarks fall back to Most Recent instead of leaving the sort box blank; guarded by `frontend/src/test/sortParams.test.ts`.
  - Review follow-up 2: the companies contract fixture was recorded from a mock company row without `logoUrl` or `_count`, so it lacked `logoUrl` and showed `jobCount: 0` (the live API returns both). Seeded realistic companies, re-recorded and synced fixtures; the frontend contract test now checks the exact key set of every company and every job item; `CompanySummary.logoUrl`/`jobCount` are required like the backend DTO; fixed the contract test command in `backend/docs/api.md`.

- **feat(jobs)**: show last-updated freshness time on job cards and detail view.
  - Core scraper freshness detection: implemented `resolveLastUpdated(prev, next, now)` in `backend/src/core/ResolveLastUpdated.ts` adhering to 5 resolution rules (Rule 1: NEW -> ashby/published/firstSeen; Rule 2: CHANGED hash -> ashby/detected; Rule 3: REACTIVATED -> keep stored or fall back to Rule 1; Rule 4: RAW TOUCH -> never change timestamp; Rule 5: MONOTONICITY -> clock skew / stale replays cannot rewind `lastUpdatedAt`).
  - Scraper integration: wired into `backend/src/core/Scraper.ts` across `createMany`, `toUpdate`, standard upsert, and per-job fallback paths. GraphQL-over-REST raw touches and unchanged rows keep their stored timestamp. Preserved `computeJobContentHash` and its 17 fields strictly invariant (BF-011).
  - Database schema: added `lastUpdatedAt DateTime?` and `lastUpdatedSource String?` (`'ashby' | 'detected' | 'published' | 'firstSeen'`) to model `Job` in `backend/prisma/schema.prisma`.
  - API and Cache: updated DTOs in `backend/src/api/types.ts` (`JobListItemDTO`, `JobDetailDTO`) and mappers in `backend/src/api/contract.ts` (`toJobListItem`, `toJobDetail`, and `toJobCard`). Mappers fall back gracefully to `publishedAt` for pre-migration rows. Database queries and cache publishing select both fields automatically via shared `LIST_SELECT` and `DETAIL_SELECT`.
  - Frontend formatting & UI: added `LastUpdatedSource` to `frontend/src/types/api.ts`; created pure helpers `formatJobFreshness` and `formatDetailFreshness` in `frontend/src/lib/formatJobFreshness.ts` handling relative thresholds (`<1m`, `<60m`, `<24h`, `<30d`, `>=30d` short date) and semantic `<time dateTime={...}>` output. Rendered freshness badges with tooltips on job cards in `frontend/src/pages/BrowsePage.tsx` and header metadata in `frontend/src/pages/JobDetailPage.tsx`.
  - Architecture & Docs: authored `docs/decisions/ADR-0018-job-last-updated-detection.md`, updated ADR index, updated database, API, architecture, and UI docs, synced agent context shells, and regenerated project explorer.
  - Tests & Verification: added unit tests in `backend/tests/unit/LastUpdated.test.ts` (13 tests), scraper integration tests in `backend/tests/unit/ScraperRunAll.test.ts`, frontend unit tests in `frontend/src/test/formatJobFreshness.test.ts` (16 tests), verified `ContentHash.test.ts` remains invariant, updated snapshots, and verified zero new `any` against baseline ratchets.
  - Review follow-up: added `frontend/src/test/jobFreshness.test.tsx` (job card renders the label as `<time>`, with the `publishedAt` fallback for old cache bodies) and listed the ADR-0018 guards in `docs/testing.md` §6 and `frontend/docs/testing.md`.

- **feat(types)**: Phase P7 backend types and strictness.
  - Added `backend/src/api/types.ts` defining all public API DTOs (`JobListItemDTO`, `CompanyDetailDTO`, `JobDetailDTO`, `CompanySummaryDTO`, `CompaniesResponseDTO`, `PaginationMetaDTO`, `JobsResponseDTO`, `FacetCountDTO`, `FacetsResponseDTO`, `MetaResponseDTO`, `HealthResponseDTO`, `ErrorResponseDTO`) and parsed query parameter interfaces (`JobQueryParams`, `CompanyQueryParams`).
  - Typed API layer: mappers in `backend/src/api/contract.ts` use `Prisma.JobGetPayload` without `Prisma.validator`, typed `queries.ts` returns, generic `ReadThroughService` (`serveView<T>`, `serveDetail<T>`), typed Server route handlers, typed query parameter parsing (`parseJobQueryParams`, `parseCompanyQueryParams`), and `isHttpError(e: unknown)` type guard replacing `catch (err: any)`.
  - Type-level verification suite: added `backend/tests/unit/ApiTypes.test.ts` asserting bidirectional type equality (`Equal<A, B>`) and runtime query parsing/error guards run via `typecheck:test` and Jest.
  - Ratchet system: implemented `backend/scripts/any-ratchet.mjs` and `frontend/scripts/any-ratchet.mjs` comparing ESLint `no-explicit-any` counts against `.any-baseline.json`. Added `--update` mode (which may only lower counts). Wired into `backend check:all`, `frontend check`, `.github/workflows/backend-ci.yml`, and `.github/workflows/frontend-ci.yml`.
  - ESLint rules: set `@typescript-eslint/no-explicit-any: error` for `backend/src/api/**` and `backend/api/**` (0 errors), and added `tests/` and `scripts/` to backend lint with ratcheted baseline.
  - Synchronized `docs/agents/rules/api-contract-sync.md` to note `types.ts` is current and ran `sync-shells.mjs`. Documented `types.ts` in `backend/docs/api.md`.
  - Preserved golden snapshots with zero diff against `origin/main`.

- **fix(tests)**: `Hardening.test.ts` and `HealthMeta.test.ts` seeded cache data with a fixed `2026-10-24T12:00:00Z` timestamp; the API marks cache data older than 36 h as `STALE`, so both tests started failing on 2026-10-26 00:00 UTC and broke CI for every branch. They now build the timestamp relative to the current time (2 h ago).

- **feat(deploy)**: deploys are now manual. Both `vercel.json` files set `git.deploymentEnabled: false` (pushes to `main` or any branch no longer deploy) and drop `ignoreCommand`. New `.github/workflows/deploy.yml` (manual dispatch: `app`, `target`, `ref`) runs `scripts/check-all.sh`, then deploys backend before frontend with the pinned Vercel CLI and smoke-tests production. ADR-0016; runbook in `docs/deployment-and-operations.md` §3.3. Guarded by `vercel-config` and `workflows` repo tests. Agent context, `ci-and-workflows` and `api-contract-sync` rules, the `api-cache` role, root/backend/frontend `AGENTS.md`, both app READMEs and ADR-0014 now state that deploys are manual.
- **feat(agents)**: agents can publish and update task branches with `scripts/agents/push-branch.sh` (new branch or fast-forward update, also `local:remote`; never `main`/`master`, force, tags, deletes or mirror; refuses dirty trees and diffs touching `.env*`/`apikeys/`/`output/`/`.vercel/`; prints the PR link). Claude settings (root and nested) allow only that script to push, keep raw `git push` denied and now deny `gh`. Rules regenerated from `docs/agents/rules/secrets-and-git.md`. Guarded by `scripts/repo-tests/agent-push-guard.test.mjs` (real pushes to a local bare remote). ADR-0017; the `review-run` skill, `scraper-bugfixer` role, self-healing loop, architecture invariants and branch-protection runbook now describe the new flow.

- **fix(agents)**: Claude allow-lists no longer auto-approve every backend npm script. Only `typecheck`, `typecheck:test`, `lint`, `lint:fix`, `build`, `docs:generate`, `docs:check` and `check:all` run without a prompt; `db:clean`, `scrape*`, `seed`, `cache:publish` and the rest ask first because they act on the production database.

### Added
- **Nested Workspace Agent Guides (P6b):** Created `backend/AGENTS.md` (2,517 bytes), `backend/CLAUDE.md` (5 lines), `frontend/AGENTS.md` (2,255 bytes), and `frontend/CLAUDE.md` (5 lines). Both pairs recommend launching sessions at the monorepo root, outline workspace-specific check commands (`npm run check:all` vs `npm run check`), document secret and git invariants, and provide pointers to relevant documentation and design systems (including the `impeccable` skill for frontend).
- **Workspace-Level Claude Launch Protection (P6b):** Added `backend/.claude/settings.json` and `frontend/.claude/settings.json` mirroring the root deny list (`Read(**/.env*)`, `Read(**/apikeys/**)`, `Read(**/.vercel/**)`, `Read(**/output/**)`, `Read(./backend/.env*)`, `Read(./backend/apikeys/**)`, `Bash(git push *)`).
- **Hook Lifecycle & Invariant Suite (P6b):** Added `scripts/repo-tests/hooks.test.mjs` verifying stdin filtering for post-commit reminders, Codex root evaluation when running from `frontend/`, Antigravity `hooks.json` schema validation, and nested settings deny list parity.

### Changed
- **Lifecycle Hook Robustness (P6b):** Fixed `scripts/hooks/post-commit-reminder.sh` to parse stdin JSON (`tool_input.command` and `toolCall.args.CommandLine`), suppressing output unless a `git commit` command is executed. Dropped the ineffective `if:` filter from `.claude/settings.json`.
- **Antigravity Hooks Schema (P6b):** Rewrote `.agents/hooks.json` to conform to the official Antigravity `PostToolUse` schema with matcher `run_command` and handler wrapper.
- **Codex CWD Resilience (P6b):** Updated `.codex/hooks.json` to resolve the root via `$(git rev-parse --show-toplevel 2>/dev/null || pwd)`, ensuring impeccable hooks execute accurately even when Codex runs from `frontend/`.
- **Local Settings Gitignore (P6b):** Added `**/.claude/settings.local.json` to `.gitignore` to prevent accidental commits of developer-local settings in nested workspaces.

### Added
- **Canonical Agent Roles and Rules (P6a):** Established single-source-of-truth canonical definitions for all 6 agent roles (`docs/agents/roles/*.md`) and 10 agent rules (`docs/agents/rules/*.md`) with structured frontmatter (`id`, `scope`, `always`, `applies_to[]`, `description`).
- **Deterministic Shell Generator (P6a):** Added `scripts/agents/sync-shells.mjs` generating Claude Code (`.claude/agents/*.md`, `.claude/rules/*.md`) and Google Antigravity (`.agents/agents/*.md`, `.agents/rules/*.md`) configurations with `GENERATED from <canonical path>` provenance banners and inlined bodies. Impeccable skill files are explicitly exempt. Included `--check` mode performing byte-level verification.
- **Agent Shell Parity & Invariant Guard (P6a):** Updated `scripts/repo-tests/agent-shells.test.mjs` to execute `sync-shells.mjs --check`, assert byte-for-byte fidelity and provenance banners, verify `.claude/rules/` path arrays, verify `.claude/rules/context.md` non-generation (avoiding duplicate context loads), and assert that all `skills-lock.json` entries exist in `.agents/skills/`.

### Changed
- **Stack & Path Realignment in Agent Rules (P6a):** Corrected legacy path strings across roles to canonical `backend/` locations. Eliminated Tailwind CSS drift across `frontend.md` role and roster to reflect Material UI (MUI). Authored canonical `api-contract-sync` protocol specifying steps 1 through 6, additive-first changes, and autonomous fixer boundaries.

- **docs(monorepo)**: P5 review fixes: the docs-links test no longer flags its own header, and the READMEs now state the real weekly-discovery schedule (`0 4 * * 0`, 04:00 UTC Sunday).

### Added
- **Monorepo Documentation Restructure (P5):** Reorganized project documentation into distinct operational layers: `docs/` (repo-wide entry, workflows, architecture, testing, and operations), `backend/docs/` (CLI, scraper, database, cache, backend testing, and known issues), `frontend/docs/` (UI testing and known contract issues), and `docs/decisions/` (ADR repository). Pure moves applied in Commit 1 (`b921c27`).
- **New Architecture Decision Records (P5):** Added `docs/decisions/ADR-0013-monorepo-layout.md` (independent multi-app repository structure), `docs/decisions/ADR-0014-vercel-split-and-waf.md` (standalone API and SPA Vercel project segregation), and `docs/decisions/ADR-0015-type-contract-and-fixtures.md` (shared type contract governance and mock fixture sync).
- **Workspace Guides & Testing Docs (P5):** Created `backend/README.md`, `backend/docs/testing.md` (backend Jest suites and database mocking), `frontend/docs/testing.md` (Vitest, React Testing Library, MSW network mocking), and `frontend/docs/known-issues.md` (frontend contract debt O3/O4 and MUI deprecations). Updated `docs/testing.md` as overarching repo-level guide.
- **Documentation Link & Reachability Test (P5):** Added `scripts/repo-tests/docs-links.test.mjs` verifying that the root `README.md` opens with `## Workflows & Pipelines`, that zero active references point to the retired `documentation/` prefix, that all markdown relative links and `@import` directives resolve to existing targets, and that all active documentation files are reachable from `docs/README.md`.

### Changed
- **Fixer Scope & Agent Rules Realignment (P5):** Updated `scripts/ci/check-fixer-scope.sh` and `scripts/repo-tests/fixer-scope.test.mjs` to allow `docs/bug-fix-log.md`, `docs/decisions/`, `docs/runs/`, `backend/docs/known-issues.md`, and `backend/docs/testing.md`, while removing legacy `documentation/` and strictly forbidding `frontend/docs/`. Realigned agent shells, rules, skills, and context imports across `.agents/` and `.claude/` to point to `docs/agents/roles/` and `docs/agents/context.md`.
- **Root README & Documentation Hub (P5):** Rewrote root `README.md` to ~75 lines prioritizing developer workflows and pipelines first, followed by monorepo layout and documentation index links. Updated `docs/README.md` into a 7-section index covering workflows, directory maps, agent fact-ownership, ADR index, archives, and backlog. Added historical archive banner to `docs/archive/2026-10-initial-plan/00-README.md`.
- **Migration Move Manifest (P5):** Registered all 54 moved documentation file paths in `scripts/migration/move-map.json` and updated `scripts/repo-tests/layout.test.mjs` to forbid `documentation/` at monorepo root.

### Removed
- **Legacy Monolithic CI Workflow (P4b):** Deleted `.github/workflows/ci.yml` and retired the legacy `Verify & Test` status check. The monorepo now runs exclusively on parallel split workflows (`backend-ci.yml`, `frontend-ci.yml`, and `repo-ci.yml`) with required gates `backend-gate`, `frontend-gate`, and `repo-gate`. Updated `scripts/repo-tests/workflows.test.mjs` to assert `ci.yml` non-existence, removed `ci.yml` test from `scripts/repo-tests/yaml-lite.test.mjs`, registered `.github/workflows/ci.yml` in `scripts/migration/move-map.json`, and updated `documentation/14-deployment-and-operations.md`.

- **ci(monorepo)**: `repo-ci` actionlint now ignores four reviewed findings in existing workflows (two shellcheck SC2086 hints on intentional flag splitting, two stale-metadata false positives for `create-github-app-token@v3`); any new finding still fails the check.

- **ci(monorepo)**: the split workflows (`backend-ci`, `frontend-ci`, `repo-ci`) now run on `pull_request` for all branches and on `push` only for `main`, which removes the duplicate push + pull_request run on every PR commit.

### Added
- **Parallel Monorepo CI Split (P4a):** Added separate workflow files `.github/workflows/backend-ci.yml`, `.github/workflows/frontend-ci.yml`, and `.github/workflows/repo-ci.yml` alongside `ci.yml`. Workflows include path-based change detection via `changes` jobs, scoped dependency caching, and uniquely named gates (`backend-gate`, `frontend-gate`, `repo-gate`) using `if: always()` to verify that no dependencies failed or were cancelled. In `repo-ci.yml`, pinned `actionlint` v1.7.12 with SHA-256 verification and added `fixer-scope` check on `auto-fix/*` branches.
- **Workflow Gate Test (P4a):** Added `scripts/repo-tests/gate-needs.test.mjs` verifying that each CI gate job covers every other job in its workflow and enforces `if: always()` with status checks.

- **docs(monorepo)**: P3b review fixes: README quick start now runs from `backend/`, README repo tree no longer double-prefixes `backend/`, and `AGENTS.md` / `documentation/agents/context.md` entry-point paths carry the `backend/` prefix.

### Added
- **Monorepo Root Layout Verification (P3b):** Added `scripts/repo-tests/layout.test.mjs` asserting that forbidden legacy root files/directories (`src`, `tests`, `package.json`, `package-lock.json`, `vercel.json`, `prisma`, `api`, `__mocks__`, etc.) do not exist at root and that all tracked root entries belong to an explicit allow-list.

### Changed
- **Backend Path & Permission Follow-ups (P3b):** Updated `.claude/settings.json` permissions to prefix command forms (`npm --prefix backend run *`, `npm --prefix frontend run *`, `scripts/check-all.sh*`) and added explicit deny rules for `./backend/.env*` and `./backend/apikeys/**`. Updated `scripts/repo-tests/secrets-ignore.test.mjs` to assert the new deny rules. Aligned all remaining legacy root path strings (`src/`, `tests/`, `prisma/`, `api/`) in `README.md` and across all `documentation/` guides to their canonical `backend/` locations.

- **docs(monorepo)**: close out P3a in `PROGRESS.md` (cutover result, incidents, rollback range) and add `docs/monorepo-migration/BACKLOG.md` (weekly discovery decision B1 and other deferred items).

- **chore(monorepo)**: add `frontend/README.md`. The change under `frontend/` lets Vercel's ignoreCommand run the first frontend-rooted build after the P3a backend split.

### Changed
- **Backend Move & Vercel Split (P3a):** Moved backend application into `backend/` workspace via pure `git mv` (Commit 1), followed by complete configuration, workflow, script, and test updates (Commit 2). Split monolithic Vercel deployment into standalone API (`backend/vercel.json`, root `backend`, rewrites `/v1/*` and `/health`, security headers) and SPA (`frontend/vercel.json`, root `frontend`, Vite framework, proxy rewrites to API). Removed static asset serving from Express `Server.ts` (API serves only JSON/404s). Updated GitHub Actions (`ci.yml`, `scrape-daily.yml`, `discover-weekly.yml`) with `working-directory: backend`, sparse-checkout, dual cache keys (`scrape-history-v2-`), and fixer allow-listed tools with deterministic gate. Updated fixer scope script and repo tests. Added architectural boundaries (`no-api-imports-scraper` repo test & ESLint `no-restricted-imports` forbidding `src/core`, `src/discovery`, `child_process` in `src/api/**`). Added `single-check-command` and `fixer-allowed-tools` repo tests. Realigned `InstallReportFixture` path resolution. Added directory and deleted file entries to `scripts/migration/move-map.json`.

### Changed
- **Frontend Workspace Rename (P2):** Moved React 19 web application from `job-scrapper-ui/` to `frontend/` using pure `git mv`. Updated root `package.json` (`verify:ui`, `build`), `vercel.json` (`outputDirectory: frontend/dist`), `src/api/Server.ts` (`distPath`), `tsconfig.json`, `tsconfig.test.json`, `scripts/GenerateDocs.ts`, CI workflows, all agent rules/shells, and documentation. Set `frontend/package.json` `name: "frontend"`, added `"check"` script and Node `>=24.0.0` engine constraint. Preserved `job-scrapper-ui.vercel.app` production domain in CORS defaults, `Hardening.test.ts`, and `robots.txt`. Recorded directory prefix mapping in `scripts/migration/move-map.json`.

### Added
- **Repo-Level Test Migration (P1):** Migrated `AgentShells.test.ts` to `scripts/repo-tests/agent-shells.test.mjs` and `FixerScope.test.ts` to `scripts/repo-tests/fixer-scope.test.mjs` under native Node 24 test runner. Added integration test coverage against temporary git repositories verifying allowed files, forbidden files, dependency version bumps, script edits, and all files written by the `fix-from-error-report` protocol.
- **Test Migration Tracking (P1):** Recorded moved test mappings in `scripts/migration/moved-tests.json` and deleted files in `scripts/migration/move-map.json`.
- **Golden API Snapshot Tests (P0b):** Added `tests/unit/ApiGolden.test.ts` with 17 golden snapshot comparisons for Express REST endpoints (`/v1/jobs`, `/v1/jobs/:id`, `/v1/companies`, `/v1/facets`, `/v1/meta`, `/health`, 404s) covering both DB MISS and Redis cache HIT states.
- **Import & Path Resolution Safety Tests (P0b):** Added `tests/unit/PathResolution.test.ts` asserting import-time path isolation and current working directory resolution rules (`output/`, `apikeys/`, `extracted-slugs.json`).
- **Static Asset Routing Fallback Test (P0b):** Added `ApiNoStatic` test suite to `tests/unit/ApiServer.test.ts` verifying API 404 behavior when static frontend `dist` is missing.
- **Documentation Generator Test Suite (P0b):** Added `tests/unit/GenerateDocs.test.ts` testing custom root, output target, and exclusion logic.
- **Infrastructure & Configuration Verification Tests (P0b):** Added `scripts/repo-tests/vercel-config.test.mjs` (Vercel rewrite order, headers, function targets), `scripts/repo-tests/workflows.test.mjs` (action toggles, fixer permissions, working directories), and `scripts/repo-tests/move-manifest.test.mjs` (file tracking invariant across restructuring).
- **Official Migration Baseline (P0b):** Captured and committed official pre-migration verification baseline in `docs/monorepo-migration/baseline/` (Jest, Vitest, TypeScript, ESLint, any-counts, strict flags, production smoke).
- **Monorepo Migration Foundation (P0a):** Added migration blueprint `docs/monorepo-migration/PLAN.md`, progress tracker `docs/monorepo-migration/PROGRESS.md`, baseline capture and comparison tools (`scripts/migration/{capture-baseline,compare-results}.mjs`, `move-map.json`, `moved-tests.json`).
- **Production Smoke Script:** Added zero-body, read-only GET smoke verification script `scripts/smoke/smoke.mjs` checking health, jobs, facets, companies, and edge security headers.
- **Repo-Level Test Harness:** Added zero-dependency Node 24 test harness in `scripts/repo-tests/` with `_yaml-lite.mjs`, `secrets-ignore.test.mjs` (A18), and `toggles.test.mjs` (O11).
- **Unified Check Script:** Added layout-aware `scripts/check-all.sh` providing single-command verification across root and backend layouts.

### Changed
- **Fixer Scope Hardening (A19, O13, P1):** Updated `scripts/ci/check-fixer-scope.sh` to enforce AST-level JSON comparison (`node -e`) across `scripts`, `dependencies`, `devDependencies`, and `overrides` on any modified `package.json` between base ref and HEAD, failing immediately on alterations.
- **Baseline Metrics Capture (P1):** Updated `capture-baseline.mjs` to force `--rule '@typescript-eslint/no-explicit-any: error'` when measuring explicit any occurrences, re-capturing 148 occurrences across 21 source files in `docs/monorepo-migration/baseline/any-counts.json`.
- **PathResolution Safety Test Hardening (P1):** Enhanced `tests/unit/PathResolution.test.ts` to actively spy on `fs.existsSync` calls issued by `GoogleDriveOAuth`, `GoogleDriveUserOAuth`, `Seed`, and `ErrorTracker` under a temporary `process.chdir(tmpDir)`.
- **Prisma Factory Mock Accuracy & Golden Snapshot Realignment (P1):** Refined `tests/helpers/prismaFactory.ts` to restrict `w.OR` in-memory filtering strictly to clauses containing `id` or `ashbyId` matching, leaving other OR conditions unfiltered. In P0b, the mock dropped all rows for non-ID OR queries, which caused salary count queries (`OR: [{ salaryMin: { not: null } }, { salaryMax: { not: null } }]`) to return 0. Fixing this allows all 5 mock sample jobs with salaries to be accurately counted, updating `ApiGolden` snapshots from `withSalary: 0` / `hasSalary: { yes: 0, no: 5 }` to `withSalary: 5` / `hasSalary: { yes: 5, no: 0 }` across both DB MISS and cache HIT paths.
- **GenerateDocs Library Export (P0b):** Refactored `scripts/GenerateDocs.ts` into a callable `generate({ root, outFile })` function with a `require.main === module` CLI guard to support both pre- and post-P3a monorepo layouts.
- **CI Workflow Script Syntax Check (P0b):** Fixed recursive `.mjs` check in `.github/workflows/ci.yml` using `find scripts -name '*.mjs' -print0 | xargs -0 -n1 node --check`.

### Changed
- **Secret Hygiene & Permission Hardening (A18):** Hardened `.gitignore` to cover `.env*`, `!.env.example`, `.vercel/`, `**/apikeys/`, `**/output/`, and updated `.claude/settings.json` to deny reading sensitive patterns.
- **Workflow Stop-the-Line Toggles (O11):** Guarded daily scrape and weekly discovery workflows with `vars.SCRAPE_ENABLED`, `vars.FIXER_ENABLED`, and `vars.DISCOVERY_ENABLED`, and skipped company enrichment during fixture replay.
- **Frontend URL Filter Synchronization & Mobile Drawer Draft:** Bidirectional URL query synchronization (`useJobFilters`), mobile filter drawer draft applying once, scroll-to-top with h1 focus on page change, and server-aligned sort options (P5-T01, FE-03, FE-07, FE-16).
- **Shared QueryState Component & 429 Auto-Refetch:** Added `<QueryState>` handling loading indicators, 404 states, 5xx retries, and automatic countdown refetch based on `Retry-After` headers (P5-T02, FE-05, FE-06).
- **Companies Directory Pagination & Dynamic Total:** Paginated companies view with server-side paging, dynamic total count, and empty state search feedback (P5-T03, FE-04).
- **Dynamic Live Telemetry:** Replaced static job and company count literals with live metrics from `GET /v1/meta` across Header and navigation (P5-T04, FE-11).
- **SEO & Fallback Routing:** Added React 19 native `<title>` and `<meta>` tags across all routes, `public/robots.txt`, and dedicated 404 `NotFoundPage` (P5-T06, FE-13).
- **Performance Optimization & Bundle Chunking:** Lazy route loading, MUI and Redux vendor manualChunks chunk splitting, self-hosted `@fontsource-variable/geist` fonts, and dark theme initialization (P5-T08, FE-20, FE-21, FE-22, FE-24).
- **UI Architecture Documentation:** Complete documentation of UI components, routing, Redux/RTK data flow, and testing in `documentation/13-frontend-ui.md` (P5-T09, DOC-03).
- **Contract Tests & Fixtures:** Added `src/test/contract.test.ts` and `src/test/fixtures/` asserting strict parity with backend response schemas (P5-T10, FE-17, FE-23).
- **Weekly Discovery Workflow & Paging:** Added `.github/workflows/discover-weekly.yml` and expanded CommonCrawl / CDX pagination in `src/discovery/CdxWorker.ts` (P5-T11, OPS-10).

### Changed
- **Removed Client Rate Gate (ADR-0011):** Deleted `rateLimitSlice.ts` and client-side 10 req/min request throttling in RTK Query, relying exclusively on Vercel WAF rules and backend `DbGuard` backpressure (P5-T02, FE-05).
- **Accessibility & Touch Targets:** Enforced 44px minimum touch targets on mobile viewports, one h1 per page, `role="status"` on count elements, and proper aria attributes (P5-T05, FE-12, FE-25).

### Fixed
- **Cache and DB responses diverged (BF-019):** Cache HITs for `/v1/facets`, `/v1/meta` and `/v1/companies` were wrapped differently from the DB fallback (`{data: …}` vs bare objects), cached job pages lacked `meta.hasNext`/`hasPrev`, and only the first 100 companies were cached while the manifest advertised every page. The publisher now stores the exact DB-path bodies and pages through all companies. Guarded by `tests/unit/CacheParity.test.ts`.
- **API Redis client never connected (BF-019):** The `lazyConnect` + `enableOfflineQueue:false` API client rejected every command on a cold start, sending early requests to Postgres and counting toward the circuit breaker. `ReadThroughService` now connects an idle client once (shared promise) before issuing commands.
- **Fixer job could not run:** `if: env.X` conditions in `scrape-daily.yml` read variables defined only on the same step, so the Claude and PR steps were always skipped. A `Detect fixer secrets` step now exposes outputs; also pinned `download-artifact@v8` and added a docs-diff gate (ignoring the generated-date line) to `ci.yml` and the fixer gate.
- `/v1/meta` DB fallback now counts `hiringCompanies` over listed jobs, matching the publisher.
- **DOMPurify Hook & Closed-Job Banner (BF-013, FE-14, FE-15):** Implemented strict DOMPurify hook setting `target="_blank" rel="noopener noreferrer nofollow ugc"` and stripping inline styles; displayed closed-job banner and disabled both desktop and mobile Apply buttons when `active: false`. Guarded by `frontend/src/test/sanitize.test.ts`.
- **Double-Buffered Cache Generations (`jc:v1:*`):** Atomic cache publication pipeline swapping active generation pointers upon verified completion with 30% drop sanity gate (P2-T01, P2-T02, P2-T04, ADR-0003, GAP-CAC-02).
- **API Read-Through Service:** Express read-through service for jobs, companies, facets, and metadata backed by Upstash Redis with in-process LRU cache and circuit breaker fallback to Neon PostgreSQL (P2-T05, P2-T06, ADR-0001, ADR-0002, BF-018, GAP-API-03).
- **Detail Sharding & Negative Caching:** Detail queries mapped to 8 CRC32 shards with index fallback and 10-minute in-process negative LRU caching for confirmed 404 lookups (P2-T06, BF-018).
- **DbGuard Middleware & Edge Cache Headers:** Serverless PostgreSQL concurrency guard (max 3 concurrent queries, 503 backpressure, single-flight deduplication) and edge CDN cache-control headers (P2-T07, ADR-0011, GAP-API-05).
- **Telemetry Classifier & Error Report v2:** Structured error classification (`classifyReport`) generating `.issues.json` and v2 telemetry reports partitioned by month (`output/reports/<YYYY-MM>/<runId>.json`) (P1-T19, P1-T20).
- **CI Workflows & Scheduled Scrape:** GitHub Actions PR CI workflow (`ci.yml`) enforcing Node 24, typecheck, lint, tests, and UI verification, plus daily scheduled scrape workflow (`scrape-daily.yml`) running at 06:17 UTC with 4 worker processes and issue alerting (P3-T01, P3-T02, ADR-0010, GAP-CI-01).
- **Deployment & Operations Runbook:** Comprehensive documentation of free-tier quotas, secrets matrix, operational incident runbooks, and cost dashboards in `documentation/14-deployment-and-operations.md` (P3-T04).
- **Architecture Decision Records:** Established `documentation/decisions/` directory, template, and initial ADR index ADR-0001 through ADR-0012 (P4-T01, ADR-0001..0012, GAP-DOC-06).

### Changed
- **Enforced Node 24:** Added `.nvmrc` (`24`) and updated `package.json` engines to `>=24.0.0` (P3-T01).
- **Company Enrichment Backoff:** Updated `fetchOrganizationMetadata` to return structured status (`ok`, `not_found`, `rate_limited`, `error`) and back off via adaptive concurrency limiter on HTTP 429 (P3-T03, GAP-SCR-22).
- **Prisma Schema Additions:** Added `contentHash`, `pendingEmptySince`, `consecutiveFails`, `consecutive404s`, `lastHttpStatus`, and `quarantinedAt` columns to `Job` and `Company` models (P1-T04, P1-T05, P1-T06, ADR-0004, ADR-0009).

### Fixed
- **Limiter Event Loop Cooldown Retention (BF-014, SCR-09):** Removed `pauseTimer.unref()` in `Concurrency.ts` so active tasks finish during rate-limit pauses instead of terminating Node process prematurely. Guarded by `tests/unit/ConcurrencyExit.test.ts`.
- **Posting API Failure Classification & Retry-After (BF-015, SCR-11/12):** Scoped rate limiting strictly to HTTP 429, honored upstream `Retry-After` header capped at 10 s, and recorded structured `api_error` events on network/timeout exhaustion. Guarded by `tests/unit/AshbyClient.test.ts` and `tests/unit/ScraperRunAll.test.ts`.
- **GraphQL Overwrite Protection & Empty Board Deferral (BF-016, SCR-16/17):** Preserved rich REST job details from overwrite by fallback GraphQL records, and deferred job deactivation for companies with ≥ 5 jobs on single empty responses. Guarded by `tests/unit/ScraperRunAll.test.ts`.
- **Cache Publishing Isolation & Exit Codes (BF-017, CACHE-04, GAP-OPS-06):** Gated cache publishing on 100% worker success, emitted exit code 2 on publication or sanity gate failure, and properly recorded timestamps on `--skip-publish`. Guarded by `tests/unit/ClusterScraper.test.ts`.
- **API Salary Interval Filtering (BF-014, ADR-0007, GAP-API-01):** Backend query builder now ignores `salaryInterval` unless `salaryMin` or `salaryMax` is specified, preventing accidental omission of jobs without disclosed annual salaries. Guarded by `tests/unit/ApiServer.test.ts`.
- **Country Facet Normalization (BF-013, GAP-UI-01):** Implemented ISO-3166 alpha-2 country extraction and UI display name localization using `Intl.DisplayNames`. Guarded by `tests/unit/Country.test.ts` and UI test suites.

---

## [1.3.0] - 2026-10-23

### Added
- **Multi-Process Cluster Scraper (BF-008):** Parallel scraping across multiple OS worker processes with watchdog timeouts, SIGTERM handling, and aggregated telemetry output.
- **Verification Auditor (BF-009):** CLI command `npm run verify` (`src/utils/Verify.ts`) verifying database counts, salary distribution, and data integrity.
- **REST API Server (BF-012, BF-013):** Express REST API in `src/api/Server.ts` serving `/v1/jobs`, `/v1/jobs/:id`, `/v1/companies`, `/v1/facets`, and `/health`.
- **React 19 Web UI (BF-012, BF-013):** Modern web frontend in `frontend/` built with React 19, TypeScript, Vite, Tailwind CSS, and Redux Toolkit.
- **Company Enrichment & Discovery (BF-011):** CommonCrawl CDX index scraping (`src/discovery/CdxWorker.ts`) and logo/domain metadata extraction from Ashby board HTML.
- **Bulk Upsert & DB Optimization (BF-010):** Batch `createMany` fast path and database indexing.

### Changed
- **Query Builder Search Accumulation (BF-013):** Refactored API query builder to use `where.AND` preventing filter overwrite between text search and salary parameters.
- **Security Hardening (BF-013):** Added Content-Security-Policy headers, client IP resolution under trust proxy, and DOMPurify sanitization in frontend job description rendering.

### Fixed
- **Posting API Fallback to GraphQL (BF-001):** Automatic retry with exponential backoff and GraphQL fallback for boards returning 404/403/400.
- **JSONB Unicode & Surrogate Stripping (BF-002):** Stripped null bytes (`\u0000`), unpaired Unicode surrogates, and script tags before database insertion.
- **URL Validation & Canonical Fallback (BF-003):** Validated job application URLs with fallback to canonical Ashby job board URLs.
- **Validation Pre-Filter & Batch Fallback (BF-004):** Filtered malformed records before Prisma transactions with fallback to individual row persistence.
- **Salary Extraction & Null Clearing (BF-005):** Regex-based compensation parsing extracting min/max/currency/interval, properly clearing null values when compensation is removed upstream.
- **Department/Location Deduplication & Quarantine (BF-006):** In-memory deduplication of department and location records, streaming batch flushes, and 3-strike quarantine on dead boards.
- **CSV/Markdown Escaping (BF-007):** Quoted and sanitized special characters in CSV export mode (`src/core/ScraperCSV.ts`).
