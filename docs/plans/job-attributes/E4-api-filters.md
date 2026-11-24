# E4 — Experience and Clearance in the API, facets and cache (Antigravity prompt)

> Owner: after E3 is merged, paste "Read docs/plans/job-attributes/E4-api-filters.md and implement it exactly."
> Background: `docs/plans/job-attributes/DESIGN.md` (spec, §6.3 cache visibility, §6.4 API) and
> `docs/plans/job-attributes/00-PLAN.md` (shared names — use them **exactly**). Review: `REVIEW.md` "E4".
> **Merging is fine at any time after E3. Deploying the backend happens only when `ROLLOUT.md` Step 7 says the
> backfill is complete.**

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax. TDD: every task
> writes the failing test first.

You are working in the Ashby Job Scraper monorepo (product: B.O.O.L.E.A.N), acting as the `api-cache` role
(`docs/agents/roles/api-cache.md`). Implement ONE PR: expose `experienceMinYears` / `clearanceRequired` (filled by
E1–E3) as DTO fields, `/v1/jobs` filters and `/v1/facets` counts, keep cache bodies equal to DB bodies (BF-019), and make
the Publisher rewrite a cached job detail when its attributes change. Additive contract change. Squash-merge. Follow
AGENTS.md, CLAUDE.md, docs/agents/context.md and every rule in docs/agents/rules/ (api-cache, api-contract-sync,
multi-source-ats, changelog-and-commits, secrets-and-git).

**Goal:** `GET /v1/jobs?experience=3-5,10plus&clearance=exclude` works on the DB path and the cache path with identical
bodies, `/v1/facets` carries `experience` and `clearance` counts, and a job's cached detail is rewritten on the next
publish after enrichment changes its attributes.

**Architecture:** one new pure module `backend/src/lib/attrFilters.ts` (pattern: `lib/search.ts`, shared by
`lib/cache/keys.ts` and `api/db/queries.ts`) owns parsing, the Prisma `where` builder and the in-memory matcher, so the
DB path and the pre-rendered cache path cannot drift. The Publisher pre-renders the single-value views (5 buckets +
2 clearance values) like today's single-filter views; multi-value or combined filters take the DB path. The detail index
value becomes `contentHash:attrsFingerprint`.

**Tech stack:** TypeScript, Express 5, Prisma 5 + Postgres, Upstash Redis (`jc:v1:*`), Jest + supertest, FakeRedis,
stateful Prisma mock; frontend Vitest contract test only.

## WHY
The owner asked for experience and clearance filters (DESIGN §1). E1–E3 store the values; nothing reads them yet.
Two traps make this more than "add a where clause":
1. **Cache key collapse.** `/v1/jobs` uses `canonicalJobsKey` as the cache key, the singleFlight key and the
   pre-render lookup (`backend/src/api/Server.ts:202-203,216-221`; `backend/src/api/cache/ReadThrough.ts:218`).
   `parseJobsQuery` keeps only known params (`backend/src/lib/cache/keys.ts:92-197`), so today `?clearance=required`
   canonicalizes to `jobs?page=1`, `isCacheableView` says "default view" (`keys.ts:241-244`) and the API would serve
   **the unfiltered default page from Redis**. The new params must enter the canonical key in the same PR.
2. **Detail cache staleness.** The Publisher rewrites a detail only when `jc:v1:details:index[id] !== contentHash`
   (`backend/src/cache/Publisher.ts:403-415`, stored at `:491`) or on Sundays (`:405`). Attribute columns are outside
   `contentHash` (BF-011, DESIGN §6.1), so without a new index value an enriched job keeps a detail body with old
   attributes for up to a week.

## HARD RULES (non-negotiable)
- Never read, print, stage, or commit `.env*`, `apikeys/`, `backend/apikeys/`, `output/`, `backend/output/`, `.vercel/`.
- Agents never push to `main`/`master`, never merge, never force-push, push tags or delete branches, and never run raw
  `git push` or `gh`. Publish only with `scripts/agents/push-branch.sh`. Owner reviews and merges.
- Never connect to production DB/Redis/API; no scrapes, publishes or deploys. Integration tests only against a local
  throwaway Postgres (`TEST_DATABASE_URL` on localhost). No network in any test. No new `any`
  (`backend/scripts/any-ratchet.mjs:22,88-91` scans `src/`, `api/`, `tests/`, `scripts/` and rejects any `any` in a new
  file — so no `as any` casts in new tests either).
