# E1 — Schema columns, pure rules extractor and golden set (BF-026, ADR-0023) (Antigravity prompt)

> Owner: after the plan PR (`docs/plans/job-attributes/`) is merged, paste "Read
> docs/plans/job-attributes/E1-schema-and-rules.md and implement it exactly." Background: `DESIGN.md` (spec: §2 research,
> §4 decisions, §6.1 data model, §6.2 extraction, §6.6 testing) and `00-PLAN.md` (global constraints, **shared
> interfaces: use those names exactly**). Use those facts; do not re-research the design.

> **For agentic workers:** steps use checkbox (`- [ ]`) syntax. Run tasks in order; each ends green and committed.
> REQUIRED SUB-SKILL: superpowers:test-driven-development for Tasks 1–7.

You are working in the Ashby Job Scraper monorepo (product: B.O.O.L.E.A.N). Implement ONE PR, branch
`feat/ja-1-schema-and-rules`, squash-merged by the owner. It adds eight nullable `Job` columns and three indexes, a
**pure** (no I/O) rules extractor for "minimum required years of experience" and "security clearance required", and
a labelled golden set that measures it in CI. **Nothing calls the extractor in production yet** (E2 adds the pass), and
**the API must not expose the new columns** (E4 does). Follow AGENTS.md, CLAUDE.md, docs/agents/context.md and every
rule in docs/agents/rules/ (prisma-schema, scraper-invariants, multi-source-ats).

**Goal:** a merged, CI-guarded extractor with years P/R ≥ 0.90 and clearance P/R ≥ 0.90 on a frozen holdout, plus the
DB columns E2 will write into.

**Architecture:** `backend/src/enrichment/` holds types, a version constant, description text helpers, experience
buckets, and `rules/` (years, clearance, combiner). Everything is a pure function of `EnrichmentInput`. The golden set
lives in `backend/tests/fixtures/job-attributes/` and is built once by a manual script that fetches real postings and
passes them through the **production normalizers**, so the test sees exactly the text E2 will read from
`Job.metadata.descriptionPlain`.

**Tech stack:** TypeScript 5.9, Node ≥ 24, Prisma 5.22 + Postgres, Jest 30 via ts-jest (`backend/package.json:50,57,59,71`).

## WHY (read this, it drives every decision)
Users want to filter by experience and by clearance. No ATS exposes either as a field (DESIGN §2), so the description is
the only source. A regex tuned on 60 jobs scored P/R 0.96 on years and found 12/12 clearances on a 40-job holdout, but
the research text was **not** production text: `research/samples.json` renders every `<li>` as a `- ` line (73/73
Greenhouse, 41/41 Lever samples), while production builds Greenhouse and Lever plain text from HTML with `<li>` →
newline and tags → space and **no bullet markers** (`backend/src/lib/Sanitizer.ts:115-136`;
`backend/src/lib/ats/GreenhouseClient.ts:359`, `backend/src/lib/ats/LeverClient.ts:330`). Ashby is different:
production keeps Ashby's own `descriptionPlain` (`Sanitizer.ts:116`), which does carry bullets. So the rules must work
with and without bullet markers. The research also took the first match (`research/extract.py:18`), which contradicts the
§6.2 labelling rule. So E1 rebuilds the set from production text, re-labels it with the §6.2 rule, makes it big enough
(≥ 200 jobs, ≥ 40 clearance positives) for a 0.90 threshold to mean something, and pins every known failure mode with a
named test.

## HARD RULES (non-negotiable)
- Never read, print, stage, or commit `.env*`, `apikeys/`, `backend/apikeys/`, `output/`, `backend/output/`, `.vercel/`.
- Agents never push to `main`/`master`, never merge, never force-push, push tags or delete branches, and never run raw
  `git push` or `gh`. Publish only with `scripts/agents/push-branch.sh`. Owner reviews and merges.
- **Never run any `prisma` command (or anything that opens a DB connection) without an explicit localhost
  `DATABASE_URL` exported in the same shell.** `backend/.env` exists and Prisma loads it automatically, so an unset
  `DATABASE_URL` can mean **production**. Before every such command run the guard
  `case "$DATABASE_URL" in *localhost*|*127.0.0.1*) ;; *) echo "not local" >&2; exit 1;; esac`. Quote URLs (zsh
  treats `?` as a glob).
- Never connect to production DB/Redis/API. Schema work only on a **local throwaway Postgres**. Never add
  `--accept-data-loss` anywhere. No `@@unique` in this PR (multi-source rule 7).
- **No behaviour change in production:** API bodies, cache bodies, contract fixtures
  (`backend/tests/fixtures/contract/*.json`) and the scraper's writes stay byte-identical. `LIST_SELECT` /
  `DETAIL_SELECT` in `backend/src/api/contract.ts` gain **nothing**.
- **Must not change:** `computeJobContentHash` and its 17 fields (`backend/src/core/Scraper.ts:82-128`, BF-011),
  `lastUpdatedAt` / `lastUpdatedSource` (ADR-0018), scrape exit codes, BF-017, BF-025. No existing test is edited.
