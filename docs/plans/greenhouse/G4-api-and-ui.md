# G4 — API contract + UI for multiple sources (Antigravity prompt)

> Owner: after G3 is merged, paste "Read docs/plans/greenhouse/G4-api-and-ui.md and implement it exactly."
> Background: `docs/plans/greenhouse/00-PLAN.md`.

You are working in the Ashby Job Scraper monorepo (product: B.O.O.L.E.A.N). Implement ONE PR: expose the job source in
the API and the UI, and make all user-facing copy source-neutral. Additive contract change. Squash-merge. Follow
AGENTS.md, CLAUDE.md, docs/agents/context.md and every rule in docs/agents/rules/ (api-contract-sync, api-cache,
frontend-invariants, frontend-design).

## HARD RULES (non-negotiable)
- Never read, print, stage, or commit `.env*`, `apikeys/`, `backend/apikeys/`, `output/`, `backend/output/`, `.vercel/`.
- Agents never push to `main`/`master`, never merge, never force-push, push tags or delete branches, and never run raw
  `git push` or `gh`. Publish only with `scripts/agents/push-branch.sh`. Owner reviews and merges.
- Never connect to production DB/Redis; no scrapes/publishes/deploys. MUI only (no Tailwind). No new `any`.
- **Additive only:** never remove or rename an existing DTO field. Keep `ashbyId` (mark `@deprecated` in JSDoc).
- No schema change. Scraper unchanged. Commit before running check-all.

## PRECONDITION
- origin/main contains G3 (`backend/src/lib/ats/GreenhouseClient.ts`). Otherwise STOP. Branch: `feat/gh-4-api-ui`.

## BACKEND (follow docs/agents/rules/api-contract-sync.md)
1. `backend/src/api/types.ts`:
   - `JobListItemDTO`, `JobDetailDTO`: add `source: 'ashby' | 'greenhouse'` and `externalId: string`;
     `ashbyId` JSDoc → "@deprecated legacy global key (`greenhouse:<id>` for Greenhouse); use source + externalId".
   - `CompanySummaryDTO`, `CompanyProfileDTO`, `CompanyDetailDTO`: add `source` and `boardUrl: string`
     (Ashby `https://jobs.ashbyhq.com/{atsToken}`, Greenhouse `https://job-boards.greenhouse.io/{atsToken}`; built
     server-side via `AtsClient`, falling back to `slug` when `atsToken` is null).
   - `FacetsResponseDTO`: add `sources: FacetCountDTO[]` (values `ashby`/`greenhouse`).
2. `contract.ts`: `LIST_SELECT`/`DETAIL_SELECT` add `source`, `externalId` (and `company.atsToken` in DETAIL_SELECT);
   mappers map enum → lower-case via `lib/ats/source.ts` and fall back `externalId ?? ashbyId`; detail `jobUrl` fallback
   via the pure builders in `lib/ats/urls.ts` using `company.atsToken` (fallback: `companySlug` with a leading `gh--`
   removed). Import only `lib/ats/urls.ts`/`source.ts` into the API — never the HTTP clients.
2b. Widen `SLUG_REGEX` (`backend/src/api/db/queries.ts`, `^[a-z0-9-]{1,100}$`) to `^[a-z0-9_-]{1,100}$` because
   Greenhouse tokens may contain `_` (e.g. `gh--foo_bar`); Ashby slugs never do. Update the related tests and any
   frontend route/slug checks.
3. `GET /v1/jobs?source=ashby|greenhouse`: add to `KNOWN_PARAMS` + `parseJobsQuery` allow-list (unknown value ignored),
   `JobQueryParams`/`parseJobQueryParams`, `queryJobs` (`where.source`), `matchesFilter`. Not pre-rendered:
   `isCacheableView` stays false for it (DB path), so no Publisher view changes. Facets compute `sources`.