- **Owner authorization for files outside the `api-cache` role scope** (`docs/agents/roles/api-cache.md` "Allowed
  Scope"): by approving this plan the owner authorizes E4 to create/edit exactly these, and nothing else outside scope:
  `backend/src/lib/attrFilters.ts` (kept under `lib/` because `lib/cache/keys.ts` must import it and `lib/` must not
  import `api/`; precedent `lib/search.ts`), `backend/tests/helpers/prismaFactory.ts`,
  `backend/tests/unit/{AttrFilters,CacheParity,ApiTypes}.test.ts`, `backend/tests/unit/JobAttributesNotExposed.test.ts`
  (E1's guard, inverted in Task 3), `docs/agents/rules/scraper-invariants.md`, the two snapshot files,
  `backend/tests/integration/AttributeFilters.test.ts`, `backend/tests/contract/ContractFixtures.test.ts` +
  `backend/tests/fixtures/contract/*`, the four frontend files below plus the synced fixture mirror, and the docs
  `docs/testing.md`, `docs/bug-fix-log.md`, `docs/agents/context.md`, `docs/agents/rules/api-cache.md`,
  `backend/docs/database-and-cache.md`, `docs/system-architecture-and-flows.md`, `CHANGELOG.md`, explorer.
- **Additive only:** no DTO field removed or renamed; no existing filter's behaviour changed; existing cache bodies change
  only by the added fields; invalid new values are **silently dropped** (no new 400).
- **Must not change:** `computeJobContentHash` and its 17 fields (BF-011), `lastUpdatedAt`/`lastUpdatedSource`
  (ADR-0018), scrape exit codes 0/1/2, BF-017 publish orchestration, sanity gate (`Publisher.ts:214-266`), BF-025.
- **No schema change** (E1 owns `backend/prisma/schema.prisma`). No scraper or enrichment change.
- **Frontend scope (explicit):** E4 owns the frontend changes the contract-sync rule requires in the same PR
  (`docs/agents/rules/api-contract-sync.md` step 4: "Update `frontend/src/types/api.ts` until `npm --prefix frontend run
  check` passes"): the synced fixture mirror, `frontend/src/types/api.ts` response types, the exact key lists in
  `frontend/src/test/contract.test.ts`, and the **typed mocks** that stop compiling when `JobListItem` gains two required
  fields (`frontend/src/mocks/mockData.ts`, `frontend/src/test/jobCard.test.tsx:28`, any other literal `tsc` flags).
  Nothing else under `frontend/` (no filter UI, no badges, no query-param types — that is E5).
- **DB safety rule (00-PLAN amendment).** `backend/.env` is auto-loaded by Prisma and points at **production**. Every
  command that can open a DB connection — `test:integration`, the Task 6 EXPLAIN/seed scratch script, `psql`, any
  `prisma …`, `npm run api:start` — runs only after, in the **same shell**:
  ```bash
  export DATABASE_URL='postgresql://postgres:pw@localhost:55432/postgres?schema=ja_e4'   # quoted: '?' is a zsh glob
  export TEST_DATABASE_URL="$DATABASE_URL"
  case "$DATABASE_URL" in *localhost*|*127.0.0.1*) ;; *) echo "not local" >&2; exit 1;; esac
  case "$TEST_DATABASE_URL" in *localhost*|*127.0.0.1*) ;; *) echo "not local" >&2; exit 1;; esac
  ```
  (adjust port/password to your local throwaway Postgres; it must stay localhost). Called "the guard" below.
- Commit before running check-all.

## PRECONDITION
- `origin/main` contains E3: `backend/src/enrichment/model/validate.ts` exists, and E1's
  `backend/src/enrichment/buckets.ts` exports `EXPERIENCE_BUCKETS = ['0-2','3-5','6-9','10plus','unspecified']`,
  `ExperienceBucket`, `bucketRange`, `bucketOf`, and `backend/prisma/schema.prisma` model `Job` has
  `experienceMinYears Int?`, `clearanceRequired Boolean?`, `attrsVersion Int?` and the three `@@index` lines from
  00-PLAN. Otherwise **STOP** and tell the owner.
- Branch: `feat/ja-4-api-filters` from `origin/main`.

## Decisions this plan makes (and why)

**D1 — Which new views are pre-rendered.** Today the Publisher pre-renders the default view and every *single* filter
with a small fixed value set: 3 workplace types, 5 employment types, `hasSalary=true`, top-20 countries, up to 40 pages
each (`Publisher.ts:302-358`); `isCacheableView` mirrors that list (`keys.ts:215-268`); `source=` is the exception and is
never pre-rendered (rule `docs/agents/rules/api-cache.md` 6). Experience buckets and clearance are small fixed enums like
workplace type, so E4 follows the general rule:
- **Pre-rendered (7 views):** `experience=<one bucket>` for each of the 5 buckets, `clearance=required`,
  `clearance=exclude`.
- **DB path:** any comma list with ≥ 2 buckets, any combination with another filter, search, sort or custom page size —
  exactly like today's combined filters.

Justification (for when Redis is enabled): the DB path runs through `dbGuard` (3 active queries, queue 10, then 503 +
`Retry-After`; `backend/src/api/middleware/dbGuard.ts:3,16,30-37`) and every list request runs `findMany` **and**
`count` (`backend/src/api/db/queries.ts:139-148`). `clearance=exclude` matches ~90 % of ~128.5k active jobs (DESIGN §2),
so its `count(*)` is as heavy as the default view's; the bucket views each cover 10–40 % of rows. Cost: ≤ 7 × 40 = 280
extra gzip page fields per generation (≈ 1–1.5 MB) against the 250 MB budget (`Publisher.ts:70`) and the ~5,100
default-view pages already written each publish (`Publisher.ts:286-300`).

**Production today has no Redis** (`docs/deployment-and-operations.md:167`, "today's production state"; `backend/docs/api.md:233`):
the Publisher returns `skipped_not_configured` (`Publisher.ts:150-157`), so **every cache-side change in this PR
(views, facets body, detail index) is inert** until the owner enables Redis. Every request — including
`clearance=exclude` and its full `count(*)` — hits Postgres through DbGuard on each edge-cache miss (1-hour list policy,
`backend/src/api/middleware/cacheControl.ts:46-65`). So the DB path must be acceptable on its own; Task 6 Step 3 measures
it at production scale with an acceptance bound.

**D2 — `clearance=exclude` in Prisma.** Prisma's `{ clearanceRequired: { not: true } }` compiles to `<> true`, which
drops `NULL` rows in SQL. The builder must emit `{ OR: [{ clearanceRequired: false }, { clearanceRequired: null }] }`
(= `IS NOT TRUE`). The integration test proves it on real Postgres.

**D3 — Facets.** `computeFacets` takes no filter params today (`queries.ts:190`), so every facet is a global count over
`active AND isListed`. The new facets follow that: `experience` = `Record<ExperienceBucket, number>` with all five keys
in `EXPERIENCE_BUCKETS` order (zeros present; unprocessed rows are in no bucket), `clearance` =
`{ required, exclude }` where `required` = count of `clearanceRequired = true` and `exclude = totalActive − required`
(exactly the `clearance=exclude` result total; reuses the existing `totalActive`, `queries.ts:230`).

**D4 — Parsing.** Both parsers (`types.ts:427-485` for the DB path and `keys.ts:92-197` for the cache key) call the
same functions in `lib/attrFilters.ts`. `experience` accepts a string or an array (`?experience=0-2&experience=3-5`),
splits on `,`, trims, lower-cases, keeps only `EXPERIENCE_BUCKETS`, de-duplicates and orders by `EXPERIENCE_BUCKETS`;
an empty result means "no filter". So `experience=10plus,0-2` and `experience=0-2,10plus` share one cache key.

**D5 — Detail index.** Value = `contentHash + ':' + attrsFingerprint(job)` with
`attrsFingerprint = sha256(\`${attrsVersion}|${experienceMinYears}|${clearanceRequired}\`).slice(0, 12)` (00-PLAN).
Only the Publisher reads or writes `jc:v1:details:index`: compare `Publisher.ts:412`, store `:491-492`, purge `:606`.
`ReadThrough.serveDetail` reads only the shard hashes (`ReadThrough.ts:511`; `KEY_DETAILS_INDEX` is not imported
there), `runCacheStatus` never reads it (`Publisher.ts:660-722`), and the sanity gate uses counts only
(`Publisher.ts:214-266`). The purge loop works on keys and is unaffected by the value format.

## Global constraints
- Every PR rule from 00-PLAN "Global constraints" applies (check-all, `docs:generate`, JSDoc `@file/@summary/@tags` on
  every new file **and** function, CHANGELOG `[Unreleased]`, Conventional Commit with bulleted body + attribution lines).
- Names exactly as 00-PLAN "API (E4)": params `experience`, `clearance` (`required` | `exclude`); bucket value `10plus`;
  DTO `experienceMinYears: number | null`, `clearanceRequired: boolean | null`; facets
  `experience: Record<ExperienceBucket, number>`, `clearance: { required: number; exclude: number }`.
- `experience=unspecified` → `attrsVersion IS NOT NULL AND experienceMinYears IS NULL`. Ranges come only from
  `bucketRange` (`10plus` → `{ min: 10, max: null }`, no upper bound).
- Invariant id: **BF-028** (API/cache filters; E5 extends it for the UI).

## Review focus (most likely to bite; each has a named test below)
1. `?clearance=required` served the unfiltered default page from cache (cache-key collapse) → Task 2
   `clearance and experience get their own canonical keys`, Task 5 `filtered request never served the default page`.
2. `clearance=exclude` hides unprocessed (`NULL`) jobs → Task 1 shape test, Task 6 `exclude keeps unprocessed jobs`.
3. Cached detail keeps old attributes after enrichment → Task 5 `detail rewritten when attrs change`.
4. Pre-rendered view body differs from the DB body for the same filter (e.g. `unspecified` matched on the DTO without
   `attrsVersion`) → Task 6 `pre-rendered attribute views equal the DB path`.
5. An old frontend or old cache body without the new keys crashes the UI → frontend `FacetsData.experience?` /
   `.clearance?` optional (Task 7); DTO fields always present (`null` when unprocessed) on both paths (Task 3).

---

## File map
| File | Change |
|---|---|
| `backend/src/lib/attrFilters.ts` | **Create.** Parse, `where` builder, matcher (single source of filter semantics) |
| `backend/src/cache/detailIndex.ts` | **Create.** `attrsFingerprint`, `detailIndexValue` |
| `backend/src/api/types.ts` | DTO fields (`:12-69`, `:90-159`), `FacetsResponseDTO` (`:266-284`), `JobQueryParams` (`:366-382`), `parseJobQueryParams` (`:427-485`) |
| `backend/src/api/contract.ts` | `LIST_SELECT`/`DETAIL_SELECT` (`:25-67`, `:72-126`), mappers (`:134-172`, `:182-266`), `SingleFilter` (`:268-274`) |
| `backend/src/api/db/queries.ts` | `queryJobs` where (`:44-120`), `computeFacets` (`:190-258`) |
| `backend/src/lib/cache/keys.ts` | `KNOWN_PARAMS` (`:67-83`), `parseJobsQuery` (`:92-197`), `isCacheableView` (`:251-267`) |
| `backend/src/cache/Publisher.ts` | snapshot select (`:179-182`), single-filter views (`:302-358`), detail diff (`:403-415`), index write (`:491-492`) |
| `backend/tests/unit/JobAttributesNotExposed.test.ts` | inverted (Task 3 + Task 7): only the two value fields exposed, never `attrs*` |
| `backend/tests/helpers/prismaFactory.ts` | `findMany` and `groupBy` learn the new columns (`:55-114`, `:222-241`) |
| `backend/tests/unit/AttrFilters.test.ts` | **Create** |
| `backend/tests/unit/{CacheKeys,ApiTypes,ApiServer,Publisher,CacheParity,ReadThrough}.test.ts` | extend |
| `backend/tests/unit/__snapshots__/{ApiServer,ApiGolden}.test.ts.snap` | re-recorded (added keys only) |
| `backend/tests/integration/AttributeFilters.test.ts` | **Create** (real Postgres) |
| `backend/tests/contract/ContractFixtures.test.ts` + `backend/tests/fixtures/contract/*` | seed values, new case, re-record |
| `frontend/src/test/fixtures/contract/*` | synced mirror |
| `frontend/src/types/api.ts`, `frontend/src/test/contract.test.ts`, `frontend/src/mocks/mockData.ts`, `frontend/src/test/jobCard.test.tsx` | contract-sync minimum (see HARD RULES) |
| Docs | Task 8 |

No change needed in `backend/src/api/Server.ts` (route reads `canonicalJobsKey`/`isCacheableView`/`parseJobQueryParams`,
`:202-221`; its `viewName` = the single non-page canonical pair, `:206-213`, which equals the manifest key names below
because bucket values need no URL encoding) or `backend/src/api/middleware/cacheControl.ts` (list policy is path-based,
`:46-65`). `ReadThrough.ts` needs no code change: a missing view falls back with `view_not_cached` (`:293-302`), pages
> 40 with `page_not_cached` (`:322-331`).

---

### Task 1: Shared attribute-filter module

**Files:**
- Create: `backend/src/lib/attrFilters.ts`
- Test: `backend/tests/unit/AttrFilters.test.ts`

**Interfaces:**
- Consumes: `EXPERIENCE_BUCKETS`, `ExperienceBucket`, `bucketRange` from `backend/src/enrichment/buckets.ts` (E1).
- Produces:
```ts
export type ClearanceFilter = 'required' | 'exclude';
export interface AttrRow { experienceMinYears: number | null; clearanceRequired: boolean | null; attrsVersion: number | null }
export function parseExperienceParam(raw: unknown): ExperienceBucket[];          // D4; [] = no filter
export function parseClearanceParam(raw: unknown): ClearanceFilter | undefined; // string or first array item; trim + lower-case
export function experienceParamString(buckets: ExperienceBucket[]): string | undefined; // canonical 'a,b' or undefined if empty
export function buildAttributeWhere(experience: ExperienceBucket[], clearance?: ClearanceFilter): Prisma.JobWhereInput[];
export function matchesAttributes(row: AttrRow, experience: ExperienceBucket[], clearance?: ClearanceFilter): boolean;
```

- [ ] **Step 1: Write the failing tests** (`describe('attrFilters (BF-028)')`):
```ts
it('parses, de-duplicates and orders experience buckets', () => {
  expect(parseExperienceParam('10plus, 0-2,0-2')).toEqual(['0-2', '10plus']);
  expect(parseExperienceParam(['3-5', '6-9'])).toEqual(['3-5', '6-9']);
  expect(parseExperienceParam('UNSPECIFIED')).toEqual(['unspecified']);
});
it('invalid experience value ignored', () => {
  expect(parseExperienceParam('junior,3-5')).toEqual(['3-5']);
  expect(parseExperienceParam('10+')).toEqual([]);   // '+' arrives as a space: '10 ' -> dropped
  expect(parseExperienceParam(42)).toEqual([]);
  expect(parseClearanceParam('maybe')).toBeUndefined();
  expect(parseClearanceParam(' Exclude ')).toBe('exclude');
});
it('experience OR within: one OR over bucket ranges', () => {
  expect(buildAttributeWhere(['0-2', '10plus'])).toEqual([
    { OR: [{ experienceMinYears: { gte: 0, lte: 2 } }, { experienceMinYears: { gte: 10 } }] },
  ]);
  expect(buildAttributeWhere(['unspecified'])).toEqual([
    { OR: [{ AND: [{ attrsVersion: { not: null } }, { experienceMinYears: null }] }] },
  ]);
});
it('clearance exclude is IS NOT TRUE, never = false alone', () => {
  expect(buildAttributeWhere([], 'exclude')).toEqual([{ OR: [{ clearanceRequired: false }, { clearanceRequired: null }] }]);
  expect(buildAttributeWhere([], 'required')).toEqual([{ clearanceRequired: true }]);
  expect(buildAttributeWhere([])).toEqual([]);
});
it('matcher agrees with the where semantics', () => {
  const unprocessed = { experienceMinYears: null, clearanceRequired: null, attrsVersion: null };
  const processedNull = { experienceMinYears: null, clearanceRequired: false, attrsVersion: 1 };
  expect(matchesAttributes(unprocessed, [], 'exclude')).toBe(true);
  expect(matchesAttributes(unprocessed, ['unspecified'])).toBe(false);
  expect(matchesAttributes(processedNull, ['unspecified'])).toBe(true);
  expect(matchesAttributes({ experienceMinYears: 10, clearanceRequired: true, attrsVersion: 1 }, ['10plus'], 'required')).toBe(true);
  expect(matchesAttributes({ experienceMinYears: 2, clearanceRequired: true, attrsVersion: 1 }, ['3-5'])).toBe(false);
});
```
- [ ] **Step 2: Run** `npm --prefix backend test -- AttrFilters` → FAIL ("Cannot find module '../../src/lib/attrFilters'").
- [ ] **Step 3: Implement** `backend/src/lib/attrFilters.ts` (JSDoc `@file`/`@summary`/`@tags` on the file and each
  function). Ranges only via `bucketRange`; the matcher and builder sit side by side so they stay identical.
- [ ] **Step 4: Run** the same command → PASS.
- [ ] **Step 5: Commit** `git add backend/src/lib/attrFilters.ts backend/tests/unit/AttrFilters.test.ts && git commit -m "feat(api): shared experience/clearance filter module (BF-028)"` (bulleted body + attribution).

### Task 2: Query params and canonical cache keys

**Files:**
- Modify: `backend/src/api/types.ts:366-382` (`JobQueryParams` gains `experience?: ExperienceBucket[]; clearance?: ClearanceFilter;`), `:427-485` (`parseJobQueryParams`)
- Modify: `backend/src/lib/cache/keys.ts:67-83`, `:92-197`, `:251-267`
- Test: `backend/tests/unit/CacheKeys.test.ts` (table at `:53-...`), `backend/tests/unit/ApiTypes.test.ts`

**Interfaces:** Consumes Task 1. Produces `JobQueryParams.experience` / `.clearance` (parsed, canonical) for Task 4;
canonical keys `experience=<a,b>` / `clearance=<v>` for Task 5.

- [ ] **Step 1: Write the failing tests.** Add cases to the CacheKeys table (`name`, `query`, `expectedKey`, `isCacheable`):
  | name | query | expectedKey | isCacheable |
  |---|---|---|---|
  | `Clearance required` | `{ clearance: 'required' }` | `jobs?clearance=required&page=1` | true |
  | `Clearance exclude, page 2` | `{ clearance: 'EXCLUDE', page: 2 }` | `jobs?clearance=exclude&page=2` | true |
  | `Experience single bucket` | `{ experience: '10plus' }` | `jobs?experience=10plus&page=1` | true |
  | `Experience list is canonical and not pre-rendered` | `{ experience: '3-5,0-2,3-5' }` | `jobs?experience=0-2%2C3-5&page=1` | false |
  | `Experience + clearance combined` | `{ experience: '3-5', clearance: 'exclude' }` | `jobs?clearance=exclude&experience=3-5&page=1` | false |
  | `Invalid attribute values dropped` | `{ experience: 'junior', clearance: 'maybe' }` | `jobs?page=1` | true |

  Plus `it('clearance and experience get their own canonical keys')`: `canonicalJobsKey({ clearance: 'required' })` is
  not `'jobs?page=1'`, and `KNOWN_PARAMS.has('experience') && KNOWN_PARAMS.has('clearance')`.
  ApiTypes: `parseJobQueryParams({ experience: '10plus,0-2', clearance: 'Required' })` →
  `{ experience: ['0-2', '10plus'], clearance: 'required' }`; `parseJobQueryParams({ experience: 'junior', clearance: 'x' })`
  → no `experience` / `clearance` keys.
- [ ] **Step 2: Run** `npm --prefix backend test -- CacheKeys ApiTypes` → FAIL on the new cases.
- [ ] **Step 3: Implement.** `parseJobQueryParams`: next to `source`/`postedWithin` (`types.ts:432-438,476-482`), set
  `experience` only when `parseExperienceParam(query.experience)` is non-empty and `clearance` only when defined — pass
  the raw value (string or array), not `extractQueryString`. `keys.ts`: add both to `KNOWN_PARAMS`; in `parseJobsQuery`
  add step 14 `experience` (`experienceParamString(parseExperienceParam(query.experience))`) and step 15 `clearance`;
  in `isCacheableView` add `experience` → cacheable iff the value is exactly one element of `EXPERIENCE_BUCKETS`, and
  `clearance` → `value === 'required' || value === 'exclude'`.
- [ ] **Step 4: Run** → PASS; also `npm --prefix backend test -- ApiServer` stays green.
- [ ] **Step 5: Commit** `feat(api): experience and clearance query params with canonical cache keys (BF-028)`.

### Task 3: DTO fields on list and detail (both paths)

**Files:**
- Modify: `backend/src/api/types.ts` — `JobListItemDTO` (`:12-69`) and `JobDetailDTO` (`:90-159`) add, with JSDoc:
  `experienceMinYears: number | null` ("minimum required years; null = not stated or not processed yet") and
  `clearanceRequired: boolean | null` ("true = clearance required; false = none found; null = not processed yet").
- Modify: `backend/src/api/contract.ts` — `LIST_SELECT` and `DETAIL_SELECT` add `experienceMinYears: true,
  clearanceRequired: true` (never `attrsEvidence`/`attrsSource`: not public); `toJobListItem` (`:141-171`) and
  `toJobDetail` (`:221-265`) add `experienceMinYears: job.experienceMinYears ?? null, clearanceRequired:
  job.clearanceRequired ?? null` right after `salaryInterval`. Same key position in both mappers keeps cache and DB JSON
  byte-identical (BF-019).
- Modify (invert): `backend/tests/unit/JobAttributesNotExposed.test.ts` (E1). Today it asserts `LIST_SELECT` /
  `DETAIL_SELECT` hold no attribute key and no contract fixture matches `/experienceMinYears|clearanceRequired|attrs[A-Z]/`,
  so Tasks 3 and 7 would fail check-all. Replace it (00-PLAN amendment) with: `it('exposes only experienceMinYears and
  clearanceRequired')` — both selects contain exactly those two attribute keys and none of `attrsVersion`,
  `attrsModelVersion`, `attrsDescHash`, `attrsSource`, `attrsConfidence`, `attrsEvidence`; list/detail DTOs from
  `toJobListItem`/`toJobDetail` have no `attrs*` key; and no file in `backend/tests/fixtures/contract/` matches `/"attrs[A-Z]/`
  (while job fixtures **do** contain `"experienceMinYears"` and `"clearanceRequired"`). Keep the test name prefix so its
  history is traceable; say so in the PR body. Order: in Task 3 invert the select/DTO assertions and drop the old
  "no fixture mentions the fields" assertion; add the "fixtures do contain both fields" assertion in Task 7 Step 2, after
  the fixtures are regenerated.
- Test: `backend/tests/unit/ApiTypes.test.ts`; snapshots `backend/tests/unit/__snapshots__/ApiServer.test.ts.snap`,
  `ApiGolden.test.ts.snap`.

- [ ] **Step 1: Write the failing test** `it('maps experienceMinYears and clearanceRequired, null when unprocessed')`:
  a row with `experienceMinYears: 5, clearanceRequired: true` → list and detail DTOs carry `5` / `true`; a row without
  the keys (old mock shape) → both `null`, and `'experienceMinYears' in dto` is `true`.
- [ ] **Step 2: Run** `npm --prefix backend test -- ApiTypes` → FAIL.
- [ ] **Step 3: Implement** as above.
- [ ] **Step 4: Run** `npm --prefix backend test` → only snapshot failures in `ApiServer`/`ApiGolden`. Re-record with
  `npm --prefix backend test -- -u ApiServer ApiGolden`, then `git diff backend/tests/unit/__snapshots__` must show
  **only** added `"experienceMinYears": null`, `"clearanceRequired": null` lines (and, after Task 4, the two facet keys).
  Any other diff → stop and fix the code, not the snapshot.
- [ ] **Step 5: Commit** `feat(api): experienceMinYears and clearanceRequired on job list and detail DTOs (BF-028)`.

### Task 4: DB-path filters and facets

**Files:**
- Modify: `backend/src/api/db/queries.ts:44-120` (`queryJobs`), `:190-258` (`computeFacets`)
- Modify: `backend/src/api/types.ts:266-284` (`FacetsResponseDTO` adds `experience: Record<ExperienceBucket, number>`
  and `clearance: { required: number; exclude: number }` with JSDoc)
- Modify: `backend/tests/helpers/prismaFactory.ts` (stateful mock, used by CacheParity/Publisher/ContractFixtures)
- Test: `backend/tests/unit/ApiServer.test.ts` (`describe('GET /v1/jobs')` `:71`, facets `:474-506`)

**Interfaces:** Consumes Task 1 `buildAttributeWhere`, Task 2 `JobQueryParams`. Produces facets shape for Task 5/7.

- [ ] **Step 1: Write the failing tests** in ApiServer (pattern of `:275-393`, `mockJob.findMany.mockResolvedValueOnce([])`):
  - `it('experience OR within, AND across')`: GET `/v1/jobs?experience=0-2,10plus&workplaceType=Remote` → `findMany`
    called with `where` containing `workplaceType: 'Remote'` and `AND: expect.arrayContaining([{ OR:
    [{ experienceMinYears: { gte: 0, lte: 2 } }, { experienceMinYears: { gte: 10 } }] }])`; response
    `x-cache-reason` = `view_not_cached`.
  - `it('clearance=required and clearance=exclude build the right where')`: `required` → `AND` contains
    `{ clearanceRequired: true }`; `exclude` → `AND` contains `{ OR: [{ clearanceRequired: false }, { clearanceRequired: null }] }`.
  - `it('invalid experience value ignored')`: `/v1/jobs?experience=junior&clearance=maybe` → status 200 and
    `JSON.stringify(findMany.mock.calls.at(-1)[0].where)` contains neither `experienceMinYears` nor `clearanceRequired`.
  - `it('facets include experience buckets')`: extend the existing facets test's mocks by **appending** (order matters,
    see Step 3) `mockJob.groupBy.mockResolvedValueOnce([{ experienceMinYears: 1, _count: { _all: 4 } },
    { experienceMinYears: 4, _count: { _all: 3 } }, { experienceMinYears: 12, _count: { _all: 2 } },
    { experienceMinYears: null, _count: { _all: 5 } }])` and a third `mockJob.count.mockResolvedValueOnce(6)`; expect
    `res.body.experience` toEqual `{ '0-2': 4, '3-5': 3, '6-9': 0, '10plus': 2, unspecified: 5 }`, `Object.keys` in
    `EXPERIENCE_BUCKETS` order, and `res.body.clearance` toEqual `{ required: 6, exclude: 9 }` (totalActive 15 − 6).
