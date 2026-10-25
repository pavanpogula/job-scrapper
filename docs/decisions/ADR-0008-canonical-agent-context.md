# ADR-0008: One canonical agent context shared by Claude Code and Antigravity

- Status: Accepted
- Date: 2026-10-24
- Deciders: owner, docs-release-keeper agent
- Related: D-14, GAP-AG-01, GAP-AG-02

## Context
Maintaining independent sets of prompt files, instructions, and rules for multiple AI agent tools (Claude Code vs Google Antigravity) rapidly leads to documentation drift, divergent agent behavior, and conflicting operational assumptions.

## Options Considered
1. **Separate agent configurations**: Maintain `.claude/` instructions and Antigravity `.agents/` instructions separately. Leads to drift and duplicate maintenance overhead.
2. **Canonical documentation core with thin platform shells**: Maintain one authoritative set of agent roles, skills, and constraints in `AGENTS.md`, `documentation/agents/**`, and `.agents/skills/**`. Provide lightweight adapter shells in `.claude/agents/` and `.agents/agents/` referencing the canonical sources, verified by automated parity tests.

## Decision
Establish `AGENTS.md` and `documentation/agents/**` as the single canonical context for all agent environments. Thin adapter shells map tool-specific interfaces to these shared definitions, and an automated parity test guarantees synchronization.

## Consequences
- Single source of truth for all agent personas and operational invariants.
- Immediate parity between local interactive development (Antigravity/Claude Code) and CI runners (Claude Code).
- Guarded by `tests/unit/AgentShells.test.ts`.
