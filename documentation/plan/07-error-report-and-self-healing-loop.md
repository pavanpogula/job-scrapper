# 07 · Error Report and Self-Healing Loop

> Owner decisions:
> - **D-08**: after each scheduled scrape, a fixer agent runs automatically in CI when the report has actionable issues.
> - **D-09**: the fixer works on a new branch, runs every check, updates the decision log and the release notes,
>   commits, pushes **the branch**, and opens a PR for the owner to review. It never pushes to `main` and never merges.
>
> Tasks: P1-T10 (report v2 + classifier), P3-T02 (scrape workflow), P4-T01…T03, P4-T08 (fixer job) in
> [12](./12-implementation-roadmap.md).

## 1. The loop

```
scheduled scrape ─► error doc v2 (JSON, per run) ─► report:classify (adds issues + <runId>.md + run-history)
   ├─ noise only ───────────────► artifact + step summary, stop
   ├─ infra/auth (R-INFRA-1) ───► GitHub issue "scrape-alert" (deduped), no fixer
   └─ actionable ───► open auto-fix PR already covers the fingerprint? ─ yes ─► comment on that PR, stop
                         └─ no ─► fixer job (Claude Code in CI)
                                   1. read: CHANGELOG.md → documentation/decisions/ → BF invariants (doc 10)
                                      → guard status (doc 11 §6) → known issues (doc 09) → the error doc
                                   2. branch auto-fix/<runId>; fix ≤ 3 issues; add/adjust tests
                                   3. write ADR (if a decision was made) + CHANGELOG "Unreleased" entry
                                      + BF entry (doc 10) + doc 09 update + documentation/runs/<runId>.md
                                   4. commit (Conventional Commit)
                        deterministic gate (tsc, lint, test, verify:ui, docs:generate diff clean)
                                   ├─ fail ─► record attempt; 2nd failure for the fingerprint ─► label needs-human
                                   └─ pass ─► push branch + open PR (GitHub App token) ─► owner reviews/merges
merge to main ─► next run uses fixed code; next fixer reads the updated CHANGELOG/ADRs first
```

## 2. Error doc v2 (P1-T10)

### 2.1 Run id, files, history

**Run id:** `<UTC yyyyMMdd'T'HHmmss'Z'>-<cluster|single|csv>-<git shortSha>`, for example `20261024T061700Z-cluster-1a2b3c4`.

**Files** (all under the gitignored `output/`):

