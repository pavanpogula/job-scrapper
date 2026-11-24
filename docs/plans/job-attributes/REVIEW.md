# Reviewing a job-attributes PR (E1–E6) — reviewer prompt

> Owner: when Antigravity has pushed a job-attributes branch and printed the PR link, open a **new** Claude Code session
> in the repo root and paste: "Review job-attributes PR #<number> (phase E<n>). Follow docs/plans/job-attributes/REVIEW.md exactly."
> For a deeper bug hunt that also proposes improvements, add: "Use deep review mode."
> Same process as `docs/plans/lever/REVIEW.md`.

You are reviewing ONE pull request that implements phase E<n> of `docs/plans/job-attributes/` (Experience and Security
Clearance filters). The phase prompt `docs/plans/job-attributes/E<n>-*.md` is the spec; `00-PLAN.md` holds the shared
interfaces, global constraints and review focus; `DESIGN.md` holds the decisions (§4, §9) and the picker rule (§6.1).
Follow AGENTS.md, CLAUDE.md and every file in `docs/agents/rules/`.

## Rules
- Never read, print, stage or commit `.env*`, `apikeys/`, `backend/apikeys/`, `output/`, `backend/output/`, `.vercel/`.
- Never push to `main`, merge, force-push, run raw `git push` or `gh`. Never connect to production DB/Redis/API, never
  scrape, publish, enrich or deploy against prod. Never call Gemini (no key, no network) — not even to "try it".
- **DB safety rule (00-PLAN Amendments):** `backend/.env` is auto-loaded and points at production. Every command that
  can reach a database (`prisma …`, `enrich:jobs`, `api:start`, `test:integration`, fixture / `EXPLAIN` scripts) runs
  only after, in the **same shell**:
  ```bash
  export DATABASE_URL='postgresql://…localhost…'   # quoted: `?` is a zsh glob
  case "$DATABASE_URL" in *localhost*|*127.0.0.1*) ;; *) echo "not local" >&2; exit 1;; esac
  ```
  (E1 Task 0 Step 2 has a concrete value, e.g. `postgresql://postgres:pw@localhost:55432/postgres?schema=ja_rehearsal`;
  set `TEST_DATABASE_URL` the same way for integration tests.) **Reviewer check, every PR:** any DB command in the PR's
  scripts, docs, ROLLOUT/PR body or local-run instructions that lacks this export + guard is an `important` finding
  (CI workflows that use the `DATABASE_URL` secret on purpose are exempt).
