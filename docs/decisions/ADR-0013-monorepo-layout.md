# ADR-0013: Monorepo layout with nested workspaces and root orchestration

- Status: Accepted
- Date: 2026-10-25
- Deciders: owner, scraper-architect agent
- Related: O12, P0a-P3b

## Context
The repository evolved from a root-level Node/TypeScript project with a nested `job-scrapper-ui` folder into a structured monorepo containing a batch scraper + Express API (`backend/`) and a React 19 SPA (`frontend/`). A clean boundary was required to prevent dependency coupling, simplify CI pipelines, and eliminate root-level configuration pollution.

## Options Considered
1. **Root workspace package manager (npm / pnpm / yarn workspaces):** Uses a root `package.json` with shared `node_modules`. Introduces version hoisting risks, phantom dependencies, and complicates isolated serverless builds on Vercel.
2. **Independent package monorepo with root orchestrators:** `backend/` and `frontend/` maintain independent `package.json` files, lockfiles, and dependencies. The root directory contains only orchestrators (`scripts/`), CI workflows (`.github/workflows/`), agent configurations (`.agents/`, `.claude/`), and documentation (`docs/`). Codex agent integration follows O12 default: nested `AGENTS.md` + skills only without `.codex/agents/*.toml` duplication.

## Decision
Adopt Option 2: independent packages with root orchestration.
- `backend/` and `frontend/` have zero dependency on root `package.json`.
- Root contains no `package.json`, `node_modules`, `src/`, `tests/`, or `vercel.json`.
- Invariant is strictly enforced by `scripts/repo-tests/layout.test.mjs`.
- Codex agent integration uses nested `AGENTS.md` and shared skills only per decision O12.

## Consequences
- Clean dependency trees and zero hoisting bugs.
- Fast, isolated CI pipelines for backend and frontend.
- Root layout is strictly enforced by automated regression tests.