| Path | Contents |
|---|---|
| `output/reports/<YYYY-MM>/<runId>.json` | Machine-readable report |
| `output/reports/<YYYY-MM>/<runId>.md` | Human-readable summary (§2.3) |
| `output/latest-<mode>.json` | Copy of the newest report for that mode |
| `output/latest-error-report.json` | Copy of the newest DB-mode run, kept for compatibility. CSV runs no longer overwrite it (fixes 09 #36). |
| `output/reports/<YYYY-MM>/<runId>.issues.json` | The issues selected for the fixer: at most 3, actionable, sorted (§3). Written by the classifier and uploaded with the artifact. |
| `output/run-history.json` | The last 30 run summaries plus issue fingerprints and their status. **The classifier owns it:** it reads it, diffs against it, and appends the new run. ErrorTracker never touches it. Fix attempts are **not** stored here (§6 notes). |

**Retention:**
- Local runs keep the newest 60 reports.
- CI uploads `output/reports/**` as the artifact `scrape-report-<runId>` (`retention-days: 30`).
- CI carries `run-history.json` between runs with `actions/cache`: key `scrape-history-<github.run_id>`, restore key
  `scrape-history-`, which returns the most recent cache. Caches unused for 7 days are evicted (GitHub docs, checked
  2026-10-23). If the history is lost, the next run treats every issue as `new`.

**Committed copy:** reports are not committed daily. The fixer PR commits the Markdown summary of the run it fixes, at
`documentation/runs/<runId>.md`. That gives a permanent, reviewable history of every fixed run.

### 2.2 JSON schema v2.0

```jsonc
{ "schemaVersion": "2.0",
  "run": { "runId", "mode": "cluster|single|csv", "trigger": "schedule|workflow_dispatch|local", "gitSha", "gitBranch",
           "ciRunUrl", "nodeVersion", "workers", "perWorkerConcurrency", "startedAt", "completedAt",
           "durationSeconds", "outcome": "success|partial|failed", "exitCode" },
  "summary": { /* every v1 key, plus: */ "companiesFailed", "companiesQuarantined", "jobsCreated", "jobsUpdated",
               "jobsUnchanged", "jobsReactivated", "jobsDeactivated", "dbActiveJobsBefore", "dbActiveJobsAfter" },
  "workers": [ { "workerId", "pid", "companies", "status": "ok|failed|timeout", "durationSeconds", "error" } ],
  "cache": { /* CachePublishResult, 05 §4.3 */ },
  "categories": {
    "api_error": { "count", "distinctCompanies", "bySubkind": { "http_5xx", "timeout", "network", "http_403_unrecovered", "http_400" } },
    "not_found": { "count", "newThisRun" }, "graphql_fallback": {}, "validation_filtered": {}, "validation_sanitized": {},
    "db_error": {}, "company_error": {}, "company_quarantined": {}, "company_unreachable": {},
    "rate_limited": { "count", "distinctCompanies" },
    "suspicious_empty_board": {}, "worker_failed": {}, "cache_publish_failed": {}, "cache_details_truncated": {},
    "sanity_gate_failed": {} },
  "topFailingCompanies": [ { "slug", "category", "consecutiveRuns", "lastSuccessAt" } ],      // ≤ 20
  "issues": [ { "fingerprint": "sha1(category|subkind|field|normalizedMessage)", "category", "subkind", "severity",
                "actionable", "rule", "count", "companies", "sampleEventIds", "status": "new|recurring|regressed",
                "firstSeenRunId", "consecutiveRuns", "relatedBF": ["BF-004"], "suggestedAction",
                "fixAttempts": 0, "openPr": null } ],
  "diffVsPrevious": { "previousRunId", "newFingerprints", "recurringFingerprints", "resolvedFingerprints",
                      "deltas": { "jobsCollected", "companiesWithJobs", "dbActiveJobs" } },
  "events": [ /* v1 shape + id, subkind, httpStatus, attempts; capped at 100 per category; counts stay exact */ ] }
```

- **`normalizedMessage`**: the message with digits, UUIDs, slugs and URLs replaced by placeholders, so the same bug
  gets the same fingerprint every run.
- **`regressed`**: the fingerprint was in `resolvedFingerprints` at some point in the last 30 runs. It went away and
  came back. Category alone never makes an issue regressed, because that would bypass the R-VAL/R-API thresholds.
  `relatedBF` is for information only.

**Category → BF map:**

| Category | BF |
|---|---|
| `api_error`, `not_found`, `graphql_fallback` | BF-001 |
| `validation_*` | BF-002/003/004 |
| `db_error` | BF-004/010 |
| `company_*`, `suspicious_empty_board` | BF-006 |
| `worker_failed` | BF-008 |
| CSV issues | BF-009 |
| hash or field issues | BF-011 |
| `cache_publish_failed`, `sanity_gate_failed` | the new cache BF (added by P2-T04) |

### 2.3 Markdown summary

The classifier writes the summary to `<runId>.md` and to `$GITHUB_STEP_SUMMARY`. Template:

```markdown
# Scrape run 20261024T061700Z-cluster-1a2b3c4 — success (exit 0)
Started 06:17:03 UTC · 81 s · 4 workers · sha 1a2b3c4 · [CI run](…)

| Metric | This run | Previous | Δ |
|---|---|---|---|
| Companies with jobs | 1,744 | 1,742 | +2 |
| Jobs collected | 34,050 | 33,997 | +53 |
| Created / updated / deactivated | 210 / 640 / 157 | … | |
| DB active jobs | 34,076 | 34,023 | +53 |
| Not found / failed | 1,109 / 4 | … | |

Cache: published g20261024T061932Z-4f2a · 34,076 jobs · 10.1 MB · 2,200 fields · 41 commands · 28 s

## Actionable issues (1) — fixer triggered: yes
- **S2 NEW** `validation_filtered/invalid_or_duplicate_id` ×37 (BF-004) — "job id missing or duplicated" — acme, foo, …

## Noise
not_found 1,109 (3 new) · api_error transient 4 · graphql_fallback 12

## Workers
w0 ok 79 s · w1 ok 80 s · w2 ok 77 s · w3 ok 81 s
```

## 3. Actionable rules (`src/lib/ReportClassifier.ts`, `npm run report:classify`)

**Precedence:** if **R-INFRA-1** matches anything, the run is infra-only. It opens or updates the alert issue, and the
fixer is not started, even if other rules also match. This applies to Neon down, an Upstash budget error and an auth
failure. Otherwise every rule is evaluated. R-RECUR-1 and R-STOP-1 then filter the actionable set, which is sorted and
capped at 3.

Note on applyUrl: an invalid `applyUrl` is **repaired** with a canonical fallback (`Sanitizer.ts:275-282`), so it
shows up as `validation_sanitized`, not `validation_filtered`.

| Rule | Condition | Result |
|---|---|---|
| R-RUN-1 | `run.outcome != success` | actionable S1 |
| R-INFRA-1 | Prisma P1000/P1001/P1017; DB or Redis auth failure; ENOTFOUND; a quota or budget error from Neon, Upstash or Actions | **No fixer.** Open or append a `scrape-alert` issue. |
| R-DB-1 | `db_error.count ≥ 1` | actionable S1 |
| R-CACHE-1 | `cache_publish_failed` in 2 consecutive runs | actionable S2 |
| R-CACHE-2 | `cache_details_truncated` | actionable S3. Details over budget: review the budget or the description size. |
| R-GATE-1 | `sanity_gate_failed`. This is the publish gate in 05 §4.2: jobs below 0.7× or `companiesWithJobs` below 0.8× the last publish. | actionable S1 |
| R-GATE-2 | Early warning when the gate passed: DB active jobs down more than 20%, or `companiesWithJobs` down more than 15%, against the previous run | actionable S2 |
| R-VAL-1 | a new `validation_filtered` fingerprint, or filtered jobs above 0.5% | actionable S2 |
| R-VAL-2 | a new `validation_sanitized` fingerprint with count ≥ 50 | actionable S3 |
| R-API-1 | non-404 `api_error` on more than 5% of companies, or the same company 3 runs in a row | actionable S2 |
| R-API-2 | transient 5xx, timeout or network errors below the R-API-1 thresholds | noise |
| R-NF-1 | `not_found` | noise (the quarantine handles it) |
| R-NF-2 | more than 50 **new** `not_found` in one run | actionable S2 (an Ashby change is likely) |
| R-GQL-1 | `graphql_fallback` | noise |
| R-RL-1 | `rate_limited.distinctCompanies` above 10% of companies | actionable S3 |
| R-CO-1 | `company_error ≥ 1` or `company_unreachable ≥ 1` | actionable S2 |
| R-RECUR-1 | an actionable fingerprint already has `openPr` | comment on that PR; don't start the fixer |
| R-STOP-1 | `fixAttempts ≥ 2` for the fingerprint. The count comes from the open `fix-failed` issue for that fingerprint (§6 notes). | not given to the fixer; label that issue `needs-human` |
| R-REGRESS-1 | `status = regressed` | actionable S1, handled first |

**Outputs to `$GITHUB_OUTPUT`:**
- `actionable=true|false`
- `infra_alert=true|false`
- `run_id`
- `issues_file`: `output/reports/<YYYY-MM>/<runId>.issues.json`. It is uploaded inside the artifact, so the fixer
  job gets it from `download-artifact`. It holds at most 3 issues, sorted by severity, then `regressed`, then
  `consecutiveRuns`.

**Open PRs:** the classifier finds them with the GitHub API (`gh pr list --label auto-fix --json headRefName,body`).
Each fingerprint is written into the PR body as `<!-- fp:… -->`.

## 4. Decision log: ADRs (P4-T01)

**Location:** `documentation/decisions/`, with an index in `documentation/decisions/README.md` (a table of id, title,
status, date, BF ids).

**File name:** `ADR-<nnnn>-<kebab-title>.md`, numbered from `ADR-0001`.

**When to write one:** whenever a change picks between options, alters an invariant, changes a contract, or accepts a
risk. A plain bug fix with an obvious solution needs only a BF entry and a CHANGELOG line, no ADR.

```markdown
# ADR-0007: Ignore salaryInterval unless salaryMin is set
- Status: Accepted            <!-- Proposed | Accepted | Superseded by ADR-nnnn | Deprecated -->
- Date: 2026-10-24
- Deciders: owner (PR #123 review), scraper-bugfixer agent
- Related: BF-014, GAP-API-01, run 20261024T061700Z-cluster-1a2b3c4
## Context
<what forced a decision; evidence with path:line>
## Options considered
1. … (pros/cons)
2. …
## Decision
<the choice, in one paragraph>
## Consequences
<what changes, what new invariant exists, what tests guard it, what to watch>
```

**Backfill in P4-T01:** write ADRs for the decisions made in this plan.

| ADR | Decision |
|---|---|
| ADR-0001 | Postgres is the source of truth; the cache-first API falls back to Postgres |
| ADR-0002 | Upstash instead of Redis Cloud; no HMAC envelope |
| ADR-0003 | Immutable cache generations with an atomic pointer swap, and the publisher as the single writer |
| ADR-0004 | Remove Redis change detection in favour of the DB `contentHash` |
| ADR-0005 | The CI fixer runs on Claude Code, not Antigravity (no CI auth for `agy`) |
| ADR-0006 | The fixer works on a branch and opens a PR; it never touches `main` |
| ADR-0007 | `salaryInterval` semantics |
| ADR-0008 | One canonical agent context shared by Claude Code and Antigravity |
| ADR-0009 | Persisted company health counters and the quarantine |
| ADR-0010 | Daily GitHub Actions schedule (06:17 UTC, `--workers=4`) |
| ADR-0011 | Rate limiting: one Vercel WAF rule plus `dbGuard`; the in-memory and client limiters are removed |
| ADR-0012 | Fix-attempt tracking via `fix-failed` GitHub issues (§6) |

## 5. Release doc: `CHANGELOG.md` (P4-T02)

**Format:** [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) with [SemVer](https://semver.org/). Every
entry carries its BF, ADR and gap ids, so the next agent can trace why something changed.

```markdown
# Changelog
## [Unreleased]
### Fixed
- Default job list no longer hides jobs without an annual salary (BF-014, ADR-0007, GAP-API-01). Root cause: …; fix: …;
  guard: tests/unit/ApiServer.test.ts "ignores salaryInterval without salaryMin".
### Changed / Added / Removed / Security
- …
## [1.3.0] - 2026-10-23
### Added
- BF-013 security hardening, /v1/facets, DOMPurify … (backfilled from git history)
```

**Rules:**
- Every fix commit, whether from an agent or a human, adds its entry under `[Unreleased]` **in the same commit**. This
  is how "after commit, the release doc is updated with the bug fix and its solution" is met, and it can be reviewed
  in the PR.
- Each entry states the **root cause**, the **fix** and the **guarding test**. It must be readable without the diff.

**Cutting a release:** the `release` skill (`/release`, P4-T05) does this. The docs-release-keeper agent normally
runs it, on demand or weekly, when the owner asks. It:
1. moves `[Unreleased]` to `[x.y.z] - date`;
2. bumps the `package.json` version (patch for fixes only, minor for features, major for breaking contract changes);
3. commits on a `release/x.y.z` branch and opens a PR;
4. after the owner merges, the owner runs `git tag vX.Y.Z && git push --tags`, or a `release.yml` workflow that runs
   on a merged `release/*` PR does it. That workflow is optional (Q-09).

**Baseline:** P4-T02 backfills BF-001…BF-013 from git history up to `22afd64` as `[1.3.0] - 2026-10-23`, and sets
`package.json` to `1.3.0` (fixes 09 #40). The owner tags `v1.3.0` on commit `22afd64` (`git tag v1.3.0 22afd64`).

Everything done in P1–P3 (BF-014 onward) comes from the notes kept in commit bodies (12 DoD #5). It goes under
`[Unreleased]`, and the first `/release` after P4 turns it into `[1.4.0]`.

## 6. CI workflows (P3-T02 scrape job, P4-T08 fixer job)

Draft for `.github/workflows/scrape-daily.yml`. It is plan material, so re-check the versions when implementing.
Majors verified against the GitHub releases on 2026-10-23:

| Action | Major | Current release |
|---|---|---|
| `actions/checkout` | v7 | 7.0.1 |
| `actions/setup-node` | v7 | 7.1.0 |
| `actions/upload-artifact` | v7 | 7.0.2 |
| `actions/download-artifact` | v8 | 8.0.2 |
| `actions/cache` | v6 | 6.1.0 |
| `actions/create-github-app-token` | v3 | 3.3.0 |
| `anthropics/claude-code-action` | v1 | 1.0.261 |

`.nvmrc` is created by P3-T01, which must land before this workflow (P3-T02).

```yaml
name: Daily scrape
on:
  schedule: [{ cron: '17 6 * * *' }]
  workflow_dispatch:
    inputs:
      workers:           { default: '4' }
      skip_publish:      { type: boolean, default: false }
      publish_only:      { type: boolean, default: false }
      recheck_not_found: { type: boolean, default: false }
      skip_fixer:        { type: boolean, default: false }
      fixture_report:    { description: 'Repo path of a v2 report fixture; skips scraping (for testing alerts/fixer)', default: '' }
permissions: { contents: read, issues: write, pull-requests: read }
concurrency: { group: scrape-production, cancel-in-progress: false }
jobs:
  scrape:
    runs-on: ubuntu-24.04
    timeout-minutes: 30
    environment: production
    outputs:
      actionable:  ${{ steps.classify.outputs.actionable }}
      run_id:      ${{ steps.classify.outputs.run_id }}
      scrape_exit: ${{ steps.scrape.outputs.exit_code }}
    env:
      DATABASE_URL: ${{ secrets.DATABASE_URL }}
      REDIS_URL:    ${{ secrets.REDIS_URL }}
      TS_NODE_TRANSPILE_ONLY: 'true'
      SCRAPE_TRIGGER: ${{ github.event_name }}
      GIT_SHA: ${{ github.sha }}
      CI_RUN_URL: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
      SCRAPE_WORKER_TIMEOUT_MS: '900000'
      VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}           # optional, CDN purge (D-15)
      VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }} # optional
      GH_TOKEN: ${{ github.token }}
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version-file: '.nvmrc', cache: 'npm' }
      - run: npm ci
      - run: npx prisma generate
      - run: npx tsc --noEmit -p .
      - run: npx prisma db push --skip-generate
      - uses: actions/cache/restore@v6        # v6.1.0 current (checked 2026-10-23)
        with: { path: output/run-history.json, key: 'scrape-history-${{ github.run_id }}', restore-keys: 'scrape-history-' }
      - run: npm run enrich:companies
        continue-on-error: true
      - id: scrape
        run: |
          set +e
          if [ -n "${{ inputs.fixture_report }}" ]; then
            # Test mode: no scrape. Install the fixture as this run's report; exit with its run.exitCode.
            npm run report:install-fixture -- "${{ inputs.fixture_report }}"; true
          elif [ "${{ inputs.publish_only }}" = "true" ]; then npm run cache:publish; else
            ARGS="--workers=${{ inputs.workers || '4' }}"
            [ "${{ inputs.skip_publish }}" = "true" ] && ARGS="$ARGS --skip-publish"
            [ "${{ inputs.recheck_not_found }}" = "true" ] && ARGS="$ARGS --recheck-not-found"
            npm run scrape:parallel -- $ARGS
          fi
          echo "exit_code=$?" >> "$GITHUB_OUTPUT"
      - id: classify
        if: always()
        run: npm run report:classify -- --github-output "$GITHUB_OUTPUT" --step-summary "$GITHUB_STEP_SUMMARY"
      - uses: actions/upload-artifact@v7
        if: always()
        with: { name: 'scrape-report-${{ steps.classify.outputs.run_id || github.run_id }}', path: 'output/reports/**', retention-days: 30 }
      - uses: actions/cache/save@v6
        if: always()
        with: { path: output/run-history.json, key: 'scrape-history-${{ github.run_id }}' }
      - if: steps.scrape.outputs.exit_code == '1' || steps.classify.outputs.infra_alert == 'true'
        run: scripts/ci/alert-issue.sh "$CI_RUN_URL" "${{ steps.scrape.outputs.exit_code }}"   # exit 2 → R-CACHE-1, not an alert
      - if: steps.scrape.outputs.exit_code == '1'
        run: exit 1

  fixer:                                   # P4-T08
    needs: scrape
    if: always() && needs.scrape.outputs.actionable == 'true' && inputs.skip_fixer != true
    runs-on: ubuntu-24.04
    timeout-minutes: 45
    environment: fixer
    permissions: { contents: read, actions: read, issues: write }   # no id-token: we pass a read-only github_token below
    steps:
      - uses: actions/checkout@v7
        with: { ref: '${{ github.sha }}', fetch-depth: 0, persist-credentials: false }   # = main on schedule; the test branch on workflow_dispatch
      - uses: actions/setup-node@v7
        with: { node-version-file: '.nvmrc', cache: 'npm' }
      - run: npm ci && npm --prefix job-scrapper-ui ci && npx prisma generate
      - uses: actions/download-artifact@v8      # v8.0.2 current (checked 2026-10-23)
        with: { name: 'scrape-report-${{ needs.scrape.outputs.run_id }}', path: output/reports }
      - run: git checkout -b "auto-fix/${{ needs.scrape.outputs.run_id }}"
      - name: Claude fixer
        uses: anthropics/claude-code-action@v1
        env:
          CLAUDE_BRANCH: auto-fix/${{ needs.scrape.outputs.run_id }}
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          # REQUIRED: in automation mode the action rewrites `origin` to embed its token (configureGitAuth).
          # Passing the job's read-only GITHUB_TOKEN (contents: read) keeps origin non-writable; without it the
          # action would use the Claude GitHub App token, which has contents write.
          github_token: ${{ github.token }}
          prompt: |
            /fix-from-error-report output/reports/*/${{ needs.scrape.outputs.run_id }}.issues.json (full report: same folder, <runId>.json)
            Do not push. Do not change branches. Stop after at most 3 issues.
          claude_args: |
            --max-turns 60
            --max-budget-usd 5
            --permission-mode dontAsk
            --allowedTools "Read,Edit,Write,Grep,Glob,Bash(npx tsc --noEmit -p .),Bash(npm run lint),Bash(npm test),Bash(npm test *),Bash(npx jest *),Bash(npm run verify:ui),Bash(npm run docs:generate),Bash(git status*),Bash(git diff*),Bash(git log*),Bash(git add *),Bash(git commit *)"
      - name: Deterministic gate
        # docs:generate stamps the current date (scripts/GenerateDocs.ts:351), so the diff ignores that line (regex fixed in P4-T08).
        run: npx tsc --noEmit -p . && npx tsc --noEmit -p tsconfig.test.json && npm run lint && npm test && npm run verify:ui && npm run docs:generate && git diff --exit-code -I '<generated-date line regex>' docs/
      - uses: actions/create-github-app-token@v3   # v3.3.0 current; v3 uses client-id (app-id deprecated)
        id: app
        with: { client-id: '${{ secrets.FIXER_APP_CLIENT_ID }}', private-key: '${{ secrets.FIXER_APP_PRIVATE_KEY }}' }
      - name: Push branch + open PR
        env: { GH_TOKEN: '${{ steps.app.outputs.token }}' }
        run: scripts/ci/open-fix-pr.sh "${{ needs.scrape.outputs.run_id }}"
      - if: failure()
        env: { GH_TOKEN: '${{ github.token }}' }   # issues: write (job permission) — app token usually not minted yet
        run: scripts/ci/record-fix-attempt.sh "${{ needs.scrape.outputs.run_id }}"
```

**Notes:**
- `npm test` must not need secrets. All suites mock Prisma, Redis and axios, so the fixer job has no `DATABASE_URL`
  or `REDIS_URL`.
- `scripts/ci/open-fix-pr.sh`:
  1. Exit 0 if `git rev-list --count origin/main..HEAD` is 0.
  2. Otherwise run `git push https://x-access-token:$GH_TOKEN@github.com/$GITHUB_REPOSITORY.git HEAD:refs/heads/auto-fix/<runId>`.
     The fixer GitHub App needs Contents, Pull requests and Issues set to read & write. Issues is needed for `--label`.
  3. Then `gh pr create --base main --label auto-fix --title "fix(auto): <top issue> (run <runId>)" --body-file <generated>`.
     The body has the summary table, the issues with `<!-- fp:… -->` markers, the ADR, CHANGELOG and BF ids, a test
     summary, and "Not merged automatically."
- PRs opened with the GitHub App token **do** trigger `ci.yml`. PRs opened with `GITHUB_TOKEN` would not.
- **Fix-attempt tracking (ADR-0012), decided.** It uses GitHub issues, not `run-history.json`, because the fixer job
  can't save that cache.
  - `scripts/ci/record-fix-attempt.sh` opens, or comments on, one issue per fingerprint. The issue is labelled
    `fix-failed`, titled `Fix failed: <category/subkind>`, and its body carries `<!-- fp:<fingerprint> -->`.
    The script uses `GH_TOKEN` = `github.token`, which has `issues: write`.
  - The classifier sets `fixAttempts` = 1 + the number of attempt comments on that issue
    (`gh issue list --label fix-failed --json number,body,comments`).
  - At 2 attempts it adds `needs-human` (R-STOP-1).
  - Closing the issue resets the count.
- **`npm run report:install-fixture <path>`** (added in P4-T08) copies a v2 report fixture into
  `output/reports/<YYYY-MM>/<runId>.json` and exits with the fixture's `run.exitCode`. Fixtures live in
  `tests/fixtures/reports/`, with one actionable case, one infra case and one failed run. They are used for the
  P3-T02 and P4-T08 acceptance runs, so testing never needs a real scrape or a forced crash. (`--workers=0` is ignored
  by `resolveWorkerCount`, `ClusterScraper.ts:24`.)
- The `fix-failed` label is created in P0-T03, along with the others.

## 7. Guardrails

| Guardrail | Mechanism |
|---|---|
| Never push to or merge `main` | Branch protection on `main`: PRs required, 1 approval, `ci` status check required, no bypass for apps (P0-T03). During the agent step, **the only token in the job is the read-only `GITHUB_TOKEN`** (`contents: read`). It is passed as `github_token` so that the action's `configureGitAuth()` writes a non-writable token into `origin`. The only write-capable token, the fixer App token, is minted **after** the agent step and used only by the deterministic push step, which pushes only `auto-fix/*`. The `dontAsk` allowlist (no push rule) is a convenience, not a boundary. |
| Never touch secrets | The fixer job has no DB or Redis secrets. Deny `Read(./.env)`, `Read(./.env.*)` and `Read(./apikeys/**)` in `.claude/settings.json` (08 §4). `output/` holds only reports. |
| Bounded cost and time | `--max-turns 60`, `--max-budget-usd 5`, job `timeout-minutes: 45`, at most 3 issues per run |
| No pile-up | One open `auto-fix` PR per fingerprint (R-RECUR-1). If 3 or more `auto-fix` PRs are already open, skip the fixer and comment on the alert issue. |
| Stop when stuck | 2 failed attempts per fingerprint → `needs-human` (R-STOP-1) |
| No hollow fixes | The gate re-runs every check outside the agent. The PR template requires a guarding test, and the reviewer checks it. |
| Respect invariants | The skill instructions say to read doc 10 BF invariants and doc 11 §6 before editing, and to list in the PR body each invariant touched |
| Infra problems are not code problems | R-INFRA-1 routes them to an issue and never to the fixer |
| Scope | The fixer may edit `src/**`, `tests/**`, `prisma/schema.prisma` (additive only), `documentation/**`, `CHANGELOG.md`, `README.md` and `AGENTS.md`. It may not edit `.github/**`, `.claude/settings.json`, `.agents/hooks.json`, `vercel.json` or `package.json` dependencies. The `fix-from-error-report` skill enforces this, and the PR CI repeats the check with `scripts/ci/check-fixer-scope.sh` for `auto-fix/*` branches. |

## 8. One protocol (P4-T03)

Create `documentation/16-self-healing-loop.md` as **the** protocol, with sections 1–8 of this file in final form.

- **`AGENTS.md`:** replace its 4-step "Bug-Fix Agent Protocol" with a 6-line summary that links to doc 16.
- **Doc 10:** replace its own protocol section with a link to doc 16. Doc 10 becomes the BF registry only, with honest
  guard status:
  - BF-011 is ⚠️ until P1-T06.
  - BF-012 is ❌ until P1-T16.
  - BF-013 is ❌ until P1-T16 (headers) and P5-T07 (DOMPurify).

The protocol order that every fixer, human or agent, follows:
1. **Read history:** `CHANGELOG.md` (Unreleased plus the last 2 releases), then `documentation/decisions/README.md`,
   plus any ADR whose BF or gap ids match.
2. **Read the guards:** the BF invariants in doc 10, their guard status in doc 11 §6, and the open issues in doc 09.
3. **Read the error doc:** the issues in `<runId>.issues.json`, in that file's order, and the full `<runId>.json`
   when you need context.
4. **Plan:** for each issue, identify the root cause (`path:line`), the fix, the test, and the BF invariant affected.
   Skip any issue whose fix would violate an invariant, and say so in the PR.
5. **Fix and test:** add a failing test first, then the fix.
6. **Record:**
   - a BF entry in doc 10;
   - the doc 09 status;
   - an ADR if a decision was made;
   - a CHANGELOG `[Unreleased]` entry;
   - `documentation/runs/<runId>.md`;
   - `npm run docs:generate`.
7. **Verify:** `npx tsc --noEmit -p . && npx tsc --noEmit -p tsconfig.test.json && npm run lint && npm test && npm run verify:ui`.
8. **Commit:** a Conventional Commit with a bulleted body covering root cause, fix, tests and docs.
9. **CI** pushes the branch and opens the PR (agents never push).
