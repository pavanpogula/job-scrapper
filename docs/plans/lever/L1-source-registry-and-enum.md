# L1 — One source registry + `LEVER` enum value, no behaviour change (Antigravity prompt)

> Owner: paste "Read docs/plans/lever/L1-source-registry-and-enum.md and implement it exactly." Background:
> `docs/plans/lever/00-PLAN.md` (§1 facts, §2 decisions, §3 file list). Use those facts; do not re-research.

You are working in the Ashby Job Scraper monorepo (B.O.O.L.E.A.N). Implement ONE PR that prepares a third ATS source
(Lever) **without scraping it, accepting it in the API, or showing it anywhere**. Squash-merge. Follow AGENTS.md,
CLAUDE.md, docs/agents/context.md and every rule in docs/agents/rules/.

## HARD RULES (non-negotiable)
- Never read, print, stage, or commit `.env*`, `apikeys/`, `backend/apikeys/`, `output/`, `backend/output/`, `.vercel/`.
- Agents never push to `main`/`master`, never merge, never force-push, push tags or delete branches, and never run raw
  `git push` or `gh`. Publish only with `scripts/agents/push-branch.sh`. Owner reviews and merges.
- Never connect to production DB/Redis/API. Never add `--accept-data-loss` to any workflow.
- **No behaviour change.** API responses byte-identical; `?source=lever` must behave exactly as today (ignored → all
  jobs, cacheable). Existing tests stay unchanged **except exactly these**:
  - `backend/tests/unit/ClusterPartition.test.ts` (≈20) and `backend/tests/unit/SourceDeactivate.test.ts` (≈161-164):
    the "unknown source" example `lever` becomes `workday`.
  - `backend/tests/unit/ApiTypes.test.ts` (≈57-90): the compile-time `source` checks expect `AtsSource`.
  - `backend/tests/helpers/prismaFactory.ts` (≈263): the fake Prisma also understands
    `NOT: { source: { not: 'ASHBY' }, jobs: { none: … } }` (BUILD 4).
  - `scripts/repo-tests/fixer-scope.test.mjs` (BUILD 7).
- No new `any` (any-ratchet). JSDoc `@file/@summary/@tags` on new files and functions. Commit before check-all.
- The untracked `.impeccable/` folder in the repo root is not yours: never stage it (`git add` explicit paths only).

## PRECONDITION
- `git fetch origin`; branch `feat/lv-1-source-registry` **from `origin/main`** (not a local `main`, which may be stale).
  origin/main must contain `SUPPORTED_ATS_SOURCES` in `backend/src/lib/ats/source.ts` and the discovery
  `--budget` flag (`parseTokenBudget` in `CdxWorker.ts`). Otherwise STOP.
- Commit this plan folder (`docs/plans/lever/`) in the PR.

## STEP 0 — rehearse the enum change (before writing code)
On a throwaway local Postgres (never prod): push the **current** `schema.prisma`, insert one Company + one Job, then
add `LEVER` to `enum Ats` and run `npx prisma db push --skip-generate` (exactly what `scrape-daily.yml` runs).
Required: exit 0, no "data loss" prompt, rows intact, then a second push says "already in sync". Paste the output in
the PR body. **If it exits non-zero, STOP and report.** Do not work around it with `--accept-data-loss`.

## BUILD
1. `backend/prisma/schema.prisma`: `enum Ats { ASHBY GREENHOUSE LEVER }`; `Job.ashbyId` comment → "Ashby UUID,
   `greenhouse:<id>` or `lever:<uuid>`"; `Company.atsToken` comment (≈31) → "native board token (lower-case for
   Ashby/Greenhouse; exact case for Lever)".
