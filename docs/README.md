# Documentation Routing Guide & Index

> **Purpose:** Authoritative documentation index for humans and AI agents.
> Every document has a single clear purpose and owner. Consult this index to find the exact documentation file needed.

---

## 1. Workflows & Pipelines

| Workflow | Schedule / Trigger | Purpose | Workflow File | Primary Documentation |
|---|---|---|---|---|
| **Daily Scrape & Publish** | Cron `17 6 * * *` (06:17 UTC) / manual `workflow_dispatch` | Scrapes active boards with adaptive concurrency, writes PostgreSQL, atomically publishes generations to Upstash Redis (`jc:v1:*`), uploads telemetry report | [`.github/workflows/scrape-daily.yml`](../.github/workflows/scrape-daily.yml) | [`docs/deployment-and-operations.md`](./deployment-and-operations.md), [`backend/docs/architecture-and-workflows.md`](../backend/docs/architecture-and-workflows.md) |
| **Weekly Discovery** | Cron `0 4 * * 0` (04:00 UTC Sun) / manual `workflow_dispatch` | Discovers new Ashby ATS slugs from Wayback Machine CDX API, validates patterns, updates seeds | [`.github/workflows/discover-weekly.yml`](../.github/workflows/discover-weekly.yml) | [`backend/docs/cli-commands.md`](../backend/docs/cli-commands.md), [`backend/docs/external-apis.md`](../backend/docs/external-apis.md) |
| **Backend CI** | PRs / pushes (`backend/**`) | Verifies Prisma generation, typecheck, lint, Jest test suite (37 suites / 264 tests), and docs sync | [`.github/workflows/backend-ci.yml`](../.github/workflows/backend-ci.yml) | [`backend/docs/testing.md`](../backend/docs/testing.md) |
| **Frontend CI** | PRs / pushes (`frontend/**`) | Verifies TypeScript, ESLint, Vitest component suite (5 suites / 14 tests), and Vite production build | [`.github/workflows/frontend-ci.yml`](../.github/workflows/frontend-ci.yml) | [`frontend/docs/testing.md`](../frontend/docs/testing.md) |
| **Repo CI** | PRs / pushes (all) | Runs zero-dependency Node 24 native repo tests, pinned actionlint, and fixer scope checks | [`.github/workflows/repo-ci.yml`](../.github/workflows/repo-ci.yml) | [`docs/testing.md`](./testing.md) |

---

## 2. Repository Map

```
job-scrapper/
├── backend/                  # Node.js batch scraper, Prisma ORM, Express REST API
│   ├── api/index.ts          # Vercel serverless entry point
│   ├── src/                  # Scraper core, discovery, API Server, cache read-through
│   ├── prisma/               # Schema and migrations (PostgreSQL Neon)
│   ├── tests/                # Jest unit and e2e test suites
│   ├── vercel.json           # API serverless deployment configuration
│   ├── README.md             # Backend setup and local developer guide
│   └── docs/                 # Backend-specific architecture and guides
├── frontend/                 # React 19 SPA (Vite + TypeScript + Redux Toolkit + MUI)
│   ├── src/                  # Components, Redux store, RTK Query API, pages
│   ├── vercel.json           # Frontend SPA configuration and API proxy rewrites
│   ├── README.md             # Frontend setup and local developer guide
│   └── docs/                 # Frontend-specific UI and component guides
├── docs/                     # Central repository documentation
│   ├── decisions/            # Architecture Decision Records (ADR-0001 through ADR-0015)
│   ├── agents/               # Canonical agent context, roster, and role definitions
│   ├── archive/              # Preserved historical planning documentation
│   ├── monorepo-migration/   # Monorepo migration plan, progress, and backlog
│   └── README.md             # This central index
└── scripts/                  # Cross-workspace automation and verification
    ├── check-all.sh          # Single canonical verification script
    └── repo-tests/           # Zero-dependency Node 24 invariant test harness
```

---

## 3. "If You Need X → Look in Y" (Agent Fact-Owner Table)