4. `/v1/companies` + `/v1/companies/:slug` include `source` and `boardUrl` (Publisher company pages too — CacheParity).
5. Contract fixtures: add one Greenhouse job and one Greenhouse company to the ContractFixtures seed (realistic:
   numeric externalId, `greenhouse:<id>` ashbyId, `gh--` slug, logoUrl null), new case `jobs.source-greenhouse`;
   `npm --prefix backend run contract:fixtures` then `node scripts/contract/sync-fixtures.mjs`. Snapshots change only
   by the new fields — explain in the PR body.

## FRONTEND (use the design skills)
Use `.agents/skills/impeccable` (run its `context` script; read `reference/craft-floor.md` before editing UI) — surface
mode Operate; keep DESIGN.md tokens.
1. `frontend/src/types/api.ts`: add `source?`, `externalId?` (optional — an older cache body may lack them; default
   `'ashby'`), company `source?`/`boardUrl?`, facet `sources?`, query param `source?`. Contract test exact key sets
   updated.
2. Source badge: small, quiet "via Greenhouse" / "via Ashby" caption on `JobCard`, `JobDetailPanel` header and
   `CompanyHeader` (one shared `SourceBadge` component; no logos of Ashby/Greenhouse).
3. Filter: a "Source" pill in `JobFiltersBar` (All / Ashby / Greenhouse) → `?source=`; URL-synced via `useJobFilters`.
4. Board links come from the API: `CompanyHeader` "View on Ashby" → "View careers board ↗" using `boardUrl`;
   `CompanyCard` external icon tooltip likewise. Never build `jobs.ashbyhq.com/...` in the browser.
5. Source-neutral copy (find by text — line numbers drift): Header "Live verified jobs · Ashby ATS"; Footer "Ashby
   Public API" link (→ "Ashby & Greenhouse public job APIs", or two links); AboutPage "application form on Ashby" and
   "Ashby's Public Job Posting API with automatic hosted GraphQL fallback"; CompanyPage "may not be actively hiring on
   Ashby" (2×); NotFoundPage title "Ashby Job Index"; `frontend/index.html` meta description "…on Ashby ATS";
   `PRODUCT.md` (sources), root `README.md` title/intro ("Ashby Job Scraper" → "multi-source" wording; keep the
   B.O.O.L.E.A.N name). Keep `themeSlice` localStorage key `ashby_theme` (renaming resets users' theme).
6. Mocks (`mockData.ts`) gain one Greenhouse job/company.

## TESTS (write first)
- Backend: ApiServer `source=` filter + unknown value ignored; DTO fields; company `boardUrl` per source;
  CacheParity incl. new fields; ContractFixtures; integration Search/Companies with mixed sources (`source=` returns
  exactly that source).
- Frontend: SourceBadge on card/detail/company header; Source pill sends `source=`; CompanyHeader link uses
  `boardUrl`; no rendered text contains "Ashby ATS" where the copy was neutralized; contract test.

## DOCS
`backend/docs/api.md` (fields, `source=`, deprecations), `frontend/docs/frontend-ui.md`, `frontend/docs/testing.md`,
`docs/system-architecture-and-flows.md`, ADR-0021 status, CHANGELOG (`contract` tag), `docs:generate`,
docs/agents/context.md REST line if needed (byte budget) + sync-shells.

## VERIFY
check-all · test:integration · repo tests · sync-shells --check · contract fixtures re-recorded and synced (stable on a
second run). Screenshots (1440px + 390px, light + dark) of a Greenhouse job card/detail and company page using mock or
fixture data, in the PR body.

## COMMIT + PUBLISH
`feat(api,ui): job source in API and UI, source filter, source-neutral copy (ADR-0021)`; `scripts/agents/push-branch.sh`.

## ROLLOUT (PR body)
Schema already exists (G1). **Deploy to Vercel app=backend** (smoke) → if Redis is configured, dispatch scrape-daily
`publish_only=true` → **Deploy app=frontend**. Then send Claude the `/v1/meta` numbers (activeJobs, hiringCompanies)
so Claude can confirm nothing dropped. Until G6, the live site simply shows "via Ashby" everywhere.
Rollback: Vercel Instant Rollback (backend then frontend) or revert; fields are additive.
