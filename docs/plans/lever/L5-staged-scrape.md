# L5 — Staged scrape runner: one source at a time, finish all, publish once (Antigravity prompt)

> Owner: after L4 is merged (it is) and this plan is merged, paste "Read docs/plans/lever/L5-staged-scrape.md and
> implement it exactly." Background: `docs/plans/lever/00-PLAN.md` (§1 facts, §2 decisions 7 and 12).
> This PR is **code + tests only**. The workflow wiring and turning Lever on are L6.

You are working in the Ashby Job Scraper monorepo (product: B.O.O.L.E.A.N). Implement ONE PR: a new opt-in
`--staged` mode for `scrape:parallel` that scrapes **one ATS source completely, then the next, then the next**, and
publishes the cache **once** at the end. Without `--staged` nothing changes (byte-identical behaviour). Squash-merge.
Follow AGENTS.md, CLAUDE.md, docs/agents/context.md and every rule in docs/agents/rules/ (scraper-invariants,
multi-source-ats, ci-and-workflows).

## WHY (read this, it drives every decision)
Today one `scrape:parallel` run interleaves all sources across the same workers. Lever must stay ≤ 1 request/s for the
whole run (robots `Crawl-delay: 1`), so its ~1,800 boards need ~50 min, while Ashby (~1,700 boards) and Greenhouse
(~1,700 boards) need ~6–8 min each. Mixed together, Lever is capped at 600 boards / 11 min and a slow source blocks the
others. Staged mode gives each source its own pass, its own worker count, its own time budget and its own wall-time in
the report, and one failing source cannot stop the others from being scraped.

