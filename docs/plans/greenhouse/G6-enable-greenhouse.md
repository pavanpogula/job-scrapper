# G6 — Enable Greenhouse in the daily scrape (Antigravity prompt)

> Owner: only after G5 is merged AND you have (a) reviewed Greenhouse's Terms of Service for redistributing job data and
> (b) checked Neon storage usage/plan headroom (Greenhouse descriptions add roughly 4–8 KB per job), paste
> "Read docs/plans/greenhouse/G6-enable-greenhouse.md and implement it exactly." Background: `00-PLAN.md`.

You are working in the Ashby Job Scraper monorepo. Implement ONE PR: let the daily scrape include Greenhouse behind a
repo variable, with per-source safety gates, measurements and a clean rollback. Squash-merge. Follow AGENTS.md,
CLAUDE.md, docs/agents/context.md and every rule in docs/agents/rules/ (ci-and-workflows, api-cache, scraper-invariants).

## HARD RULES (non-negotiable)
- Never read, print, stage, or commit `.env*`, `apikeys/`, `backend/apikeys/`, `output/`, `backend/output/`, `.vercel/`.
- Agents never push to `main`/`master`, never merge, never force-push, push tags or delete branches, and never run raw
  `git push` or `gh`. Publish only with `scripts/agents/push-branch.sh`. Owner reviews and merges.
- Never connect to production; no scrapes/publishes/deploys. Never add `--accept-data-loss` to any workflow.
- No new `any`. Commit before running check-all.

## PRECONDITION
- origin/main contains G5 (`CdxWorker.ts` supports `--source=greenhouse`). Otherwise STOP. Branch: `feat/gh-6-enable`.

## BUILD
1. `.github/workflows/scrape-daily.yml`:
   - New `workflow_dispatch` input `sources` (default empty) and repo variable `GREENHOUSE_ENABLED`. Effective sources:
     input if set, else `ashby,greenhouse` when `vars.GREENHOUSE_ENABLED == 'true'`, else `ashby`. Pass
     `--sources=<effective>` to `scrape:parallel` and to `enrich:companies` (both flags exist since G2).
   - New input `force_publish` (boolean, default false): appends `--force` to `npm run cache:publish` in the
     `publish_only` path (needed after a source rollback, when the sanity gate would block).
   - Step summary prints the report's `summary.bySource`.
2. Per-source sanity gate in `backend/src/cache/Publisher.ts`: store `bySource` active-job counts in `lastPublish`;
   gate (exit 2, existing contract BF-017) when any source with a baseline ≥ 100 jobs drops > 30%; a source with no
   baseline never gates. The existing global gate stays.
3. Rollback CLI `npm run source:deactivate -- greenhouse [--dry-run]` (add to the `DANGEROUS` list in
   `scripts/repo-tests/settings-allowlist.test.mjs`): sets `active=false` on that source's jobs and
   `status` unchanged; prints counts; refuses `ashby` without `--i-know`. Expose it in `scrape-daily.yml` as a
   `workflow_dispatch` input `deactivate_source` (choice: none / greenhouse, default none) that runs the CLI after
   `db push` and then skips scraping — so the owner never needs production credentials on a laptop.
4. Concurrency: Greenhouse limiter starts at ≤ 5 per worker; send `Accept-Encoding: gzip`; optional `If-None-Match`
   ETag cache is a follow-up (note in PR).
5. Restore `^backend/prisma/schema\.prisma` in `scripts/ci/check-fixer-scope.sh` ALLOWED_PATTERNS (removed in G1) and
   flip the G1 case in `scripts/repo-tests/fixer-scope.test.mjs` to "allowed".

## TESTS
- Publisher: per-source gate (drop > 30% gates; new source no gate; global gate unchanged).
- Workflow repo tests: effective-sources expression, `force_publish` only affects publish_only, never
  `--accept-data-loss`.
- `source:deactivate`: dry-run counts, real run only touches that source, ashby guard.
- ClusterScraper: both sources interleaved across workers.

## DOCS
`docs/deployment-and-operations.md` (how to enable, measure, roll back), `docs/self-healing-loop.md` (bySource,
per-source gate), `backend/docs/cli-commands.md`, ADR-0021 → "Implemented", `docs/agents/context.md` (one line:
Greenhouse enabled via `GREENHOUSE_ENABLED`; byte budget) + sync-shells, README "Sources: Ashby, Greenhouse",
CHANGELOG, `docs:generate`.

## VERIFY
check-all · test:integration · repo tests · sync-shells --check.

## COMMIT + PUBLISH
`feat(ops): enable Greenhouse in the daily scrape behind GREENHOUSE_ENABLED`; `scripts/agents/push-branch.sh`.

## ROLLOUT (PR body; owner, with Claude checking each step)
1. Merge. Nothing changes until the variable is set.
2. Measure: Actions → scrape-daily → Run workflow with `sources=ashby,greenhouse`, `skip_publish=true`.
   **This is a real write**: Greenhouse jobs land in the production database and the API (search, `source=greenhouse`)
   shows them immediately; only the Redis publish is skipped. Send Claude the summary: run time (job timeout is
   30 min, worker watchdog 15 min), Greenhouse jobs collected, errors by source. If anything looks wrong, run
   scrape-daily with `deactivate_source=greenhouse` right away. If Redis is configured, also run
   `npm run cache:publish -- --dry-run` (or ask Claude) to check memory against the 0.8 × `CACHE_MAX_MEMORY_BYTES` budget.
3. If healthy: set repo variable `GREENHOUSE_ENABLED=true`; next run publishes normally.
4. Deploy is not needed (API/UI shipped in G4). Claude verifies `/v1/jobs?source=greenhouse` and the UI live.
5. Rollback: set `GREENHOUSE_ENABLED=false` → scrape-daily with `deactivate_source=greenhouse` → scrape-daily
   `publish_only=true` + `force_publish=true` (only if Redis is configured; `force` is needed because the per-source
   gate would otherwise block the publish that resets the baseline). Greenhouse companies stay in the DB but are hidden
   (no active jobs, G5 rule).