- `backend/src/enrichment/**` is pure: no Prisma, no network, no `fs`, no `process.env`, and **no import from
  `src/core/`, `src/discovery/` or `child_process`** (E4's API will import `buckets.ts`;
  `scripts/repo-tests/no-api-imports-scraper.test.mjs` forbids those imports in API code and their transitive reach is
  the reviewer's check). Allowed imports: `node:crypto`, `../lib/Sanitizer` (`../../lib/Sanitizer` from `rules/`),
  and relative imports inside `src/enrichment/`.
- Tests never call the network. The golden-set builder (Task 4) is a manual script, never run by Jest or check-all.
- No new `any` (`backend/scripts/any-ratchet.mjs:22` scans `src/ api/ tests/ scripts/`). JSDoc `@file` / `@summary` /
  `@tags` on every new file and `@summary` on every function. Never stage `.impeccable/`, `brag-output/` or
  `docs/plans/job-attributes/research/__pycache__/` (`git add` explicit paths only). Commit before check-all
  (`docs:check` diffs against git, `backend/package.json:24`). **Every task commit** is a Conventional Commit with a
  bulleted body (root cause / changes / tests / docs) ending with the session attribution lines.

## PRECONDITION
- `git fetch origin`; origin/main contains `docs/plans/job-attributes/E1-schema-and-rules.md` and
  `docs/plans/job-attributes/research/samples.json`, and `backend/prisma/schema.prisma` has **no** `attrsVersion`.
  Otherwise STOP. Branch `feat/ja-1-schema-and-rules` **from `origin/main`**.
- `ls docs/decisions/` shows no `ADR-0023-*` and `grep -rn "BF-026" docs` is empty. Otherwise STOP and report.

## File map

| File | Action | Responsibility |
|---|---|---|
| `backend/prisma/schema.prisma` | Modify `:96-120` | 8 nullable `Job` columns + 3 `@@index` (00-PLAN names) |
| `backend/tests/integration/fixtures/schema.pre-e1.prisma` | Create | frozen copy of today's schema |
| `backend/tests/integration/JobAttributesSchema.test.ts` | Create | additive `db push` + index usability on real Postgres |
| `backend/tests/unit/JobAttributesNotExposed.test.ts` | Create | selects/DTOs/contract fixtures carry no attribute field |
| `backend/src/enrichment/types.ts` | Create | `AttrsConfidence`, `AttrsSource`, `EnrichmentInput`, `JobAttributes` |
| `backend/src/enrichment/version.ts` | Create | `ATTRS_VERSION = 1` |
| `backend/src/enrichment/buckets.ts` | Create | `EXPERIENCE_BUCKETS`, `ExperienceBucket`, `bucketRange`, `bucketOf` |
| `backend/src/enrichment/text.ts` | Create | `getDescriptionText`, `hashDescription` |
| `backend/src/enrichment/rules/years.ts` | Create | `YearsResult`, `extractMinYears` |
| `backend/src/enrichment/rules/clearance.ts` | Create | `ClearanceResult`, `detectClearance`, exported `CLEARANCE_*` lexicon constants |
| `backend/src/enrichment/rules/index.ts` | Create | `extractAttributesByRules` |
| `backend/scripts/BuildJobAttributeFixtures.ts` | Create | manual golden-set builder (network, ≤ 1 req/s) |
| `backend/tests/fixtures/job-attributes/jobs.json` | Create | ≥ 200 real postings, production text |
| `backend/tests/fixtures/job-attributes/labels.json` | Create | hand labels (§6.2 rule), split, evidence |
| `backend/tests/helpers/goldenScore.ts` | Create | TypeScript scorer (replaces `research/evaluate.py`) |
| `backend/tests/unit/JobAttributesBuckets.test.ts` | Create | buckets |
| `backend/tests/unit/JobAttributesText.test.ts` | Create | text + hash |
| `backend/tests/unit/JobAttributesYears.test.ts` | Create | years regression table |
| `backend/tests/unit/JobAttributesClearance.test.ts` | Create | clearance regression table |
| `backend/tests/unit/JobAttributesGolden.test.ts` | Create | golden-set integrity + P/R thresholds |
| `docs/plans/job-attributes/research/samples.json` | Delete | superseded by `jobs.json` (1.1 MB, non-production text) |
| docs + agent files | Modify | Task 8 |

Name note: `backend/tests/unit/EnrichmentDispatch.test.ts` and `src/utils/EnrichCompanies.ts` already exist and are
about **company** enrichment; every new file uses the `JobAttributes` prefix to avoid confusion.

## Review Focus (most likely to bite; each has a named test below)
1. Greenhouse/Lever production text has no `- ` bullet markers (Ashby's own text does) → bullet-style requirements ("6+ years building …") must still be found
   via the requirements-heading context (`years: bullet without "experience" under a requirements heading`).
2. Descriptions mixing benefits/blurb numbers with requirements → only requirement numbers count
   (`years: company blurb number is ignored`, `years: salary per year is ignored`).
3. Clearance words that are not clearances (`range clearance`, `customs clearance`, `trade secret`, `SCIENCE`) → false
   (`clearance: false friends`).
4. The new columns leak into an API or cache body before E4 → must not (`JobAttributesNotExposed`).
5. `db push` on production must be additive and exit 0 → rehearsed (`JobAttributesSchema` + STEP 0 output in PR body).

---

### Task 0: Rehearse the schema change (before writing code)

**Files:** none committed in this task (the output goes in the PR body).

- [ ] **Step 1: Start a throwaway Postgres** (Docker or local install; never prod). Example:
  `docker run --rm -d --name ja-e1 -e POSTGRES_PASSWORD=pw -p 55432:5432 postgres:16`.
- [ ] **Step 2: Point Prisma at the throwaway DB, push today's schema, seed one Company + two Jobs** (one shell for
  Steps 2–4):
  ```bash
  cd backend
  export DATABASE_URL='postgresql://postgres:pw@localhost:55432/postgres?schema=ja_rehearsal'
  case "$DATABASE_URL" in *localhost*|*127.0.0.1*) ;; *) echo "not local" >&2; exit 1;; esac
  npx prisma db push --skip-generate --force-reset
  ```
  then insert rows with `psql "$DATABASE_URL"`-equivalent (same columns as
  `backend/tests/integration/LeverL1Schema.test.ts:73-80`).
- [ ] **Step 3: Add the 00-PLAN columns and indexes (Task 1 Step 4) and run exactly the workflow command**
  (`.github/workflows/scrape-daily.yml:120-121`), guard first:
  ```bash
  case "$DATABASE_URL" in *localhost*|*127.0.0.1*) ;; *) echo "not local" >&2; exit 1;; esac
  npx prisma db push --skip-generate
  ```
  Expected: exit 0, no "data loss" warning, no prompt; rows intact with the 8 new columns `NULL`.
- [ ] **Step 4: Run it again (same guard first).** Expected: "The database is already in sync with the Prisma schema."
- [ ] **Step 5: STOP condition.** If Step 3 exits non-zero or prints a data-loss warning, STOP and report the output.
  Do not work around it (`--accept-data-loss` is forbidden).
- [ ] **Step 6:** keep the Step 3 and Step 4 output for the PR body; `git checkout backend/prisma/schema.prisma`.

### Task 1: Prisma columns, indexes, and the "not exposed" guard

**Files:**
- Create: `backend/tests/integration/fixtures/schema.pre-e1.prisma` (byte copy of today's `backend/prisma/schema.prisma`, made **before** Step 4)
- Create: `backend/tests/integration/JobAttributesSchema.test.ts`
- Create: `backend/tests/unit/JobAttributesNotExposed.test.ts`
- Modify: `backend/prisma/schema.prisma` (model `Job`, after `updatedAt` at `:105`; indexes after `:119`)

**Interfaces:**
- Produces (exact 00-PLAN names): `experienceMinYears Int?`, `clearanceRequired Boolean?`, `attrsVersion Int?`,
  `attrsModelVersion Int?`, `attrsDescHash String?`, `attrsSource String?`, `attrsConfidence String?`,
  `attrsEvidence Json?`; indexes `Job_active_attrsVersion_idx`, `Job_experienceMinYears_idx`,
  `Job_clearanceRequired_idx` (Prisma default names).

- [ ] **Step 1: Write the failing integration test** `JobAttributesSchema.test.ts` modelled on
  `LeverL1Schema.test.ts` (same `pushSchema` helper `:26-43`, which always sets `DATABASE_URL` to the isolated
  localhost URL in the child env; localhost guard `:46-49`, `describeIfDb` skip when
  `TEST_DATABASE_URL` is unset `:12`), isolated schema `job_attrs_e1`:
  ```ts
  it('Step 1: seeds rows under the pre-E1 schema')                 // 1 Company, 2 Jobs via $executeRawUnsafe
  it('Step 2: pushes the live schema additively (exit 0, no data loss)', () => {
    const r = pushSchema(liveSchema);
    expect(r.status).toBe(0);
    expect(r.stdout).not.toMatch(/data loss|--accept-data-loss/i);
  });
  it('Step 3: keeps existing rows and leaves every attribute column NULL')
    // SELECT count(*) = 2; SELECT "experienceMinYears","clearanceRequired","attrsVersion","attrsModelVersion",
    // "attrsDescHash","attrsSource","attrsConfidence","attrsEvidence" → all null for both rows; contentHash/updatedAt unchanged
  it('Step 4: second push is a no-op', () => expect(pushSchema(liveSchema).stdout).toMatch(/already in sync/i));
  it('Step 5: creates the three attribute indexes')
    // pg_indexes for tablename 'Job' in schema job_attrs_e1 includes all three names above, and no OTHER index's
    // indexdef mentions experienceMinYears, clearanceRequired or attrs* (Job keeps its 11 existing indexes, schema.prisma:109-119)
  it('Step 6: the indexes are usable for the picker and filter predicates')
    // SET LOCAL enable_seqscan = off inside $transaction; EXPLAIN of
    //  (a) WHERE active = true AND "attrsVersion" IS NULL          → plan text contains 'Job_active_attrsVersion_idx'
    //  (b) WHERE "experienceMinYears" BETWEEN 3 AND 5             → contains 'Job_experienceMinYears_idx'
    //  (c) WHERE "clearanceRequired" = true                       → contains 'Job_clearanceRequired_idx'
  ```
- [ ] **Step 2: Write the failing unit test** `JobAttributesNotExposed.test.ts`. Its JSDoc header says
  `@summary Guards that no job attribute column reaches the API before E4 (E4 inverts this: after E4 only experienceMinYears and clearanceRequired may be exposed)`
  (00-PLAN Amendments: E4 replaces this test; `attrsEvidence`, `attrsSource`, `attrsDescHash`, `attrsModelVersion`,
  `attrsConfidence`, `attrsVersion` stay hidden forever):
  ```ts
  const ATTR_KEYS = ['experienceMinYears','clearanceRequired','attrsVersion','attrsModelVersion',
                     'attrsDescHash','attrsSource','attrsConfidence','attrsEvidence'];
  it('LIST_SELECT and DETAIL_SELECT select no attribute column')     // Object.keys(LIST_SELECT|DETAIL_SELECT) ∩ ATTR_KEYS = []
  it('toJobListItem and toJobDetail drop attribute fields present on the row')
    // pass a row object that also carries all 8 keys (cast via unknown) → output has none of ATTR_KEYS
  it('contract fixtures contain no attribute key')
    // every JSON under tests/fixtures/contract/ stringified does not match /experienceMinYears|clearanceRequired|attrs[A-Z]/
  ```
  Facts this relies on (verified): selects are explicit allow-lists (`contract.ts:25-67` list, `:72-126` detail); the DTO
  mappers copy named fields only (`contract.ts:134-172`, `toJobDetail` from `:182`); the Publisher snapshots with
  `{...LIST_SELECT, contentHash: true}` (`Publisher.ts:177-181`) and details with `DETAIL_SELECT`
  (`Publisher.ts:473-476`); `queries.ts:140-142,176-180` use the same selects; the fake Prisma honours `select`
  (`tests/helpers/prismaFactory.ts:126-131`). So adding columns cannot leak; the test keeps it that way until E4.
- [ ] **Step 3: Run both; expect failure.**
  `npm --prefix backend test -- JobAttributesNotExposed` → PASS for selects/fixtures is acceptable (they are guards);
  `cd backend && export TEST_DATABASE_URL='postgresql://postgres:pw@localhost:55432/postgres'` then
  `npx jest -c jest.integration.config.js JobAttributesSchema` (the test refuses non-localhost URLs itself)
  → FAIL at Step 2/5 (columns and indexes absent).
- [ ] **Step 4: Edit `schema.prisma`** exactly as the 00-PLAN block (columns with the two comments, three `@@index`
  lines). Then `npm --prefix backend run build` (= `npx prisma generate`, `backend/package.json:41`; prisma-schema rule 2;
  `generate` opens no DB connection, so no guard is needed for it).
- [ ] **Step 5: Run both again.** Expected: integration 6/6 PASS; unit 3/3 PASS; and
  `npm --prefix backend test -- ContractFixtures` PASS with `git diff --exit-code backend/tests/fixtures/contract` clean.
- [ ] **Step 6: Commit** `git add backend/prisma/schema.prisma backend/tests/integration/fixtures/schema.pre-e1.prisma backend/tests/integration/JobAttributesSchema.test.ts backend/tests/unit/JobAttributesNotExposed.test.ts`
  → `feat(db): nullable job attribute columns and indexes (ADR-0023)` (bulleted body).

### Task 2: Types, version and experience buckets

**Files:**
- Create: `backend/src/enrichment/types.ts`, `backend/src/enrichment/version.ts`, `backend/src/enrichment/buckets.ts`
- Test: `backend/tests/unit/JobAttributesBuckets.test.ts`

**Interfaces (Produces, verbatim from 00-PLAN):**
```ts
export type AttrsConfidence = 'high' | 'low';
export type AttrsSource = 'rules' | 'model';
export interface EnrichmentInput { id: string; title: string; descriptionPlain: string }
export interface JobAttributes { experienceMinYears: number | null; clearanceRequired: boolean;
  confidence: AttrsConfidence; source: AttrsSource; evidence: { years?: string; clearance?: string } }
export const ATTRS_VERSION = 1;
export const EXPERIENCE_BUCKETS = ['0-2', '3-5', '6-9', '10plus', 'unspecified'] as const;
export type ExperienceBucket = typeof EXPERIENCE_BUCKETS[number];
export function bucketRange(b: Exclude<ExperienceBucket, 'unspecified'>): { min: number; max: number | null };
export function bucketOf(years: number | null): ExperienceBucket;
```

- [ ] **Step 1: Write the failing test** `JobAttributesBuckets.test.ts`:
  ```ts
  it('lists the five buckets in order')       // toEqual(['0-2','3-5','6-9','10plus','unspecified'])
  it('bucket values are URL-safe')            // every b: encodeURIComponent(b) === b  (why '10plus', not '10+')
  it('bucketRange maps each bucket')          // '0-2'→{min:0,max:2} '3-5'→{3,5} '6-9'→{6,9} '10plus'→{min:10,max:null}
  it.each([[null,'unspecified'],[0,'0-2'],[2,'0-2'],[3,'3-5'],[5,'3-5'],[6,'6-9'],[9,'6-9'],[10,'10plus'],[30,'10plus']])
    ('bucketOf(%p) is %p', ...)
  it('bucketOf rejects negative or non-integer years')   // -1, 2.5, NaN → toThrow(RangeError)
  it('buckets cover 0..30 with no gap or overlap')        // for y in 0..30: exactly one bucketRange contains y and it equals bucketOf(y)
  it('ATTRS_VERSION is a positive integer')               // Number.isInteger && > 0
  ```
- [ ] **Step 2: Run** `npm --prefix backend test -- JobAttributesBuckets` → FAIL (module not found).
- [ ] **Step 3: Implement** the three files. `version.ts` JSDoc says: "Bump when rules change; every job is
  re-processed by E2's picker (`attrsVersion < ATTRS_VERSION`)."
- [ ] **Step 4: Run** → PASS (all cases).
- [ ] **Step 5: Commit** `feat(enrichment): attribute types, version and experience buckets (BF-026)`.

### Task 3: Description text and hash

**Files:** Create `backend/src/enrichment/text.ts`; Test `backend/tests/unit/JobAttributesText.test.ts`

**Interfaces (Produces):**
```ts
export function getDescriptionText(metadata: unknown): string;
export function hashDescription(text: string): string;
```
- `getDescriptionText`: if `metadata` is a non-array object and `metadata.descriptionPlain` is a non-empty string,
  return it **unchanged** (it was already normalized at write time by `sanitizeJsonMetadata`, `Sanitizer.ts:237-239`;
  re-running `decodeHtmlEntities` could double-decode `&amp;lt;`). Else if `metadata.descriptionHtml` is a non-empty
  string, return `sanitizeJobDescriptionPlain(undefined, metadata.descriptionHtml)` (`Sanitizer.ts:115`). Else `''`.
- `hashDescription`: `sha256` hex of `text.replace(/\s+/g, ' ').trim()`.

- [ ] **Step 1: Write the failing test:**
  ```ts
  it('returns metadata.descriptionPlain unchanged')        // {descriptionPlain:'A &amp; B\nC'} → 'A &amp; B\nC'
  it('falls back to plain text of descriptionHtml')        // {descriptionPlain:'', descriptionHtml:'<p>5+ years</p><ul><li>Go</li></ul>'}
                                                           //   → equals sanitizeJobDescriptionPlain(undefined, html); contains '5+ years' and '\nGo' or ' Go'
  it('returns empty string for null, arrays, strings and missing fields')  // null, [], 'x', {} → ''
  it('hash is 64 hex chars and ignores whitespace differences')  // hash('a  b\n') === hash('a b'); /^[0-9a-f]{64}$/
  it('hash changes when words change')                           // hash('5+ years') !== hash('6+ years')
  ```
- [ ] **Step 2: Run** `npm --prefix backend test -- JobAttributesText` → FAIL.
- [ ] **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(enrichment): description text and hash helpers (BF-026)`.

### Task 4: Build and label the golden set (no rules code yet)

Labels are the tests of Tasks 5–7, so they are written **before** the rules and **blind** (do not run any extractor
while labelling).

**Files:**
- Create: `backend/scripts/BuildJobAttributeFixtures.ts`
- Create: `backend/tests/fixtures/job-attributes/jobs.json`, `backend/tests/fixtures/job-attributes/labels.json`
- Delete: `docs/plans/job-attributes/research/samples.json` (keep `extract.py`, `evaluate.py`, `analysis.txt`,
  `labels.json`, `holdout_labels.json`, `label_ids.json`, `holdout_ids.json`: DESIGN cites them)

**Interfaces:**
- Consumes: the production fetch + normalize paths, no hand-rolled HTTP:
  `new AshbyAtsClient().fetchBoard(ref, { includeCompensation: true })` (`backend/src/lib/ats/AshbyAtsClient.ts:122`,
  which calls `fetchAshbyBoardWithFallback` `backend/src/lib/AshbyClient.ts:299` → `sanitizeJobBatch`
  `AshbyClient.ts:318` → `normalizeAshbyJob` with its `sanitizeJsonMetadata` `AshbyAtsClient.ts:43-44`),
  `new GreenhouseClient().fetchBoard(ref)` (`backend/src/lib/ats/GreenhouseClient.ts:500`),
  `new LeverClient().fetchBoard(ref)` (`backend/src/lib/ats/LeverClient.ts:511`); `BoardRef = { slug, source, atsToken }`
  (`backend/src/lib/ats/AtsClient.ts:10-14`). Each returns `NormalizedJob[]` whose `raw` is what the scraper stores as
  `Job.metadata` (`backend/src/core/Scraper.ts:674`); `getDescriptionText` (Task 3).
- Produces (fixture shapes):
  ```ts
  // jobs.json
  interface GoldenJob { id: string; source: 'ashby'|'greenhouse'|'lever'; board: string; title: string;
                        descriptionPlain: string; fetchedAt: string /* ISO date */ }
  // labels.json
  interface GoldenLabels { schemaVersion: 1; rule: 'DESIGN §6.2 (2026-11-23)'; labelledBy: 'implementer';
    ownerReviewed: boolean;
    labels: Record<string, { split: 'tune'|'holdout'; labelled: boolean; years: number|null; clearance: boolean;
                             yearsEvidence?: string; clearanceEvidence?: string; note?: string }> }
  ```
  `id` = the research id form `<ab|gh|lv>:<board>:<externalId>`.

- [ ] **Step 1: Write the builder** `BuildJobAttributeFixtures.ts` (run only by hand:
  `cd backend && npx ts-node scripts/BuildJobAttributeFixtures.ts [--boards=gh:epirus,ab:picogrid,…]`; guard the entry
  with `if (require.main === module)` so importing it never runs it — context gotcha 1).
  - Fetch **one board per call** through the production clients above (they hit the same endpoints as the scraper,
    with their own retry and headers; the Lever client keeps its ≤ 1 req/s pacer). Boards serial, `await sleep(1000)`
    between boards, so the whole run stays ≤ 1 request/s. No auth. Skip (and report) a board whose result has
    `notFound`, `failure`, or Ashby `fetchMode: 'fallback'` (GraphQL text differs from the REST text most rows carry).
  - The builder opens **no database connection** (no Prisma import); it only writes JSON files.
  - `descriptionPlain = getDescriptionText(normalized.raw)` for every job; drop jobs with an empty description.
  - Selection (deterministic, no cherry-picking): (a) every research id from `research/label_ids.json` and
    `research/holdout_ids.json` that is still live; (b) new jobs from each board ordered by `sha256(id)` ascending,
    taking the first **k = 12** per board (`--k=<n>` and `--k-defense=<n>` override; defaults 12 and 12). Report research
    ids no longer live; they are dropped (their old text is not production text and must not be reused).
  - After labelling (Step 3), if any integrity minimum of Task 7 falls short (total ≥ 200, clearance positives ≥ 40,
    holdout ≥ 80, holdout clearance positives ≥ 16, holdout non-null years ≥ 40): rerun the builder with a larger
    `--k-defense` (defense boards listed below) or `--k`, label only the new rows, and repeat. Never hand-pick postings.
    If the minimums are still short at `--k-defense=30`, STOP and report the counts.
  - Board mix for new jobs (to reach ≥ 40 clearance positives without over-fitting to Anduril): defense (the
    `--k-defense` set) `gh:epirus`, `gh:relativity`, `gh:rocketlab`, `gh:spacex`, `ab:hadrian-automation`, `ab:picogrid`, plus mainstream
    `gh:databricks`, `gh:cloudflare`, `ab:openai`, `ab:notion`, `lv:zoox` (all measured in `research/analysis.txt`).
    Cap any single board at 15 % of the set. Also run the builder with `--find-non-us`, which scans every fetched
    posting for `SC clearance|Developed Vetting|BPSS|NV1|NV2|Baseline clearance|NATO|Reliability Status` and adds the
    first 10 matches in `sha256(id)` order (a fixed rule, not a hand pick; Anduril and Palantir have UK/Australia roles). If fewer than 3 exist, say so in the PR
    body; the regression tables (Tasks 5–6) still cover non-US wording with synthetic strings.
  - **Dead ids, dead boards, no network (exact behaviour):** a research id that is no longer live is skipped and
    reported (never rebuilt from `samples.json`). A board that is `notFound`, fails, or falls back to GraphQL is skipped
    and reported; its share is **not** refilled by hand — only the k-raise rule above adds rows, always in `sha256(id)`
    order. If the network is unavailable or a client is rate-limited on every board, the builder exits 1 without
    writing anything, and you STOP and report: never fabricate postings or reuse research text.
  - **Reruns are merge-only:** the builder loads existing `jobs.json` / `labels.json` first and never rewrites a row
    whose `labelled` is `true` (its text is frozen even if the posting closed since); it only appends new ids.
  - Writes `jobs.json` sorted by `id`, 2-space JSON, and a **label template** `labels.json` with
    `labelled: false, years: null, clearance: false` and `split` assigned: research holdout ids → `holdout`; research tune ids →
    `tune`; new ids → `holdout` when `parseInt(sha256(id).slice(0, 8), 16) % 5 < 2`, else `tune`.
  - Never writes outside `backend/tests/fixtures/job-attributes/`; prints counts only (no description text).
- [ ] **Step 2: Run it.** Expected output: board count, boards skipped (with reason), jobs written, research ids
  dropped. With the 11 new-job boards × k = 12 (132) plus the live research ids (≤ 100) plus ≤ 10 non-US rows,
  expect ≈ 220–240 jobs. Research boards contribute only their research ids.
- [ ] **Step 3: Label every job by hand with the §6.2 rule** (implementer labels; owner reviews). This is a manual
  reading step, not code: expect ≈ 1–3 min per posting, i.e. **≈ 5–10 hours for 220–240 jobs**. Work in batches of
  ≈ 40: set `labelled: true` on each finished row and commit after every batch
  (`test(enrichment): label golden set batch <n>` with a bulleted body), so the work can stop and **resume** at the
  first row with `labelled: false`. The owner then reviews all labels (Step 4); budget their time too (≈ 1–2 hours
  with the evidence column).
  - `years` = minimum years a typical applicant must have: overall beats sub-skill ("8+ overall, 3+ in PM" → 8); base
    (lowest-degree) path ("5+ with BS / 3+ with MS / PhD" → 5); required beats preferred; a number that appears only as
    preferred / nice-to-have → `null`; range → lower bound ("3–5" → 3); nothing stated → `null`.
  - `clearance` = `true` for **any** government clearance requirement or eligibility: Public Trust, Secret, Top Secret,
    TS/SCI, polygraph, DOE Q/L, "able to obtain / eligible for", and non-US (UK BPSS/SC/DV, NATO, Canadian
    Reliability/Secret, Australian Baseline/NV1/NV2). `false` when the only mention is negated ("not required",
    "beneficial but not required") or a false friend, or when the text has only export-control / "U.S. person" wording.
  - Record `yearsEvidence` / `clearanceEvidence` (the exact substring, ≤ 160 chars) for every non-null / true label,
    and `note` for any judgement call. Evidence must be a substring of `descriptionPlain` (the Golden test checks it).
  - Do not look at extractor output while labelling. After labelling, do not edit `holdout` labels without owner
    approval written in the PR conversation.
- [ ] **Step 4: Owner review artefact.** In the PR body add a collapsed table of every label
  (`id | split | years | yearsEvidence | clearance | clearanceEvidence | note`) and the counts from Step 2.
  `ownerReviewed` stays `false`; it is flipped to `true` in a follow-up commit on this branch only after the owner
  approves the labels in the PR.
- [ ] **Step 5: Delete** `docs/plans/job-attributes/research/samples.json` (`git rm`).
- [ ] **Step 6: Commit** `git add backend/scripts/BuildJobAttributeFixtures.ts backend/tests/fixtures/job-attributes/`
  plus the deletion → `test(enrichment): golden set of real postings with hand labels (BF-026)`.

### Task 5: Years rules

**Files:** Create `backend/src/enrichment/rules/years.ts`; Test `backend/tests/unit/JobAttributesYears.test.ts`

**Interfaces (Produces):**
```ts
export interface YearsResult { value: number | null; evidence: string | null; ambiguous: boolean }
export function extractMinYears(text: string): YearsResult;
```

Algorithm (the tests cannot determine these specifics; tune them on the `tune` split only):
1. Pre-normalize a working copy: en/em dash → `-`, NBSP → space. Keep line breaks (each `<li>`/`<p>` is a line).
2. Candidate regex (case-insensitive), with `NUM = \d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty`:
   ```
   (?<![\d,.$€£])\b(NUM)(?:\s*\(\d{1,2}\))?\s*(?:\+|plus)?\s*(?:(?:-|to)\s*(NUM)\s*\+?\s*)?(?:or more\s+|or greater\s+)?(?:years?|yrs?)\b(?!-)
   ```
   Reject when the number and `year` are joined by a hyphen (`three-year`, `5-year`), when the text right after is
   `in a row|ago|old|running|straight`, or when the 12 chars before are `per|each|every|a`.
3. Context: the candidate's line plus the active section. A section starts at a heading line (≤ 60 chars, no final
   period) matching `/requirements|qualifications|what you('ll)? (need|bring)|you (have|bring)|about you|must have|minimum|basic|who you are/i`
   and is **preferred** when the heading matches `/preferred|nice to have|bonus|plus|desired|ideal/i`. Benefits /
   about-us / compensation headings (`/benefits|perks|about (us|the company)|compensation|salary|pay/i`) end a section.
4. Accept a candidate when its line contains an experience cue
   (`/experience|exp\b|industry|professional|background|track record|working|hands-on|building|developing|designing|managing|leading|in (a|an)\b.*\brole/i`)
   **or** a degree cue (`/\b(BS|MS|B\.?S\.?|M\.?S\.?|bachelor'?s?|master'?s?|degree|PhD)\b/i`, so "5+ years with a BS"
   counts) **or** it sits inside a requirements section (this is what finds Greenhouse/Lever bullets without
   "experience").
5. Reject blurb/money lines: line matches `/[$€£]\s?\d|per (year|annum)|salary|compensation|pay range|bonus|equity|401k|pto|vacation|parental/i`,
   or matches `/founded|history|we('ve| have)|our (company|team|customers)|has (been|provided|powered)|since \d{4}|anniversary/i`
   without `/you|your|candidate|applicant/i`. Discard values > 30 (00-PLAN Amendments: discarded, not clamped).
6. A candidate is **preferred** when its line or section matches the preferred cue
   (`/prefer|nice to have|bonus|\ba plus\b|ideally|desired|advantage/i`).
7. `value` = **max** over required candidates' lower bounds (overall > sub-skill; base degree path has the larger
   number). No required candidate → `value: null`.
8. `evidence` = the winning candidate's line taken from the **original** input (not the dash/NBSP-normalized working
   copy; keep a position map or match line-by-line), whitespace-collapsed, ≤ 160 chars, and a substring of the input
   after whitespace collapsing. E3's validator compares model evidence against the original text, so `3–5` must stay `3–5`.
9. `ambiguous = true` when: only preferred candidates exist; or the winning line has `/not required|or equivalent experience in lieu|\bor\b.*\byears?\b.*\bor\b/i`
   near the match; or ≥ 2 required lines start with a level label (`/^(junior|mid|senior|staff|principal|lead|level|L\d|IC\d|P\d)\b[^:\n]{0,40}:/i`) with different values;
   or no candidate was accepted but `/\byears?\b/` appears within 40 chars of `/experience/i`.

- [ ] **Step 1: Write the failing regression table** `JobAttributesYears.test.ts` with
  `it.each(cases)('years: %s', (name, text, value, ambiguous?) => …)`; assert `value` always, `ambiguous` where given:

  | name | text (`\n` = new line) | value | ambiguous |
  |---|---|---|---|
  | sub-requirement: overall beats sub-skill | `8+ years of overall experience, including 3+ years in product management` | 8 | – |
  | separate bullets: largest overall wins | `Requirements\n7+ years of software engineering experience\n3+ years leading teams` | 7 | false |
  | company blurb number is ignored | `For 10 years, Scale has powered the AI industry.\nRequirements\n4+ years of experience with Python` | 4 | – |
  | blurb only gives null | `Founded 12 years ago, we have grown to 500 people.` | null | false |
  | salary per year is ignored | `Salary: $120,000 - $150,000 per year\n5+ years of experience` | 5 | – |
  | money only gives null | `Pay range $90,000 per year. Up to 10% bonus.` | null | false |
  | date phrase is ignored | `Named a Best Place to Work four years in a row.` | null | false |
  | hyphenated adjective is ignored | `Help shape our three-year vision and 5-year roadmap.` | null | false |
  | en-dash range gives lower bound | `3–5 years of experience in data engineering` | 3 | – |
  | hyphen range gives lower bound | `3-5 years experience` | 3 | – |
  | "to" range gives lower bound | `2 to 4 years of relevant experience` | 2 | – |
  | number word | `Five or more years of experience in finance` | 5 | – |
  | at least + number word | `At least six years of professional experience` | 6 | – |
  | number word with digits in brackets | `five (5) years of experience` | 5 | – |
  | bullet without "experience" under a requirements heading | `What you'll bring\n6+ years building distributed systems\nStrong communication` | 6 | – |
  | minimum of | `Minimum of 4 years in a similar role` | 4 | – |
  | yrs abbreviation | `10+ yrs experience in sales` | 10 | – |
  | singular year | `1 year of experience in customer support` | 1 | – |
  | preferred-only gives null | `Preferred qualifications\n5+ years of experience with Kubernetes` | null | true |
  | preferred inline gives null | `5+ years of experience with Rust is a plus` | null | true |
  | required beats preferred | `Requirements\n3+ years of experience\nPreferred qualifications\n7+ years of experience` | 3 | – |
  | BS/MS paths take the base path | `5+ years with a BS, 3+ years with an MS, or a PhD` | 5 | – |
  | degree sentence takes the base path | `Bachelor's degree and 8 years of experience, or Master's degree and 6 years of experience` | 8 | – |
  | value above 30 is discarded | `40 years of combined experience on our leadership team` | null | – |
  | level-labelled requirements are ambiguous | `Senior Engineer: 5+ years of experience\nStaff Engineer: 10+ years of experience` | 10 | true |
  | experience without a number is ambiguous | `Several years of experience in enterprise sales` | null | true |
  | empty text | `` | null | false |

  Plus: `it('years: evidence is a substring of the input line')` for the en-dash case (evidence contains `3–5 years`).
- [ ] **Step 2: Run** `npm --prefix backend test -- JobAttributesYears` → FAIL (module not found).
- [ ] **Step 3: Implement** `extractMinYears` per the algorithm. Iterate using the `tune` split of the golden set
  (a throwaway local script is fine; do not commit it) — never the `holdout` split.
- [ ] **Step 4: Run** → every case PASS.
- [ ] **Step 5: Commit** `feat(enrichment): rules for minimum required years (BF-026)`.

### Task 6: Clearance rules

**Files:** Create `backend/src/enrichment/rules/clearance.ts`; Test `backend/tests/unit/JobAttributesClearance.test.ts`

**Interfaces (Produces):**
```ts
export interface ClearanceResult { required: boolean; evidence: string | null; ambiguous: boolean }
export function detectClearance(text: string): ClearanceResult;
// Module-level lexicon, exported by these exact names so E3's containsClearanceKeyword reuses them
// (E3 Task 2 adds that function to this file). Frozen arrays; no RegExp carries the `g` or `y` flag
// (stateful lastIndex) — use String.prototype.search/match or `new RegExp(re.source, re.flags + 'g')` locally.
export const CLEARANCE_FALSE_FRIENDS: readonly RegExp[];   // lexicon step 1 (stripped before matching)
export const CLEARANCE_STRONG_PATTERNS: readonly RegExp[]; // step 2, US patterns
export const CLEARANCE_NON_US_PATTERNS: readonly RegExp[]; // step 2, non-US patterns (UK, NATO, Canada, Australia)
export const CLEARANCE_WEAK_PATTERNS: readonly RegExp[];   // step 3
export const CLEARANCE_NEGATION: RegExp;                   // step 4
export const CLEARANCE_PREFERRED: RegExp;                  // step 5
```

Lexicon (specifics the tests do not fully determine):
1. **Strip false friends first** (replace with spaces, case-insensitive): `range clearance`, `low[- ]clearance`,
   `ground clearance`, `customs clearance`, `medical clearance`, `flight clearance`, `airspace clearance`,
   `tool clearance`, `height clearance`, `clearance sale`, `trade secrets?`, `secret sauce`.
2. **Strong keywords** (→ `required: true`, `ambiguous: false` unless step 4/5 applies):
   `/\b(security|government|federal|dod|doe|personnel|active|interim)\s+clearances?\b/i`,
   `/\btop[\s-]secret\b/i`, `/\bTS\s*\/\s*SCI\b|\bTS-SCI\b/` (case-sensitive), `/\bpublic\s+trust\b/i`,
   `/\bpolygraph\b|\b(ci|full[\s-]scope|lifestyle|counter-?intelligence)\s+poly\b/i`,
   `/\bsecret\b[^.\n]{0,40}\bclearance\b|\bclearance\b[^.\n]{0,40}\bsecret\b/i`, `/\b[QL][\s-]clearance\b/` (case-sensitive),
   `/obtain\b[^.\n]{0,40}\bclearance\b|eligib\w*\b[^.\n]{0,40}\bclearance\b/i`,
   non-US: `/\bdeveloped vetting\b|\bsecurity check(ed)?\s*\(SC\)/i` plus the case-sensitive
   `/\(?\b(SC|DV)\)?\s+(clearance|cleared|vetting)\b|\bBPSS\b|\bCTC\s+(clearance|cleared)\b/` (matches
   "Developed Vetting (DV) clearance" and "(SC) clearance"),
   `/\bNATO\s+(secret|confidential|cosmic|clearance)\b/i`, `/\b(NV1|NV2|AGSVA)\b|\bbaseline\s+(security\s+)?clearance\b|\bnegative vetting\b/i`,
   `/\breliability\s+(status|clearance|screening)\b|\b(government of canada|canadian)\b[^.\n]{0,40}\b(security|secret|clearance)\b/i`.
3. **Weak keywords** (→ `required: true`, `ambiguous: true`): bare `/\bclearance\b/i` after stripping,
   `/\bSCI\b/` (case-sensitive), `/\bpoly\b/i`.
4. **Negation:** a mention whose sentence (split on `.`, `;`, `\n`) matches
   `/\b(no|not|without|doesn'?t|does not)\b[^.\n]{0,40}\b(required|require|need(ed)?|necessary)\b|beneficial but not required|not a requirement/i`
   is negated. All mentions negated → `required: false, ambiguous: false`. Mixed negated and non-negated →
   `required: true, ambiguous: true`.
5. **Preferred cue** in the mention's sentence (`/prefer|nice to have|a plus|bonus|desired/i`) → `ambiguous: true`.
6. No keyword → `{ required: false, evidence: null, ambiguous: false }`. Export-control / "U.S. person" / ITAR / EAR
   words are deliberately **not** in the lexicon.
7. `evidence` = the first non-negated match's sentence, whitespace-collapsed, ≤ 160 chars.

- [ ] **Step 1: Write the failing regression table** (`it.each`, test titles `clearance: <name>`; assert `required`
  always and `ambiguous` where given). Group the false-friend rows under one `describe('clearance: false friends')`.

  | name | text | required | ambiguous |
  |---|---|---|---|
  | active Secret | `Must have an active Secret clearance` | true | false |
  | obtain and maintain Top Secret | `Ability to obtain and maintain a Top Secret clearance` | true | false |
  | TS/SCI with polygraph | `Active TS/SCI with full-scope polygraph` | true | false |
  | eligible for DoD clearance | `Must be eligible for a DoD security clearance` | true | false |
  | Public Trust | `Public Trust required` | true | false |
  | polygraph alone | `Willingness to undergo a polygraph examination` | true | false |
  | DOE Q clearance | `An active DOE Q clearance is required` | true | false |
  | UK SC | `You must hold or be able to obtain UK Security Check (SC) clearance` | true | false |
  | UK DV | `Developed Vetting (DV) clearance required` | true | false |
  | UK BPSS | `Successful candidates will undergo BPSS checks` | true | false |
  | NATO | `NATO SECRET clearance required` | true | false |
  | Canadian Reliability | `Must be able to obtain Government of Canada Reliability Status` | true | false |
  | Canadian Secret | `Must hold a valid Canadian Secret clearance` | true | false |
  | Australian NV1 | `Must hold a current Australian Government NV1 security clearance` | true | false |
  | Australian Baseline | `Ability to obtain a Baseline clearance` | true | false |
  | preferred clearance | `Active Secret clearance preferred` | true | true |
  | negation: no clearance required | `No security clearance required` | false | false |
  | negation: not required | `Security clearance not required for this role` | false | false |
  | negation: beneficial but not required | `A clearance is beneficial but not required` | false | false |
  | negation mixed with a requirement | `No clearance required to start.\nMust obtain a Secret clearance within 6 months` | true | true |
  | false friend: range clearance | `Experience with range clearance procedures at test sites` | false | – |
  | false friend: low-clearance | `Design low-clearance vehicle undercarriages` | false | – |
  | false friend: customs clearance | `Prepare customs clearance documentation for imports` | false | – |
  | false friend: trade secret | `Protect our trade secrets and IP` | false | – |
  | false friend: secret sauce | `Our secret sauce is our people` | false | – |
  | false friend: SCIENCE | `BS in COMPUTER SCIENCE required` | false | – |
  | false friend: polymer | `Experience with polymer composites` | false | – |
  | export control only | `This role requires access to export-controlled information (ITAR). Applicants must be U.S. persons.` | false | false |
  | no mention | `We build developer tools.` | false | false |

  Plus `it('clearance: evidence is the matching sentence')` (active Secret case: evidence contains `Secret clearance`),
  and `it('clearance: lexicon constants are exported, frozen and stateless')`: each of the six names above is exported;
  arrays are `Object.isFrozen`; no RegExp has `global` or `sticky`; `CLEARANCE_NON_US_PATTERNS.some(r => r.test('NV1'))`
  and `CLEARANCE_FALSE_FRIENDS.some(r => r.test('range clearance'))` are true.
- [ ] **Step 2: Run** `npm --prefix backend test -- JobAttributesClearance` → FAIL.
- [ ] **Step 3: Implement** `detectClearance`; tune on the `tune` split only.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(enrichment): rules for security clearance (BF-026)`.

### Task 7: Combiner and golden-set scorer

**Files:**
- Create: `backend/src/enrichment/rules/index.ts`, `backend/tests/helpers/goldenScore.ts`
- Test: `backend/tests/unit/JobAttributesGolden.test.ts` (also holds the combiner unit cases)

**Interfaces:**
- Consumes: `extractMinYears` (Task 5), `detectClearance` (Task 6), `EnrichmentInput`/`JobAttributes` (Task 2).
- Produces: `export function extractAttributesByRules(input: EnrichmentInput): JobAttributes;` — years from
  `input.descriptionPlain`; clearance from `` `${input.title}\n${input.descriptionPlain}` `` (titles like
  "Engineer (TS/SCI)" count); `source: 'rules'`; `confidence: 'low'` iff either result is ambiguous, else `'high'`;
  `evidence` has a key only when that evidence is non-null.
- Scorer (test helper, not production):
  ```ts
  export interface Score { tp: number; fp: number; fn: number; tn: number; precision: number; recall: number }
  export function scoreYears(pairs: Array<{ gold: number | null; pred: number | null }>): Score;
  // gold null & pred null → tn; pred null → fn; gold null → fp; equal → tp; different numbers → fp AND fn
  // (same definition as research/evaluate.py:18-22). precision = tp/(tp+fp) (1 when denominator 0); recall likewise.
  export function scoreClearance(pairs: Array<{ gold: boolean; pred: boolean }>): Score;   // binary
  ```

- [ ] **Step 1: Write the failing tests** in `JobAttributesGolden.test.ts` (load fixtures with `fs.readFileSync` +
  `JSON.parse` like `tests/contract/ContractFixtures.test.ts:7-8,18`; the inline ts-jest config in
  `backend/jest.config.js:16-29` does not set `resolveJsonModule`):
  ```ts
  describe('extractAttributesByRules')
    it('marks source rules and high confidence when both rules are sure')
    it('marks low confidence when years are ambiguous')          // 'Preferred qualifications\n5+ years…' → 'low'
    it('marks low confidence when clearance is ambiguous')       // 'Secret clearance preferred' → 'low'
    it('detects a clearance stated only in the title')           // title 'Engineer (TS/SCI)', description '' → true
    it('omits evidence keys that are null')                      // no-mention input → evidence toEqual({})
  describe('scorer')
    it('counts a wrong number as both FP and FN')                // scoreYears([{gold:5,pred:3}]) → {tp:0,fp:1,fn:1,tn:0}
  describe('golden set integrity')
    it('has at least 200 jobs and 40 clearance positives')
    it('has a holdout of at least 80 jobs, 16 clearance positives and 40 non-null years')
    it('labels exactly the jobs in jobs.json')                   // same id sets, no duplicates
    it('every label is marked labelled')                         // no row with labelled === false
    it('every evidence string is a substring of the description (whitespace-collapsed)')
    it('every years label is null or an integer 0..30')
  describe('golden set accuracy (BF-026)')
    it('years precision and recall >= 0.90 on holdout')
    it('clearance precision and recall >= 0.90 on holdout')
    it('years and clearance precision and recall >= 0.90 on tune')
    it('high-confidence predictions are >= 0.95 precise and low confidence is <= 35% of jobs')   // E3 sizing
    // over ALL golden jobs (tune + holdout):
    //   highPrecision = |{ j : confidence==='high' && years===gold.years && clearance===gold.clearance }|
    //                   / |{ j : confidence==='high' }|                        → toBeGreaterThanOrEqual(0.95)
    //   lowShare      = |{ j : confidence==='low' }| / |all jobs|              → toBeLessThanOrEqual(0.35)
  ```
  On failure each accuracy test prints the mismatching ids with gold vs predicted (no full descriptions).
- [ ] **Step 2: Run** `npm --prefix backend test -- JobAttributesGolden` → FAIL (module not found).
- [ ] **Step 3: Implement** the combiner and the scorer.
- [ ] **Step 4: Run** → PASS. If a holdout threshold fails: fix the rules using **tune** jobs or a new named
  regression row (Tasks 5/6) that reproduces the failure mode in your own words; never edit a holdout label or lower a
  threshold. If it still fails, STOP and report the scores and mismatches.
- [ ] **Step 5: Commit** `test(enrichment): golden-set scorer and P/R thresholds (BF-026)`. Paste the four scores
  (P/R per field per split), the low-confidence share and the high-confidence precision in the PR body.

### Task 8: ADR, invariant and docs

**Files (Modify unless stated):**
- Create `docs/decisions/ADR-0023-job-attribute-enrichment.md` from `docs/decisions/ADR-0000-template.md`
  (record-decision skill): Status Accepted, Date = merge day, Deciders owner + agent, Related BF-026, BF-011, ADR-0018,
  ADR-0021, ADR-0022. Context = DESIGN §1–§2; Options = DESIGN §5 table; Decision = DESIGN §4 items 1–5 plus §6.1 data
  model **as amended by 00-PLAN "Amendments from plan writing"** (`attrsDescHash` stores the job's `contentHash` at
  processing time, not a description hash; `hashDescription` is for evidence checks and tests only), the §6.2 labelling rule and the "processed = `attrsVersion` not null" marker; Consequences = columns outside
  the content hash, raw-SQL writes in E2 so `updatedAt` stays, API exposure only in E4, BF-026..BF-028, flags off.
- `docs/decisions/README.md`: index row after `:35` —
  `| [ADR-0023](./ADR-0023-job-attribute-enrichment.md) | Job attribute enrichment (experience and security clearance) | Accepted | <date> | ADR-0018, ADR-0021, ADR-0022 |`.
- `docs/README.md`: the "Job Attribute Enrichment Plans (`docs/plans/job-attributes/`)" list already exists (added by the
  plan PR); add only the ADR-0023 link next to the other ADR links.
- `docs/bug-fix-log.md`: new `### BF-026: Job attribute rules extractor and golden set (ADR-0023)` after BF-025
  (`:268-275`, same five bullets: Symptom / Need, Root cause & fix, Implemented in, Regression Invariant, Guarding
  tests). Invariant: "rules are pure; years P/R ≥ 0.90 and clearance P/R ≥ 0.90 on the frozen holdout; every DESIGN §2 /
  §6.2 failure mode has a named case; the API does not expose attribute columns until E4."
- `docs/testing.md`: §6 row **BF-026** after `:389` (guards: `JobAttributesYears`, `JobAttributesClearance`,
  `JobAttributesGolden`, `JobAttributesBuckets`, `JobAttributesText`, `JobAttributesNotExposed`,
  `tests/integration/JobAttributesSchema.test.ts`); §2.3 fixtures (`job-attributes/`, built by
  `scripts/BuildJobAttributeFixtures.ts`, never run in CI); §3 test-file rows.
- `backend/docs/database-and-cache.md`: §1 ER diagram `Job` entity (≈`:51`) gains the 8 columns; §2 `Job` table
  (`:116-160`) gains 8 rows with the DESIGN §6.1 meanings, except `attrsDescHash` = "the job's `contentHash` when it was processed"
  (00-PLAN Amendments), and the three indexes; one paragraph: "not part of
  `contentHash`; written only by `enrich:jobs` (E2) with raw SQL; `attrsVersion IS NULL` = not processed".
- `backend/docs/module-reference.md`: new `## ../src/enrichment/` section (after `../src/discovery/`, `:87-110`) with
  one `###` entry per new file and the `scripts/BuildJobAttributeFixtures.ts` entry under `## ../scripts/` (`:311`).
- `CHANGELOG.md` `## [Unreleased]` (skill `release-notes`): `feat(enrichment)` entry: columns + indexes, pure rules,
  golden set sizes and scores, BF-026, ADR-0023, "nothing runs in production yet".

**Agent files** (canonical sources only, then `node scripts/agents/sync-shells.mjs`; never hand-edit `.claude/` or
`.agents/` copies):
- `docs/agents/context.md` is **6,021 of 6,144 bytes** (`scripts/repo-tests/agent-shells.test.mjs:172-178`). E1, E2
  (BF-027) and E4 (BF-028) each add lines, so E1 must leave **≥ 450 bytes of headroom after its own additions**
  (`wc -c` ≤ 5,694). Measure first: `wc -c docs/agents/context.md` (expect 6021).
  1. Collapse lines `:33-43` (BF-001…BF-010 through BF-020, ≈ 1,420 bytes) into one line (≈ 170 bytes):
     `- **BF-001…BF-020:** see \`docs/testing.md\` §6 (BF-011 17-field content hash, BF-013 filter AND, BF-017 publish + exit codes, BF-019 cache = DB bodies).`
     Every fact stays in `docs/testing.md` §6 and `docs/bug-fix-log.md`; BF-023…BF-025 lines stay as they are.
  2. Add after BF-025:
     `- **BF-026:** Job attribute rules are pure; golden-set P/R ≥ 0.90 (guarded: \`JobAttributesGolden.test.ts\`).`
  3. Add in Data & Cache Facts:
     `- **Job attributes (ADR-0023):** \`experienceMinYears\`, \`clearanceRequired\`, \`attrs*\` on \`Job\`; outside \`contentHash\`; not in the API until E4.`
  4. Update the stamp line `:3` to `Last updated: <date> (ADR-0023).`
  5. Measure: `wc -c docs/agents/context.md` → expect ≈ 5,050 and **must be ≤ 5,694**. If it is above, shorten the
     Backend API line `:8` (400 bytes; drop the middleware file list, keep `Server.ts`, `contract.ts`, `ReadThrough.ts`,
     `api/index.ts`) and re-measure. Paste the before/after byte counts in the PR body.
- `docs/agents/rules/scraper-invariants.md`: "BF-001 through BF-025" → "BF-001 through BF-026".
- `docs/agents/rules/prisma-schema.md`: add rule 6 "Enrichment columns (`experienceMinYears`, `clearanceRequired`,
  `attrs*`) are never part of `computeJobContentHash` and are never written by the scraper."
