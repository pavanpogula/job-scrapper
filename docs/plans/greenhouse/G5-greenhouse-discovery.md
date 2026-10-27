# G5 — Greenhouse board discovery + enrichment (Antigravity prompt)

> Owner: after G4 is merged and deployed, paste "Read docs/plans/greenhouse/G5-greenhouse-discovery.md and implement it
> exactly." Background: `docs/plans/greenhouse/00-PLAN.md` (§1 has the verified CDX findings).

You are working in the Ashby Job Scraper monorepo. Implement ONE PR: discover Greenhouse board tokens at scale and keep
their company name/logo fresh. Discovery inserts companies but **does not enable scraping** (that is G6). Squash-merge.
Follow AGENTS.md, CLAUDE.md, docs/agents/context.md and every rule in docs/agents/rules/.

## HARD RULES (non-negotiable)
- Never read, print, stage, or commit `.env*`, `apikeys/`, `backend/apikeys/`, `output/`, `backend/output/`, `.vercel/`.
- Agents never push to `main`/`master`, never merge, never force-push, push tags or delete branches, and never run raw
  `git push` or `gh`. Publish only with `scripts/agents/push-branch.sh`. Owner reviews and merges.
- Never connect to production DB; no discovery/scrape runs against prod. Tests use recorded fixtures (no network).
  While developing you may make a handful of public CDX / Greenhouse GETs (≤ 1/s).
- Ashby discovery behaviour unchanged (including its crawl id — updating Ashby's crawl id is a separate follow-up).
  No new `any`. Commit before running check-all.

## PRECONDITION
- origin/main contains G4 (`backend/src/api/types.ts` has `boardUrl`). Otherwise STOP. Branch: `feat/gh-5-discovery`.

## BUILD
1. `backend/src/discovery/CdxWorker.ts` gains `--source=greenhouse` (default `ashby` = today's behaviour):
   - Hosts: `job-boards.greenhouse.io`, `boards.greenhouse.io`, `job-boards.eu.greenhouse.io`, `boards.eu.greenhouse.io`.
   - **Paged CDX** (unpaged prefix queries return 504 — verified): use `showNumPages=true` then `page=N`, or narrower
     prefixes (`…/a*` … `…/z*`, `…/0*` … `…/9*`), each with retry/backoff and an overall time budget.
   - Greenhouse mode uses **paged Common Crawl only** (no Wayback) and takes the latest crawl id from
     `https://index.commoncrawl.org/collinfo.json` (fall back to `CC-MAIN-2024-51`). Ashby mode is untouched.
   - Budget: validate only tokens **not already** in the DB, at most 500 new tokens per run; stop cleanly when the
     time budget (20 min) is reached and report how many were left.
   - Token extraction: first path segment, lower-cased; also `embed/job_board?for=<token>`; drop reserved segments
     (`embed`, `jobs`, `job_app`, `v1`, `api`, …) and query junk; Greenhouse token regex `^[a-z0-9][a-z0-9_-]{1,59}$`.
   - Validate each new token with `GET https://boards-api.greenhouse.io/v1/boards/{token}` (200 → keep with `name`,
     404 → drop) at ≤ 5 concurrent, honouring 429/Retry-After.
   - Upsert `Company { slug: 'gh--' + token, source: GREENHOUSE, atsToken: token, name, status: ACTIVE }` by
     `(source, atsToken)`; never touch Ashby rows.
   - **Hide empty Greenhouse companies**: `/v1/companies` (`queryCompanies`), `/v1/companies/:slug` and the Publisher's
     company pages exclude `source = GREENHOUSE` companies with no active listed jobs (Ashby behaviour unchanged).
     So discovered boards stay invisible until G6 scrapes them, and after a rollback they disappear again. Tests +
     CacheParity cover it.
2. Enrichment (`EnrichCompanies.ts`, dispatch from G2): Greenhouse `fetchCompanyMetadata` returns `name` from
   `/v1/boards/{token}` and a best-effort logo: the `og:image` (or header logo `<img>`) of
   `https://job-boards.greenhouse.io/{token}` (its robots.txt allows all paths — verified) if present and an absolute
   https URL; otherwise null (UI shows initials). Boards without a logo are retried at most once per 7 days (use
   `lastCheckedAt`), capped at 200 per run.
3. `.github/workflows/discover-weekly.yml`: a **separate job** `discover-greenhouse` (own `timeout-minutes: 30`, runs
   after the Ashby job, same concurrency group, `db push` first like G1 added) running
   `npm run discover -- --source=greenhouse --enrich`, gated by repo variable `DISCOVERY_GREENHOUSE_ENABLED == 'true'`
   (default off); step summary prints tokens found / already known / validated / inserted / skipped-by-budget.

## TESTS (recorded fixtures)
- Extractor: path tokens, EU host, `embed/job_board?for=`, upper-case → lower, reserved segments, junk queries,
  regex rejects; Ashby extractor unchanged (incl. `--` rejection from G1).
- Paged CDX client: page iteration, 504 retry then give-up within budget, collinfo fallback.
- Validation: 200 keeps with name, 404 drops, 429 backs off.
- Upsert: `gh--` slug, idempotent re-run, Ashby rows untouched (integration, real Postgres).
- Enrichment: name from board info; og:image parsing; missing logo → null; Ashby path unchanged.
- E2E DiscoveryPipeline with a Greenhouse fixture. Workflow repo test for the gated step.

## DOCS
`backend/docs/external-apis.md` (Greenhouse discovery + enrichment), `backend/docs/cli-commands.md`,
`docs/deployment-and-operations.md` (new variable), CHANGELOG, `docs:generate`.

## VERIFY
check-all · test:integration · repo tests · sync-shells --check.

## COMMIT + PUBLISH
`feat(discovery): Greenhouse board discovery and enrichment`; `scripts/agents/push-branch.sh`.

## ROLLOUT (PR body)
Merge → owner sets repo variable `DISCOVERY_GREENHOUSE_ENABLED=true` → Actions → discover-weekly → Run workflow →
send Claude the step summary. Companies are inserted but stay hidden (no jobs) and are not scraped until G6.
Rollback: set the variable to false — empty Greenhouse companies are already hidden, so nothing needs deleting.