| If you need to know about… | Look in… |
|---|---|
| End-to-end architecture and sequence flows | [`docs/system-architecture-and-flows.md`](./system-architecture-and-flows.md) |
| Central high-level system overview | [`docs/overview.md`](./overview.md) |
| Daily scraping, concurrency limits, and retry logic | [`backend/docs/architecture-and-workflows.md`](../backend/docs/architecture-and-workflows.md) |
| External APIs (Ashby REST/GraphQL, Wayback CDX, Drive) | [`backend/docs/external-apis.md`](../backend/docs/external-apis.md) |
| CLI commands, parameters, and flags | [`backend/docs/cli-commands.md`](../backend/docs/cli-commands.md) |
| Database schema, Prisma relations, and Redis keys | [`backend/docs/database-and-cache.md`](../backend/docs/database-and-cache.md) |
| Module-by-module code reference and exports | [`backend/docs/module-reference.md`](../backend/docs/module-reference.md) |
| Environment variables and configuration | [`backend/docs/configuration.md`](../backend/docs/configuration.md) |
| Output artifacts, CSV format, and error reports | [`backend/docs/outputs-and-artifacts.md`](../backend/docs/outputs-and-artifacts.md) |
| Backend bugs, debt, and gotchas | [`backend/docs/known-issues.md`](../backend/docs/known-issues.md) |
| Frontend bugs, debt, and contract alignments | [`frontend/docs/known-issues.md`](../frontend/docs/known-issues.md) |
| Bug fix invariants (`BF-001` through `BF-019+`) | [`docs/bug-fix-log.md`](./bug-fix-log.md) |
| Testing pyramid, mocks, and repo tests | [`docs/testing.md`](./testing.md), [`backend/docs/testing.md`](../backend/docs/testing.md), [`frontend/docs/testing.md`](../frontend/docs/testing.md) |
| Express REST API contract & endpoints | [`backend/docs/api.md`](../backend/docs/api.md) |
| Frontend UI routes, Redux store, and components | [`frontend/docs/frontend-ui.md`](../frontend/docs/frontend-ui.md) |
| Vercel deployment, branch protection, and operations | [`docs/deployment-and-operations.md`](./deployment-and-operations.md) |
| Self-healing loop and bugfix protocol | [`docs/self-healing-loop.md`](./self-healing-loop.md) |
| Canonical agent roles and permissions | [`docs/agents/roster.md`](./agents/roster.md), [`docs/agents/context.md`](./agents/context.md) |

---

## 4. Full Documentation Index

### Repository Root Docs (`docs/`)
- [`overview.md`](./overview.md): High-level system overview and architectural stack.
- [`system-architecture-and-flows.md`](./system-architecture-and-flows.md): Complete Mermaid architecture, sequence flows, and subsystem interactions.
- [`deployment-and-operations.md`](./deployment-and-operations.md): Deployment runbooks for Vercel, Neon, Upstash, and GitHub Actions.
- [`self-healing-loop.md`](./self-healing-loop.md): Autonomous error triage, bug-fix protocol, and invariant validation.
- [`bug-fix-log.md`](./bug-fix-log.md): Central registry of bug fixes (`BF-*`) and regression invariants.
- [`testing.md`](./testing.md): Monorepo-wide testing guide and test harness map.

### Backend Documentation (`backend/docs/`)
- [`architecture-and-workflows.md`](../backend/docs/architecture-and-workflows.md): Scraper pipeline, concurrency throttling, and publishing workflows.
- [`external-apis.md`](../backend/docs/external-apis.md): Specifications for Ashby Posting API, hosted GraphQL, and Wayback CDX.
- [`cli-commands.md`](../backend/docs/cli-commands.md): Complete reference for all CLI commands (`scrape`, `discover`, `seed`, `verify`).
- [`database-and-cache.md`](../backend/docs/database-and-cache.md): PostgreSQL Prisma schema, indexing strategy, and Upstash Redis schema.
- [`module-reference.md`](../backend/docs/module-reference.md): Source module reference, public methods, and dependency relationships.
- [`configuration.md`](../backend/docs/configuration.md): Environment variables, credentials, and configuration guidelines.
- [`outputs-and-artifacts.md`](../backend/docs/outputs-and-artifacts.md): Scraper output formats, CSV schemas, and telemetry reports.
- [`known-issues.md`](../backend/docs/known-issues.md): Active and resolved technical debt items for backend systems.
- [`api.md`](../backend/docs/api.md): Express REST API contracts, routes, and query parameters.
- [`testing.md`](../backend/docs/testing.md): Backend Jest test suite, Prisma/Redis mocking, and execution instructions.
- [`google-drive-setup.md`](../backend/docs/google-drive-setup.md): Google Drive API credentials and cloud upload configuration.

### Frontend Documentation (`frontend/docs/`)
- [`frontend-ui.md`](../frontend/docs/frontend-ui.md): React 19 component hierarchy, Redux RTK Query state, and responsive layout.
- [`known-issues.md`](../frontend/docs/known-issues.md): UI technical debt and contract alignment tracking.
- [`testing.md`](../frontend/docs/testing.md): Vitest component test suites, MSW network mocking, and setup guide.

