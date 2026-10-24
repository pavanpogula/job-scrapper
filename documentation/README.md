# 📚 Job Scraper — Project Context Documentation

> **Purpose of this folder:** A single, authoritative source of context for humans *and AI agents*
> working on this repository. Read this index first, then open only the file(s) relevant to your task.
>
> _Last full analysis: 2026-10-23 (P1-T04: Redis change detection removed from scraper per D-06)._

---

## ⚡ TL;DR (30-second summary)

- **What it is:** A batch TypeScript CLI scraper feeding Neon PostgreSQL and Upstash Redis (planned: P2), an Express REST API deployed on Vercel, and a React 19 SPA frontend in `job-scrapper-ui/` for exploring public Ashby job boards.
- **How it works:**
  1. **Discover** company slugs from Wayback Machine CDX API (`npm run discover`) or load seeds (`npm run seed [-- --all]`).
  2. **Scrape** active boards via Ashby's Posting API with adaptive rate limiting and hosted GraphQL fallback (`npm run scrape:parallel`).
  3. **Persist** to PostgreSQL in 100-job streaming batches. (Cache generation publishing to Upstash Redis `jc:v1:*` is planned: P2).
  4. **Serve** via Express REST API (`/v1/jobs`, `/v1/jobs/:id`, `/v1/companies`, `/v1/facets`, `/health`) running as a Vercel serverless function.
  5. **Display** in React 19 UI with debounced search, facet filtering, and Redux Toolkit caching.
- **Stack:** TypeScript 5 · Prisma 5 (PostgreSQL / Neon) · Express 5 · React 19 · Vite 6 · Redux Toolkit · Material UI · ioredis · axios.
- **Scale:** ~3,072 discovered slugs → 33,997 collected / 34,023 active jobs across ~1,747 hiring companies scraped in 76.3s via 4 workers.

---

## 🗂️ Document Index

| # | File | Read it when you need… |
|---|------|------------------------|
| 01 | [01-overview.md](./01-overview.md) | Purpose, tech stack, directory layout, git/repo state |
| 02 | [02-architecture-and-workflows.md](./02-architecture-and-workflows.md) | End-to-end data flow, sequence diagrams, workflow details |
| 03 | [03-external-apis.md](./03-external-apis.md) | External APIs consumed (Ashby REST/GraphQL, Wayback CDX, Drive) |
| 04 | [04-cli-commands.md](./04-cli-commands.md) | CLI commands, arguments, flags, and outputs |
| 05 | [05-database-and-cache.md](./05-database-and-cache.md) | Prisma schema, relations, indexes, Redis keys, field mapping |
| 06 | [06-module-reference.md](./06-module-reference.md) | Module-by-module reference with symbol links |
| 07 | [07-configuration-and-setup.md](./07-configuration-and-setup.md) | Environment variables, credentials, auth setup |
| 08 | [08-outputs-and-artifacts.md](./08-outputs-and-artifacts.md) | CSV format, JOBS.md, extracted-slugs.json, reports |
| 09 | [09-known-issues-and-tech-debt.md](./09-known-issues-and-tech-debt.md) | Verified bugs, technical debt, and improvement items |
| 10 | [10-bug-fix-and-improvement-log.md](./10-bug-fix-and-improvement-log.md) | Bug fix log, Regression Guard Registry (`BF-001`…`BF-013`) |
| 11 | [11-testing-guide.md](./11-testing-guide.md) | Testing strategy, mocking, invariant guard status |
| 12 | 12-backend-api.md *(planned: P2-T09)* | Backend REST API contract and cache read path |
| 13 | 13-frontend-ui.md *(planned: P5-T09)* | Frontend routes, state, and UI component architecture |
| 14 | 14-deployment-and-operations.md *(planned: P3-T04)* | Vercel, GitHub Actions, Neon, Upstash operations & runbook |
| 15 | 15-system-architecture-and-flows.md *(planned: P1-T22)* | End-to-end Mermaid architecture and sequence flows |
| 16 | 16-self-healing-loop.md *(planned: P4-T03)* | The automated error report, triage, fix, and release loop |
| plan | [plan/00-README.md](./plan/00-README.md) | Phased enhancement plan (P0–P5 roadmap) |

---

## 🏛️ Fact-Owner Table

Every fact has a single canonical source of truth. Consult the owner doc:

| Fact | Owner Document |
|---|---|
| Database schema, contentHash fields, field mapping | `documentation/05-database-and-cache.md` |
| Redis key schema and cache semantics | `documentation/05-database-and-cache.md` (summary), `plan/03-cache-design.md` |
| External APIs called (Ashby, CDX, Drive) | `documentation/03-external-apis.md` |
| Internal REST API contract | `documentation/plan/04-backend-api-plan.md` (planned: `12-backend-api.md`) |
| UI routes, state, and API client | `documentation/plan/06-frontend-plan.md` (planned: `13-frontend-ui.md`) |
| Environment variables | `documentation/07-configuration-and-setup.md` |
| CLI commands | `documentation/04-cli-commands.md` |
| Deployment, schedule, secrets, runbook | `documentation/plan/02-target-architecture.md` (planned: `14-deployment-and-operations.md`) |
| System flows | `documentation/plan/02-target-architecture.md` (planned: `15-system-architecture-and-flows.md`) |
| Self-healing protocol | `documentation/plan/07-error-report-and-self-healing-loop.md` (planned: `16-self-healing-loop.md`) |
| BF invariants and guard status | `documentation/10-bug-fix-and-improvement-log.md` (registry) + `11-testing-guide.md` §6 |
| Known issues | `documentation/09-known-issues-and-tech-debt.md` |
| History | Commit history (planned: `CHANGELOG.md` + `documentation/decisions/`) |

---

## 🤖 Guidance for AI Agents

1. **Architecture Stack:**
   - **Backend API:** `src/api/Server.ts` (Express 5, runs locally on port 3001 and as a Vercel serverless function via `api/index.ts`).
   - **Frontend UI:** `job-scrapper-ui/` (Vite, React 19, Redux Toolkit, Material UI).
   - **Scrapers:** `src/core/Scraper.ts` (core DB scraper), `src/core/ClusterScraper.ts` (multi-process coordinator), `src/core/ScraperCSV.ts` (CSV streaming).
2. **Scraper Pipeline:** All scraping uses `src/lib/AshbyClient.ts` (`fetchAshbyBoardWithFallback` with browser headers, retries, and GraphQL fallback on 404/403/400).
3. **Adaptive Concurrency:** `createLimiter()` in `src/lib/Concurrency.ts` throttles request rates dynamically on 429 rate limits.
4. **Execution on Import:** `src/database/DbMenu.ts`, `src/database/DbInspect.ts`, and `scripts/GenerateDocs.ts` run on import—never import them into other modules.
5. **Secrets & Safety:** Secrets live in `.env` (gitignored). Never read, print, or commit secret keys or `output/` values. Agents never push to `main` and never merge.
6. **Verification Scope:** `npx tsc --noEmit -p .` and `npm run lint` cover `src/` only today (expansion planned: P3-T01). Tests use a global Prisma manual mock (`__mocks__/@prisma/client.ts`).
7. **Default Change Rule:** Every change must: (a) update docs and `AGENTS.md`, (b) run `npm run docs:generate`, (c) pass all tests/lint/tsc, and (d) commit with a Conventional Commit and bulleted body.
