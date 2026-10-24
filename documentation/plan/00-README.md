# Enhancement Plan: Index

> **Status:** planning only; nothing here is implemented yet. Written 2026-10-23 at HEAD `22afd64`. An implementing
> agent (a different session or LLM) will execute it. The paste-ready prompt for that agent is at the end of
> [`12-implementation-roadmap.md`](./12-implementation-roadmap.md).

## 1. What the owner asked for

1. **Frontend:** the React UI (`job-scrapper-ui/`) displays jobs: browse, search, filter, paginate, and Apply. There
   are no logins.
2. **Backend:** the Express API reads the cache first. Postgres is only the fail-safe, used when the cache misses, has
   been deleted, or Redis is down.
3. **Scraper:** it scrapes and updates the DB and the cache in the same run, as **parallel** tasks on a schedule. It
   must be fully working, with a correct README and agent-friendly docs on the flow and architecture.
4. **Agents:** Claude Code and Antigravity agents that load the scraper context on launch.
5. **Self-healing loop:**
   - Every run writes an error doc.
   - An agent reads it, fixes the issues, and records the decision in a decision document.
   - After the commit, the release documentation is updated with the bug fix and its solution.
   - The next agent reads all of that before it fixes anything.

## 2. Reading order

| # | File | Read when you need |
|---|---|---|
| 01 | [current state and gaps](./01-current-state-and-gap-analysis.md) | What is broken or missing today, with `path:line` evidence. The gap IDs are used everywhere. |
| 02 | [target architecture](./02-target-architecture.md) | Component, sequence and state diagrams; invariants; failure modes |
| 03 | [cache design](./03-cache-design.md) | Upstash limits, the `jc:v1:*` key schema, the publish and read algorithms |
| 04 | [backend API plan](./04-backend-api-plan.md) | The contract to keep, the read pipeline, `/health`, rate limiting, indexes, env vars |
| 05 | [scraper plan](./05-scraper-plan.md) | Correctness fixes, company health, country normalization, publishing, exit codes, the scheduled run |
| 06 | [frontend plan](./06-frontend-plan.md) | UI bugs, tooling, and polish tasks |
| 07 | [error report and self-healing loop](./07-error-report-and-self-healing-loop.md) | Error doc v2, classifier rules, the ADR and CHANGELOG formats, CI workflows, guardrails, the protocol |
| 08 | [agent setup](./08-agent-setup-claude-and-antigravity.md) | The Claude Code and Antigravity file layout, roster, skills, settings, parity test, cold-start test |
| 09 | [documentation plan](./09-documentation-plan.md) | The target doc structure, fact owners, the README rewrite, the list of factual fixes |
| 10 | [testing and verification](./10-testing-and-verification-plan.md) | Every new suite, the BF guard map, live checks per phase |
| 11 | [decisions, questions, risks](./11-open-questions-and-decisions.md) | D-01…D-16 (final), Q-01…Q-17 (with defaults), risks, the validation log |
| 12 | [implementation roadmap](./12-implementation-roadmap.md) | Phased tasks P0…P5 with acceptance commands, plus the **implementer prompt** |

## 3. How the implementer uses this

1. Read `AGENTS.md` and `CLAUDE.md`, then 00 → 12 in order.
2. Execute 12 task by task. Each task row points back to its design section and gaps.
3. Treat the decisions in 11 as final. When the code disagrees with the plan, trust the code, note the difference in
   the commit body, and make the smallest adjustment that works.
4. P0 is for the owner: accounts, secrets, the GitHub App, branch protection, and the WAF rule. If a P0 result is
   missing, ask for exactly that.

## 4. How this plan was produced and validated

- **Audit:** 5 parallel read-only auditors (frontend with the impeccable critique, API/cache with the Postgres
  best-practices skill, scraper/ops, docs/Antigravity, Claude Code formats). The raw findings were merged into these
  files.
- **Owner decisions** (2026-10-23):
  - Redis provider: Redis Cloud first, then switched to **Upstash** after the audit.
  - Schedule: **GitHub Actions, daily**.
  - Fixer: **branch, commit and PR** for review, triggered **automatically after each scheduled scrape**.
  - The **Next.js design package was retired**.
- **Validation:** two rounds by fresh agents, recorded in 11 §4.
  - Round 1: a fact check of claims against the code and dated sources.
  - Round 2: a cross-file consistency check (every gap has a task, every task has a gap, names are consistent) and a
    cold-start read of this folder alone.

## 5. Glossary

| Term | Meaning |
|---|---|
| **Generation (`gen`)** | An immutable snapshot of pre-rendered API responses in Redis (`jc:v1:gen:<gen>`). `jc:v1:current` points to the live one. |
| **Manifest** | The `__manifest` field of a generation. It lists the cached views, totals and size, and is written last. |
| **Canonical key** | A normalized query string used as the field name inside a generation (03 §3.2). |
| **Publisher** | `src/cache/Publisher.ts`, the only writer of `jc:v1:*`. |
| **Run id** | `<UTC timestamp>-<mode>-<sha>`, the identity of one scrape run and its report. |
| **Fingerprint** | A stable hash of one issue type in a report, used to dedupe and track it across runs. |
| **Actionable** | A report issue that the classifier (07 §3) says should trigger the fixer. |
| **BF-nnn** | A regression-guard entry in doc 10: the fix, its invariant, and the test that guards it. |
| **ADR-nnnn** | An architecture decision record in `documentation/decisions/`. |
| **GAP-xx-nn** | A gap in 01. Every task in 12 names the gaps it closes. |
| **D-nn / Q-nn** | A final decision or an open question in 11. |
| **doc NN** vs **NN §x** | "doc NN" (or "doc NN:line") means the repo doc `documentation/NN-*.md`. A bare "NN §x", or a link like `[03](./03-…)`, means the plan file `documentation/plan/NN-*.md`. "09 #NN" is an issue number in `documentation/09-known-issues-and-tech-debt.md`. |
