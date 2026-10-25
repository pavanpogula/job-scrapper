# Ashby Job Scraper

A TypeScript monorepo providing a high-performance batch scraper feeding Neon PostgreSQL and Upstash Redis (`jc:v1:*` cache-first architecture), a serverless Express REST API deployed on Vercel, and a modern React 19 web application for browsing and filtering public Ashby job postings.

- **Live UI:** [https://job-scrapper-ui.vercel.app](https://job-scrapper-ui.vercel.app)
- **Live API:** [https://job-scrapper-api-eight.vercel.app](https://job-scrapper-api-eight.vercel.app)

---

## Workflows & Pipelines

| Workflow | Trigger | Description | Workflow File | Documentation |
|---|---|---|---|---|
| **Daily Scrape & Publish** | Cron `17 6 * * *` / dispatch | Scrapes active boards with adaptive concurrency, writes PostgreSQL, publishes generation cache to Upstash Redis | [`.github/workflows/scrape-daily.yml`](.github/workflows/scrape-daily.yml) | [`docs/deployment-and-operations.md`](docs/deployment-and-operations.md) |
| **Weekly Slug Discovery** | Cron `0 4 * * 0` / dispatch | Discovers new Ashby ATS company slugs via Wayback Machine CDX API | [`.github/workflows/discover-weekly.yml`](.github/workflows/discover-weekly.yml) | [`backend/docs/cli-commands.md`](backend/docs/cli-commands.md) |
| **Backend CI** | PRs / pushes (`backend/**`) | Verifies backend Prisma, types, lint, Jest test suite, and docs generation | [`.github/workflows/backend-ci.yml`](.github/workflows/backend-ci.yml) | [`backend/docs/testing.md`](backend/docs/testing.md) |
| **Frontend CI** | PRs / pushes (`frontend/**`) | Verifies frontend TypeScript, ESLint, Vitest component suite, and Vite build | [`.github/workflows/frontend-ci.yml`](.github/workflows/frontend-ci.yml) | [`frontend/docs/testing.md`](frontend/docs/testing.md) |
| **Repo CI** | PRs / pushes (all) | Runs zero-dependency Node 24 repo tests, pinned actionlint, and fixer scope checks | [`.github/workflows/repo-ci.yml`](.github/workflows/repo-ci.yml) | [`docs/testing.md`](docs/testing.md) |

---

## Repository Structure

```
job-scrapper/
├── backend/                  # Batch scraper, Prisma ORM, Express REST API
│   ├── src/                  # Scraper core, discovery, API Server, cache read-through
│   ├── prisma/               # PostgreSQL schema & migrations
│   ├── tests/                # Jest unit & e2e test suites
│   ├── vercel.json           # Vercel serverless function configuration (Root: backend)
│   └── README.md             # Backend setup, scripts, and local guide
├── frontend/                 # React 19 SPA (Vite + TypeScript + Redux Toolkit + MUI)
│   ├── src/                  # React components, RTK Query API, router
│   ├── vercel.json           # Vercel SPA configuration + proxy rewrites (Root: frontend)
│   └── README.md             # Frontend setup, scripts, and local guide
├── docs/                     # Project-wide documentation, architecture, ADRs, runs
│   ├── decisions/            # Architecture Decision Records (ADR-0001 through ADR-0015)
│   ├── agents/               # Canonical agent context, roster, and role definitions
│   ├── archive/              # Historical planning artifacts
│   └── README.md             # Complete documentation routing index
└── scripts/                  # Unified verification & migration tooling
    ├── check-all.sh          # Single canonical verification script across all workspaces
    └── repo-tests/           # Zero-dependency Node 24 native invariant test harness
```

---

## Quick Navigation

- **Central Documentation Index:** [`docs/README.md`](docs/README.md)
- **Backend Setup & Guide:** [`backend/README.md`](backend/README.md)
- **Frontend Setup & Guide:** [`frontend/README.md`](frontend/README.md)
- **System Architecture & Data Flows:** [`docs/system-architecture-and-flows.md`](docs/system-architecture-and-flows.md)
- **Bug Fix & Invariant Log:** [`docs/bug-fix-log.md`](docs/bug-fix-log.md)
- **Agent Rules & Safety:** [`AGENTS.md`](AGENTS.md) and [`CLAUDE.md`](CLAUDE.md)

---

## Verification

Run all mandatory checks across backend, frontend, and repository tests with:
```bash
scripts/check-all.sh --no-install
```
