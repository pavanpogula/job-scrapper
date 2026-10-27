# Agent Roster & Routing Guide

This document defines the specialized agent roster, read-first order, allowed file editing scopes, and routing table for the **Ashby Job Scraper** codebase.

Every role must read `AGENTS.md`, then `docs/agents/context.md`, then its own role file in `docs/agents/roles/<role>.md`, before taking any action.

---

## Agent Roster

| Role | Job Description | Reads First (beyond shared context) | Allowed Edit Scope | Output Contract |
|---|---|---|---|---|
| [`scraper-architect`](./roles/scraper-architect.md) | Explains system behavior and authors architectural plans; never edits implementation code. | `docs/system-architecture-and-flows.md`, `backend/docs/architecture-and-workflows.md`, `backend/docs/database-and-cache.md`, `docs/bug-fix-log.md` | Read-only across codebase; writes `docs/archive/2026-10-initial-plan/**`, `docs/decisions/**` | Architectural explanation, RFC, or step-by-step implementation plan citing `file:line`. |
| [`run-reviewer`](./roles/run-reviewer.md) | Triages scrape telemetry reports, classifies actionable regressions vs normal noise, gates the fixer. | `docs/self-healing-loop.md`, `backend/docs/outputs-and-artifacts.md`, `backend/docs/known-issues.md`, `CHANGELOG.md` | Read-only; generates `output/reports/<YYYY-MM>/<runId>.issues.json` | JSON triage report `{ actionable: boolean, issues: [...] }` referencing BF and debt IDs. |
| [`scraper-bugfixer`](./roles/scraper-bugfixer.md) | Diagnoses root causes, implements bug fixes following the self-healing protocol, and authors regression invariant guards. | `CHANGELOG.md`, `docs/decisions/README.md`, `docs/self-healing-loop.md`, `docs/bug-fix-log.md`, `docs/testing.md` §6, `backend/docs/known-issues.md` | `backend/src/lib/**`, `backend/src/core/**`, `backend/src/database/**`, `backend/src/discovery/**`, `backend/src/utils/**`, `backend/tests/**`, `backend/prisma/schema.prisma` (additive only; locked during migration G1-G5), `docs/**`, `CHANGELOG.md` | Branch commit series, failing regression test first, BF entry in doc 10, ADR, CHANGELOG entry, run summary. |
| [`api-cache`](./roles/api-cache.md) | Owns the Express REST API, Redis cache read-through, circuit breaker, rate limiting, and Vercel edge deployment configuration. | `backend/docs/api.md`, `backend/docs/database-and-cache.md`, `docs/archive/2026-10-initial-plan/03-cache-design.md`, `docs/archive/2026-10-initial-plan/04-backend-api-plan.md`, `docs/deployment-and-operations.md` | `backend/src/api/**`, `backend/api/**`, `backend/src/lib/cache/**`, `backend/src/cache/**`, `backend/vercel.json`, `backend/tests/unit/{ApiServer,ReadThrough,Breaker,CacheKeys,Publisher}*` | Code, tests, and API/cache documentation updates. |
| [`frontend`](./roles/frontend.md) | Owns the React 19 web application in `frontend/`, Redux Toolkit data flow, search/filter UX, and UI component polish. | `frontend/docs/frontend-ui.md`, `backend/docs/api.md`, `frontend/src/types/api.ts` | `frontend/**` | React components, Redux slices, Material UI (MUI) components, and Vitest test suites. |
| [`docs-release-keeper`](./roles/docs-release-keeper.md) | Maintains documentation integrity, cuts releases, keeps ADR index and CHANGELOG, regenerates explorer documentation, and audits agent parity. | `docs/README.md`, `CHANGELOG.md`, `docs/decisions/README.md`, `docs/agents/**` | `docs/**`, `CHANGELOG.md`, `README.md`, `AGENTS.md`, `CLAUDE.md`, `.claude/**`, `.agents/**` | Documentation commits, release PRs, regenerated `docs/project-explorer.html`. |

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
