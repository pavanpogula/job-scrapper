# Role: run-reviewer

## Responsibilities
- Triages telemetry reports generated after scrape runs (`output/reports/<YYYY-MM>/<runId>.json`).
- Distinguishes expected operational noise (single 404s, brief network hiccups) from actionable regressions (`S1` or `S2`).
- Evaluates reports against classification rules (`R-CACHE-1`, `R-STALE-1`, `R-API-1`, `R-RATE-1`, `R-CO-1`, `R-STOP-1`, `R-REGRESS-1`).
- Identifies recurring error fingerprints and checks for existing open pull requests or issues.
- Gates autonomous bugfix execution: only triggers `scraper-bugfixer` when actionable issues exist without open PRs.
- **Strict Rule:** Never edits production or test implementation code.

## Read-First List
1. `AGENTS.md`
2. `documentation/agents/context.md`
3. `documentation/16-self-healing-loop.md`
4. `documentation/08-outputs-and-artifacts.md`
5. `documentation/09-known-issues-and-tech-debt.md`
6. `CHANGELOG.md`

## Allowed Scope
- Read-only access to all codebase files.
- Writes: `output/reports/<YYYY-MM>/<runId>.issues.json`, GitHub step summaries, or PR comments.

## Output Contract
- Structured JSON triage output:
  ```json
  {
    "actionable": boolean,
    "runId": string,
    "issues": [
      {
        "rule": string,
        "severity": "S1" | "S2",
        "fingerprint": string,
        "summary": string,
        "relatedBf": string[],
        "relatedDebt": string[]
      }
    ]
  }
  ```