2. `backend/src/lib/ats/source.ts` becomes the registry:
   - `export const SUPPORTED_ATS_SOURCES = ['ashby', 'greenhouse', 'lever'] as const;`
     `export type AtsSource = typeof SUPPORTED_ATS_SOURCES[number];` `DbAts` = the upper-case names.
   - `export const API_SOURCES: readonly AtsSource[] = ['ashby', 'greenhouse'];` — the sources the public API and
     frontend filter accept. **L3 adds `lever` here.**
   - `export interface AtsSourceInfo { source; db; label; slugPrefix; legacyKeyPrefix; apiName }` and
     `export const ATS_SOURCES: Record<AtsSource, AtsSourceInfo>`:
     ashby `{label:'Ashby', slugPrefix:'', legacyKeyPrefix:'', apiName:'Ashby Posting API'}`,
     greenhouse `{label:'Greenhouse', slugPrefix:'gh--', legacyKeyPrefix:'greenhouse:', apiName:'Greenhouse Board API'}`,
     lever `{label:'Lever', slugPrefix:'lv--', legacyKeyPrefix:'lever:', apiName:'Lever Postings API'}`.
   - `toDbAts`, `toAtsSource`, `isAtsSource`, `parseAtsSources` derive from the table (signatures and error texts
     unchanged; the error lists all supported sources). `parseAtsSources('')` still returns `['ashby']`.
   - Add `companySlug(source, token): string` (prefix + token lower-cased; for `lever` every char outside `[a-z0-9-]`
     becomes `-` — 00-PLAN decision 2; the collision suffix is the seeder's job, L2) and `tokenFromSlug(slug): string` (strips any **non-empty** registered
     prefix) and `sourceFromSlug(slug): AtsSource | undefined` (matches **non-empty** prefixes only — never `''`).
3. `backend/src/lib/ats/urls.ts`: add `lever` cases: job `https://jobs.lever.co/{token}/{id}`, board
   `https://jobs.lever.co/{token}`, apply `https://jobs.lever.co/{token}/{id}/apply`. Make the switches exhaustive
   (`never` check). Ashby/Greenhouse keep lower-casing the token; the Lever case uses `encodeURIComponent(token.trim())`
   **without** lower-casing (Lever site names are case-sensitive and may contain `.` and `&`).
   Note for `tokenFromSlug`: Lever rows always have `atsToken`; the slug is a lossy form (00-PLAN decision 2), so
   `tokenFromSlug` is only a last-resort fallback and must never be used to build a Lever URL when `atsToken` exists.
4. Replace the hard-coded spots in 00-PLAN §3 with the registry:
   - `api/types.ts`: DTO `source: AtsSource` (JSON unchanged); comment at ≈265; query parsing at ≈433 accepts
     `API_SOURCES` only.
   - `api/db/queries.ts`: source filter at ≈60 uses `API_SOURCES`; the "hide non-Ashby companies with no open jobs"
     rules at ≈274, 422, 481 become `NOT: { source: { not: 'ASHBY' }, jobs: { none: … } }` / `source !== 'ASHBY'`
     (same result today); token fallbacks at ≈313, 354, 512 use `tokenFromSlug`.
   - `api/contract.ts` ≈209: the `gh--` token fallback in `toJobDetail` uses `tokenFromSlug`.
   - `lib/cache/keys.ts` ≈187-190: keep a source only if it is in `API_SOURCES`.
   - `lib/ReportClassifier.ts` ≈194-199: infer source from a **non-Ashby** `apiName` in the message or
     `sourceFromSlug`; otherwise `undefined` (today's behaviour for Ashby events — never tag them `ashby`). Leave `resolveRelatedBF` (≈115-127) for L2.
   - `database/SourceDeactivate.ts` ≈36: error text lists `SUPPORTED_ATS_SOURCES`.
   - `discovery/CdxWorker.ts`: the `source` types use `AtsSource`; `--source=lever` exits 1 with
     "Lever discovery not implemented yet (L4)".
   - `core/Scraper.ts` ≈882-884 and ≈1023-1025: the non-Ashby message text comes from `ATS_SOURCES[src].apiName`
     (Greenhouse strings stay byte-identical; the classifier hashes them).
   - New `backend/src/lib/ats/registry.ts`: `export const DEFAULT_CLIENT_SOURCES: readonly AtsSource[] = ['ashby',
     'greenhouse'];` and `export function createAtsClient(source: AtsSource): AtsClient` (`lever` throws
     "Lever client not implemented yet (L2)"). `Scraper` (≈179-186) and `EnrichCompanies` (≈53-58) build their
     **eager** default client map from `DEFAULT_CLIENT_SOURCES` — never from `SUPPORTED_ATS_SOURCES` (that would
     throw on every run).
5. Slug guard: Ashby seed/discovery already reject `--` (`Seed.ts:48`, `CdxWorker.ts` `isValidSlug`). Test it for
   `lv--x`.
6. Frontend (no visible change):
   - `frontend/src/types/api.ts`: `export const JOB_SOURCES = ['ashby', 'greenhouse', 'lever'] as const;`
     `JobSource = typeof JOB_SOURCES[number]`; `export const FILTER_SOURCES: readonly JobSource[] = ['ashby',
     'greenhouse']` (L3 adds lever). `useJobFilters.ts:39` and `filterSlice.ts:26` accept `FILTER_SOURCES` only.
   - `SourceBadge.tsx`: label map `{ ashby:'via Ashby', greenhouse:'via Greenhouse', lever:'via Lever' }`; unknown or
     null → `ashby`; `data-source` = the resolved key.
   - `CompanyHeader.tsx:38` and `CompanyCard.tsx:23`: delete the browser-side Greenhouse URL builder and use
     `boardUrl` from the API (present in every company DTO and Publisher body). Missing → no board link.
   - Do **not** add Lever to the filter UI, About, Footer or `index.html` (L3).
7. Remove `^backend/prisma/schema\.prisma` from `scripts/ci/check-fixer-scope.sh` ALLOWED_PATTERNS (≈30) and flip that
   case in `scripts/repo-tests/fixer-scope.test.mjs` (≈205) to "denied", renaming the test title to "(restored in
   L2)", as G1 did.

