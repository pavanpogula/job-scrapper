# Agent Roster & Routing Guide

This document defines the specialized agent roster, read-first order, allowed file editing scopes, and routing table for the **Ashby Job Scraper** codebase.

Every role must read `AGENTS.md`, then `documentation/agents/context.md`, then its own role file in `documentation/agents/roles/<role>.md`, before taking any action.

---

## Agent Roster

| Role | Job Description | Reads First (beyond shared context) | Allowed Edit Scope | Output Contract |
|---|---|---|---|---|
| [`scraper-architect`](./roles/scraper-architect.md) | Explains system behavior and authors architectural plans; never edits implementation code. | `documentation/15-system-architecture-and-flows.md`, `documentation/02-architecture-and-workflows.md`, `documentation/05-database-and-cache.md`, `documentation/10-bug-fix-and-improvement-log.md` | Read-only across codebase; writes `documentation/plan/**`, `documentation/decisions/**` | Architectural explanation, RFC, or step-by-step implementation plan citing `file:line`. |
| [`run-reviewer`](./roles/run-reviewer.md) | Triages scrape telemetry reports, classifies actionable regressions vs normal noise, gates the fixer. | `documentation/16-self-healing-loop.md`, `documentation/08-outputs-and-artifacts.md`, `documentation/09-known-issues-and-tech-debt.md`, `CHANGELOG.md` | Read-only; generates `output/reports/<YYYY-MM>/<runId>.issues.json` | JSON triage report `{ actionable: boolean, issues: [...] }` referencing BF and debt IDs. |
| [`scraper-bugfixer`](./roles/scraper-bugfixer.md) | Diagnoses root causes, implements bug fixes following the self-healing protocol, and authors regression invariant guards. | `CHANGELOG.md`, `documentation/decisions/README.md`, `documentation/16-self-healing-loop.md`, `documentation/10-bug-fix-and-improvement-log.md`, `documentation/11-testing-guide.md` §6, `documentation/09-known-issues-and-tech-debt.md` | `src/lib/**`, `src/core/**`, `src/database/**`, `src/discovery/**`, `src/utils/**`, `tests/**`, `prisma/schema.prisma` (additive only), `documentation/**`, `CHANGELOG.md` | Branch commit series, failing regression test first, BF entry in doc 10, ADR, CHANGELOG entry, run summary. |
| [`api-cache`](./roles/api-cache.md) | Owns the Express REST API, Redis cache read-through, circuit breaker, rate limiting, and Vercel edge deployment configuration. | `documentation/12-backend-api.md`, `documentation/05-database-and-cache.md`, `documentation/plan/03-cache-design.md`, `documentation/plan/04-backend-api-plan.md`, `documentation/14-deployment-and-operations.md` | `src/api/**`, `api/**`, `src/lib/cache/**`, `src/cache/**`, `vercel.json`, `tests/unit/{ApiServer,ReadThrough,Breaker,CacheKeys,Publisher}*` | Code, tests, and API/cache documentation updates. |
| [`frontend`](./roles/frontend.md) | Owns the React 19 web application in `job-scrapper-ui/`, Redux Toolkit data flow, search/filter UX, and UI component polish. | `documentation/13-frontend-ui.md`, `documentation/12-backend-api.md`, `job-scrapper-ui/src/types/api.ts` | `job-scrapper-ui/**` | React components, Redux slices, Tailwind styles, and Vitest test suites. |
| [`docs-release-keeper`](./roles/docs-release-keeper.md) | Maintains documentation integrity, cuts releases, keeps ADR index and CHANGELOG, regenerates explorer documentation, and audits agent parity. | `documentation/README.md`, `CHANGELOG.md`, `documentation/decisions/README.md`, `documentation/agents/**` | `documentation/**`, `CHANGELOG.md`, `README.md`, `AGENTS.md`, `CLAUDE.md`, `.claude/**`, `.agents/**` | Documentation commits, release PRs, regenerated `docs/project-explorer.html`. |

---

## Routing Table

When incoming tasks or issues arrive, route them according to this mapping:

| User Intent / Trigger Event | Primary Role | Secondary Role / Handoff |
|---|---|---|
| "Explain how this works", "design an architecture", "write a plan" | `scraper-architect` | — |
| Scrape run completed, triage error report, classify telemetry | `run-reviewer` | Handoff to `scraper-bugfixer` if actionable issues exist |
| Bug fix, scraper exception, data pipeline error, failing invariant | `scraper-bugfixer` | Review by `docs-release-keeper` |
| REST endpoint changes, cache synchronization, Vercel config, circuit breaker | `api-cache` | Handoff to `frontend` if contract changes |
| Web UI styling, search filters, detail drawer, mobile responsiveness | `frontend` | Handoff to `api-cache` if API schema additions needed |
| Release tagging, CHANGELOG sync, ADR management, docs regeneration | `docs-release-keeper` | — |