- [ ] **Step 2: Run** `npm --prefix backend test -- ApiServer` → FAIL.
- [ ] **Step 3: Implement.**
  - `queryJobs`: after the `postedWithin` block (`:102-116`) push `...buildAttributeWhere(params.experience ?? [],
    params.clearance)` into `andConditions`. Nothing else moves.
  - `computeFacets`: **append** two calls at the end of the existing `Promise.all` array (after `totalActive`, `:230`)
    so the existing order-dependent `mockResolvedValueOnce` chains in tests keep working:
    `prisma.job.groupBy({ by: ['experienceMinYears'], where: { active: true, isListed: true, attrsVersion: { not: null } }, _count: { _all: true } })`
    and `prisma.job.count({ where: { active: true, isListed: true, clearanceRequired: true } })`. Fold groups with
    `bucketOf` into a zero-filled record built from `EXPERIENCE_BUCKETS` (insertion order = bucket order).
    `clearance = { required, exclude: Math.max(0, totalActive - required) }`. Return keys after `hasSalary`.
  - `prismaFactory.ts`: `findMany` today ignores `w.AND` entirely (`prismaFactory.ts:56-114`). Add `w.clearanceRequired`
    (equality), `w.attrsVersion?.not === null`, and a small helper that evaluates **only** `w.AND` entries whose keys are
    `experienceMinYears`, `clearanceRequired` or `attrsVersion` (including the `OR`/`AND` shapes `buildAttributeWhere`
    emits); every other `AND` entry is treated as pass, exactly as today, so existing tests do not change. Do not
    import production code into the mock. `groupBy` honours
    `where.attrsVersion?.not === null` and `where.clearanceRequired`, and emits a group for value `null` (strict
    `=== null`, not `undefined`) when the `by` field is not filtered `{ not: null }` — this matches real Prisma, which
    returns a `null` group. Run the whole suite to confirm no existing caller changes (`source`, `companySlug` groups
    never hold `null` in seeds).
