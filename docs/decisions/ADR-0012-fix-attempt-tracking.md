# ADR-0012: Fix-attempt tracking via fix-failed GitHub issues

- Status: Accepted
- Date: 2026-10-24
- Deciders: owner, scraper-architect agent
- Related: D-12, GAP-CI-04

## Context
When an automated bugfix agent fails to fix an error or introduces a failing test, running the agent again on the next daily scrape risks an infinite loop of repeated, unsuccessful pull requests and consumed runner/LLM tokens.

## Options Considered
1. **Local state file in repo or cache**: Storing attempt counters in a file in git requires committing failed state back to `main`, violating git branch safety invariants.
2. **Redis key counter**: Couples CI execution tracking to Redis availability and pollutes data storage.
3. **GitHub Issues with labels**: Track fix attempts via GitHub issues labeled `fix-failed` carrying the error fingerprint `<!-- fp:<hash> -->`. If a fingerprint fails more than once (`fixAttempts >= 2`), label the issue `needs-human` and halt automated attempts until a human intervenes.

## Decision
Track automated fix attempts using GitHub Issues labelled `fix-failed` indexed by error fingerprint. When the fixer fails to produce a passing PR, it updates or creates the issue. If attempts reach 2, further automated attempts are blocked and the issue is flagged for human triage.

## Consequences
- Prevents runaway token and CI minute consumption on stubborn errors.
- Clean audit trail directly within GitHub Issues visible to repository maintainers.
- Implemented in `scripts/ci/record-fix-attempt.sh` and documented in `documentation/16-self-healing-loop.md`.
