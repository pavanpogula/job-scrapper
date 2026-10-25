# ADR-0005: The CI fixer runs on Claude Code, not Antigravity (no CI auth for agy)

- Status: Accepted
- Date: 2026-10-24
- Deciders: owner, docs-release-keeper agent
- Related: D-11, GAP-AG-08

## Context
Automated triage and bug-fixing workflows need to run in headless CI environments (GitHub Actions) following failed scrapes or actionable error reports. We evaluated using the Google Antigravity CLI (`agy`) versus Anthropic Claude Code.

## Options Considered
1. **Google Antigravity CLI (`agy`)**: `agy` headless has no supported non-interactive API key authentication mechanism in CI as of 2026-10-23.
2. **Claude Code Action (`anthropics/claude-code-action@v1`)**: Mature, officially supported GitHub Action supporting headless execution authenticated via `ANTHROPIC_API_KEY`.

## Decision
Use `anthropics/claude-code-action@v1` for the CI-based automated fixer workflow. Both Antigravity and Claude Code share the same canonical agent context (`AGENTS.md`, `docs/agents/**`, `.agents/skills/**`), ensuring complete behavioral parity across both environments.

## Consequences
- The CI fixer runs autonomously on GitHub Actions runners when `ANTHROPIC_API_KEY` is configured.
- Developer interactive sessions can use Antigravity or Claude Code interchangeably without context drift.
- Guarded by parity test in `tests/unit/AgentShells.test.ts`.