- Explorer: `npm --prefix backend run docs:generate` (regenerates `backend/docs/project-explorer.html`; it reads the
  JSDoc `@file/@summary/@tags` blocks, `backend/scripts/GenerateDocs.ts:86-101`).

- [ ] **Step 1:** write the ADR and index; **Step 2:** BF-026 in bug-fix-log + testing.md; **Step 3:** backend docs;
  **Step 4:** agent files + `node scripts/agents/sync-shells.mjs`; **Step 5:** CHANGELOG; **Step 6:** docs:generate.
- [ ] **Step 7: Verify** `node --test 'scripts/repo-tests/**/*.test.mjs'` → all pass (byte budget, docs links, shells).
- [ ] **Step 8: Commit** `docs: ADR-0023, BF-026 and job attribute docs`.

### Task 9: Verify, commit, publish

- [ ] `scripts/check-all.sh --no-install` → every step PASSED (backend `check:all` = build, typecheck, typecheck:test,
  lint, any-ratchet, jest, docs:check — `backend/package.json:31`; frontend check; repo tests).
- [ ] `export TEST_DATABASE_URL='postgresql://postgres:pw@localhost:55432/postgres'`, guard
  `case "$TEST_DATABASE_URL" in *localhost*|*127.0.0.1*) ;; *) echo "not local" >&2; exit 1;; esac`, then
  `npm --prefix backend run test:integration` → all suites pass, including
  `JobAttributesSchema`.