- Never run `prisma generate` inside a worktree that symlinks `node_modules` (it rewrites the main folder's client).
- Do not change files in the owner's folder (Antigravity uses it and switches branches). Work in a separate worktree.
- Default: **report findings and stop.** Push a fix commit to the PR branch (with `scripts/agents/push-branch.sh` only)
  only if the owner says "fix it".

## Steps
1. **Map PR → branch first.** Fetch `https://github.com/<owner>/<repo>/pull/<number>` (public page) and read the head
   branch name; `git fetch origin`; confirm the branch matches the phase (`00-PLAN.md` PR table: `feat/ja-1-schema-and-rules`,
   `feat/ja-2-enrich-pass`, `feat/ja-3-gemini-step`, `feat/ja-4-api-filters`, `feat/ja-5-ui-filters`,
   `docs/ja-6-rollout-and-release`) and its commits are that phase. Do not review the wrong branch.
2. **Worktree:** `git worktree add <scratchpad>/wt-e<n> origin/<branch>`; symlink `node_modules` for `backend/` and
   `frontend/` from the main folder (the repo has no root `package.json`; a root `node_modules` only triggers a
   check-all warning, `scripts/check-all.sh:82-84`).
3. **Precondition and scope:** the branch starts from current `origin/main` and the previous E-phase is merged; its diff
   (`git diff --stat origin/main...HEAD`) matches the phase prompt's BUILD list — nothing missing, nothing from a later
   phase. Leak examples that are findings:
   - **E1** exposes the new columns in the API/DTO/cache, adds a CLI, picker or writer, or edits a workflow. (The
     manual golden-set builder `backend/scripts/BuildJobAttributeFixtures.ts` is **in** E1 scope (E1 File map, Task 4); it must
     never run in CI or tests.)
   - **E2** imports or calls Gemini / any HTTP client, adds `GEMINI_*` env, or touches `backend/src/api/**`, `frontend/**`.
   - **E3** touches `backend/src/api/**`, `backend/src/cache/**` or `frontend/**`.
   - **E4** touches `frontend/**` beyond the contract-sync minimum it is **required** to make (E4 HARD RULES "Frontend scope", File map, Task 7;
     `docs/agents/rules/api-contract-sync.md` step 4): the fixture mirror `frontend/src/test/fixtures/contract/*`
     (via `scripts/contract/sync-fixtures.mjs:16-17`), `frontend/src/types/api.ts` response types,
     `frontend/src/test/contract.test.ts` key lists, and the typed mocks that stop compiling
     (`frontend/src/mocks/mockData.ts`, `frontend/src/test/jobCard.test.tsx`, any other literal `tsc` flags). Any other
     frontend edit (filter UI, badges, query-param types) is an E5 leak.
   - **E5** touches `backend/**` (other than generated `backend/docs/project-explorer.html`).
   - **E6** changes code behaviour (docs, agent context and release only).
   List any extra or missing items.
4. **Run the checks** in the worktree and paste the result lines:
   - `scripts/check-all.sh --no-install` (runs `backend check:all` = build, typecheck, typecheck:test, lint,
     `any-ratchet`, jest, `docs:check`, then `frontend check` and repo tests — `scripts/check-all.sh:53-54,76`,
     `backend/package.json:31`, `frontend/package.json:13`).
   - `node --test 'scripts/repo-tests/**/*.test.mjs'` (also inside check-all; run it alone to see `workflows`,
     `toggles`, `contract-sync`, `agent-shells` failures clearly).
   - `node scripts/agents/sync-shells.mjs --check`.
   - `npm --prefix backend run test:integration` (`backend/package.json:7`) against a **local throwaway Postgres only**
     (`TEST_DATABASE_URL` on localhost, e.g. embedded-postgres in the scratchpad; tests skip without it,
     `backend/tests/integration/LeverL1Schema.test.ts:11-12` — a skipped suite is **not** a pass: confirm the new
     integration tests ran). Required for E1 (schema/indexes), E2 (writer, picker), E4 (filters, facets, `EXPLAIN`).
     Run it, like every DB command in steps 4 and 6, only after the Rules' `export DATABASE_URL='…localhost…'` + `case`
     guard in the same shell:
     ```bash
     cd <scratchpad>/wt-e<n>
     export DATABASE_URL='postgresql://postgres:pw@localhost:55432/postgres?schema=ja_review'
     case "$DATABASE_URL" in *localhost*|*127.0.0.1*) ;; *) echo "not local" >&2; exit 1;; esac
     export TEST_DATABASE_URL="$DATABASE_URL"
     npm --prefix backend run test:integration
     ```
   - `npm --prefix backend run docs:generate` leaves no diff (`git diff --exit-code -I 'Auto-generated on' -- backend/docs/`).
   - **E4 (and E5 if it changes fixtures):** `npm --prefix backend run contract:fixtures` (`backend/package.json:8`)
     then `node scripts/contract/sync-fixtures.mjs`, twice → `git status` shows no diff (fixtures are deterministic and
     committed in both trees, `docs/agents/rules/api-contract-sync.md:17-23`).
   - Optional automated pass: in the worktree run `/code-review high origin/<branch>` (skill `code-review`) for a
     correctness sweep, or follow `superpowers:requesting-code-review` with the phase prompt as the requirements. These
     **add to** the manual checklist below; they never replace it. Re-verify every finding they produce before reporting.
5. **Read the code against the spec**, line by line for every BUILD item, every shared interface name in 00-PLAN
   (exact names and signatures) and the per-phase checklist below.
6. **Behaviour proof** (local throwaway DB, never prod; same shell as the DB-safety `export` + `case` guard, re-run
   before each of `prisma db push`, `enrich:jobs`, `api:start`): E2 seed ~20 jobs, run `npm --prefix backend run enrich:jobs -- --max-jobs=50`
   twice → second run `picked: 0`; change one job's description **and its `contentHash`** (as the scraper would, E2 Task 2 test `picker re-picks on description change`)
   → only that job is re-picked; across the enrichment write itself `updatedAt`, `contentHash`, `lastUpdatedAt` stay
   unchanged (SQL before/after). E3 the same with a fake `ModelClient` only (no key). E4 `curl` the local
   API (`npm run api:start` from `backend/`, port 3001) for `?experience=3-5,10plus`, `?clearance=exclude`, invalid values
   (including `10+`, which decodes to `10 ` and must be dropped),
   `/v1/facets`. E5 check the UI with Playwright/Chrome at 1440px and 390px, light and dark (filters desktop + mobile
   drawer, badge, chip, URL round-trip, back button).
7. **Docs checklist** — CHANGELOG `[Unreleased]` entry and regenerated `backend/docs/project-explorer.html` are required
   in **every** PR. Phase-specific docs: the phase prompt's DOCS list (from DESIGN §7). Minimum per phase:

   | Phase | Docs that must change |
   |---|---|
   | E1 | `docs/decisions/ADR-0023-job-attribute-enrichment.md` (new; ADR-0022 is the last today) · `docs/decisions/README.md` · `docs/README.md` (ADR + plan links) · `backend/docs/database-and-cache.md` · `backend/docs/module-reference.md` · `docs/bug-fix-log.md` + `docs/testing.md` §6 BF-026 · `docs/agents/context.md` BF-026 line + sync-shells · `docs/plans/job-attributes/` committed |
   | E2 | BF-027 in bug-fix-log / testing / context · `backend/docs/cli-commands.md` · `backend/docs/outputs-and-artifacts.md` (enrich report) · `backend/docs/architecture-and-workflows.md` · `backend/docs/configuration.md` (`ENRICH_ENABLED`) · `docs/deployment-and-operations.md` (backfill) · `docs/agents/rules/ci-and-workflows.md` |
   | E3 | BF-027 extension · `backend/docs/external-apis.md` (Gemini) · `backend/docs/configuration.md` (`GEMINI_ENABLED`, `GEMINI_API_KEY`, `GEMINI_MODEL`) · owner Gemini setup steps · ADR-0023 (model ID + verification date) |
   | E4 | BF-028 in bug-fix-log / testing / context · `backend/docs/api.md` · `backend/docs/database-and-cache.md` (detail-index value) · `docs/agents/rules/api-cache.md` / `api-contract-sync.md` if behaviour they describe changed |
   | E5 | BF-028 extension · `frontend/docs/frontend-ui.md` · `frontend/docs/testing.md` · `docs/agents/rules/frontend-invariants.md` if a new invariant |
   | E6 | `docs/deployment-and-operations.md` (enable/backfill/rollback, flags) · `docs/system-architecture-and-flows.md` · ADR-0023 "Implemented" · `docs/agents/context.md` + `AGENTS.md` + sync-shells · release cut (skill `release`), versions aligned |

   **Agent files (every PR, hard requirement):** changes made in the canonical `docs/agents/` sources (never only in
   `.claude/`/`.agents/` copies), `node scripts/agents/sync-shells.mjs --check` passes, `docs/agents/context.md` and
   `AGENTS.md` stay ≤ 6,144 bytes — check with `wc -c docs/agents/context.md AGENTS.md` (context.md is near the cap;
   E1 collapses the BF-001…BF-016 lines to make room, 00-PLAN Amendments). A behaviour change with no matching agent-rule update is a finding. Docs say what the code does (flag
   names, defaults, file paths), not what the plan hoped.
8. **Commit message:** Conventional Commit subject from the phase prompt + bulleted body (root cause, changes, tests,
   docs) ending with the session attribution lines.

## Per-phase checklist (read the code against each line)

**Every phase**
- `computeJobContentHash` (`backend/src/core/Scraper.ts:82`) and its 17 fields untouched; `ContentHash.test.ts` unchanged.
- `lastUpdatedAt` / `lastUpdatedSource` logic untouched (ADR-0018); scrape exit codes 0/1/2, BF-017, BF-025 unchanged.
- No existing test weakened or deleted; no new `any` (any-ratchet in both apps); JSDoc `@file/@summary/@tags` on every
  new file and function; no secrets, keys or prod URLs in code, tests or fixtures; no network in any test.

**E1 — schema and rules**
- Columns, types and the three `@@index` lines exactly as 00-PLAN; all nullable (additive, `db push` safe, no
  `--accept-data-loss`); no new column in the content hash.
- Types / `ATTRS_VERSION` / `getDescriptionText` / `hashDescription` / `extractMinYears` / `detectClearance` /
  `extractAttributesByRules` / `bucketRange` / `bucketOf` names and signatures exactly as 00-PLAN; rules are pure (no I/O,
  no `Date.now`, no env).
- `getDescriptionText` uses `sanitizeJobDescriptionPlain` (`backend/src/lib/Sanitizer.ts:115`); `hashDescription` is
  whitespace-normalized sha256 hex (stable across runs), used for evidence checks and tests only — change detection
  uses `contentHash` (00-PLAN Amendments).
- Labelling rule (DESIGN §6.2): overall > sub-skill, base degree path, preferred-only → `null`, range → lower bound,
  values > 30 **discarded** (not clamped, E1 Task 5; case `value above 30 is discarded`). Clearance: owner decision 1 (any mention incl. Public Trust, polygraph, eligible-for, non-US) counts;
  negations and false friends ("range clearance", export-control/US-person alone) do not.
- Confidence `'low'` iff either result is ambiguous; no clearance keyword → `false`, high.
- Golden set: re-fetched as raw HTML and passed through the production normalizer, ≥ 200 jobs, ≥ 40 clearance
  positives, no board > 15 % of the set, holdout separate from tuning; CI asserts years and clearance P/R ≥ 0.90 on the
  holdout, high-confidence precision ≥ 0.95 and low-confidence share ≤ 35 % (E1 Task 7 scorer test); named regression cases for each
  DESIGN §2 failure mode. Thresholds not lowered to make the test pass.
- PR body carries the Task 0 schema rehearsal output (E1 Review Focus 5 calls it "STEP 0 output"; it means Task 0),
  run with the DB-safety guard.
- `bucketOf`: 0–2, 3–5, 6–9, 10+ boundaries (2→`0-2`, 3→`3-5`, 9→`6-9`, 10→`10plus`, `null`→`unspecified`); `EXPERIENCE_BUCKETS` uses `'10plus'`, not `'10+'`.

**E2 — enrichment pass**
- Picker WHERE equals DESIGN §6.1 as amended (00-PLAN Amendments, E2 Task 2 pinned SQL), all in SQL: `active = true AND
  (attrsVersion IS NULL OR attrsVersion < ATTRS_VERSION OR "attrsDescHash" IS DISTINCT FROM "contentHash" OR
  (modelEnabled AND attrsConfidence = 'low' AND (attrsModelVersion IS NULL OR attrsModelVersion < ATTRS_VERSION)))`;
  `descHash` returned = the row's `contentHash`; projection reads only the description key; keyset pagination by id with
  `afterId` (no OFFSET).
- Writer uses one parameterised `$executeRaw` `UPDATE … FROM unnest(…)` per batch (E2 Task 3; no string-built SQL),
  writes only `experienceMinYears`, `clearanceRequired`, `attrs*`; never `updatedAt` (no Prisma `update`/`updateMany` on
  `Job`, `@updatedAt` at `backend/prisma/schema.prisma:105`); guards `AND j."contentHash" = v.desc_hash` so a row changed
  by the scraper after pick is skipped (E2 `writer skips a row whose contentHash changed after pick`);
  `attrsModelVersion = CASE WHEN model_tried THEN ATTRS_VERSION ELSE NULL END` — **reset to NULL** when the model was not
  tried, so a changed row gets one new model attempt.
- Gemini-off mode writes low-confidence rows (not left pending), so the next run picks 0 of them.
- Budget stop: `--budget-min` checked between batches; stops with `stoppedBy: 'budget'` and exit 0; `--max-jobs` →
  `'maxJobs'`; DB unreachable → exit 1; `--dry-run` writes nothing (DB and report path stated); `--all` meaning matches the
  prompt. Report counts keys are 00-PLAN's plus the E2/E3 additions (`remaining`, `descBytes`,
  `modelStoppedBy`, `modelTokensIn`, `modelTokensOut`); written to `output/latest-enrich.json` + monthly `enrich-<runId>.json`;
  does not modify the scrape report or feed `report:classify` / the fixer.
