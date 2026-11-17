# L4 — Lever board discovery + enrichment (Antigravity prompt)

> Owner: after L3 is merged and deployed, paste "Read docs/plans/lever/L4-lever-discovery.md and implement it exactly."
> Background: `docs/plans/lever/00-PLAN.md` (§1 has the verified Wayback / Common Crawl findings).

You are working in the Ashby Job Scraper monorepo. Implement ONE PR: discover Lever sites at scale and keep their
name/logo fresh. Discovery inserts companies but **does not enable scraping** (that is L5). Squash-merge. Follow
AGENTS.md, CLAUDE.md, docs/agents/context.md and every rule in docs/agents/rules/ (ci-and-workflows).

## HARD RULES (non-negotiable)
- Never read, print, stage, or commit `.env*`, `apikeys/`, `backend/apikeys/`, `output/`, `backend/output/`, `.vercel/`.
- Agents never push to `main`/`master`, never merge, never force-push, push tags or delete branches, and never run raw
  `git push` or `gh`. Publish only with `scripts/agents/push-branch.sh`. Owner reviews and merges.
- Never connect to production DB; no discovery/scrape runs against prod. Tests use recorded fixtures (no network).
  While developing you may make a handful of public Wayback / Lever GETs (≤ 1/s).
- Ashby and Greenhouse discovery behaviour unchanged. No new `any`. Commit before check-all. Never stage `.impeccable/`.

## PRECONDITION
- `git fetch origin`; origin/main contains L3 (`API_SOURCES` includes `lever`) and `LeverClient.validateSite` (L2).
  Otherwise STOP. Branch `feat/lv-4-discovery` from `origin/main`.