- [ ] `node scripts/agents/sync-shells.mjs --check` → clean; `git diff --exit-code backend/tests/fixtures/contract` → clean.
- [ ] `git status` shows nothing unstaged from this PR and nothing from `.impeccable/`, `brag-output/`, `__pycache__/`.
- [ ] Squash-friendly final commit (or the task commits) with subject
  `feat(enrichment): job attribute columns, rules extractor and golden set (BF-026, ADR-0023)` and a bulleted body
  (root cause / changes / tests / docs) ending with the session attribution lines.
- [ ] Publish: `scripts/agents/push-branch.sh`. PR body: summary, Task 0 rehearsal output, golden-set counts and scores,
  the label review table (Task 4 Step 4), "API and cache unchanged; nothing calls the extractor yet".

## DONE (acceptance)
- [ ] `Job` has the 8 columns and 3 indexes with the exact 00-PLAN names; `prisma db push --skip-generate` from the
  pre-E1 schema exits 0 and is idempotent (integration test + rehearsal output).
- [ ] `backend/src/enrichment/{types,version,text,buckets}.ts` and `rules/{years,clearance,index}.ts` export exactly the
  00-PLAN signatures, with `EXPERIENCE_BUCKETS = ['0-2','3-5','6-9','10plus','unspecified']`; no I/O.
