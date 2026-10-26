# Architecture Decision Records (ADRs)

This directory documents key architectural decisions, rationale, and consequences for the **Ashby Job Scraper** platform.

Every ADR follows the template defined in [ADR-0000-template.md](./ADR-0000-template.md).

---

## Decision Index

| ADR ID | Title | Status | Date | Related Decisions / Issues |
|---|---|:---:|:---:|---|
| [ADR-0000](./ADR-0000-template.md) | ADR Template | Template | — | — |
| [ADR-0001](./ADR-0001-postgres-source-of-truth.md) | Postgres is the source of truth; cache-first API falls back to Postgres | Accepted | 2026-10-24 | D-01, BF-017, GAP-API-03 |
| [ADR-0002](./ADR-0002-upstash-redis-no-hmac.md) | Upstash instead of Redis Cloud; no HMAC envelope | Accepted | 2026-10-24 | D-02, GAP-CAC-01 |
| [ADR-0003](./ADR-0003-immutable-cache-generations.md) | Immutable cache generations with atomic pointer swap and publisher single writer | Accepted | 2026-10-24 | D-03, GAP-CAC-02 |
| [ADR-0004](./ADR-0004-db-content-hash-detection.md) | Remove Redis change detection in favour of DB contentHash | Accepted | 2026-10-24 | D-04, GAP-CAC-03, GAP-SCR-02 |
| [ADR-0005](./ADR-0005-ci-fixer-claude-code.md) | CI fixer runs on Claude Code, not Antigravity (no CI auth for agy) | Accepted | 2026-10-24 | D-11, GAP-AG-08 |
| [ADR-0006](./ADR-0006-fixer-branch-and-pr.md) | The fixer works on a branch and opens a PR; never touches main | Accepted | 2026-10-24 | D-08, D-09, GAP-CI-02 |
| [ADR-0007](./ADR-0007-salary-interval-semantics.md) | salaryInterval semantics: ignored unless salaryMin is set | Accepted | 2026-10-24 | D-07, BF-014, GAP-API-01 |
| [ADR-0008](./ADR-0008-canonical-agent-context.md) | One canonical agent context shared by Claude Code and Antigravity | Accepted | 2026-10-24 | D-14, GAP-AG-01, GAP-AG-02 |
| [ADR-0009](./ADR-0009-company-health-and-quarantine.md) | Persisted company health counters and the quarantine | Accepted | 2026-10-24 | D-10, GAP-SCR-06, GAP-DB-02 |
| [ADR-0010](./ADR-0010-daily-scheduled-scrape.md) | Daily GitHub Actions schedule (06:17 UTC, --workers=4) | Accepted | 2026-10-24 | D-15, GAP-CI-01 |
| [ADR-0011](./ADR-0011-rate-limiting-waf-and-dbguard.md) | Rate limiting: one Vercel WAF rule plus dbGuard; in-memory/client gates removed | Accepted | 2026-10-24 | D-16, BF-016, GAP-API-05, GAP-API-06 |
| [ADR-0012](./ADR-0012-fix-attempt-tracking.md) | Fix-attempt tracking via fix-failed GitHub issues | Accepted | 2026-10-24 | D-12, GAP-CI-04 |
| [ADR-0013](./ADR-0013-monorepo-layout.md) | Monorepo layout with nested workspaces and root orchestration | Accepted | 2026-10-25 | O12, P0a-P3b |
| [ADR-0014](./ADR-0014-vercel-split-and-waf.md) | Independent Vercel projects for backend API and frontend SPA with WAF risk acceptance | Accepted | 2026-10-25 | O9, P3a, PR #6, PR #7 |
| [ADR-0015](./ADR-0015-type-contract-and-fixtures.md) | Synchronized API contract fixtures and type parity between backend and frontend | Accepted | 2026-10-25 | O3, O4, O5, O6, O14, P8a |
| [ADR-0016](./ADR-0016-manual-vercel-deploys.md) | Manual Vercel deploys from a GitHub Actions workflow | Accepted | 2026-10-26 | ADR-0014, P3a |
| [ADR-0017](./ADR-0017-agent-branch-pushes.md) | Agents publish task branches through a guarded push script | Accepted | 2026-10-26 | ADR-0006, ADR-0016 |
| [ADR-0018](./ADR-0018-job-last-updated-detection.md) | Job last-updated time is detected by content-hash change | Accepted | 2026-10-26 | BF-011, ADR-0004 |

---

## ADR Guidelines
1. When proposing architectural or structural changes, duplicate `ADR-0000-template.md` as `ADR-<nnnn>-<kebab-title>.md`.
2. Clearly state options considered, the chosen decision, and resulting consequences or invariants.
3. Update this index upon acceptance.