- Workflow (`.github/workflows/scrape-daily.yml`): new step placed **after** "Run scrape or fixture" (`:149`) and its
  publish; `if:` gated on `vars.ENRICH_ENABLED == 'true'` and on the scrape step not hard-failing (uses
  `steps.scrape.outputs.exit_code`, `:192`, not `failure()` — the scrape step itself never fails because of `set +e`);
  `continue-on-error: true`; `--budget-min=10`; skipped for `deactivate_source` / `fixture_report` runs; the step does not
  change "Propagate scraper exit code" (`:226`); job `timeout-minutes: 150` (`:74`) still covers the worst case (update
  the comment at `:72`). Step runs after "Classify scrape telemetry" (00-PLAN Amendments); `enrich_budget_min` input
  capped at 130. **No new secret on the scrape step**; `GEMINI_API_KEY` (E3) appears only in the env of the two enrich
  steps, "Enrich job attributes" and "Backfill job attributes" (E3 Task 5, E2 Task 6) — nowhere else, never job-level. Backfill dispatch input validated/quoted (no `${{ inputs.* }}` spliced into shell unquoted).
  `scripts/repo-tests/workflows.test.mjs` / `toggles.test.mjs` updated if they enumerate steps/variables.

**E3 — Gemini step**
- `GeminiClient` reads `GEMINI_API_KEY` / `GEMINI_MODEL` from env only; key sent as a header (not in a logged URL);
  the key and full request/response bodies never logged, never in errors or the report (check every `console`/logger
  and every `throw` path, including axios error objects that carry `config.headers`).
