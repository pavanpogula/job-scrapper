# Rollout runbook — Experience and Security Clearance filters (owner)

> For the owner. You paste prompts into Antigravity and Claude Code and click GitHub buttons. Do the steps **in order**;
> do not start a step until the one before it is done. Plan: `00-PLAN.md` (its "Amendments" section wins over
> `DESIGN.md`). Reviews: `REVIEW.md`. Click paths and file:line references were checked on 2026-11-23.

## Fixed facts (used in every step)

| Thing | Value | Where it is defined |
|---|---|---|
| Scrape workflow (GitHub name) | **Daily scrape** | `.github/workflows/scrape-daily.yml:1` |
| Schedule | 7 runs a day, every 3 h, 5:17 AM to 11:17 PM PST | `scrape-daily.yml:5-7` |
| Scrape job timeout | 150 min (normal run worst case ~132 min incl. 12 min enrichment) | `scrape-daily.yml:74`; E2 Task 6 BUILD 5 |
| Scrape job secrets come from | GitHub environment **`production`** | `scrape-daily.yml:75` |
| One run at a time | concurrency group `scrape-production`; GitHub keeps **at most one pending run**, a newer queued run replaces it | `scrape-daily.yml:63-65`; E2 Task 6 BUILD 5 |
| Schema changes reach the DB | step "Sync database schema" (`prisma db push`) at the start of every run | `scrape-daily.yml:120-121` |
| Run report download | artifact `scrape-report-<runId>` (all of `backend/output/reports/**`, 30 days); enrichment file `enrich-<runId>.json` is inside | `scrape-daily.yml:200-206`; E2 Task 5 Paths |
| Scheduled enrich step | "Enrich job attributes", `--budget-min=10`, runs only when `ENRICH_ENABLED=true`, cannot fail the run | E2 Task 6 BUILD 3 |
| Backfill inputs (Run workflow form) | `enrich_backfill` (checkbox; runs only the backfill: no scrape, no classify; works with `ENRICH_ENABLED` off), `enrich_budget_min` (default `120`, 1–130) | E2 Task 6 BUILD 1, 4 |
| Gemini variables | `GEMINI_ENABLED`, `GEMINI_MAX_CALLS` (caps model calls per run for **both** the scheduled and the backfill step; unset = 2,000), `GEMINI_MODEL` (leave unset) | E3 Task "Workflow" step (step-level env) |
| Gemini key | secret `GEMINI_API_KEY` in environment `production` | E3 "Owner setup" step 8 |
| Summary line that decides completion | `Backfill complete: yes` (= `remaining` 0) | E2 Task 5 "Summary format"; `00-PLAN.md:118-119` |
| Deploy workflow | **Deploy to Vercel**, inputs `app` (both/frontend/backend), `target` (production/preview), `ref` (default `main`) | `.github/workflows/deploy.yml:4-27` |
| Deploy approval | environment `vercel-production`, you are the required reviewer | `deploy.yml:69,128`; `docs/deployment-and-operations.md:203-205` |
| Smoke tests | backend `https://job-scrapper-api-eight.vercel.app`, frontend `https://www.boolean.page`; must print `PASSED` | `deploy.yml:113-115,171-173` |
| Required PR checks | `backend-gate`, `frontend-gate`, `repo-gate` | `docs/deployment-and-operations.md:186-187` |
| Merge method | **Squash and merge** | `00-PLAN.md:4` |

Shell shortcut used below: `API=https://job-scrapper-api-eight.vercel.app`

GitHub click paths:
- **Variables:** repo → **Settings** → **Secrets and variables** → **Actions** → tab **Variables** → **New repository
  variable** (or the pencil icon). Exact name, value as written.
- **Run the scrape by hand:** repo → **Actions** → **Daily scrape** → **Run workflow** → branch `main` → fill inputs →
  **Run workflow**.
- **Run summary:** open the run → **Summary** shows the step summary; artifacts are at the bottom.
- **Deploy:** repo → **Actions** → **Deploy to Vercel** → **Run workflow** → `app`, `target=production`, `ref=main` →
  **Run workflow** → approve the `vercel-production` deployment.

## Ground rule: production runs only through GitHub

