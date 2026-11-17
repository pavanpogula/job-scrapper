# L5 — Enable Lever in the daily scrape (Antigravity prompt)

> Owner: only after L4 is merged AND you have (a) reviewed Lever's terms for showing their postings (we link every job
> back to `jobs.lever.co` for applying; their `jobs.lever.co/robots.txt` says `search=yes, use=reference`) and
> (b) run discover-weekly with `DISCOVERY_LEVER_ENABLED=true` and sent Claude the summary (number of Lever boards). Then
> paste "Read docs/plans/lever/L5-enable-lever.md and implement it exactly." Background: `00-PLAN.md`.

You are working in the Ashby Job Scraper monorepo. Implement ONE PR: let the daily scrape include Lever behind a repo
variable, with timing, rollback and docs. Squash-merge. Follow AGENTS.md, CLAUDE.md, docs/agents/context.md and every
rule in docs/agents/rules/ (ci-and-workflows, api-cache, scraper-invariants).

## HARD RULES (non-negotiable)
- Never read, print, stage, or commit `.env*`, `apikeys/`, `backend/apikeys/`, `output/`, `backend/output/`, `.vercel/`.
- Agents never push to `main`/`master`, never merge, never force-push, push tags or delete branches, and never run raw
  `git push` or `gh`. Publish only with `scripts/agents/push-branch.sh`. Owner reviews and merges.
- Never connect to production; no scrapes/publishes/deploys. Never add `--accept-data-loss` to any workflow.
- No new `any`. Commit before check-all. Never stage `.impeccable/`.

## PRECONDITION
- origin/main contains L4 (`backend/src/discovery/LeverDiscovery.ts`). Otherwise STOP. Branch: `feat/lv-5-enable`.

## BUILD
1. `.github/workflows/scrape-daily.yml`:
   - New job env `LEVER_ENABLED: ${{ vars.LEVER_ENABLED }}`. Keep `EFFECTIVE_SOURCES` a **job-level env expression**
     (≈77; `scripts/repo-tests/toggles.test.mjs:57-61` asserts on it — no bash step):
     `${{ inputs.sources != '' && inputs.sources || format('ashby{0}{1}', vars.GREENHOUSE_ENABLED == 'true' && ',greenhouse' || '', vars.LEVER_ENABLED == 'true' && ',lever' || '') }}`
     — identical result to today when `LEVER_ENABLED` is unset.
   - `sources` input description lists `lever`; `deactivate_source` choice gains `lever`.
   - New input `lever_max_boards` (default empty → the code default) passed as `--lever-max-boards=<n>` to
     `scrape:parallel` only when set.
   - No new summary step. The step summary is written by `npm run report:classify -- --step-summary` (≈154) from the
     "By Source" table in `ReportClassifier.ts` (≈471-479). Add to `SourceTelemetrySummary` (`ErrorTracker.ts`
     ≈224-235, merge ≈580-600) optional `durationMs` (merge = max) and, for Lever, `boardsAvailable` / `boardsCap`
     (merge = max). In `scrape:parallel` only the coordinator calls `selectCompanies`, so set
     `merged.summary.bySource.lever.boardsAvailable/boardsCap` in `runClusterScrape` right after `mergeReports`
     (single-process `scrape` sets them in `runAll`). Table columns: "Wall time", "Boards
     (scraped/available/cap)", "Skipped by deadline" (L2's `skippedByDeadline`).
2. `--lever-max-boards` default: keep **600** unless the L4 numbers say otherwise. Document next to the constant: at
   ≤ 1 Lever request/s for the whole run, `cap × 1 s` must stay under ~10 min, because the job has
   `timeout-minutes: 30`, each worker a 15-min watchdog (`SCRAPE_WORKER_TIMEOUT_MS=900000`), and Lever enrichment
   (≤ 200 boards ≈ 3.5 min at 1 req/s) runs in the same job before the scrape (≈118-121). The scrape runs 7×/day,
   so 600 per run ≈ 4,200 board-checks per day.