- [ ] Golden set ≥ 200 real jobs from production normalizers, ≥ 40 clearance positives, holdout ≥ 80; years and
  clearance P/R ≥ 0.90 on holdout and tune; all regression rows pass.
- [ ] No API/cache/contract change (`JobAttributesNotExposed`, contract fixtures unchanged); content hash untouched.
- [ ] ADR-0023 + index, BF-026 in bug-fix-log, testing.md §6 and context.md (≤ 5,694 bytes, leaving ≥ 450 for E2/E4), backend docs, CHANGELOG,
  explorer regenerated; check-all green.

## ROLLOUT (PR body)
Merge → no deploy. The next scheduled **scrape-daily** run applies the columns via "Sync database schema"
(`scrape-daily.yml:120-121`; `CREATE INDEX` on `Job` blocks writes for seconds, before the scrape starts, reads are not
blocked). Check the log shows the push succeeded and job counts are normal. The deployed API keeps working because its
Prisma queries use explicit selects (the extra columns are invisible to it); multi-source rule 13 (deploy before writing)
does not apply because nothing writes the columns until E2. Rollback: revert the squash commit; the nullable columns
and indexes are harmless and stay (never drop them with `db push --accept-data-loss`).

---

## Notes for the plan owner

1. **Research set is defense-heavy**: of the 100 labelled ids (label + holdout), Anduril 21, Palantir 17, Saronic 11
   (150 is the size of `samples.json`). E1 caps any board at 15 % and adds mainstream boards so the 0.90 thresholds are
   not tuned to one company's template. Research ids that have closed are dropped, so expect the research P/R numbers
   to move.
