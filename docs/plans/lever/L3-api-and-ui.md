# L3 — Lever in the API contract and the UI (Antigravity prompt)

> Owner: after L2 is merged, paste "Read docs/plans/lever/L3-api-and-ui.md and implement it exactly."
> Background: `docs/plans/lever/00-PLAN.md`.

You are working in the Ashby Job Scraper monorepo (product: B.O.O.L.E.A.N). Implement ONE PR: Lever as a third value
everywhere the API and UI show a source. Additive contract change. Squash-merge. Follow AGENTS.md, CLAUDE.md,
docs/agents/context.md and every rule in docs/agents/rules/ (api-contract-sync, api-cache, frontend-invariants,
frontend-design).

## HARD RULES (non-negotiable)
- Never read, print, stage, or commit `.env*`, `apikeys/`, `backend/apikeys/`, `output/`, `backend/output/`, `.vercel/`.
- Agents never push to `main`/`master`, never merge, never force-push, push tags or delete branches, and never run raw
  `git push` or `gh`. Publish only with `scripts/agents/push-branch.sh`. Owner reviews and merges.
- Never connect to production; no scrapes/publishes/deploys. MUI only (no Tailwind). No new `any`.
- **Additive only**: no DTO field removed or renamed. No schema change. Scraper unchanged. Commit before check-all.
- Never stage `.impeccable/`.

## PRECONDITION
- origin/main contains L2 (`backend/src/lib/ats/LeverClient.ts`). Otherwise STOP. Branch: `feat/lv-3-api-ui`.

## BACKEND (follow docs/agents/rules/api-contract-sync.md)
1. Add `'lever'` to `API_SOURCES` in `backend/src/lib/ats/source.ts` (L1). That alone turns on
   `GET /v1/jobs?source=lever` in `types.ts` (≈433), `queries.ts` (≈60) and `lib/cache/keys.ts` (≈186-191).
   Already generic (only add tests): `source` in `KNOWN_PARAMS` (`keys.ts:66-81`), `matchesFilter`
   (`contract.ts:279`), facets `sources` groupBy (`queries.ts:233`), `boardUrl` (`queries.ts:319`, via `urls.ts`).
   `source=` views are never pre-rendered (`isCacheableView`, `keys.ts:250-266`), so `?source=lever` always takes
   the DB path. No Publisher view change.
2. `ashbyId` JSDoc in `api/types.ts` → "legacy global key (`greenhouse:<id>` / `lever:<uuid>`); use source + externalId".
3. Contract fixtures: add one Lever job and one Lever company to the ContractFixtures seed (realistic: UUID externalId,
   `lever:<uuid>` ashbyId, `lv--acme` slug, `jobs.lever.co` URLs, logoUrl null) and a case `jobs.source-lever`;
   `npm --prefix backend run contract:fixtures` then `node scripts/contract/sync-fixtures.mjs`. Expect changes in the
   new rows **and** in totals/counts (`meta.default`, `facets.default`, `companies.*`, `jobs.default` pagination; and
   `jobs.filtered` if the Lever job matches that filter — make it not match). Explain each in the PR body.
   `frontend/src/test/contract.test.ts`: import `jobs.source-lever.json` and add a `satisfies JobsResponse` check,
   like `jobsSourceGreenhouse` (≈19, 44).

## FRONTEND (use the design skills)
Use `.agents/skills/impeccable` (run its `context` script; read `reference/craft-floor.md` before editing UI) — surface
mode Operate; keep DESIGN.md tokens.
1. Add `'lever'` to `FILTER_SOURCES` in `frontend/src/types/api.ts` (L1). `JobFiltersBar.tsx`: **both** the desktop
   Source pill/menu (≈379-428) and the mobile-drawer Source `Select` (≈569-584, incl. its `as 'ashby' | 'greenhouse'`
   cast) list **All / Ashby / Greenhouse / Lever**, built from `FILTER_SOURCES` and one label map — no per-source `if`
   chains. Chip text "Source: Lever". URL-synced (`?source=lever`).
2. `SourceBadge` already says "via Lever" (L1) — check it on JobCard, JobDetailPanel and CompanyHeader with a Lever mock.
3. Copy (find by text): `AboutPage.tsx` "(Ashby & Greenhouse)" → "(Ashby, Greenhouse & Lever)"; `Footer.tsx` add a
   third API link "Lever postings API" → `https://github.com/lever/postings-api`; `frontend/index.html` meta
   description "…on Ashby, Greenhouse & Lever…"; `PRODUCT.md`, root `README.md` and `.github/SECURITY.md` (≈21
   "(Ashby, Greenhouse)") source lists.
4. `mockData.ts`: one Lever job + detail + company (`lv--acme`); facet `sources` gains `{ value: 'lever', count: 1 }`.

## TESTS (write first)
- Backend: ApiServer `source=lever` filter (DB path); unknown source (`workday`) still ignored; company `boardUrl` for
  Lever; CacheParity for `/v1/companies/lv--acme`; ContractFixtures; integration (real Postgres) `MixedSources` extended to three sources —
  `source=lever` returns only Lever jobs and `/v1/facets` counts all three.
- Frontend: desktop menu and mobile `Select` (390px) show four options and selecting Lever sends `source=lever`; chip text; badge "via Lever" on
  card/detail/company header; About/Footer text; contract key-set test.

## DOCS
`backend/docs/api.md` (`source=lever`, fields), `frontend/docs/frontend-ui.md`, `frontend/docs/testing.md`,
ADR-0022 status note, CHANGELOG (`contract` tag), `docs:generate`, docs/agents/context.md if needed (byte budget) +
sync-shells.

## AGENT FILES (hard requirement)
Canonical sources only, then `node scripts/agents/sync-shells.mjs`:
- `docs/agents/rules/api-cache.md` add: "6. `?source=` accepts only `API_SOURCES`; `source=` views are never
  pre-rendered (DB path); company DTOs always carry `boardUrl`."
- `docs/agents/rules/frontend-invariants.md` add: "5. Source labels, the Source filter (desktop menu and mobile
  `Select`) and badges are built from `JOB_SOURCES`/`FILTER_SOURCES` and one label map; never build ATS URLs in the
  browser — use `boardUrl`."

## VERIFY
check-all · test:integration · repo tests · sync-shells --check · contract fixtures stable on a second run.
Screenshots (1440px + 390px, light + dark) of a Lever job card, detail and company page (mock/fixture data) in the PR body.

## COMMIT + PUBLISH
`feat(api,ui): Lever source in API filter, facets and UI (ADR-0022)`; `scripts/agents/push-branch.sh`.

## ROLLOUT (PR body)
**Deploy to Vercel app=backend** (smoke) → **app=frontend** (smoke). The live site shows a Lever filter option that
returns 0 jobs until L5 — acceptable, or the owner may delay the frontend deploy until after L5.
Rollback: Vercel Instant Rollback (backend then frontend) or revert; changes are additive.