- [ ] **Step 4: Run** `npm --prefix backend test` → PASS (re-record snapshots once more if only the two facet keys were
  added; inspect the diff as in Task 3).
- [ ] **Step 5: Commit** `feat(api): experience and clearance filters and facets on the DB path (BF-028)`.

### Task 5: Publisher — pre-rendered views and attribute-aware detail index

**Files:**
- Create: `backend/src/cache/detailIndex.ts`
- Modify: `backend/src/api/contract.ts:268-274` (`SingleFilter` gains `experience?: ExperienceBucket; clearance?: ClearanceFilter`)
- Modify: `backend/src/cache/Publisher.ts:179-182`, `:302-358`, `:403-415`, `:491-492`
- Test: `backend/tests/unit/Publisher.test.ts`, `backend/tests/unit/CacheParity.test.ts`, `backend/tests/unit/ReadThrough.test.ts`

**Interfaces:**
```ts
// detailIndex.ts
export interface DetailIndexRow { contentHash: string; attrsVersion: number | null; experienceMinYears: number | null; clearanceRequired: boolean | null }
export function attrsFingerprint(row: Omit<DetailIndexRow, 'contentHash'>): string; // sha256(`${attrsVersion}|${experienceMinYears}|${clearanceRequired}`).slice(0, 12)
export function detailIndexValue(row: DetailIndexRow): string;                       // `${contentHash}:${attrsFingerprint(row)}`
```