2. **"No years found in a description that contains the word 'years'" → low (DESIGN §6.2)** would flag almost every
   posting with a benefits section. E1 narrows it to "years within 40 chars of 'experience'". Keep or revert.
3. **Ashby text keeps bullets, Greenhouse/Lever text does not** (`Sanitizer.ts:116` keeps a non-empty native
   `descriptionPlain`; the HTML path never adds markers). DESIGN §6.6 says the normalizer "drops `- ` bullet markers"
   (`Sanitizer.ts:118-122`); it never creates them for Greenhouse/Lever and leaves Ashby's alone. E1's rules therefore
   use requirement-section context and do not depend on bullet markers.
4. **Index value**: `clearance=exclude` (`IS NOT TRUE`, DESIGN §6.4) cannot use `Job_clearanceRequired_idx`, and the
   boolean index has low selectivity for `= true` on most boards. E1 keeps the 00-PLAN index set; E4 should re-check
   with `EXPLAIN` on realistic data. Similarly E2's picker predicate (`attrsDescHash <> …` OR'ed with the version
   check) can use `Job_active_attrsVersion_idx` only for the `IS NULL` / `<` arms.
5. **`docs/agents/context.md` byte budget**: 6,021 / 6,144 bytes. 00-PLAN Amendments say E1 collapses BF-001…BF-016;
   that frees only ≈ 610 bytes, which E1+E2+E4 additions would overshoot. E1 therefore collapses BF-001…BF-020 and must
   end ≤ 5,694 bytes (≥ 450 headroom) so E2 and E4 can each add one short line. Update the Amendment wording if you agree.