Measured on 2026-11-17/18 (owner's Mac, real APIs): full run of 3,939 boards, 6 workers, 882 s; Lever-only 455 boards
in 781 s (≈ 0.58 boards/s); ≈ 46 Lever jobs per board; ~1,823 live Lever boards.

## HARD RULES (non-negotiable)
- Never read, print, stage, or commit `.env*`, `apikeys/`, `backend/apikeys/`, `output/`, `backend/output/`, `.vercel/`.
- Agents never push to `main`/`master`, never merge, never force-push, push tags or delete branches, and never run raw
  `git push` or `gh`. Publish only with `scripts/agents/push-branch.sh`. Owner reviews and merges.
- Never connect to production; no scrapes/publishes/deploys against prod. While developing you may make a handful of
  public GETs (≤ 1/s) and use a local throwaway Postgres only.
- **Without `--staged` the run is byte-identical**: same selection, same worker shards, same report shape, same logs
  and exit codes. No existing test may be weakened or edited except the ones listed in TESTS.
- BF-017 stays exactly as is: any failed worker → no cache publish, exit 1; a clean run publishes once.
- The Lever limit stays ≤ 1 request/s for the whole run; never raise it. No new `any`. Commit before check-all.
  Never stage `.impeccable/`. Never add `--accept-data-loss` anywhere.

## PRECONDITION
- `git fetch origin`; origin/main contains `backend/src/discovery/LeverDiscovery.ts` (L4) and
  `docs/plans/lever/L5-staged-scrape.md`. Otherwise STOP. Branch `feat/lv-5-staged-scrape` from `origin/main`.

## BUILD (all in `backend/src/core/` unless stated)

### 1. CLI surface (parsed in `ClusterScraper.runClusterScrape`, also accepted via `ClusterScrapeOptions`)
- `--staged` (boolean). Off by default.
- `--lever-max-boards=N|all`: `parseLeverMaxBoards` (`selectCompanies.ts`) also accepts `all` → no cap
  (`Number.POSITIVE_INFINITY`; `selectCompanies` must then skip `take`). Default unchanged (600) when not staged.
  When `--staged` and the flag is absent, the Lever stage default is **3000** (safety ceiling, not a target).
- `--lever-stage-min=N`: integer 1–120, default **70**. Invalid → print an error and exit 1 (same style as
  `--time-budget-min` in `CdxWorker.ts`). Only meaningful with `--staged`; ignored (with one warning line) otherwise.
- Stage order is the registry order filtered to the enabled sources: `SUPPORTED_ATS_SOURCES` order
  (`ashby`, `greenhouse`, `lever`), **not** the order typed by the user. Export `orderStages(sources: AtsSource[]): AtsSource[]`.
- `--staged` with `--slugs=` works: each stage gets only the slugs whose company belongs to that source.

### 2. Stage runner
Refactor, do not rewrite: extract from `runClusterScrape` the "select → shard → spawn workers → collect results" part
into `runStage(source, ctx): Promise<StageResult>` and call it once per stage. The non-staged path calls it **once with
all enabled sources** and must produce the same shards/IPC messages/results as today (the existing ClusterScraper tests
are the proof; do not edit them).

`StageResult`: `{ source, companies, workerCount, durationMs, results: WorkerResult[], failed: boolean }`.

Per stage:
1. `selectCompanies(prisma, { sources: [source], statusFilter, explicitSlugs filtered to this source, leverMaxBoards, select })`.
   Zero companies → log `⏭  Stage <i>/<n> <source>: no active companies, skipped` and continue (not an error, and the
   function must **not** return `null` unless **every** stage was empty — keep the current "No active companies" message
   and `null` return for that case).
2. Worker count: Ashby and Greenhouse use `resolveWorkerCount(argv, companies.length)` as today. **Lever always uses 1
   worker** (the limit is global, so more workers add nothing; the pacer is then 1000 ms). Document this next to the code.
3. IPC message gains optional `leverDeadlineMs` (Lever stage only = `leverStageMin × 60_000 − 5 × 60_000`, i.e. stop
   starting boards 5 min before the stage ends). `Scraper.ts` worker entry passes it to `AshbyScraper({ leverDeadlineMs })`
   (the option already exists; non-Lever messages omit it and the default stays 11 min).
4. Watchdog (`workerTimeoutMs`): Ashby/Greenhouse stages keep the existing value (`SCRAPE_WORKER_TIMEOUT_MS` or 15 min);
   the Lever stage uses `leverStageMin × 60_000 + 5 × 60_000`.
5. Log `▶ Stage <i>/<n>: <source> (<boards> boards, <workers> worker(s))` before and
   `✔ Stage <i>/<n>: <source> done in <s>s (<ok>/<total> workers ok)` after. These lines are new; staged mode only.

Isolation rules (this is the point of the PR):
- A failed or timed-out worker marks **its stage** failed; the next stages still run.
- SIGINT/SIGTERM handlers are registered **once** for the whole run (not per stage) and forward to the children of the
  stage that is currently running; `activeChildren` is cleared between stages. No duplicate listeners (`process.once`
  per stage would leak).
- `prisma.$disconnect()` currently runs right after selection; in staged mode keep one client and disconnect only after
  the last stage and after publish. Do not call a disconnected client.
- If the process is interrupted, earlier stages' rows are already written (workers write as they go); nothing is rolled back.

### 3. Merge, telemetry, publish
- Collect the successful workers' reports of **all** stages and merge once with `ErrorTracker.mergeReports(..., 'cluster')`.
- `mergedReport.workers[]` entries gain optional `stage: AtsSource` (additive field in the `ErrorReportDocument` type;
  absent when not staged). `ErrorReportDocument.schemaVersion` stays `'2.0'`.
- `SourceTelemetrySummary` (`ErrorTracker.ts`) gains optional `durationMs` (merge = **max**). In staged mode the
  coordinator sets `bySource[source].durationMs` = stage wall time (ms). For Lever also set `boardsAvailable` and
  `boardsCap` (optional fields, merge = max; `boardsCap` omitted when uncapped). Non-staged runs leave all three unset.
- Failure policy unchanged: if any worker of any stage failed → `run.outcome='failed'`, `exitCode=1`, cache
  `skipped_incomplete_run`, one `worker_failed` event per failed worker whose message starts with
  `Stage <source>: ` in staged mode (do **not** add a new event category).
- Otherwise exactly one `recordScrapeFinished` / `publishCacheGeneration` call, after the last stage (unchanged logic,
  including `--skip-publish`, `--dry-run`, `--force`).
- `ReportClassifier.ts`: the existing "By Source" table gains columns **Wall time** (from `durationMs`, `—` when unset),
  **Boards (scraped/available/cap)** (Lever rows only, `—` otherwise) and **Skipped by deadline** (L2's
  `skippedByDeadline`, `0` when unset). Existing column text and fingerprints are unchanged. Add the S2 rule: Lever
  `skippedByDeadline > 0` is **noise** for one run and **actionable (S2)** only when `run-history` shows it on two
  consecutive runs (reuse the existing consecutive-run mechanism; no new state file).

### 4. `source:deactivate`
Accepts `lever` through the registry already; add the test only.

## TESTS (write first; fake `child_process.fork` exactly like `ClusterScraper.test.ts` — no real forks, no network)
New file `backend/tests/unit/StagedScrape.test.ts`:
1. Three stages run **in order ashby → greenhouse → lever** even when `--sources=lever,ashby,greenhouse`; each stage's
   workers receive `sources: [stage]`; stage 2 starts only after stage 1's workers exited (assert on spawn order).
2. Lever stage: exactly 1 worker, IPC has `workerCount: 1` and `leverDeadlineMs = (leverStageMin−5) × 60_000`; watchdog
   = `(leverStageMin+5) × 60_000`; Ashby/Greenhouse stages keep the 15-min watchdog and carry no `leverDeadlineMs`.
3. Failure isolation: Ashby worker fails → Greenhouse and Lever stages still spawn; result `exitCode 1`;
   `publishCacheGeneration` **not** called; one `worker_failed` event `Stage ashby: …`.
4. All stages ok → `publishCacheGeneration` called **once**, after the last stage; `--skip-publish` → `recordScrapeFinished`
   only; merged `bySource.<source>.durationMs` set for every stage; `workers[].stage` set.
5. Empty stage is skipped (no spawn, no error); all stages empty → `null` and the "No active companies" message.
6. `--lever-max-boards=all` → `selectCompanies` called without `take`; invalid `--lever-stage-min` (0, 121, `abc`) exits 1.
7. Single `SIGTERM` listener registered for the whole staged run (assert `process.listenerCount` before/after).
8. Non-staged regression: `--sources=ashby,greenhouse,lever` without `--staged` still spawns one interleaved set of
   shards with the same IPC payload as before (keep the existing assertions green; add one explicit snapshot of the IPC
   message keys, which must **not** include `leverDeadlineMs`).
Also: `ErrorTracker` (`durationMs`/`boardsAvailable`/`boardsCap` merge = max, `stage` survives merge), `ReportClassifier`
(new columns; Lever `skippedByDeadline` noise once / S2 on two consecutive runs), `selectCompanies` (`all`),
`Scraper` worker IPC (`leverDeadlineMs` honoured, absent → 11 min), `source:deactivate lever --dry-run`.

## DOCS
- `docs/bug-fix-log.md`: **BF-025** — staged scrape: stage order, failure isolation, single publish, Lever 1 worker and
  deadline, additive telemetry (guarded: `StagedScrape.test.ts`, `ClusterScraper.test.ts`, `ErrorTrackerV2.test.ts`).
- `docs/testing.md` (BF-025 row + the guard list), `backend/docs/cli-commands.md` (`--staged`, `--lever-max-boards=all`,
  `--lever-stage-min`, examples), `backend/docs/architecture-and-workflows.md` (staged flow diagram: stages → one
  publish), `backend/docs/module-reference.md`, `backend/docs/outputs-and-artifacts.md` (report: `stage`, `durationMs`,
  `boardsAvailable/boardsCap`), `docs/self-healing-loop.md` (new By Source columns, the Lever S2 rule),
  `backend/docs/known-issues.md` (staged mode is opt-in until L6; a stage's failure blocks the publish by BF-017),
  ADR-0022 (status note: staged runner), `docs/system-architecture-and-flows.md` (scrape flow), CHANGELOG
  (`feat(scraper)`), `npm --prefix backend run docs:generate`.

## AGENT FILES (hard requirement — canonical sources only, then `node scripts/agents/sync-shells.mjs`)
- `docs/agents/rules/scraper-invariants.md`: "BF-001 through BF-025"; add rule: "8. Staged scrape (`--staged`, BF-025):
  stages run in registry order, one source each; a failed stage never stops later stages; one cache publish after the
  last stage; BF-017 (any failed worker → no publish, exit 1) is unchanged; Lever always uses 1 worker. Without
  `--staged` behaviour must stay byte-identical."
- `docs/agents/rules/multi-source-ats.md`: append "14. Staged scrape: `--staged` scrapes one source per stage
  (ashby → greenhouse → lever). The Lever stage has its own deadline (`--lever-stage-min`, default 70) and `--lever-max-boards`
  accepts `all`; outside staged mode the 600-board cap and 11-min deadline still apply."
- `docs/agents/roles/run-reviewer.md`: add the staged-report triage (stage-tagged `worker_failed` = that source's pass
  failed; Lever `skippedByDeadline` on two consecutive runs = actionable S2: raise `--lever-stage-min` or lower the cap,
  never raise the request rate).
- `docs/agents/roles/scraper-bugfixer.md`: add "Never fix a Lever slowdown by raising its request rate or concurrency;
  change the stage budget or cap instead."
- `docs/agents/roles/scraper-architect.md`: add `docs/plans/lever/00-PLAN.md` §2 decision 12 and BF-025 to the read-first list.
- `docs/agents/roles/docs-release-keeper.md`: add "staged-scrape timing/limits docs (`docs/deployment-and-operations.md`)
  must match `scrape-daily.yml` timeouts" to the checklist.
- `docs/agents/context.md`: Components line mentions `--staged`; add the BF-025 line; **stay ≤ 6,144 bytes** (it is at
  5,827 — trim other lines to make room, keep every fact). Root `AGENTS.md` Flow step 2 mentions staged mode; ≤ 6,144 bytes.
- `node scripts/agents/sync-shells.mjs --check` must pass.

## VERIFY
`scripts/check-all.sh --no-install` · `npm --prefix backend run test:integration` (local throwaway Postgres only) ·
`node --test 'scripts/repo-tests/**/*.test.mjs'` · `node scripts/agents/sync-shells.mjs --check` · docs:generate leaves no diff.
**Local rehearsal (throwaway DB, real APIs, ≤ 1 req/s, ≤ 20 boards per source):** seed 2–3 boards per source
(`seed`, `seed:greenhouse`, `seed:lever`), then
`npm --prefix backend run scrape:parallel -- --staged --sources=ashby,greenhouse,lever --workers=2 --skip-publish --lever-stage-min=10`.
Paste: the three `▶/✔ Stage` lines, the By Source table, and a second identical run showing 0 changed rows.
Then rerun **without** `--staged` and show the output is the same shape as before.

## COMMIT + PUBLISH
`feat(scraper): staged scrape runner, one source per stage with a single publish (BF-025, ADR-0022)`;
`scripts/agents/push-branch.sh`. PR body: summary, the timing table from 00-PLAN §2.12, the rehearsal output, and
"nothing changes in production until L6 sets `STAGED_SCRAPE=true`".

## ROLLOUT
Merge. No deploy, no variable, no schedule change — the flag is opt-in and L6 wires it. Rollback: revert the PR.