- Model ID pinned in config, with the verification date in ADR-0023 / docs. Temperature 0, JSON schema output.
- Uses `backend/src/lib/ats/http.ts` helpers for retry/backoff on 429/5xx; bounded concurrency; `--model-max-calls`
  default 2000 enforced before the call (not after); failures degrade to rules output and never fail the run.
- `validateModelAnswer` (DESIGN §6.2): each evidence string appears in the description (normalized whitespace);
  `minYears` 0–30 and its number appears in the years evidence; `clearanceRequired = true` needs a lexicon keyword in
  the clearance evidence; reject → rules answer kept with `attrsConfidence = 'low'` and `attrsModelVersion` set.
- `modelTried` / `ModelStep.tried` counts only rows whose request got an HTTP 200 (accepted, rejected, `bad_json`,
  `blocked`); transport errors, 429/5xx after retries do not mark tried (E3 Review Focus 3, Tasks 3–4, test `does not mark tried on
  transport error`).
- On 402/403/404 the step sets `exhausted` and stops calling for the rest of the run, and the pass then picks with
  `modelEnabled && !exhausted` so low rows are not picked just to be skipped (E3 File structure `run.ts` row, Review Focus 3).
- Only low-confidence jobs reach the model; `GEMINI_ENABLED` off or no key → model step not constructed.
- Tests use a fake `ModelClient` / mocked axios only (429, timeout, bad JSON, hallucinated evidence); a grep of
  `backend/tests` finds no real endpoint call and no key.

