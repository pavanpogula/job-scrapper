# PR A — Company API for the B.O.O.L.E.A.N UI (Antigravity prompt)

> Owner: paste "Read docs/plans/boolean-ui/PR-A-company-api.md and implement it exactly." into a fresh Antigravity session.
> Full background and screenshots-based research: `docs/plans/boolean-ui/00-PLAN.md`.

You are working in the Ashby Job Scraper monorepo (product name: B.O.O.L.E.A.N). Implement ONE PR: "Company API for the
new UI". Squash-merge. Backend behaviour change -> ADR-0019. Follow AGENTS.md, CLAUDE.md, docs/agents/context.md and every
rule in docs/agents/rules/ (api-cache, api-contract-sync, prisma-schema, ci-and-workflows).

## HARD RULES (non-negotiable)
- Never read, print, stage, or commit `.env*`, `apikeys/`, `backend/apikeys/`, `output/`, `backend/output/`, or `.vercel/` values.
- Agents never push to `main`/`master`, never merge, never force-push, push tags or delete branches, and never run raw
  `git push` or `gh`. Publish only with `scripts/agents/push-branch.sh` (fast-forward only; prints a compare link).
  Give the owner the link; the owner opens the PR, reviews and merges.
- No scrapes, cache publish, deploys, or production DB/Redis access. Integration tests use ONLY TEST_DATABASE_URL (localhost).
- No schema.prisma changes (none needed). No new `any` (any-ratchet). Do not touch vercel.json or workflows.
- Commit before running check-all (docs:check needs committed backend/docs).

## PRECONDITION
- Start from latest origin/main (contains #20 search 4c39355 and #21 P8a). Branch: `feat/company-pages-api`
- Commit the folder `docs/plans/boolean-ui/` (00-PLAN.md, PR-A-company-api.md, PR-B-boolean-ui.md) in this PR as-is,
  so PR B can read it from main. Do not edit those files except to tick status.

## BUILD
1. `GET /v1/companies/:slug` -> `CompanyProfileDTO` (add to backend/src/api/types.ts with JSDoc):
   `{ slug, name: string|null, logoUrl: string|null, jobCount, withSalary, latestPublishedAt: string|null,
     workplaceTypes: FacetCountDTO[], employmentTypes: FacetCountDTO[], departments: FacetCountDTO[] (top 10 by count),
     locations: FacetCountDTO[] (top 10) }`
   Counts over active && isListed jobs only. 404 `{error:'Company not found'}` for unknown / non-ACTIVE company or a slug
   failing `/^[a-z0-9-]{1,100}$/`. Implement `queryCompanyProfile` in backend/src/api/db/queries.ts (Prisma groupBy/count,
   reuse existing facet helpers). Serve through ReadThroughService like other DB views (never pre-rendered); same
   Cache-Control policy as /v1/companies (middleware/cacheControl.ts).
2. `GET /v1/jobs?company=<slug>`: exact companySlug filter, combines with search (BF-020) and all filters. Add `company`
   to JobQueryParams/parseJobQueryParams (types.ts) and KNOWN_PARAMS + parseJobsQuery (backend/src/lib/cache/keys.ts);
   isCacheableView must stay false for it.
3. `GET /v1/jobs?postedWithin=1d|7d|30d`: `COALESCE(lastUpdatedAt, publishedAt) >= now - window` (ADR-0018 fields).
   Unknown values ignored. Normalised in cache keys; never pre-rendered.
4. `GET /v1/companies?sort=jobs|name` (default name; jobs = most active jobs first, then name, then slug).
5. O5 (owner-approved): companies `totalPages = max(1, ceil(total/limit))` — also on the Publisher path; CacheParity must hold.
6. O14 (owner-approved): unknown `/v1/*` routes return JSON 404 `{error:'Not found'}` (Express catch-all after v1 routes).

## TESTS (write first, see them fail)
- tests/unit/ApiServer.test.ts: new route (found/404/bad slug), company filter, postedWithin, sort, O5, O14.
- tests/integration/Search.test.ts (real Postgres; `npm run test:integration` with a local TEST_DATABASE_URL): add
  company= correctness (exact set, combined with search/filters), postedWithin correctness, and pagination walks with
  company=. Extend searchSeed.ts as needed; keep the reference matcher independent.
- tests/unit/CacheKeys.test.ts: company/postedWithin normalisation, never cacheable.
- Contract fixtures: add cases company-profile.found, company-profile.not-found, jobs.company, companies.sorted-by-jobs
  in backend/tests/contract/ContractFixtures.test.ts (seed realistic rows: logoUrl present, `_count` matching jobs);
  run `npm --prefix backend run contract:fixtures` then `node scripts/contract/sync-fixtures.mjs`; extend
  frontend/src/test/contract.test.ts + frontend/src/types/api.ts with `CompanyProfile` (exact key set, `satisfies`),
  and add `company?`, `postedWithin?` to JobsQueryParams (types only — no UI).
- Snapshots may change only for O5/O14; explain each diff in the PR body.

## DOCS
- backend/docs/api.md (new endpoint, params, 404s); ADR-0019 "Company profile endpoint, company/postedWithin job filters"
  + docs/decisions/README.md + ADR range in docs/README.md; docs/bug-fix-log.md BF-021 (O5) and BF-022 (O14);
  docs/testing.md §6 rows; docs/agents/context.md endpoints line (BYTE BUDGET 6144 — it is ~6105 now; shorten other
  wording to fit) then `node scripts/agents/sync-shells.mjs` + `--check`; docs/monorepo-migration/PROGRESS.md
  (O5/O14 done; P8b now only O6); CHANGELOG [Unreleased]; `npm --prefix backend run docs:generate`.

## VERIFY (paste results in PR body)
- `scripts/check-all.sh --no-install`
- `npm --prefix backend run test:integration` (local throwaway Postgres)
- `node --test 'scripts/repo-tests/**/*.test.mjs'`
- `node scripts/agents/sync-shells.mjs --check`

## COMMIT + PUBLISH
- Conventional Commit with bulleted body, e.g. `feat(api): company profile endpoint and company/postedWithin job filters (ADR-0019)`.
- `scripts/agents/push-branch.sh`; give the owner the link.

## ROLLOUT (PR body; owner does it)
Merge -> Deploy to Vercel `app=backend` production (smoke green) -> check `/v1/companies/openai` and
`/v1/jobs?company=openai` live. No scrape or cache republish needed.