- [ ] **Step 1: Write the failing tests.**
  - New `describe('detailIndex (BF-028)')` in `Publisher.test.ts`: test vectors (computed with Node `crypto`):
    `attrsFingerprint({ attrsVersion: null, experienceMinYears: null, clearanceRequired: null })` = `'919c9fc98db9'`,
    `{1, 5, true}` = `'0e7e3fdf5922'`, `{1, null, false}` = `'bc6d5587bbbc'`;
    `detailIndexValue({ contentHash: 'hash-1', attrsVersion: 1, experienceMinYears: 5, clearanceRequired: true })` =
    `'hash-1:0e7e3fdf5922'`; `it('missing attribute keys fingerprint like nulls')`: `attrsFingerprint({} as
    Omit<DetailIndexRow, 'contentHash'>)` (mock rows without the keys would otherwise render
    `undefined|undefined|undefined`) equals the all-null value `'919c9fc98db9'`.
  - Update the existing assertion at `Publisher.test.ts:185-187` from `toBe(contentHash)` to
    `toBe(detailIndexValue(sampleJobs[i]))` (same strength: exact value; the format changed by design — say so in the PR).
  - `it('detail rewritten when attrs change')`: `jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'], now: new
    Date('2026-01-07T12:00:00Z') })` (a Wednesday, so the Sunday rewrite at `:405` is off); seed both sample jobs with
    `attrsVersion: 1, experienceMinYears: 5, clearanceRequired: false`; publish → `detailsWritten === 2`; re-seed job 1
    (same `ashbyId`, same `contentHash`) with `experienceMinYears: 7`; publish again (new `runId`) → `detailsWritten ===
    1`, job 1's shard body has `data.experienceMinYears === 7`, index value for job 1 = `'hash-1:' +
    attrsFingerprint({ attrsVersion: 1, experienceMinYears: 7, clearanceRequired: false })`; third publish →
    `detailsWritten === 0`. Restore real timers in `afterEach`.
  - `it('legacy bare-contentHash index rewrites every detail once')`: pre-fill `KEY_DETAILS_INDEX` with
    `{ [id]: contentHash }` (today's format) for both jobs, non-Sunday date → first publish `detailsWritten === 2`,
    second `0`.
  - `it('publishes the seven attribute views with manifest entries')`: seed jobs covering each bucket and clearance
    value; after publish the manifest has `views['experience=0-2']` … `views['experience=unspecified']`,
    `views['clearance=required']`, `views['clearance=exclude']`, and field `jobs?experience=10plus&page=1` gunzips to
    exactly the 10plus jobs; an unprocessed job (`attrsVersion: null`) is in `clearance=exclude`, not in
    `experience=unspecified`.
  - CacheParity `it('cache body equals DB body with new fields')`: give `makeJob(n)` (`CacheParity.test.ts:32-49`)
    `attrsVersion: n % 4 ? 1 : null, experienceMinYears: n % 4 ? n % 13 : null, clearanceRequired: n % 4 ? n % 5 === 0 : null`;
    after publish, `jobs?page=1` cached items equal `asWire(queryJobs(...))` items **as whole objects** for the first 25
    ids (not only ids), every item has both keys, the detail shard body for one processed and one unprocessed job equals
    `asWire({ data: await queryJobDetail(prisma, id) })`, and the existing facets parity test (`:97-101`) passes with the
    new keys.
  - `ReadThrough.test.ts` `it('filtered request never served the default page')`: publish a generation whose manifest has
    only `default` (as `ReadThrough.test.ts:69-100` does) → `GET /v1/jobs?clearance=required` returns `x-cache: MISS`,
    `x-cache-reason: view_not_cached`, and the body is the DB mock's, not `'Cached Engineer'`.
- [ ] **Step 2: Run** `npm --prefix backend test -- Publisher CacheParity ReadThrough` → FAIL.
- [ ] **Step 3: Implement.**
  - `detailIndex.ts` with Node `crypto` (`createHash('sha256')`), JSDoc on file and both functions; normalize each part
    with `?? null` before building the string, so `undefined` and `null` give the same fingerprint.
  - Snapshot select (`:179-182`): `{ ...LIST_SELECT, contentHash: true, attrsVersion: true }` (`LIST_SELECT` already
    carries the two value columns after Task 3).
  - Single-filter list (`:303-313`): append `{ keyName: \`experience=${b}\`, filter: { experience: b } }` for each
    `b` of `EXPERIENCE_BUCKETS`, then `clearance=required`, `clearance=exclude`. Key names equal Server's `viewName`
    (`Server.ts:209-213`) because bucket values contain no URL-escaped characters; `canonicalJobsKey({ ...item.filter,
    page: p })` (`:341-344`) produces the field names.
  - Filtering (`:326-327`): iterate by index so the raw row is available:
    `matchesFilter(defaultJobItems[i], f) && matchesAttributes(snapshotJobs[i], f.experience ? [f.experience] : [], f.clearance)`.
    `matchesFilter` (`contract.ts:279-297`) itself is unchanged.
  - Detail diff (`:410-414`): build `const indexValueById = new Map(snapshotJobs.map((j) => [j.id, detailIndexValue(j)]))`
    once; compare `storedIndex[job.id] !== indexValueById.get(job.id)`. Index write (`:491-492`):
    `indexBatch[row.id] = indexValueById.get(row.id) ?? ''`. This also replaces the O(n²) `snapshotJobs.find` per detail
    row (`:491`), which on a full rewrite is ~128k × 128k comparisons.
- [ ] **Step 4: Run** `npm --prefix backend test` → PASS.
- [ ] **Step 5: Commit** `feat(cache): pre-render attribute views and include attributes in the detail index (BF-028)`.

### Task 6: Integration test on real Postgres + index check

**Files:**
- Create: `backend/tests/integration/AttributeFilters.test.ts` (pattern: `MixedSources.test.ts:14-40` — `describeIfDb`,
  localhost guard, `prisma db push`, clean tables; picked up by `backend/jest.integration.config.js:8-9`)

- [ ] **Step 1: Write the tests** (`describeIfDb('BF-028: experience and clearance filters on real PostgreSQL')`). Seed one
  company and 9 active listed jobs with `createMany` (test seeding may set the columns directly):
  | job | attrsVersion | experienceMinYears | clearanceRequired | workplaceType |
  |---|---|---|---|---|
  | j1 | 1 | 1 | false | Remote |
  | j2 | 1 | 4 | true | OnSite |
  | j3 | 1 | 7 | false | Remote |
  | j4 | 1 | 12 | true | Remote |
  | j5 | 1 | null | false | Remote |
  | j6 | null | null | null | Remote |
  | j7 | 1 | 3 | false | Hybrid |
  | j8 | 1 | 10 | false | OnSite |
  | j9 | null | null | null | OnSite |
  Tests (ids compared as sets via `title`):
  - `exclude keeps unprocessed jobs`: `queryJobs({ clearance: 'exclude' })` → j1, j3, j5, j6, j7, j8, j9 (7);
    `required` → j2, j4.
  - `experience OR within, AND across`: `{ experience: ['0-2', '10plus'], workplaceType: 'Remote' }` → j1, j4.
  - `unspecified means processed with no years`: `{ experience: ['unspecified'] }` → j5 only (not j6, j9).
  - `bucket edges`: `['3-5']` → j2, j7; `['10plus']` → j4, j8; `['6-9']` → j3.
  - `facets include experience buckets`: `computeFacets(prisma)` → `experience` = `{ '0-2': 1, '3-5': 2, '6-9': 1,
    '10plus': 2, unspecified: 1 }`, `clearance` = `{ required: 2, exclude: 7 }`, and `clearance.exclude ===
    (await queryJobs(prisma, { clearance: 'exclude' })).meta.total`.
  - `pre-rendered attribute views equal the DB path`: `publishCacheGeneration({ prisma, redis: new FakeRedis(),
    runId, scrapeFinishedAt })` (no cast: `redis?: any` already, `Publisher.ts:36`; a cast would trip the any-ratchet); for each of the 7 views, gunzipped `jobs?<view>&page=1` equals
    `asWire(await queryJobs(prisma, <parsed view>))`; detail body of j6 equals `asWire({ data: await
    queryJobDetail(prisma, j6.id) })` with `experienceMinYears: null, clearanceRequired: null`.
- [ ] **Step 2: Run** against a local throwaway DB. Create it once (same container as E1, or embedded-postgres in the
  scratchpad if Docker is unavailable):
  ```bash
  docker run --rm -d --name ja-e4 -e POSTGRES_PASSWORD=pw -p 55432:5432 postgres:16   # skip if ja-e1 is still up
  export DATABASE_URL='postgresql://postgres:pw@localhost:55432/postgres?schema=ja_e4'
  export TEST_DATABASE_URL="$DATABASE_URL"
  case "$DATABASE_URL" in *localhost*|*127.0.0.1*) ;; *) echo "not local" >&2; exit 1;; esac
  case "$TEST_DATABASE_URL" in *localhost*|*127.0.0.1*) ;; *) echo "not local" >&2; exit 1;; esac
  ```
  (the `?schema=ja_e4` schema is created by the test's own `prisma db push`; no `createdb` needed with the default
  `postgres` database). Then, in that shell,
  `npm --prefix backend run test:integration -- AttributeFilters` → the suite **runs** (not skipped) and passes. A
  skipped suite is not a pass (`REVIEW.md` step 4). The test itself also refuses non-localhost hosts
  (`MixedSources.test.ts:24-28` pattern).
- [ ] **Step 3: Index and load check at production scale (record in the PR, no schema change).** First run the guard
  (HARD RULES) in this shell; the scratch script builds its client only from the exported `DATABASE_URL` and exits if
  the host is not `localhost`/`127.0.0.1`. In the same local DB,
  insert ~130k extra active listed rows with `generate_series` (≈ 10 % `clearanceRequired = true`, years spread 0–15,
  20 % `attrsVersion` null, realistic `publishedAt` spread), `ANALYZE "Job"`, then `EXPLAIN (ANALYZE, BUFFERS)` the SQL
  Prisma generates (log it once with `new PrismaClient({ log: ['query'] })` in a scratch script under the scratchpad,
  never committed) for page + count of: unfiltered (baseline), `clearance=required`, `clearance=exclude`,
  `experience=3-5`, `experience=0-2,10plus&workplaceType=Remote`. Run each 3× warm and take the median.
  Expected: page queries walk the Job index `@@index([active, isListed, publishedAt(sort: Desc), createdAt(sort: Desc),
  id])` with a filter and stop at 25 rows; the `required` count uses the `clearanceRequired` index.
  **Acceptance bound** (production has no Redis, so these run on every edge miss): every filtered **count** ≤ 1.5× the
  unfiltered count time, and every filtered **page** query ≤ 1.5× the unfiltered page time (or ≤ 50 ms absolute,
  whichever is larger). Report the ratios in a table in the PR body with the plans.
  **If a bound is exceeded: STOP before publishing** and report to the owner with the plan, the ratio and a proposed
  partial index (e.g. `CREATE INDEX … ON "Job" ("publishedAt" DESC, "createdAt" DESC, id) WHERE active AND "isListed"
  AND "clearanceRequired" IS NOT TRUE`) for a separate schema PR; do **not** edit `schema.prisma` here.
- [ ] **Step 4: Commit** `test(api): real-Postgres attribute filter, facet and cache parity tests (BF-028)`.

### Task 7: Contract fixtures and the frontend contract minimum

**Files:**
- Modify: `backend/tests/contract/ContractFixtures.test.ts` (seed helpers `createSampleJob` etc., cases `:289-...`)
- Regenerate: `backend/tests/fixtures/contract/*`, then `frontend/src/test/fixtures/contract/*` (via
  `scripts/contract/sync-fixtures.mjs:16-17`)
- Modify: `frontend/src/types/api.ts` — `JobListItem` (`:73-101`) gains required `experienceMinYears: number | null;
  clearanceRequired: boolean | null;` (reaches `JobDetail` through its `Omit`, `:103`); export
  `type ExperienceBucket = '0-2' | '3-5' | '6-9' | '10plus' | 'unspecified'`; `FacetsData` (`:121-128`) gains optional
  `experience?: Record<ExperienceBucket, number>; clearance?: { required: number; exclude: number };` (optional like
  `sources?`, so an old facets body never crashes).
- Modify: `frontend/src/test/contract.test.ts` — add the two keys to `JOB_LIST_ITEM_KEYS` (`:61`) and
  `JOB_DETAIL_KEYS` (`:93`), `experience`, `clearance` to `FACETS_DATA_KEYS` (`:149-156`); import the new fixture and
  add `satisfies JobsResponse` (`:42-47` pattern).
- Modify: typed mocks `frontend/src/mocks/mockData.ts` (`MOCK_JOBS` `:3`, `MOCK_JOB_DETAIL` `:209`,
  `MOCK_GREENHOUSE_JOB_DETAIL` `:258`, `MOCK_LEVER_JOB_DETAIL` `:283`), `frontend/src/test/jobCard.test.tsx:28`, and
  every other literal `npm --prefix frontend run typecheck` flags — add only `experienceMinYears: null,
  clearanceRequired: null` (the minimum `tsc` needs; no UI change). `MOCK_FACETS` (`:325`) is left alone because its new
  keys are optional; realistic facet mock values are E5's. Note for E5: on a backend rollback the live API returns jobs
  without these keys, so at runtime the fields may be `undefined` despite the type (E5 already checks
  `typeof === 'number'` / `=== true`).

- [ ] **Step 1:** Seed values in the contract suite: Ashby job 1 `attrsVersion: 1, experienceMinYears: 5,
  clearanceRequired: false`; job 2 `1, null, true`; the rest unprocessed (`null`s, keys present). Add case
  `it('verifies GET /v1/jobs?experience=3-5&clearance=exclude')` that mocks `findMany`/`count` once with the matching
  rows (pattern `:296-307`) and records fixture `jobs.attributes`.
- [ ] **Step 2:** `npm --prefix backend run contract:fixtures` then `node scripts/contract/sync-fixtures.mjs`; run both
  **twice** → second run leaves `git status` clean. Expected diffs: the two new keys in every job/detail fixture, the two
  new facet keys in `facets.default.json`, the new `jobs.attributes.json`. Nothing else — explain each in the PR body.
- [ ] **Step 3:** frontend edits above; `npm --prefix frontend run check` → PASS.
- [ ] **Step 4: Commit** `feat(contract): experience and clearance fields in contract fixtures and shared types (BF-028)`.

### Task 8: Docs, agent files, release note, verify, publish

- [ ] **Docs** (say what the code does; cite paths):
  - `backend/docs/api.md`: `GET /v1/jobs` (`:13`) params `experience` (comma list, OR within; `10plus`; `unspecified`;
    invalid dropped) and `clearance` (`required` | `exclude` = `IS NOT TRUE`, keeps unprocessed jobs), AND with other
    filters; DTO fields; `GET /v1/facets` (`:76`) new keys; pre-rendered view list (D1); Redis key table row
    `jc:v1:details:index` (`:270`) → "job id → `contentHash:attrsFingerprint`; Publisher-only diff index"; indexes
    (`:303`) note from Task 6.
  - `backend/docs/database-and-cache.md:207`: same correction (today it wrongly says "maps `ashbyId` to `job.id`"); add
    one paragraph: detail rewrite when content **or** attributes change; first publish after merge rewrites every detail
    once (see ROLLOUT note below).
  - `docs/system-architecture-and-flows.md:73`: publisher step "new/changed details (content or attributes)".
  - BF-028: row in `docs/testing.md` §6 table (directly after the BF-027 row that E2 adds; today BF-025 is last at
    `:389`; same column style; guards: `AttrFilters.test.ts`,
    `CacheKeys.test.ts`, `ApiServer.test.ts`, `Publisher.test.ts`, `CacheParity.test.ts`, `ReadThrough.test.ts`,
    `tests/integration/AttributeFilters.test.ts`, `ContractFixtures.test.ts`); `### BF-028` section in
    `docs/bug-fix-log.md` after BF-027 (Symptom / Root cause & fix / Implemented in / Regression Invariant / Guarding
    tests, format of `:192-224`).
  - `docs/agents/context.md` (≤ 6,144 bytes, `scripts/repo-tests/agent-shells.test.mjs:178`; E1 leaves ≥ 450 B of
    headroom): add one short line
    `- **BF-028:** experience/clearance filters + facets; exclude = IS NOT TRUE; detail index = contentHash:attrs (see testing §6).`
    and measure with `wc -c docs/agents/context.md` (must print ≤ 6144).
  - `docs/agents/rules/api-cache.md` add rule 7: "`experience`/`clearance` are parsed only by `lib/attrFilters.ts`;
    single-value views are pre-rendered, lists/combinations use the DB path; `clearance=exclude` = `clearanceRequired IS
    NOT TRUE`; the detail-index value is `contentHash:attrsFingerprint` (BF-028)." Then
    `node scripts/agents/sync-shells.mjs` and `--check`.
  - `docs/agents/rules/scraper-invariants.md` item 2 "Invariants BF-001 through BF-0xx must be preserved": bump to
    **BF-028** (00-PLAN amendment; E1 → 026, E2 → 027, E4 → 028; E6 is only a fallback), then sync-shells.
  - `CHANGELOG.md` `## [Unreleased]` entry tagged `contract` (skill `release-notes`): root cause (no fields/filters;
    cache-key and detail-index traps), fix, guards, BF-028, ADR-0023.
  - `npm --prefix backend run docs:generate` (explorer).
- [ ] **Verify:** `scripts/check-all.sh --no-install` (green); `node --test 'scripts/repo-tests/**/*.test.mjs'`;
  `node scripts/agents/sync-shells.mjs --check`; integration suite ran (Task 6, after the guard); fixtures stable on a
  second run; local smoke: run the guard (HARD RULES) in this shell, then `npm run api:start` from `backend/` (port 3001)
  against that local DB, then `curl` `?experience=3-5,10plus`,
  `?clearance=exclude`, `?experience=junior` (same total as unfiltered), `/v1/facets`.
- [ ] **Commit + publish** (squash target subject):
  `feat(api): experience and clearance filters, facets and attribute-aware detail cache (BF-028, ADR-0023)`, bulleted
  body (root cause / changes / tests / docs) + attribution lines; `scripts/agents/push-branch.sh`.

## ROLLOUT (PR body)
- **Merge** any time after E3. Effect of the merge alone: the scheduled scrape runs code from `main`
  (`.github/workflows/scrape-daily.yml:97-102`, checkout without `ref`), so the **next publish** already writes cache
  bodies with the new fields, the seven attribute views, the new facets, and the new detail-index format. The old live
  API serves those bodies (additive, harmless) and ignores the new params.
- **Today (no production Redis): all cache-side effects are inert.** The Publisher returns `skipped_not_configured`
  (`Publisher.ts:150-157`); no views, facets body or index are written and no rewrite happens.
- **One-time detail rewrite, only once Redis is enabled:** at the first publish with the new code every stored index
  value is a bare `contentHash`, so all ~128k details are rewritten once — the same volume as a Sunday full rewrite
  (`Publisher.ts:405`): ~128k × ~3.5 KB (`Publisher.ts:434`) ≈ 450 MB, in ~257 batches of ≤ 500 ids with ~9 `HSET`s each
  (8 shards + index, `Publisher.ts:471-501`) ≈ 2.3k `HSET`s. Like a Sunday, the estimate exceeds the double-buffer
  budget (`Publisher.ts:434-440`), so the publish runs `single_buffer` and the API takes the DB path until the swap
  (`:463-468`). Sunday UTC already rewrites everything on each of its 7 runs (cron `17 1,4,7,13,16,19,22 * * *`,
  `scrape-daily.yml:7`, plus `isSunday` at `:405`), so one extra full rewrite is marginal. Note that ~450 MB exceeds the
  Upstash free tier's 256 MB storage (`docs/deployment-and-operations.md:15`) — a concern for enabling Redis at all, not
  specific to E4.
- **Deploy** the backend only at `ROLLOUT.md` Step 7, after the backfill is complete (`remaining = 0`):
  **Deploy to Vercel** `app=backend` (smoke `PASSED`). Then curl checks from ROLLOUT Step 7(f). Frontend deploy is E5's.
  Why (00-PLAN amendment "Deploying E4 before the backfill finishes"): unprocessed jobs sit in no experience bucket and
  are not `required`, so bucket, `unspecified` and `clearance=required` results and facet counts undercount silently
  (only `exclude` still lists them) — the UI looks wrong without any error.
- **api-contract-sync rule 6** ("deploy backend, then dispatch `scrape-daily publish_only=true`"): **not needed for
  E4.** With Redis unconfigured, `publish_only` is a no-op. If Redis is enabled before the deploy, the scheduled publishes
  after the merge have already written the new bodies (the Publisher runs from `main`), so a dispatch adds nothing. If the
  owner wants the new bodies immediately after enabling Redis, dispatching **Daily scrape** with `publish_only=true` is
  safe.
- **Rollback:** Vercel Instant Rollback / Deploy `app=backend ref=<previous SHA>`; reverting the PR restores the old
  index format (one more full rewrite at the next publish). Fields are additive.

## DONE when
- All Task tests pass; `scripts/check-all.sh --no-install` green; the real-Postgres suite ran and passed; EXPLAIN plans
  in the PR; fixtures stable on a second run; docs, BF-028, rule 7, CHANGELOG and explorer committed; branch pushed with
  `scripts/agents/push-branch.sh`.

## Notes for the plan owner
1. **DESIGN §6.3 superseded on cache timing.** DESIGN describes the backfill as "one spread-out rewrite of ~128k
   details". Per the 00-PLAN amendment "Cache timing", the index change takes effect at the first scheduled publish
   after the E4 **merge**, is inert while production Redis is unconfigured, and the single full rewrite happens at the
   first publish once Redis is enabled (ROLLOUT section above).
2. **Snapshot rule.** `backend/CLAUDE.md` says "preserve zero snapshot diffs"; an additive DTO change cannot. Task 3/4
   allow only added-key snapshot diffs, verified by reading the diff.
3. **Doc bug found.** `backend/docs/api.md:270` and `backend/docs/database-and-cache.md:207` describe
   `jc:v1:details:index` as "`ashbyId` → `job.id`"; the code stores job id → `contentHash` (`Publisher.ts:491-500`).
   Task 8 corrects both.
4. **Existing latent bug (not fixed here).** `parseJobsQuery` drops array params (`keys.ts:189`, `typeof === 'string'`)
   while `parseJobQueryParams` takes the first item (`types.ts:418-422`), so `?source=a&source=lever` is keyed as the
   default view and served the unfiltered cached page. E4 avoids this for the new params (D4); `source` is out of scope.
5. **Index set.** E1 adds single-column indexes on `experienceMinYears` and `clearanceRequired`; list pages sort by
   `publishedAt`, so these indexes mostly help counts. Task 6 records plans; any composite index goes to a later schema PR.
6. **BF-011 count.** `backend/docs/database-and-cache.md:58,143` say "md5 across 16 fields"; context.md says 17. Not
   E4's to fix; flag for E6's docs sweep.