You never run `enrich:jobs`, `prisma` or any other database command against production from your laptop. Every
production write in this runbook is a **Daily scrape** run on GitHub. This runbook has no local database commands; the
only local commands are `curl` checks against the public API (and E3's optional `enrich:model-eval`, which reads test
fixtures, not the database). If an agent ever asks you to run a database command locally, it must use E1's pattern: a
quoted `export DATABASE_URL='postgresql://…@localhost:…'` plus the localhost guard
`case "$DATABASE_URL" in *localhost*|*127.0.0.1*) ;; *) echo "not local" >&2; exit 1;; esac` in the same shell
(`backend/.env` would otherwise be loaded automatically).

## The standard loop for every PR (E1–E6)

1. **Implement.** Paste the step's Antigravity prompt. Wait for the PR link.
2. **Review.** New Claude Code session in the repo folder, paste:
   `Review job-attributes PR #<number> (phase E<n>). Follow docs/plans/job-attributes/REVIEW.md exactly.`
   Deep variant:
   `Review job-attributes PR #<number> (phase E<n>). Follow docs/plans/job-attributes/REVIEW.md exactly. Use deep review mode.`
   Blocking findings → paste them into Antigravity ("Fix these review findings on the same branch: …") or tell the
   reviewer `fix it`. Re-review until it says ready.
3. **PR page checks:** three gates green; no unresolved conversations; "Files changed" has no `.env`, `output/`,
   `apikeys/`, `.vercel/`, `brag-output/`; only what the phase prompt names; a new `CHANGELOG.md` `[Unreleased]` line.
4. **Merge:** **Squash and merge**, keep the title.

---

## Step 0 — Merge the plan PR

E1 stops unless `origin/main` already has `docs/plans/job-attributes/` including `research/` (E1 PRECONDITION).
1. The planning session pushes branch `docs/job-attributes-plan` with `scripts/agents/push-branch.sh`, which prints
   the PR link. Open that link, or: repo → **Pull requests** → **New pull request** → base `main`, compare
   `docs/job-attributes-plan` → **Create pull request** (title e.g. `docs(plan): job attribute enrichment plan
   (E1–E6)`).
2. Check: the three gates are green; "Files changed" is only `docs/plans/job-attributes/**` (plus `docs/README.md` /
   `CHANGELOG.md` if the planning session added them); no `brag-output/`, `output/`, `.env`.
3. **Squash and merge**.
4. Done when repo → **Code** → `docs/plans/job-attributes/` on `main` lists `E1-…` to `E6-…`, `ROLLOUT.md` and
   `research/`.

Rollback: revert the PR (nothing in production reads these files).

## Step 1 — E1: schema columns and rules extractor

(a) `Read docs/plans/job-attributes/E1-schema-and-rules.md and implement it exactly. Work on branch feat/ja-1-schema-and-rules from origin/main and finish with scripts/agents/push-branch.sh.`

(b)–(d) Standard loop, `E1`. Extra check: `backend/prisma/schema.prisma` only **adds** nullable columns and indexes.

(e) After merge: wait for the next scheduled **Daily scrape** (≤ 3 h).

(f) Verify: in that run "Sync database schema" is green and the run ends green. Live API unchanged.

(g) Rollback: PR page → **Revert** → squash-merge the revert. The empty columns can stay in the DB.

## Step 2 — E2: enrichment pass (rules only)

(a) `Read docs/plans/job-attributes/E2-enrich-pass.md and implement it exactly. Work on branch feat/ja-2-enrich-pass from origin/main and finish with scripts/agents/push-branch.sh.`

(b)–(d) Standard loop, `E2`. Extra check: step "Enrich job attributes" is gated by `vars.ENRICH_ENABLED == 'true'` and
has `continue-on-error: true`; inputs `enrich_backfill` and `enrich_budget_min` exist.

(e) After merge: **do not** set `ENRICH_ENABLED` yet.

(f) Verify: the next scheduled run looks like before (no enrichment table).

(g) Rollback: revert the PR.

## Step 3 — Backfill, rules only (~128,500 active jobs)

1. **Before each chunk:** open **Actions → Daily scrape**. If a run shows **Queued/Waiting**, wait until it starts
   running; dispatching now would replace that pending run.
