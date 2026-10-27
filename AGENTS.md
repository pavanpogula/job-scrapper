# AGENTS.md

The **Ashby Job Scraper** (product name: **B.O.O.L.E.A.N**) is a batch TypeScript CLI scraper feeding Neon PostgreSQL and Upstash Redis (`jc:v1:*` cache-first architecture), an Express REST API deployed on Vercel (`backend/api/index.ts` invoking `backend/src/api/Server.ts`), and a React 19 web application in `frontend/` for browsing direct company job postings. Users only browse and click Apply (no logins).

## Flow
1. **Discover & Seed:** `npm run discover` / `npm run seed [-- --all]` populates `Company` rows from Ashby ATS slugs.
2. **Scrape:** `npm run scrape:parallel [-- --workers=N]` scrapes active boards with adaptive concurrency, retry/backoff, and GraphQL fallback. (Scheduled daily by GitHub Actions: `.github/workflows/scrape-daily.yml`).
3. **Persist & Publish:** Writes companies, departments, locations, and jobs to PostgreSQL (Prisma). On clean scrape, atomically publishes double-buffered cache generations to Upstash Redis (`jc:v1:*`) with details diffing and a 30% drop sanity gate.
4. **API:** Express 5 server in `backend/src/api/Server.ts` (invoked via `backend/api/index.ts` on Vercel) serves `/v1/jobs`, `/v1/jobs/:id`, `/v1/companies`, `/v1/facets`, `/v1/meta`, and `/health` via `ReadThroughService` with CircuitBreaker, DbGuard backpressure, and edge CDN headers.
5. **UI:** React 19 + TypeScript + Vite + Redux Toolkit application in `frontend/` queries the API. See system flows in `docs/system-architecture-and-flows.md`.
6. **Deploy:** Deploys are manual: Vercel git deploys are off, so a push or merge never changes the live site; the owner runs the **Deploy to Vercel** workflow (`.github/workflows/deploy.yml`, ADR-0016).

## Hard Rules
- **Secrets & Outputs:** Never read, print, stage, or commit `.env`, `apikeys/`, or `output/` values.
- **Git Safety:** Agents never push to `main`/`master`, never merge, never force-push, push tags or delete branches, and never run raw `git push` or `gh`. Publish or update a task branch only with `scripts/agents/push-branch.sh` (fast-forward only; it prints the pull-request link). The owner reviews and merges.
- **Mandatory Checks:** Every change must pass `scripts/check-all.sh --no-install`.
- **Explorer Sync:** Every change must run `npm --prefix backend run docs:generate` to regenerate `backend/docs/project-explorer.html`.
- **JSDoc Headers:** Every new file and function gets a JSDoc `@file` / `@summary` / `@tags` block.
- **Conventional Commits:** Commit with conventional prefix (`feat:`, `fix:`, `chore:`, `docs:`) and a multi-line bulleted body explaining root cause, changes, tests, and docs.

## Agent Roles (Roster)
Full details in `docs/agents/roster.md`:
| Role | Purpose |
|---|---|
| `scraper-architect` | Explains architecture and writes plans; never edits code. |
| `run-reviewer` | Triages error reports: actionable vs noise. |
| `scraper-bugfixer` | Implements bug fixes following the self-healing protocol. |
| `api-cache` | Owns Express API, cache layers, Vercel config, and API contracts. |
| `frontend` | Owns `frontend/**` web application and UI tests. |
| `docs-release-keeper` | Maintains documentation integrity, stamps, and release docs. |

## Self-Healing Loop
Every scrape writes a v2 error report partitioned by month (`output/reports/<YYYY-MM>/<runId>.json`) and updated to `output/latest-<mode>.json`. Actionable issues trigger automated investigation, a regression-guarded fix on a branch, documentation of decisions in `docs/decisions/`, and release notes in `CHANGELOG.md`. All fixes must strictly adhere to the 9-step Bug-Fix Agent Protocol detailed in `docs/self-healing-loop.md`.

## Documentation Map
| Topic | Document |
|---|---|
| Architecture & workflows | `backend/docs/architecture-and-workflows.md` |
| External APIs (Ashby, CDX, Drive) | `backend/docs/external-apis.md` |
| CLI commands & scripts | `backend/docs/cli-commands.md` |
| Database & cache schema | `backend/docs/database-and-cache.md` |
| Module reference | `backend/docs/module-reference.md` |
| Setup & configuration | `backend/docs/configuration.md` |
| Outputs & reports | `backend/docs/outputs-and-artifacts.md` |
| Known issues & debt | `backend/docs/known-issues.md` · `frontend/docs/known-issues.md` |
| Bug fix log & invariants | `docs/bug-fix-log.md` |
| Testing guide & invariant guards | `docs/testing.md` |
| Backend API & cache read-through | `backend/docs/api.md` |
| Frontend UI & routes | `frontend/docs/frontend-ui.md` |
| Deployment & operations runbook | `docs/deployment-and-operations.md` |
| Full documentation index | `docs/README.md` |