## BUILD
1. New file `backend/src/discovery/LeverDiscovery.ts`; `CdxWorker.runDiscovery` dispatches `--source=lever` to it
   (remove L1's "not implemented" exit). The CLI block (`CdxWorker.ts` `require.main`, ≈710-730) already parses
   `--budget` / `--time-budget-min` via `parseTokenBudget` / `parseTimeBudgetMs`: make them apply to `lever` too
   (update the "only apply with --source=greenhouse" warning) and type `source` as `AtsSource` (≈392, ≈647).
2. **Wayback harvest** (Common Crawl is useless here — CCBot is disallowed):
   - For each prefix `p` in `a…z`, `0…9`: `GET http://web.archive.org/cdx/search/cdx?url=jobs.lever.co/{p}&matchType=prefix&fl=original&collapse=urlkey&from=<currentYear-2>&limit=20000&showResumeKey=true`.
     If the response ends with a resume key, continue with `&resumeKey=<key>` until none is returned (or the phase
     deadline). `urlkey` matching is case-insensitive, so `k` also returns `Kyverna` — good.
   - ≥ 1 s between Wayback calls. 503/504/timeouts are **expected** (~40% transient): retry up to 3× with 30–60 s
     backoff; honour 429 Retry-After. Export `fetchWithRetry` from `CdxWorker.ts` (≈263) and extend it with an optional
     `{ honorRetryAfter?: boolean; maxRetryAfterMs?: number; retryOn5xxDelayMs?: number }` third argument without changing
     current callers; or use a small local loop — either way unit-tested. If a prefix still fails after retries, split it
     once into two-character prefixes (`a0…a9`, `aa…az`, `a-`, `a.`, `a_`, `a%26`) and retry those; count prefixes that
     finally failed.
   - **Persistent state** in `backend/output/lever-discovery-state.json` (shape:
     `{ version: 1, harvest: { nextPrefix: string | null, resumeKey: string | null, completedAt: string | null },
     tokens: Record<token, { firstSeen: string; outcome?: 'live'|'empty'|'not_found'|'dead_board'|'error'; checkedAt?: string }> }`),
     restored/saved in the workflow with `actions/cache/restore@v6` / `actions/cache/save@v6` (`if: always()`), key
     `lever-discovery-v1-${{ github.run_id }}`, restore-key `lever-discovery-v1-` — the same pattern as
     `run-history.json` in scrape-daily. Code never prints it. Missing/corrupt file → start fresh.
   - Each run **resumes** the harvest at `nextPrefix`/`resumeKey`; when the last prefix finishes, set `completedAt` and
     start the next cycle from `a` on the following run. Harvest gets at most **50 %** of the time budget; validation
     gets the rest.
   - Lever default `--time-budget-min` = **100** (Greenhouse keeps 20).
   - `extractLeverToken(url: string): string | null` (exported, pure): host must be `jobs.lever.co` (with or without
     scheme); first path segment; safe `decodeURIComponent` (bad encoding → null); keep **case as is**; must match
     `/^[A-Za-z0-9][A-Za-z0-9._&-]{0,79}$/`; reject reserved segments (`img`, `css`, `js`, `assets`, `static`,
     `favicon.ico`, `robots.txt`, `sitemap.xml`, `v0`, `api`, `search`, `embed`) compared case-insensitively.
     `jobs.eu.lever.co` → null (EU out of scope for v1). Dedupe tokens exactly (case-sensitive: `assembly` and
     `Assembly` are both validated).
3. **Validate** tokens not already in the DB for `source='LEVER'` (compare `atsToken` exactly), in this order:
   never-checked tokens first, then rejected tokens (`empty`/`not_found`/`dead_board`/`error`) whose `checkedAt` is
   older than 30 days, oldest first; record each outcome + `checkedAt` in the state file. At most `--budget`
   (default 500) per run, with `LeverClient.validateSite` (pacer: 1 req/s, concurrency 1 — up to two requests
   per token). Seed only `live`. Count `not_found`, `empty`, `dead_board`, `error` separately. Stop cleanly at the
   deadline and report "left by budget/time".
4. **Upsert** `Company { slug, source: LEVER, atsToken: token, status: ACTIVE }` by `(source, atsToken)`, slug from
   L2's `allocateCompanySlug`. Name: only fetch it here when time remains;
   otherwise enrichment fills it. Never touch other sources' rows. Empty Lever companies are hidden by L1's rule — add a
   test for Lever.
5. **Enrichment** (`EnrichCompanies.ts`): add Lever candidates like Greenhouse — active Lever boards without a logo (or
   with name = slug or null), retried at most once per 7 days via `lastEnrichedAt`, capped at 200 per run, logo rule
   from L2. Change the two Greenhouse-only `lastEnrichedAt` writes (≈192, ≈201) to `atsSource !== 'ashby'`. Merge the
   Greenhouse and Lever candidate blocks into one loop over non-Ashby sources only if it stays readable; Greenhouse
   behaviour unchanged.
6. `.github/workflows/discover-weekly.yml`: new job `discover-lever` — `needs: discover-greenhouse`,
   `if: always() && vars.DISCOVERY_LEVER_ENABLED == 'true'`, `timeout-minutes: 120`, state-file cache restore before and
   save after (`if: always()`), **no job-level `concurrency:`**
   (the workflow-level `discovery-pipeline` group already serializes runs; a same-named job group would deadlock),
   `prisma db push --skip-generate` before `npm run discover -- --source=lever --enrich`. Step summary: **harvest
   complete: yes/no** (+ next prefix), prefixes queried / failed, Wayback rows read, **unique tokens found (the board-count estimate)**, already known, validated,
   live (inserted), empty, not_found, dead_board, left by budget/time.

## TESTS (recorded fixtures in `backend/tests/fixtures/lever/discovery/`)
- `extractLeverToken`: `https://jobs.lever.co/spotify/abc` → `spotify`; `jobs.lever.co/spotify` → `spotify`;
  `jobs.lever.co/AIFund/x` → `AIFund`; `jobs.lever.co/arcteryx.com/x` → `arcteryx.com`;
  `jobs.lever.co/1840%26Company` → `1840&Company`; `100ms` kept; `*`, `%2a`, `%E0%A4%A`, quotes/`<`/whitespace →
  null; reserved (`IMG` too) → null; EU host → null; other host → null.
- Wayback client: iterates 36 prefixes; follows `resumeKey`; 503 then success; a prefix failing 3× splits into
  two-character prefixes incl. `a-`; 429 Retry-After respected; harvest stops at 50 % of the deadline (fake timers).
- State file: resume at `nextPrefix`/`resumeKey`; corrupt file → fresh start; a run whose first 500 candidates were
  all rejected last week validates 500 *different* tokens; a rejection older than 30 days is re-checked.
- Validation: `live` inserted; `empty`, `not_found`, `dead_board` not inserted and counted; pacer spacing; budget and
  deadline stop with "left" count.
- Upsert (integration, real Postgres): slug rule incl. collision suffix; idempotent re-run; `assembly` and `Assembly`
  are two companies; Ashby + Greenhouse rows untouched; an empty Lever company is absent from `/v1/companies`.
- Enrichment: logo from header img (regional and region-less host); banner og:image ignored; `lastEnrichedAt`
  throttle; Greenhouse path unchanged.
- Workflow repo test (`scripts/repo-tests/toggles.test.mjs` ≈110-140 style): guard
  `vars.DISCOVERY_LEVER_ENABLED == 'true'`, `timeout-minutes: 120`, `needs: discover-greenhouse`, no job-level
  concurrency, cache restore/save of `backend/output/lever-discovery-state.json`, db push before `npm run discover -- --source=lever --enrich`.

## DOCS
`backend/docs/external-apis.md` (Lever discovery + enrichment; why Wayback, not Common Crawl; EU skipped),
`backend/docs/cli-commands.md` (`--source=lever`, budgets, 100-min default), `docs/deployment-and-operations.md` (variable
`DISCOVERY_LEVER_ENABLED`, state-file cache), `backend/docs/outputs-and-artifacts.md` (new
`output/lever-discovery-state.json`: shape, cache key, safe to delete = fresh start), `backend/docs/known-issues.md`
(EU boards on `api.eu.lever.co` not discovered; Wayback 503s), CHANGELOG, `docs:generate`.

## AGENT FILES (hard requirement)
Canonical sources only, then `node scripts/agents/sync-shells.mjs`:
- `docs/agents/rules/multi-source-ats.md` append: "12. Lever discovery uses Wayback CDX (Common Crawl is blocked by
  jobs.lever.co), keeps token case, seeds a site only when `validateSite` is `live` (API ≥ 1 posting **and** board page
  200), and persists progress in `output/lever-discovery-state.json` (never printed). EU (`jobs.eu.lever.co`) is not
  supported yet."
- `docs/agents/rules/ci-and-workflows.md` rule 5 feature toggles: add `DISCOVERY_GREENHOUSE_ENABLED`,
  `DISCOVERY_LEVER_ENABLED`.

## VERIFY
check-all · test:integration · repo tests · sync-shells --check.
Optional (local throwaway DB only): `discover -- --source=lever --budget=30 --time-budget-min=5` → paste the summary.

## COMMIT + PUBLISH
`feat(discovery): Lever site discovery via Wayback CDX and enrichment (ADR-0022)`; `scripts/agents/push-branch.sh`.

## ROLLOUT (PR body)
Merge → owner sets repo variable `DISCOVERY_LEVER_ENABLED=true` → Actions → discover-weekly → Run workflow → send Claude
the step summary. "Unique tokens found" is the board-count estimate that sets L5's cap — trust it only once "harvest
complete: yes". Expect several runs to validate everything (~2–3k live boards at ≤ 1 req/s, 500 per run); the owner may dispatch extra runs. Companies stay
hidden (no jobs) and are not scraped until L5. Rollback: set the variable to false; nothing needs deleting.