**E4 — API, facets, cache**
- `experience` / `clearance` parsed next to `source` / `postedWithin` (`backend/src/api/types.ts:432-438,476-482`):
  trimmed, lower-cased, invalid values **silently dropped** (no 400); empty list after dropping = no filter.
- `experience` buckets OR within the param, AND across other filters (BF-013); `unspecified` → `attrsVersion IS NOT NULL
  AND experienceMinYears IS NULL`; ranges from `bucketRange` (`10plus` has no upper bound; the string `10+` is invalid
  and dropped).
- `clearance=required` → `clearanceRequired = true`; `clearance=exclude` → `clearanceRequired IS NOT TRUE` (not `= false`).
- Facets: `experience` record with all 5 buckets (zeros present), `clearance: { required, exclude }` where `exclude` counts exactly what `clearance=exclude` returns (00-PLAN §API, E4 D3); facets are **global** counts over active jobs, like the existing facets
  (`computeFacets` takes no filter params, `backend/src/api/db/queries.ts:190`; E4 D3) — a facet that varies with the
  active filters is a finding.
- DTO list + detail add `experienceMinYears: number | null`, `clearanceRequired: boolean | null`; `contract.ts`, shared
  types and fixtures updated together (ADR-0015); fixtures re-record with no diff (step 4).