### Canonical Agent Documentation (`docs/agents/`)
- [`roster.md`](./agents/roster.md): Canonical agent roster and routing guide.
- [`context.md`](./agents/context.md): Authoritative quick context for AI coding agents.
- **Roles:**
  - [`api-cache.md`](./agents/roles/api-cache.md)
  - [`docs-release-keeper.md`](./agents/roles/docs-release-keeper.md)
  - [`frontend.md`](./agents/roles/frontend.md)
  - [`run-reviewer.md`](./agents/roles/run-reviewer.md)
  - [`scraper-architect.md`](./agents/roles/scraper-architect.md)
  - [`scraper-bugfixer.md`](./agents/roles/scraper-bugfixer.md)
- **Rules:**
  - [`context.md`](./agents/rules/context.md)
  - [`secrets-and-git.md`](./agents/rules/secrets-and-git.md)
  - [`changelog-and-commits.md`](./agents/rules/changelog-and-commits.md)
  - [`api-contract-sync.md`](./agents/rules/api-contract-sync.md)
  - [`ci-and-workflows.md`](./agents/rules/ci-and-workflows.md)
  - [`scraper-invariants.md`](./agents/rules/scraper-invariants.md)
  - [`api-cache.md`](./agents/rules/api-cache.md)
  - [`prisma-schema.md`](./agents/rules/prisma-schema.md)
  - [`frontend-invariants.md`](./agents/rules/frontend-invariants.md)
  - [`frontend-design.md`](./agents/rules/frontend-design.md)

---

## 5. Architecture Decision Records (ADRs)

All decisions are recorded under [`docs/decisions/`](./decisions/README.md):
- [ADR Index & Guidelines](./decisions/README.md)
- [ADR-0000: Architecture Decision Record Template](./decisions/ADR-0000-template.md)
- [ADR-0001: Postgres as Source of Truth](./decisions/ADR-0001-postgres-source-of-truth.md)
- [ADR-0002: Upstash Redis with No HMAC](./decisions/ADR-0002-upstash-redis-no-hmac.md)
- [ADR-0003: Immutable Cache Generations](./decisions/ADR-0003-immutable-cache-generations.md)
- [ADR-0004: PostgreSQL DB ContentHash Detection](./decisions/ADR-0004-db-content-hash-detection.md)
- [ADR-0005: CI Fixer on Claude Code Action](./decisions/ADR-0005-ci-fixer-claude-code.md)
- [ADR-0006: Fixer Uses Branches and Pull Requests](./decisions/ADR-0006-fixer-branch-and-pr.md)
- [ADR-0007: Salary Interval Semantics](./decisions/ADR-0007-salary-interval-semantics.md)
- [ADR-0008: Canonical Agent Context](./decisions/ADR-0008-canonical-agent-context.md)
- [ADR-0009: Company Health and Quarantine](./decisions/ADR-0009-company-health-and-quarantine.md)
- [ADR-0010: Daily Scheduled Scrape Pipeline](./decisions/ADR-0010-daily-scheduled-scrape.md)
- [ADR-0011: Rate Limiting via WAF and DbGuard](./decisions/ADR-0011-rate-limiting-waf-and-dbguard.md)
- [ADR-0012: Fix Attempt Tracking via GitHub Issues](./decisions/ADR-0012-fix-attempt-tracking.md)
- [ADR-0013: Monorepo Layout with Root Orchestration](./decisions/ADR-0013-monorepo-layout.md)
- [ADR-0014: Independent Vercel Projects and WAF Risk](./decisions/ADR-0014-vercel-split-and-waf.md)
- [ADR-0015: Synchronized API Contract Fixtures](./decisions/ADR-0015-type-contract-and-fixtures.md)
- [ADR-0017: Agents Publish Task Branches via a Guarded Push Script](./decisions/ADR-0017-agent-branch-pushes.md)

---

## 6. Archives & Migration

- **Initial Enhancement Plan Archive:** [`docs/archive/2026-10-initial-plan/`](./archive/2026-10-initial-plan/00-README.md) (preserved historical planning documents).
- **Monorepo Migration Documentation:**
  - Plan: [`docs/monorepo-migration/PLAN.md`](./monorepo-migration/PLAN.md)
  - Progress: [`docs/monorepo-migration/PROGRESS.md`](./monorepo-migration/PROGRESS.md)
  - Backlog: [`docs/monorepo-migration/BACKLOG.md`](./monorepo-migration/BACKLOG.md)

---

## 7. Known Follow-Ups

- **Weekly Discovery CDX Cap (Backlog Item B1):** The weekly slug discovery workflow is currently throttled by the Wayback Machine CDX API 1,000-result page cap. Documented and tracked for evaluation in [`docs/monorepo-migration/BACKLOG.md`](./monorepo-migration/BACKLOG.md#b1-weekly-discovery-only-sees-1000-archived-urls-per-run).