## TESTS (write first)
- `backend/tests/unit/AtsSource.test.ts`: registry values; `toDbAts`/`toAtsSource` round trip for 3 sources;
  `parseAtsSources('')` → `['ashby']`; `parseAtsSources('lever,ashby')` → `['lever','ashby']`; `'workday'` throws and
  names all three; `companySlug('lever','spotify')` = `'lv--spotify'`; `companySlug('lever','arcteryx.com')` = `'lv--arcteryx-com'`;
  `companySlug('lever','1840&Company')` = `'lv--1840-company'`; `companySlug('lever','AIFund')` = `'lv--aifund'`; `tokenFromSlug('gh--figma')` = `'figma'`;
  `tokenFromSlug('openai')` = `'openai'`; `sourceFromSlug('openai')` = `undefined`; `sourceFromSlug('lv--x')` = `'lever'`.
- `backend/tests/unit/AtsUrls.test.ts`: the three Lever URLs; `boardUrl('lever','AIFund')` =
  `https://jobs.lever.co/AIFund`; `boardUrl('lever','1840&Company')` = `https://jobs.lever.co/1840%26Company`;
  `boardUrl('lever','arcteryx.com')` keeps the dot; Greenhouse/Ashby still lower-case.
- `backend/tests/unit/AtsRegistry.test.ts`: a default `AshbyScraper` and the enrich client map construct without
  throwing; `createAtsClient('lever')` throws the L2 message.
- API: `GET /v1/jobs?source=lever` returns the same body and cache behaviour as `GET /v1/jobs` (ignored).
- Integration (`backend/tests/integration/`): add frozen `fixtures/schema.pre-l1.prisma` (copy of today's
  schema.prisma), isolated schema `lever_l1` like `MultiSourceSchema.test.ts:67`: push pre-L1, seed rows, push live
  schema → success, rows intact; insert `Company { source:'LEVER', slug:'lv--acme', atsToken:'acme' }`.
- Frontend: `SourceBadge` "via Lever" for `lever`, "via Ashby" + `data-source="ashby"` for unknown;
  `CompanyCard`/`CompanyHeader` link = `boardUrl`, none when absent.

## DOCS
New `docs/decisions/ADR-0022-lever-source.md` (00-PLAN §1–§2; Accepted; links ADR-0021) + index in
`docs/decisions/README.md`; one line at the top of `ADR-0021-multi-source-ats.md` "Extended by ADR-0022 (Lever)";
`docs/README.md` index: ADR-0022 link and a "Lever plans (`docs/plans/lever/`)" list next to the Greenhouse one. `backend/docs/database-and-cache.md` (enum value, `lv--`, `lever:` key),
`backend/docs/module-reference.md` (`registry.ts`, registry table), `docs/agents/context.md`: it is 6,075 of the 6,144
bytes allowed (`scripts/repo-tests/agent-shells.test.mjs` ≈177) — **first make room** by collapsing the BF-001…BF-010
list into one line "BF-001…BF-010 → see `docs/testing.md` §6", then update the Multi-source line (Lever planned);
every later PR must keep it ≤ 6,144 bytes + `node scripts/agents/sync-shells.mjs`, CHANGELOG `[Unreleased]`,
`npm --prefix backend run docs:generate`.