2. **Run a chunk:** **Run workflow** with `enrich_backfill` ticked, `enrich_budget_min` = `120`, everything else default.
   A chunk takes about **2 h 05 m** (5 min setup + 120 min).
3. **Watch:** the **Summary** page shows the "Job attribute enrichment" table (`picked`, `rulesHigh`, `rulesLow`,
   `written`, `remaining`, `stoppedBy`) and the line `Backfill complete: no (remaining = N)`. `modelCalls` must be `0`.
   The same numbers are in `enrich-<runId>.json` inside the `scrape-report-…` artifact. Write down `remaining`,
   `rulesLow` and `Description bytes read` per chunk.
4. **Repeat** until done. Chunks needed ≈ first `remaining` ÷ first `written` + 1.
5. **Complete when** a run's summary says **`Backfill complete: yes`** (`remaining` = 0). `stoppedBy: done` alone is
   not enough.
6. **Not converging** = `remaining` does not fall between two chunks in a row. Stop and ask.

(f) Verify: the live site is unchanged. Sum of `Description bytes read` over all chunks ≈ backfill Neon egress
(expected ~0.6–1.3 GB, once).

(g) Rollback: none needed (columns nobody reads yet).

## Step 4 — Turn on enrichment for scheduled runs

(e) Variables → **New repository variable**: `ENRICH_ENABLED` = `true`.

(f) Verify on the next scheduled run: "Enrich job attributes" ran; `picked` ≈ new or changed jobs (roughly 850–3,200);
the whole run is at most ~12 min longer than before and stays green.
**Neon egress check** (now and again after one week): Neon console → your project → **Usage** (data transfer) vs the
5 GB/month free limit (`docs/deployment-and-operations.md:14`). Add up `Description bytes read` over a day of runs × 30.
Stop and ask if the month projects above ~4 GB.

(g) Rollback: set `ENRICH_ENABLED` = `false`. Values already written stay.

## Step 5 — E3: Gemini model step (code only)

(a) `Read docs/plans/job-attributes/E3-gemini-step.md and implement it exactly. Work on branch feat/ja-3-gemini-step from origin/main and finish with scripts/agents/push-branch.sh.`

(b)–(d) Standard loop, `E3`. Extra checks: no key-like string in the diff; Gemini env (`GEMINI_API_KEY` from
`secrets.`, the rest from `vars.`) only on the two enrich steps; tests mock Gemini.

(e) After merge: nothing; `GEMINI_ENABLED` stays unset.

(f) Verify: next run's summary still shows `modelCalls` 0.

(g) Rollback: revert the PR.

## Step 6 — Gemini account, key, cap and backfill

1. Follow **"Owner setup: Gemini developer account"** in `E3-gemini-step.md` (steps 1–8: project, prepay $5–10 with
   auto-reload off, spend cap, budget alert, restricted key, optional local `enrich:model-eval`, secret
   `GEMINI_API_KEY` in environment `production`). Never paste the key into a chat, PR, issue or file.
2. Variables: **`GEMINI_MAX_CALLS` = `300` first**, then `GEMINI_ENABLED` = `true` (E3 setup step 9). Order matters:
   without the cap a run may make 2,000 calls.
3. Check the next scheduled run: `modelCalls` ≤ 300, `modelAccepted` most of them, `modelErrors` small.
4. **Speed up the low-confidence backfill.** At 300 calls per run, ~30,000 low-confidence rows (sum of `rulesLow` from
   Step 3) need ~100 runs. To finish in a few chunks:
   - Cost first: ~$0.00075 per call (E3 "Model choice" cost estimate) → ~30,000 calls ≈ **$22+**, more than a $5–10 prepay.
     Top up the prepay balance (or accept that a 402 at $0 stops calls; rules answers stay) and raise the spend cap to
     match.
   - Set `GEMINI_MAX_CALLS` = `5000` (pencil icon). This also applies to scheduled runs while it is set (each limited
     by its 10-minute budget), so keep the window short.
   - Run backfill chunks exactly as in Step 3 (points 1–3). Each shows `modelCalls` ≤ 5,000.
   - When a chunk says `Backfill complete: yes`, set `GEMINI_MAX_CALLS` back to `300` **the same day**.
