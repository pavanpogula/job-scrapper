# L6 — Wire the staged scrape into scrape-daily and enable Lever (Antigravity prompt)

> Owner: only after L5 is merged AND (a) you have reviewed Lever's terms for showing their postings (we link every job
> back to `jobs.lever.co` for applying; their `jobs.lever.co/robots.txt` says `search=yes, use=reference`) and (b) the
> backend and frontend are deployed on L3 or later. Then paste "Read docs/plans/lever/L6-enable-lever.md and implement it
> exactly." Background: `00-PLAN.md`. Nothing changes in production until you set the two repo variables.

You are working in the Ashby Job Scraper monorepo (product: B.O.O.L.E.A.N). Implement ONE PR: let the scheduled daily
scrape run **staged** (ashby → greenhouse → lever, one publish at the end) and include Lever, both behind repo
variables, with timeouts, rollback, docs and agent files. Squash-merge. Follow AGENTS.md, CLAUDE.md,
docs/agents/context.md and every rule in docs/agents/rules/ (ci-and-workflows, multi-source-ats, scraper-invariants).

## HARD RULES (non-negotiable)
- Never read, print, stage, or commit `.env*`, `apikeys/`, `backend/apikeys/`, `output/`, `backend/output/`, `.vercel/`.
- Agents never push to `main`/`master`, never merge, never force-push, push tags or delete branches, and never run raw
  `git push` or `gh`. Publish only with `scripts/agents/push-branch.sh`. Owner reviews and merges.
- Never connect to production; no scrapes/publishes/deploys. Never add `--accept-data-loss` to any workflow.
- `deploy.yml` stays manual-only (ADR-0016). No new `any`. Commit before check-all. Never stage `.impeccable/`.
- With both new variables unset the scheduled run must be **identical to today** (same sources, same arguments, same
  30-min-style behaviour except the longer job timeout).

## PRECONDITION
- origin/main contains L5 (`backend/tests/unit/StagedScrape.test.ts`, `--staged`). Otherwise STOP.
  Branch `feat/lv-6-enable-lever` from `origin/main`.

## TIMING BUDGET (put this table in the docs; the numbers are the design)
| Part | Expected | Worst case (hard stop) |
|---|---|---|
| checkout, `npm ci`, prisma, typecheck, `db push` | 3 min | 5 min |
| enrichment (Greenhouse ≤ 200 + Lever ≤ 200 boards, ≤ 1 req/s for Lever) | 4–7 min | 8 min |
| Ashby stage (~1,700 boards) | 6 min | 15 min (worker watchdog) |
| Greenhouse stage (~1,700 boards) | 8 min | 15 min (worker watchdog) |
| Lever stage (~1,800 boards at ≤ 1 req/s, 1 worker) | 50–55 min | 75 min (`--lever-stage-min=70` + 5) |
| classify, artifacts, cache saves | 1 min | 2 min |
| **Total** | **~75–80 min** | **~120 min** |
`timeout-minutes` for the `scrape` job becomes **150**: above the 120-min worst case and below the 180-min cadence
(7 runs/day, 3 hours apart), so a run can never overlap the next one. Free GitHub Actions (public repo) allows this:
standard runners are free and unlimited for public repositories, a job may run up to 6 h, 20 jobs run concurrently, the
cache is 10 GB per repo (entries unused for 7 days are evicted), and scheduled workflows stop after 60 days without repo
activity. Put these limits and a "verify at docs.github.com/actions" note in `docs/deployment-and-operations.md`.

## BUILD — `.github/workflows/scrape-daily.yml` (workflow-level `concurrency` stays; do not add job-level concurrency)
1. `scrape` job: `timeout-minutes: 150`. Add a comment with the timing table's worst case and the 180-min cadence.
2. Job `env`: add `LEVER_ENABLED: ${{ vars.LEVER_ENABLED }}` and `STAGED_SCRAPE: ${{ vars.STAGED_SCRAPE }}`. Keep
   `EFFECTIVE_SOURCES` a **job-level env expression** (`scripts/repo-tests/toggles.test.mjs` asserts on it — no bash step):
   `${{ inputs.sources != '' && inputs.sources || format('ashby{0}{1}', vars.GREENHOUSE_ENABLED == 'true' && ',greenhouse' || '', vars.LEVER_ENABLED == 'true' && ',lever' || '') }}`
   (identical to today when `LEVER_ENABLED` is unset).
3. New `workflow_dispatch` inputs: `staged` (boolean, default false; "Run sources one after another"), `lever_max_boards`
   (string, default empty), `lever_stage_min` (string, default empty). `sources` description lists `lever`;
   `deactivate_source` options gain `lever`.
4. "Run scrape or fixture" step: staged when `inputs.staged == true` or `vars.STAGED_SCRAPE == 'true'` → append
   `--staged`; append `--lever-max-boards=<v>` and `--lever-stage-min=<v>` **only when the input is non-empty**. Validate
   the two inputs as digits (or `all` for the cap) before use (reject anything else with a clear message — they come
   from a manual dispatch; never interpolate them unquoted into a shell). Everything else (workers, `--skip-publish`,
   `--recheck-not-found`, `publish_only`, fixture path) unchanged.
5. Enrichment step already passes `--sources=$EFFECTIVE_SOURCES`; confirm Lever is enriched when enabled, nothing else.
6. No new summary step: the By Source table from L5 (`report:classify --step-summary`) is the summary.