- Cache body parity (BF-019): cached list/detail bodies equal DB-path bodies including the new fields
  (`CacheParity.test.ts` extended); new filter views follow the existing pre-render vs DB-path pattern in
  `backend/src/api/cache/ReadThrough.ts`; DbGuard / singleFlight keys include the new params (no cross-filter coalescing).
- Publisher detail index (`backend/src/cache/Publisher.ts:412` compares, `:491` stores): both sites use
  `contentHash + ':' + attrsFingerprint(job)` with the exact 00-PLAN formula; the snapshot query (`:181`) selects the
  attribute columns; the first **scheduled** publish after the E4 merge (scheduled scrapes run `main`) rewrites details once (expected),
  later publishes only changed ones; inert while production Redis is unconfigured (00-PLAN Amendments "Cache timing").
- Indexes used: `EXPLAIN` on a seeded local DB recorded in the PR.

**E5 — UI**
- URL/API bucket value is `10plus` (label `10+ yrs`) and the clearance facet is `{ required, exclude }` per 00-PLAN
  Amendments, which win over any older `10+` / `notRequired` text in the E5 prompt; the `Exclude` count shown is
  `facets.clearance.exclude`.
- Labels, badge and chip text exactly as 00-PLAN §UI; `null` (unprocessed) → no badge, no chip; `experienceMinYears = 0`
  renders deliberately (prompt decides "0+ yrs" or nothing — check it matches).
- URL sync both ways (`experience`, `clearance`) like existing filters; invalid URL values dropped; filters AND with the
  rest; chips removable; reset clears them; facet counts shown; mobile drawer has both filters.
- Contract types come from the shared fixtures; `npm --prefix frontend run check` green; no `dangerouslySetInnerHTML` added.

**E6 — rollout and release**
- Runbook order matches 00-PLAN rollout (backfill complete before E4 deploy); flags default off documented; rollback
  steps (turn off `ENRICH_ENABLED`/`GEMINI_ENABLED`, column values harmless) present; Gemini budget alert step present.
- BF-026/027/028 and ADR-0023 present in `docs/testing.md` §6, `docs/bug-fix-log.md`, `docs/agents/context.md`;
  CHANGELOG release cut consistent; byte limits held.

## Review focus (00-PLAN failure modes — verify each, do not assume)
1. **Description changed after enrichment → re-picked, values replaced** (E2 `picker re-picks on description change`):
   read the test; it must process a row (`attrsDescHash = contentHash`), change its description **and** `contentHash`
   in the DB as the scraper would (E2 Task 2 test `picker re-picks on description change`), run the picker again and assert the job is returned, then that the next
   write overwrites its values and resets `attrsModelVersion` to NULL when the model was not tried. Also confirm the
   writer's `contentHash = desc_hash` guard (a row changed between pick and write is skipped, not overwritten with
   stale values).