5. **Complete when** `Backfill complete: yes` with Gemini on (the low-confidence rows the model may still try are
   counted in `remaining`).

(f) Verify: Google billing page spend ≈ `modelCalls` × $0.00075; `modelErrors` under ~5% of calls.

(g) Rollback: `GEMINI_ENABLED` = `false` → rules only again; model answers already written stay (they passed the rules
check). Runaway spend: also delete the key (E3 setup step 11).

## Step 7 — E4: API filters (merge, then deploy backend only after the backfill)

(a) `Read docs/plans/job-attributes/E4-api-filters.md and implement it exactly. Work on branch feat/ja-4-api-filters from origin/main and finish with scripts/agents/push-branch.sh.`

(b)–(d) Standard loop, `E4`. Extra checks: contract fixtures change only by **added** fields; tests for
`00-PLAN.md` Review focus 4 and 5 exist. No merge timing is needed: with production Redis unconfigured the
publisher skips all cache writes, and once Redis is on, the one-time full detail rewrite costs about one extra Sunday
rewrite (E4 "ROLLOUT (PR body)").

(e) After merge:
1. Wait for one scheduled **Daily scrape** to end green (not exit code 2).
2. Confirm Steps 3 and 6 ended with `Backfill complete: yes`. **Do not deploy before that.**
3. **Deploy to Vercel**: `app=backend`, `target=production`, `ref=main` → approve → smoke `PASSED`.

(f) Verify (edge cache may hold old answers up to 1 h, `docs/deployment-and-operations.md:165`):
```bash
curl -s "$API/v1/facets" | jq '{experience, clearance}'
# expect keys 0-2, 3-5, 6-9, 10plus, unspecified and clearance {required, exclude}; unspecified ≈ 20% of jobs
curl -s "$API/v1/jobs?clearance=required&pageSize=5" | jq '{total, titles: [.data[].title]}'
# expect total > 0, mostly defense companies (Anduril, Palantir, …)
curl -s "$API/v1/jobs?experience=3-5&pageSize=5" | jq '{total, years: [.data[].experienceMinYears]}'
# expect every value 3, 4 or 5
curl -s "$API/v1/jobs?pageSize=1" | jq .total
curl -s "$API/v1/jobs?clearance=exclude&pageSize=1" | jq .total
# exclude total = unfiltered total − required total
curl -s "$API/v1/jobs?clearance=bogus&pageSize=1" | jq .total
# same as unfiltered (invalid values are ignored, no 400)
```

(g) Rollback: Vercel → `job-scrapper-api` → Deployments → previous → **Instant Rollback**, or Deploy to Vercel
`app=backend`, `ref=<previous main SHA>` (`deploy.yml:24-27`). Revert the PR if the code is wrong; cache bodies with
the extra fields are harmless to the old API.

## Step 8 — E5: UI filters (deploy frontend after the backend)

(a) `Read docs/plans/job-attributes/E5-ui-filters.md and implement it exactly. Work on branch feat/ja-5-ui-filters from origin/main and finish with scripts/agents/push-branch.sh.`

(b)–(d) Standard loop, `E5`. Extra check: labels exactly `0–2 yrs`, `3–5 yrs`, `6–9 yrs`, `10+ yrs`, `Not specified`,
`Any`, `Required`, `Exclude`, `Clearance required`, `<N>+ yrs`.

(e) After merge, only when Step 7's backend is live: **Deploy to Vercel** `app=frontend`, `target=production`,
`ref=main` → approve → smoke `PASSED`.

(f) Verify at `https://www.boolean.page`: pick `3–5 yrs` and `Required`; the URL gains `experience=3-5` and
`clearance=required`; counts match `/v1/facets`; cards show `Clearance required` / `N+ yrs`; reload keeps the
filters; check once at phone width.

(g) Rollback: Vercel → `job-scrapper-ui` → **Instant Rollback**, or Deploy `app=frontend`, `ref=<previous SHA>`. The
backend can stay on E4.

## Step 9 — E6: docs sweep and release

