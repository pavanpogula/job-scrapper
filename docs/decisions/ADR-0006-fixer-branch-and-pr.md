# ADR-0006: The fixer works on a branch and opens a PR; it never touches main

- Status: Accepted (interactive agents may publish non-`main` branches via a guarded script: see ADR-0017)
- Date: 2026-10-24
- Deciders: owner, scraper-architect agent
- Related: D-08, D-09, GAP-CI-02

## Context
Automated self-healing agents that directly commit or push to `main` pose severe risks: accidental regressions, untested edge cases, infinite fix loops, or database corruption without human oversight.

## Options Considered
1. **Direct push to main**: Autonomous agents push fixes directly to `main`. Extremely unsafe; risks breaking production scrapers and deployments.
2. **Branch and Pull Request with automated CI gates**: The agent creates an isolated branch (`auto-fix/<runId>`), writes a failing test and fix, commits using Conventional Commits, and opens a GitHub Pull Request labelled `auto-fix` for human review and merge.

## Decision
Agents must never push to `main` and never merge. All autonomous fixes must be made on a task or `auto-fix/<runId>` branch, validated through standard CI workflows, and submitted as a GitHub Pull Request requiring owner review.

## Consequences
- Zero risk of unreviewed code reaching production.
- Branch protection rules enforce PR approvals and CI status checks before any code reaches `main`.
- Enforced by `scripts/ci/check-fixer-scope.sh` and repository branch protection policies.
