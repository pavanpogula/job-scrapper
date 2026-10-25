---
name: review-run
description: "Triage a scrape run report: classify actionable vs noise."
---

1. Read the target run report `output/reports/<YYYY-MM>/<runId>.json` and historical run telemetry.
2. Apply the classification rules documented in `docs/self-healing-loop.md` §2 (`R-CACHE-1`, `R-STALE-1`, `R-API-1`, `R-RATE-1`, `R-CO-1`, `R-STOP-1`, `R-REGRESS-1`).
3. Check open `auto-fix` PRs for matching error fingerprints. In CI, `scripts/ci/open-fix-pr.sh` does this with `gh` (it has a token). Local agents cannot run `gh` (denied in `.claude/settings.json`), so ask the owner to check https://github.com/pavanpogula/job-scrapper/pulls?q=is%3Aopen+label%3Aauto-fix.
4. Output structured triage JSON to `output/reports/<YYYY-MM>/<runId>.issues.json` containing `actionable`, `runId`, and prioritized `issues[]`.