(a) `Read docs/plans/job-attributes/E6-rollout-and-release.md and implement it exactly. Work on branch docs/ja-6-rollout-and-release from origin/main and finish with scripts/agents/push-branch.sh.`
When asked, tell it: E5 frontend deploy passed, backfill finished on <date>, current `ENRICH_ENABLED`,
`GEMINI_ENABLED`, `GEMINI_MAX_CALLS` values.

(b)–(d) Standard loop, `E6`. Extra checks: nothing under `backend/src`, `frontend/src`, `backend/prisma`, `.github`
changed; `CHANGELOG.md` has `## [1.4.0] - <date>`; both `package.json` say `1.4.0`.

(e) After merge: repo → **Releases** → **Draft a new release** → **Choose a tag** → `v1.4.0` → target `main` → paste
the `[1.4.0]` CHANGELOG section → **Publish release**. No deploy.

(f) Verify: the release page shows `v1.4.0`.

(g) Rollback: revert the PR; delete the release if needed.

---

## Stop and ask (paste the run link and summary into Claude Code; change nothing else)

- Publish blocked: run ends with exit code 2 or the summary says the sanity gate tripped (30% drop rule).
- A normal **Daily scrape** run takes more than ~132 min (worst case with the 12-min enrich step; timeout 150).
- A Google budget alert email, a 402 in `modelErrors`, or spend above `modelCalls` × $0.00075.
- Backfill not converging (`remaining` flat for two chunks), or `modelErrors` above ~5% of `modelCalls`.
- Neon usage projects above ~4 GB egress this month.
- Any run turns red, or a `scrape-alert` issue opens, after one of these steps.
- `/v1/facets` shows `unspecified` above ~40%, or `clearance=required` returns mainstream tech companies.

## Timeline

| Day | Step | Your time | Waiting |
|---|---|---|---|
| 1 | E1 merge; one scheduled run | 30 min | ≤ 3 h |
| 1–2 | E2 merge | 30 min | — |
| 2 | Rules backfill chunks back to back | 10 min per chunk | ~2 h 05 m per chunk |
| 2–3 | `ENRICH_ENABLED=true`; check one run + Neon usage | 15 min | ≤ 3 h |
| 3 | E3 merge | 30 min | — |
| 3–4 | Gemini setup, `GEMINI_MAX_CALLS=300`, `GEMINI_ENABLED=true`; raise to 5000, Gemini chunks, back to 300 | 60 min | ~2 h 05 m per chunk |
| 4–5 | E4 merge; one scheduled run; deploy backend, curl checks | 50 min | ≤ 3 h + 1 h edge cache |
| 5 | E5 merge, deploy frontend, UI check | 30 min | — |
| 5–6 | E6 merge, publish `v1.4.0` | 20 min | — |
| +7 days after Step 4 | Neon egress check | 5 min | — |

## Notes for the plan owner

1. **Variable vs environment secret.** `GEMINI_API_KEY` goes in the `production` environment, as E3 says; DESIGN says
   only "GitHub secret". `production` accepts deployments from `main` only (`docs/deployment-and-operations.md:203`),
   so manual runs must use branch `main`.
2. **E4 merge changes production cache bodies before the backend deploy.** The scheduled scrape runs code from `main`
   (`scrape-daily.yml:97-102`), so its publish writes the new fields and the old live API serves them (additive).
   Today production runs without Redis (`docs/deployment-and-operations.md:167`; E4 "ROLLOUT" says the Publisher returns
   `skipped_not_configured`), so the publish and the one-time detail rewrite are no-ops; no merge timing is needed.
3. **References to E1–E5 name sections, not line numbers**, so they survive edits to those files.
4. **Rollout order follows `00-PLAN.md:50-52`** (backfill before `ENRICH_ENABLED`). The backfill input works with
   `ENRICH_ENABLED` off, so this order is safe.
5. **`GEMINI_MAX_CALLS=5000` is shared.** No separate backfill cap exists; while raised, scheduled runs may also spend
   up to their 10-minute budget. Lower it the same day.
6. **Release 1.4.0** assumes the version conflict noted in `E6-rollout-and-release.md` (CHANGELOG `1.3.0` vs
   `package.json` `0.1.0`) is resolved as written there.
