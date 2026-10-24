# AGENTS.md

The **Ashby Job Scraper** is a batch TypeScript CLI scraper feeding Neon PostgreSQL and Upstash Redis (planned: P2 cache-first), an Express REST API deployed on Vercel (planned: P2 cache-first; today queries PostgreSQL directly), and a React 19 web application in `job-scrapper-ui/` for browsing public Ashby job postings. Users only browse and click Apply (no logins).

## Flow
1. **Discover & Seed:** `npm run discover` / `npm run seed [-- --all]` populates `Company` rows from Ashby ATS slugs.
2. **Scrape:** `npm run scrape:parallel [-- --workers=N]` scrapes active boards with adaptive concurrency, retry/backoff, and GraphQL fallback. (Scheduled daily GitHub Actions planned: P3).
3. **Persist:** Writes companies, departments, locations, and jobs to PostgreSQL (Prisma). Cache publishing to Upstash Redis (`jc:v1:*`) is planned: P2.
4. **API:** Express 5 server in `src/api/Server.ts` (invoked via `api/index.ts` on Vercel) serves `/v1/jobs`, `/v1/jobs/:id`, `/v1/companies`, `/v1/facets`, and `/health`.
5. **UI:** React 19 + TypeScript + Vite + Redux Toolkit application in `job-scrapper-ui/` queries the API. See system flows in `documentation/15-system-architecture-and-flows.md` (planned: P1-T22).

## Hard Rules
- **Secrets & Outputs:** Never read, print, stage, or commit `.env`, `apikeys/`, or `output/` values.
- **Git Safety:** Agents never push to `main` and never merge. Work on task/phase branches only.
- **Mandatory Checks:** Every change must pass `npx tsc --noEmit -p . && npm run lint && npm test` (plus `npm run verify:ui` once P1-T19 lands).
- **Explorer Sync:** Every change must run `npm run docs:generate` to regenerate `docs/project-explorer.html`.
- **JSDoc Headers:** Every new file and function gets a JSDoc `@file` / `@summary` / `@tags` block.
- **Conventional Commits:** Commit with conventional prefix (`feat:`, `fix:`, `chore:`, `docs:`) and a multi-line bulleted body explaining root cause, changes, tests, and docs.

## Agent Roles (Roster)
Full details in `documentation/agents/roster.md` (planned: P4-T04):
| Role | Purpose |
|---|---|
| `scraper-architect` | Explains architecture and writes plans; never edits code. |
| `run-reviewer` | Triages error reports: actionable vs noise. |
| `scraper-bugfixer` | Implements bug fixes following the self-healing protocol. |
| `api-cache` | Owns Express API, cache layers, Vercel config, and API contracts. |
| `frontend` | Owns `job-scrapper-ui/**` web application and UI tests. |
| `docs-release-keeper` | Maintains documentation integrity, stamps, and release docs. |

## Self-Healing Loop
Every scrape writes an error report (`output/latest-error-report.json`, v2 format planned: P1-T10). Actionable issues trigger automated investigation, a regression-guarded fix on a branch, documentation of decisions in `documentation/decisions/` (planned: P4-T01), and release notes in `CHANGELOG.md` (planned: P4-T02). See `documentation/16-self-healing-loop.md` (planned: P4-T03).

## Documentation Map
| Topic | Document |
|---|---|
| Architecture & workflows | `documentation/02-architecture-and-workflows.md` |
| External APIs (Ashby, CDX, Drive) | `documentation/03-external-apis.md` |
| CLI commands & scripts | `documentation/04-cli-commands.md` |
| Database & cache schema | `documentation/05-database-and-cache.md` |
| Module reference | `documentation/06-module-reference.md` |
| Setup & configuration | `documentation/07-configuration-and-setup.md` |
| Outputs & reports | `documentation/08-outputs-and-artifacts.md` |
| Known issues & debt | `documentation/09-known-issues-and-tech-debt.md` |
| Bug fix log & invariants | `documentation/10-bug-fix-and-improvement-log.md` |
| Testing guide & invariant guards | `documentation/11-testing-guide.md` |
| Enhancement plan (roadmap) | `documentation/plan/00-README.md` |