3. `source:deactivate` accepts `lever` (it should already via the L1 registry — add the test).
4. `EnrichCompanies` runs for Lever when `lever` is in `--sources` (pass `--sources=<effective>` as for Greenhouse).
5. Per-source sanity gate: already generic (`Publisher.ts` ≈224) — add a test with a `lever` baseline.

## TESTS
- Workflow repo tests (`toggles.test.mjs`): keep the GREENHOUSE assertion, add one for
  `vars.LEVER_ENABLED == 'true'` in `EFFECTIVE_SOURCES`; `lever_max_boards` passed only when set; never
  `--accept-data-loss`; `deactivate_source` options include `lever`.
- Publisher: `lever` drop > 30% from a baseline ≥ 100 gates; first Lever publish (no baseline) does not gate.
- `source:deactivate lever --dry-run` counts only Lever jobs.
- ClusterScraper: three sources interleaved; Lever pacer interval = 1000 ms × worker count in each worker.
- ErrorTracker `bySource.*.durationMs` merge = max.

## DOCS
`docs/deployment-and-operations.md` (enable, measure, roll back Lever), `docs/self-healing-loop.md`,
`backend/docs/cli-commands.md`, ADR-0022 → "Implemented", `docs/agents/context.md` (Multi-source line: Lever via
`LEVER_ENABLED`; byte budget) + sync-shells, root `AGENTS.md` Flow step 1 ("…populates `Company` rows from Ashby,
Greenhouse and Lever boards") + sync-shells, README sources, `backend/docs/known-issues.md` (Lever per-run cap and
deadline: a board can be up to one run stale beyond the 3-hour cadence), CHANGELOG, `docs:generate`.

## AGENT FILES (hard requirement)
Canonical sources only, then `node scripts/agents/sync-shells.mjs`:
- `docs/agents/rules/multi-source-ats.md` append: "13. Lever is enabled only by repo variable `LEVER_ENABLED`
  (Greenhouse: `GREENHOUSE_ENABLED`); emergency rollback = scrape-daily `deactivate_source=<source>`, then
  `publish_only` + `force_publish` when Redis is configured."
- `docs/agents/rules/ci-and-workflows.md` rule 5: add `GREENHOUSE_ENABLED`, `LEVER_ENABLED`.
- `docs/agents/roles/run-reviewer.md`: add "Lever `skippedByDeadline` > 0 on two consecutive runs or Lever wall time
  near 11 min → actionable (cap too high)."

## VERIFY
check-all · test:integration · repo tests · sync-shells --check.

## COMMIT + PUBLISH
`feat(ops): enable Lever in the daily scrape behind LEVER_ENABLED (ADR-0022)`; `scripts/agents/push-branch.sh`.

## ROLLOUT (PR body; owner, with Claude checking each step)
1. Merge. Nothing changes until the variable is set.
2. Measure: Actions → scrape-daily → Run workflow with `sources=ashby,greenhouse,lever`, `skip_publish=true`.
   **This is a real write**: Lever jobs land in the production database. DB-path views (search, `source=lever`) show
   them right away; if Redis is configured, cached default views only after the next publish. Send Claude the summary: total and per-source time, Lever boards scraped/cap, Lever jobs
   collected, errors by source, any 429s. If anything looks wrong, run scrape-daily with `deactivate_source=lever`.
3. If healthy: set repo variable `LEVER_ENABLED=true`; next scheduled run includes Lever.
4. No deploy needed (UI shipped in L3). Claude checks `/v1/jobs?source=lever`, `/v1/facets` and the UI live.
5. Rollback: set `LEVER_ENABLED=false` → scrape-daily `deactivate_source=lever` → (only if Redis is configured)
   scrape-daily `publish_only=true` + `force_publish=true`. Lever companies stay in the DB, hidden (no active jobs).