## AGENT FILES (hard requirement — Claude Code and Antigravity read these, not the plan)
Edit only the canonical sources in `docs/agents/`, then run `node scripts/agents/sync-shells.mjs` (it regenerates
`.claude/agents/`, `.claude/rules/`, `.agents/agents/`, `.agents/rules/`; never hand-edit those copies).
1. New rule `docs/agents/rules/multi-source-ats.md` (frontmatter like the others: `id: multi-source-ats`, `scope:
   backend`, `always: false`, `applies_to:` `backend/src/**`, `backend/prisma/**`, `frontend/src/**`,
   `.github/workflows/**`) and register it in `RULES_CONFIG` in `scripts/agents/sync-shells.mjs` as
   `{ prefix: '55', id: 'multi-source-ats' }`. Content (as true after L1; later phases append):
   ```
   # Multi-source ATS Invariants (ADR-0021, ADR-0022)
   1. Sources come from one registry, `backend/src/lib/ats/source.ts` (`SUPPORTED_ATS_SOURCES`, `ATS_SOURCES`). Never hard-code source unions or slug prefixes elsewhere. `API_SOURCES` (backend) and `FILTER_SOURCES` (frontend) gate what the API and UI accept.
   2. `Company.slug` is globally unique and permanent: Ashby = token, Greenhouse = `gh--<token>`, Lever = `lv--<sanitized token>`. `Job.ashbyId` is the legacy global key (`greenhouse:<id>`, `lever:<uuid>`). Uniques: `(source, externalId)`, `(source, atsToken)`.
   3. Build board/job URLs from `atsToken` with `backend/src/lib/ats/urls.ts`, server-side only (`boardUrl` in DTOs). Never derive a token from a slug when `atsToken` exists. The frontend never builds ATS URLs.
   4. Deactivation, quarantine and empty-board deferral are keyed by `companySlug` + legacy key. Scraping one source must never change another source's rows.
   5. Existing telemetry message strings stay byte-identical (classifier fingerprints hash them); a new source's messages use `ATS_SOURCES[src].apiName`.
   6. A new source ships disabled: `--sources` defaults to `ashby`; turned on only by a repo variable.
   7. Schema: adding an enum value is safe; never add `@@unique` in the same `db push` as its new columns; never `--accept-data-loss`.
   8. Clients are built eagerly only for `DEFAULT_CLIENT_SOURCES`; never construct clients by iterating `SUPPORTED_ATS_SOURCES`.
   ```
2. Roles: add `docs/agents/rules/multi-source-ats.md` and `docs/decisions/ADR-0022-lever-source.md` to the Read-First
   list of `scraper-architect`, `scraper-bugfixer`, `run-reviewer`, `api-cache`, `frontend`
   (`docs/agents/roles/*.md`) and to `docs/agents/roster.md`.
3. `docs/agents/roles/scraper-bugfixer.md` Allowed Scope: `backend/prisma/schema.prisma` line → "(additive only;
   removed from fixer scope during L1, restored in L2)"; same in `roster.md`.
4. `docs/agents/rules/prisma-schema.md`: add rule 5 "Enum values are added, never removed or renamed (`Ats`)."

## VERIFY
`scripts/check-all.sh --no-install` · `npm --prefix backend run test:integration` · repo tests · sync-shells --check.

## COMMIT + PUBLISH
`refactor(ats): single source registry and LEVER enum value, no behaviour change (ADR-0022)` with a bulleted body
(root cause, changes, tests, docs). Publish with `scripts/agents/push-branch.sh`.

## ROLLOUT (PR body)
Merge → dispatch **scrape-daily** (its `prisma db push` adds the enum value; it now runs every 3 h anyway) → check the
log shows the push succeeded and job counts are normal → Deploy to Vercel app=backend (smoke) → app=frontend (smoke).
Rollback: revert the squash commit; the extra enum value is harmless and stays.