6. **Rollout gate wording**: 00-PLAN says E1 deploy "none (columns appear via `db push` in the next scheduled run)" —
   correct; also `discover-weekly.yml` runs `prisma db push`, so whichever workflow runs first applies them.
7. **`research/samples.json` deletion**: 00-PLAN says research data "becomes the golden test set"; E1 deletes only
   `samples.json` (superseded, 1.1 MB) and keeps the small research files DESIGN cites. `research/__pycache__/` is
   untracked junk and must never be committed (consider a `.gitignore` entry in the plan PR).
8. **Clearance in titles**: 00-PLAN's `EnrichmentInput` carries `title`; E1 scans `title + description` for clearance
   (not for years). Not stated in DESIGN; state it in ADR-0023.
9. **Prod-DB safety**: `backend/.env` is auto-loaded by Prisma, so every DB-touching command in E1 is preceded by an
   explicit quoted localhost `DATABASE_URL` and a `case` guard. E2 (which adds a DB-writing CLI) should carry the same
   rule.
10. **`JobAttributesNotExposed.test.ts` is temporary**: E4 replaces it (00-PLAN Amendments); E1's test header says so.
11. **Clearance lexicon exports**: E1 exports `CLEARANCE_FALSE_FRIENDS`, `CLEARANCE_STRONG_PATTERNS`,
    `CLEARANCE_NON_US_PATTERNS`, `CLEARANCE_WEAK_PATTERNS`, `CLEARANCE_NEGATION`, `CLEARANCE_PREFERRED` from
    `rules/clearance.ts`; E3's `containsClearanceKeyword` should be written against these names.
12. **Labelling effort**: ≈ 5–10 implementer hours plus ≈ 1–2 owner review hours; batched commits make it resumable.
