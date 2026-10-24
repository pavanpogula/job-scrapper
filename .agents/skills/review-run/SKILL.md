---
name: review-run
description: "Triage a scrape run report: classify actionable vs noise."
---

1. Read the target run report `output/reports/<YYYY-MM>/<runId>.json` and historical run telemetry.
2. Apply the classification rules documented in `documentation/16-self-healing-loop.md` §2 (`R-CACHE-1`, `R-STALE-1`, `R-API-1`, `R-RATE-1`, `R-CO-1`, `R-STOP-1`, `R-REGRESS-1`).
3. Check open PRs for matching error fingerprints using `gh pr list --label auto-fix`.
4. Output structured triage JSON to `output/reports/<YYYY-MM>/<runId>.issues.json` containing `actionable`, `runId`, and prioritized `issues[]`.