2. **Enrichment write bumps `updatedAt` / `contentHash` / `lastUpdatedAt`** (E2 `writer leaves updatedAt untouched`):
   must be an integration test on real Postgres reading the three columns before/after; a mocked-Prisma test cannot
   prove this. Grep the E2/E3 diff for `prisma.job.update` / `updateMany` / `upsert` → none.
3. **Model hallucinates evidence or years** (E3 `rejects evidence not in description`): cases for invented evidence,
   years not in evidence, `minYears` 31 / negative / non-integer, `clearanceRequired = true` with keyword-free evidence;
   each asserts the written row is the rules answer with `attrsConfidence = 'low'`.
4. **"Exclude clearance" hides unprocessed jobs** (E4 `exclude keeps unprocessed jobs`): seed one `true`, one `false`,
   one `NULL` row; `clearance=exclude` returns 2. Grep the query builder for `clearanceRequired: false` /
   `= false` — a finding. Check the cache/pre-rendered path gives the same result as the DB path.
5. **Cached detail keeps old attributes** (E4 `detail rewritten when attrs change`): Publisher test publishes, changes
   only `experienceMinYears` (same `contentHash`), publishes again on a non-Sunday (mock the date) and asserts that
   detail is rewritten and others are not.

## Deep review mode (when the owner says "Use deep review mode")
Do everything above, then hunt bugs and weak spots. Report them **separately** from the spec check, each with
file:line, a concrete failing scenario and a proposed fix. Look hard at:
1. **Picker correctness at scale:** keyset pages that skip rows when filtering in TS; a job that is re-picked forever
   (hash computed differently in picker vs writer, `attrsModelVersion` never set on reject, Gemini-off low rows); the
   `(active, attrsVersion)` index actually used.
2. **Time and budget math:** budget measured from the wrong start, a batch that overruns the budget, `NaN`/`Infinity`
   from bad flags, worst-case job time (setup + company enrichment + 3 stages + enrich 10 min) vs 150 min.
3. **Failure paths:** DB drop mid-batch (partial write is safe and resumable), model 429 storm, malformed JSON, a
   throw that skips writing the report, exit code on budget stop.
4. **Spend:** any path that sends more than `--model-max-calls`, retries counted outside the cap, backfill chunks
   without a cap, a model call for high-confidence or unchanged rows.
5. **Data safety:** rows of other sources or inactive jobs touched, `updatedAt` moved, `contentHash`/freshness
   changed, old attribute values left behind when the new answer is `null`.
6. **Secrets and workflow injection:** key in logs/errors/report/step summary; dispatch inputs unquoted in `run:`;
   secret exposed at job level or on the scrape step.
7. **API/cache:** cache key collisions between filter combinations, global facet counts that disagree with the unfiltered list total for the same filter (e.g. `clearance.exclude` vs `?clearance=exclude` total),
   parity broken for the new fields, Sunday full-rewrite interplay.
8. **Tests that cannot fail:** assertions on mocks only, golden thresholds computed on the tuning set, snapshots
   regenerated blindly, integration tests silently skipped in CI.
9. **Simplification:** duplicate bucket/range logic between API and UI, dead flags, docs describing plans not behaviour.

## Report (to the owner, plain language)
1. **Verdict:** `approve` / `changes needed` (one line, first).
2. **Findings**, most severe first, each as:
   `[important|nit|pre_existing] path/to/file.ts:LINE — what is wrong. Failure scenario: <concrete input/state → wrong
   result, who is affected>. Suggested fix: <change>.`
   `important` = violates the spec, an invariant or a hard rule, or breaks prod/limits; `nit` = cleanup or clarity;
   `pre_existing` = real problem not introduced by this PR (report, do not block on it). In deep review mode also tag
   S1/S2/S3 as in the Lever review.
3. Check results (pass/fail lines from step 4, integration suites ran vs skipped) and the behaviour proof from step 6.
4. Scope check (step 3) and docs checklist (step 7): ticked / missing.
5. After-merge steps for the owner, copied from the phase prompt's ROLLOUT (and `ROLLOUT.md`).
Then remove the worktree (`git worktree remove <scratchpad>/wt-e<n>`).