## TESTS (`scripts/repo-tests/toggles.test.mjs` style, plus backend)
- `EFFECTIVE_SOURCES` still the same for `GREENHOUSE_ENABLED` and now `vars.LEVER_ENABLED == 'true'`; unset → `ashby`.
- `scrape` job `timeout-minutes` is 150 **and** `cadence_minutes − timeout ≥ 20` (compute the smallest gap between the
  cron's hours; assert 180).
- `--staged` appended only for `inputs.staged`/`vars.STAGED_SCRAPE`; `--lever-max-boards`/`--lever-stage-min` only when
  set; the digit/`all` validation exists; no `--accept-data-loss` anywhere in any workflow; `deactivate_source`
  options include `lever`; job-level `concurrency` is still absent on `scrape`.
- Publisher: a `lever` drop > 30% from a baseline ≥ 100 gates the publish; the first Lever publish (no baseline) does not.
- `source:deactivate lever --dry-run` counts only Lever jobs (if L5 did not already).

## DOCS
`docs/deployment-and-operations.md` (variables `LEVER_ENABLED`, `STAGED_SCRAPE`; enable → measure → roll back; timing
table; free-tier limits; Lever request volume: ~1,800 requests per run, ~12,600 per day, all ≤ 1 req/s), `docs/self-healing-loop.md`,
`backend/docs/cli-commands.md`, `backend/docs/known-issues.md` (a board can be up to one run stale; staged run length ~75–80
min; BF-017 means any failed stage skips the publish), `docs/decisions/ADR-0010-daily-scheduled-scrape.md` (timeout and
staged note), ADR-0022 → "Implemented", root `README.md` sources/schedule, root `AGENTS.md` Flow steps 1–2,
`docs/agents/context.md` (Multi-source line: Lever via `LEVER_ENABLED`, staged via `STAGED_SCRAPE`; ≤ 6,144 bytes —
trim to make room), CHANGELOG (`ci`/`feat(ops)`), `docs:generate`.

## AGENT FILES (hard requirement — canonical sources only, then `node scripts/agents/sync-shells.mjs`)
- `docs/agents/rules/multi-source-ats.md` append: "15. Lever is enabled only by repo variable `LEVER_ENABLED` (Greenhouse:
  `GREENHOUSE_ENABLED`); the scheduled scrape runs staged only when `STAGED_SCRAPE=true`. Emergency rollback =
  `LEVER_ENABLED=false` → scrape-daily `deactivate_source=lever` → (only if Redis is configured) `publish_only` +
  `force_publish`; to drop back to the interleaved run set `STAGED_SCRAPE=false`."
- `docs/agents/rules/ci-and-workflows.md`: rule 5 toggles add `GREENHOUSE_ENABLED`, `LEVER_ENABLED`, `STAGED_SCRAPE`; new rule
  "7. The `scrape` job `timeout-minutes` must stay below the cron cadence (3 h) minus 20 min; change both docs and the
  repo test when you change either."
- `docs/agents/roles/run-reviewer.md`: staged runs are expected to take ~75–80 min; a run near 120 min or any stage at
  its watchdog is actionable.
- `docs/agents/roles/docs-release-keeper.md`: schedule, timing and variable docs must agree with the workflow.
- `docs/agents/roster.md` only if a role's duties changed.
- `node scripts/agents/sync-shells.mjs --check` must pass; `AGENTS.md` and `context.md` ≤ 6,144 bytes.

## VERIFY
check-all · `node --test 'scripts/repo-tests/**/*.test.mjs'` · test:integration (local throwaway Postgres only) ·
sync-shells --check · docs:generate leaves no diff. `actionlint` runs in repo-ci (do not add it to check-all).

## COMMIT + PUBLISH
`feat(ops): staged daily scrape and Lever behind STAGED_SCRAPE and LEVER_ENABLED (ADR-0022)`; `scripts/agents/push-branch.sh`.

## ROLLOUT (PR body; owner, Claude checks each step)
1. Merge. Nothing changes until a variable is set (the longer job timeout is harmless).
2. Set repo variable `STAGED_SCRAPE=true` (Lever still off). The next scheduled run is staged ashby → greenhouse. Send
   Claude the step summary: per-stage wall time, boards, errors. Compare with the previous run; counts must match.
3. Measure Lever: Actions → scrape-daily → Run workflow: `sources=ashby,greenhouse,lever`, `staged=true`,
   `skip_publish=true`. **This is a real write** (Lever jobs are already in the database from the local run, so it
   refreshes them). Send Claude the summary: total and per-stage time, Lever boards scraped/available, jobs collected,
   errors by source, any 429s, `skippedByDeadline`. If the Lever stage is near its deadline, tune `lever_stage_min`.
4. If healthy: set `LEVER_ENABLED=true`. The next scheduled run includes Lever. Claude checks `/v1/jobs?source=lever`,
   `/v1/facets` and the UI.
5. Rollback ladder: `LEVER_ENABLED=false` → scrape-daily `deactivate_source=lever` (hides Lever jobs) → (Redis only)
   `publish_only=true` + `force_publish=true`. `STAGED_SCRAPE=false` returns to the interleaved run. Lever companies stay
   in the database, hidden when they have no active jobs.
