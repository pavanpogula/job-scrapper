# E2 — Enrichment pass: `enrich:jobs` CLI, picker, raw-SQL writer, report, workflow step (Antigravity prompt)

> Owner: after E1 is merged, paste "Read docs/plans/job-attributes/E2-enrich-pass.md and implement it exactly."
> Background: `docs/plans/job-attributes/DESIGN.md` (§6.1, §6.3) and `00-PLAN.md` (shared interfaces; use those names
> exactly). This PR adds code, tests, a workflow step and docs. **Nothing changes in production** until the owner runs the
> `enrich_backfill` dispatch or sets repo variable `ENRICH_ENABLED=true` (ROLLOUT.md Steps 3–4).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a time-boxed, resumable post-scrape pass that fills the E1 attribute columns for every active job once, and
again only when the job's content or the extractor version changes, without touching `updatedAt`, `contentHash`,
`lastUpdatedAt` or `lastUpdatedSource`.

**Architecture:** `EnrichCli.ts` parses flags and calls `runEnrichment`, which loops: `pickJobsForEnrichment` (keyset by
`id`, batch 500, pinned SQL) → registered steps (`rules` now; E3 appends `model`) → `writeAttributes` (one pinned
`UPDATE … FROM unnest(…)` per batch) until done, budget or max-jobs. At the end it counts `remaining` with the picker's
WHERE clause, writes its own report (`output/latest-enrich.json` + `output/reports/<YYYY-MM>/enrich-<runId>.json`) and a
GitHub step-summary table. `scrape-daily.yml` runs it after classification, behind `ENRICH_ENABLED`, plus a manual
`enrich_backfill` dispatch that runs it alone.

**Tech stack:** TypeScript, Prisma 5 (`$queryRaw` / `$executeRaw` tagged templates), Postgres (Neon prod; local
throwaway Postgres for tests), Jest (unit + `jest.integration.config.js`), GitHub Actions, `node --test` repo tests.

**Spec:** `docs/plans/job-attributes/DESIGN.md` + `docs/plans/job-attributes/00-PLAN.md`. Where this prompt differs
from them it says so and why (see "Notes for the plan owner").

You are working in the Ashby Job Scraper monorepo (product: B.O.O.L.E.A.N). Implement ONE PR. Squash-merge. Follow
AGENTS.md, CLAUDE.md, docs/agents/context.md and every rule in docs/agents/rules/ (scraper-invariants, ci-and-workflows,
prisma-schema, secrets-and-git, changelog-and-commits).

## WHY (read this, it drives every decision)
- The scrape must never get slower or fail because of enrichment (DESIGN §3 anti-goals). So enrichment is a separate
  process, after the scrape's own classification, `continue-on-error`, with a hard wall-time budget.
- Enrichment must not look like a job change. `Job.updatedAt` is `@updatedAt` (`backend/prisma/schema.prisma:105`), which
  Prisma Client fills on every `update`/`updateMany`/`upsert`, and it is in the list/detail DTO
  (`backend/src/api/contract.ts:50,99,170`). The repo already bypasses it with raw SQL for the same reason
  (`backend/src/core/Scraper.ts:465,472-475`, BF-016). So every enrichment write is one raw `UPDATE`.
- The owner has no DB access. The report's `remaining` count is how ROLLOUT.md Step 3 decides the backfill is done.
- Neon free tier has **5 GB egress/month** (`docs/deployment-and-operations.md:14`). `Job.metadata` is the full raw ATS
  payload (`backend/src/core/Scraper.ts:674`), so the picker reads **only** the description key it needs, and the
  "description changed" test must run in SQL, not by downloading every description (see BUILD §2).

## HARD RULES (non-negotiable)
- Never read, print, stage, or commit `.env*`, `apikeys/`, `backend/apikeys/`, `output/`, `backend/output/`, `.vercel/`.
  Tests write reports to an `os.tmpdir()` folder only.
- Agents never push to `main`/`master`, never merge, never force-push, push tags or delete branches, and never run raw
  `git push` or `gh`. Publish only with `scripts/agents/push-branch.sh`. Owner reviews and merges. Deploys are manual
  (ADR-0016).
- **DB safety rule (00-PLAN):** every command that can reach a database (`prisma …`, `enrich:jobs`, `test:integration`,
  seed/EXPLAIN scripts) runs only after the **LOCAL-DB block** (PRECONDITION) in the same shell: quoted
  `export DATABASE_URL='postgresql://…localhost…'` (`?` is a zsh glob) plus the `case` guard. `backend/.env` is
  auto-loaded and points at production.
- Never connect to production DB/Redis/API. Local throwaway Postgres only (`TEST_DATABASE_URL` on localhost). No
  network in tests. No Gemini anything in this PR (E3).
- **Must not change:** `computeJobContentHash` and its 17 fields (BF-011), `lastUpdatedAt`/`lastUpdatedSource`
  (ADR-0018), `Job.updatedAt` on enrichment writes, scrape exit codes 0/1/2, BF-017 publish orchestration, BF-025 staged
  runner, `ReportClassifier` / `ReportClassifyCli` behaviour, any existing workflow step's behaviour when
  `ENRICH_ENABLED` is unset and `enrich_backfill` is false.
- Never use Prisma `update`/`updateMany`/`upsert` on `Job` in `backend/src/enrichment/**`. Never write
  `output/latest-error-report.json` or `latest-<cluster|single|csv>.json` from enrichment.
- No new `any` (`scripts/any-ratchet.mjs`). JSDoc `@file`/`@summary`/`@tags` on every new file and function. No
  existing test weakened. Never add `--accept-data-loss`. Never stage `.impeccable/` or `brag-output/`.

## PRECONDITION
- `git fetch origin`. `origin/main` must contain E1: `backend/src/enrichment/{types,version,text,buckets}.ts`,
  `backend/src/enrichment/rules/index.ts` (`extractAttributesByRules`), and `attrsModelVersion` in
  `backend/prisma/schema.prisma`; plus this file. Otherwise **STOP** and tell the owner.
- Branch `feat/ja-2-enrich-pass` from `origin/main`.
- Local Postgres for integration tests, e.g.
  `docker run --rm -d -p 5432:5432 -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=enrich_test postgres:17.5`
  (same image as `.github/workflows/backend-ci.yml:69-70`; CI runs `npm run test:integration` at `backend-ci.yml:121-125`),
  then the LOCAL-DB block, which every later DB command in this prompt assumes in the same shell:
```bash
# LOCAL-DB block: run in the same shell before any command that can reach a database (backend/.env is auto-loaded and points at production)
export DATABASE_URL='postgresql://test:test@localhost:5432/enrich_test'
export TEST_DATABASE_URL='postgresql://test:test@localhost:5432/enrich_test'
case "$DATABASE_URL" in *localhost*|*127.0.0.1*) ;; *) echo "not local" >&2; exit 1;; esac
case "$TEST_DATABASE_URL" in *localhost*|*127.0.0.1*) ;; *) echo "not local" >&2; exit 1;; esac
```

## Global constraints (from 00-PLAN, verbatim values)
- Feature flag repo variable `ENRICH_ENABLED`, default **off**. Scheduled step uses `--budget-min=10`.
- `--model-max-calls` default **2000** (parsed and passed to steps; the model step itself is E3).
- Exit codes: **0** success (including budget/max-jobs stop and dry run), **1** hard failure (bad flags, DB error).
- Invariant id **BF-027** (enrichment pass writes). ADR-0023 already exists (E1); add a status line only.
- Experience bucket value is `10plus` (E1 `buckets.ts`); E2 does not use buckets but docs must not write `10+` as a value.
- CHANGELOG `## [Unreleased]` entry (skill `release-notes`); `npm --prefix backend run docs:generate` committed.

## Review Focus (failure modes most likely to bite; each has a named test below)
1. Description changes after enrichment → job re-picked, values replaced (Task 2 `picker re-picks on description change`).
2. Enrichment write bumps `updatedAt`/`contentHash`/`lastUpdatedAt`/`lastUpdatedSource` (Task 3 `writer leaves updatedAt untouched`).
3. Scrape updates a row between pick and write → stale values land under the new content (Task 3 `writer skips a row whose contentHash changed after pick`).
4. Backfill never converges or reports "done" while rows are left (Task 5 `remaining counts the picker WHERE clause`, Task 4 `budget stop`).
5. Enrichment report is picked up by the classifier / fixer, or enrichment failure fails the scrape job (Task 6 repo tests + Task 5 `does not write latest-error-report.json`).

---

## File structure

| File | Responsibility |
|---|---|
| Create `backend/src/enrichment/picker.ts` | `pickJobsForEnrichment`, `countPickable` (pinned SQL, shared WHERE fragment) |
| Create `backend/src/enrichment/writer.ts` | `writeAttributes` (pinned raw `UPDATE … FROM unnest`) |
| Create `backend/src/enrichment/step.ts` | `EnrichmentStep` (00-PLAN), `StepRunContext`, `EnrichCounts`, `StepFactory`, `DEFAULT_STEP_FACTORIES`, `buildSteps` |
| Create `backend/src/enrichment/rulesStep.ts` | `createRulesStep()` wrapping E1 `extractAttributesByRules` |
| Create `backend/src/enrichment/run.ts` | `runEnrichment` loop (batching, budget, max-jobs, dry run, remaining) |
| Create `backend/src/enrichment/report.ts` | `EnrichReport` type, `writeEnrichReport`, `formatEnrichSummary` |
| Create `backend/src/enrichment/EnrichCli.ts` | `parseEnrichArgs`, `main` (exit codes, step summary), `require.main` guard |
| Modify `backend/src/lib/ErrorTracker.ts:148` | widen `generateRunId` mode union with `'enrich'` (no other change) |
| Modify `backend/package.json:21` | add `"enrich:jobs": "npx ts-node src/enrichment/EnrichCli.ts"` after `enrich:companies` |
| Modify `.github/workflows/scrape-daily.yml` | new step, `enrich_backfill` + `enrich_budget_min` inputs, guards, timing comment |
| Test `backend/tests/unit/EnrichPass.test.ts` | args, steps registry, run loop with fakes, report files, summary |
| Test `backend/tests/integration/EnrichPass.test.ts` | picker / writer / run on real Postgres (schema `enrich_pass`) |
| Create `backend/tests/integration/enrichSeed.ts` | `seedEnrichJobs(prisma, n)` shared by tests and the local rehearsal |
| Test `scripts/repo-tests/settings-allowlist.test.mjs`, new `enrichment-raw-sql.test.mjs` | `enrich:jobs` never auto-allowed; no Prisma `update*` on `Job` under `backend/src/enrichment/` |
| Test `scripts/repo-tests/toggles.test.mjs` | new `test('scrape-daily.yml wires job attribute enrichment …')` |

There is **no root `package.json`** (only `backend/` and `frontend/`), so no proxy script is added.

---

### Task 1: Step contract, rules step, registry

**Files:** Create `backend/src/enrichment/step.ts`, `backend/src/enrichment/rulesStep.ts`; Test `backend/tests/unit/EnrichPass.test.ts`

**Interfaces:**
- Consumes (E1): `EnrichmentInput`, `JobAttributes`, `AttrsConfidence` (`types.ts`); `extractAttributesByRules(input)` (`rules/index.ts`); `PickedJob` (Task 2, type only).
- Produces:
```ts
// step.ts
export interface EnrichCounts {
  picked: number; rulesHigh: number; rulesLow: number;
  modelCalls: number; modelAccepted: number; modelRejected: number; modelErrors: number;
  written: number;
}
export interface StepRunContext {
  counts: EnrichCounts;          // steps increment their own counters
  modelTried: Set<string>;       // ids for which a model answer (HTTP 200) arrived in this batch; network errors do not count (E3 adds to it)
  modelMaxCalls: number;         // from --model-max-calls
}
export interface EnrichmentStep {   // 00-PLAN signature + optional members (additive)
  readonly name: 'rules' | 'model';
  readonly exhausted?: boolean;   // E3 model step sets true when its call cap/deadline is spent; runner then picks with modelEnabled false
  run(jobs: PickedJob[], prior: Map<string, JobAttributes>, ctx?: StepRunContext): Promise<Map<string, JobAttributes>>;
}
export interface StepOptions { modelMaxCalls: number; env: NodeJS.ProcessEnv; deadlineAt: number }  // E2 definition: deadlineAt = start + budgetMin × 60_000 − 30_000 (epoch ms; 30 s margin for the last write), set by runEnrichment; E3 only reads it
export type StepFactory = (opts: StepOptions) => EnrichmentStep | null;   // null = step disabled
export const DEFAULT_STEP_FACTORIES: StepFactory[];                     // E2: [() => createRulesStep()]; E3 appends the model factory
export function buildSteps(opts: StepOptions, factories?: StepFactory[]): EnrichmentStep[];  // drops nulls, keeps order
export function isModelEnabled(steps: EnrichmentStep[]): boolean;        // for PICKING: steps.some(s => s.name === 'model' && !s.exhausted)
export function hasModelStep(steps: EnrichmentStep[]): boolean;          // for COUNTING `remaining`: steps.some(s => s.name === 'model') (ignores exhausted)
export function emptyCounts(): EnrichCounts;
// rulesStep.ts
export function createRulesStep(): EnrichmentStep;   // name 'rules'; one result per job; counts rulesHigh / rulesLow
```
- Runner contract (Task 4 relies on it): steps run in registry order; each returned map is merged over `prior`
  (later step wins per id); the rules step must return an entry for **every** job; a later step may return a subset.

- [ ] **Step 1: Write the failing tests** (`describe('EnrichPass unit')`)
```ts
it('buildSteps returns only the rules step by default', () => {
  const steps = buildSteps({ modelMaxCalls: 2000, env: {}, deadlineAt: 0 });
  expect(steps.map(s => s.name)).toEqual(['rules']);
  expect(isModelEnabled(steps)).toBe(false);
});
it('buildSteps keeps factory order and drops disabled steps', () => {
  const fake: EnrichmentStep = { name: 'model', run: async () => new Map() };
  expect(buildSteps({ modelMaxCalls: 1, env: {}, deadlineAt: 0 }, [...DEFAULT_STEP_FACTORIES, () => null, () => fake]).map(s => s.name))
    .toEqual(['rules', 'model']);
});
it('rules step returns one result per job and counts high/low', async () => {
  // jobs: 'a' = "5+ years of experience required" (high), 'b' = "3+ years preferred" (low per E1 rules)
  const ctx = { counts: emptyCounts(), modelTried: new Set<string>(), modelMaxCalls: 0 };
  const out = await createRulesStep().run([jobA, jobB], new Map(), ctx);
  expect([...out.keys()].sort()).toEqual(['a', 'b']);
  expect(out.get('a')).toMatchObject({ source: 'rules', experienceMinYears: 5, confidence: 'high' });
  expect(ctx.counts).toMatchObject({ rulesHigh: 1, rulesLow: 1 });
});
```
- [ ] **Step 2: Run, expect FAIL** — `npm --prefix backend test -- EnrichPass` → "Cannot find module '../../src/enrichment/step'".
- [ ] **Step 3: Implement** `step.ts` and `rulesStep.ts` with the signatures above. Pick `jobB`'s text from E1's
  named regression cases so it is low confidence under E1's rules (do not change E1 rules to fit the test).
- [ ] **Step 4: Run, expect PASS** — same command.
- [ ] **Step 5: Commit** — `git add backend/src/enrichment/step.ts backend/src/enrichment/rulesStep.ts backend/tests/unit/EnrichPass.test.ts && git commit` (`feat(enrichment): step contract and rules step`).

### Task 2: Picker (pinned SQL) and `countPickable`

**Files:** Create `backend/src/enrichment/picker.ts`; Test `backend/tests/integration/EnrichPass.test.ts`

**Interfaces:**
- Consumes (E1): `ATTRS_VERSION` (`version.ts`), `getDescriptionText(metadata)` (`text.ts`), `AttrsConfidence`, `EnrichmentInput`.
- Produces (00-PLAN names):
```ts
export interface PickedJob extends EnrichmentInput { attrsConfidence: AttrsConfidence | null; descHash: string }
export function pickJobsForEnrichment(prisma: PrismaClient, opts: { limit: number; afterId?: string; modelEnabled: boolean }): Promise<PickedJob[]>;
export function countPickable(prisma: PrismaClient, opts: { modelEnabled: boolean }): Promise<number>;
```
- `descHash` = the row's **`contentHash`** at pick time (see "change detection" below and Notes 1).

**Change detection (decided here).** DESIGN §6.1 says "`attrsDescHash <> hash(current description)`". That hash is
computed in TypeScript (`hashDescription`, E1) and cannot be evaluated in SQL; evaluating it in TS means downloading
every active job's description on every run (~128k rows, hundreds of MB, against a 5 GB/month egress cap). Instead
`attrsDescHash` stores the job's `contentHash` at enrichment time. `contentHash` already covers `descriptionHtml` and
`descriptionPlain` (`backend/src/core/Scraper.ts:107-108`) and the scraper rewrites it on every content change, so
"`attrsDescHash IS DISTINCT FROM contentHash`" is an exact, index-free, in-row test that fires on every description
change (and also on other content changes, which only costs a cheap rules re-run). It also lets the writer refuse stale
writes (Task 3). Columns and names stay as in 00-PLAN.

**Pinned WHERE fragment** (one `Prisma.Sql` constant built by `pickableWhere(modelEnabled)`, used by both functions):
```sql
j."active" = true
AND (
  j."attrsVersion" IS NULL
  OR j."attrsVersion" < ${ATTRS_VERSION}
  OR j."attrsDescHash" IS DISTINCT FROM j."contentHash"
  OR (${modelEnabled}::boolean
      AND j."attrsConfidence" = 'low'
      AND (j."attrsModelVersion" IS NULL OR j."attrsModelVersion" < ${ATTRS_VERSION}))
)
```
**Pinned picker query** (`prisma.$queryRaw` tagged template, `Prisma.sql` for the fragment):
```sql
SELECT j."id", j."title", j."contentHash", j."attrsConfidence",
       CASE WHEN COALESCE(btrim(j."metadata"->>'descriptionPlain'), '') <> ''
            THEN jsonb_build_object('descriptionPlain', j."metadata"->'descriptionPlain')
            ELSE jsonb_build_object('descriptionHtml',  j."metadata"->'descriptionHtml')
       END AS "metadata"
FROM "Job" j
WHERE j."id" > ${afterId ?? ''} AND <pickableWhere>
ORDER BY j."id" ASC
LIMIT ${limit}
```
`countPickable`: `SELECT COUNT(*)::int AS "n" FROM "Job" j WHERE <pickableWhere>`. Map each row to
`{ id, title, descriptionPlain: getDescriptionText(row.metadata), attrsConfidence, descHash: row.contentHash }`.
Every Ashby/Greenhouse/Lever metadata payload carries both keys (`AshbyAtsClient.ts:93-99`,
`GreenhouseClient.ts:403-405`, `LeverClient.ts:409-410`). Raw SQL is unqualified `"Job"`; the Prisma `?schema=` URL sets
the search path, as in `tests/integration/MultiSourceSchema.test.ts:88-116`.

- [ ] **Step 1: Write the failing integration tests.** File header mirrors
  `tests/integration/LeverCoexistence.test.ts:27-77`: `describeIfDb`, refuse non-localhost, `schema=enrich_pass`,
  `npx prisma db push --skip-generate --force-reset`, `beforeEach` deletes `Job`/`Company`. Helper
  `seedJob(id, over: Partial<{active; contentHash; attrsVersion; attrsDescHash; attrsConfidence; attrsModelVersion; metadata}>)`
  creates a company once and jobs with `metadata: { descriptionPlain: '5+ years of experience', descriptionHtml: '<p>x</p>', other: 'x'.repeat(5000) }`.
```ts
it('picker picks unprocessed, old-version, changed and low+model rows and skips processed ones', async () => {
  // n1: attrsVersion null | o1: attrsVersion ATTRS_VERSION-1 (seed 0 when ATTRS_VERSION=1) | c1: attrsDescHash 'old' ≠ contentHash 'h'
  // l1: current, hash equal, confidence 'low', attrsModelVersion null | l2: same but attrsModelVersion = ATTRS_VERSION
  // p1: current, hash equal, 'high' (processed)
  const off = (await pickJobsForEnrichment(prisma, { limit: 100, modelEnabled: false })).map(j => j.id);
  expect(off).toEqual(['c1', 'n1', 'o1']);                     // id order
  const on = (await pickJobsForEnrichment(prisma, { limit: 100, modelEnabled: true })).map(j => j.id);
  expect(on).toEqual(['c1', 'l1', 'n1', 'o1']);                 // l2 and p1 never
});
it('picker skips inactive jobs', async () => { /* n2 active=false, attrsVersion null → not returned; countPickable excludes it */ });
it('picker pages by id after afterId', async () => {
  // 5 unprocessed ids a..e, limit 2: ['a','b'], then afterId 'b' → ['c','d'], then afterId 'd' → ['e'], then [] 
});
it('picker reads only the description key and returns descHash = contentHash', async () => {
  const [j] = await pickJobsForEnrichment(prisma, { limit: 1, modelEnabled: false });
  expect(j.descriptionPlain).toContain('5+ years');
  expect(j.descHash).toBe('h');
  // the projection itself: same CASE expression as the picker, via $queryRaw
  const [row] = await prisma.$queryRaw<{ metadata: Record<string, unknown> }[]>`SELECT CASE … END AS "metadata" FROM "Job" j WHERE j."id" = ${j.id}`;
  expect(Object.keys(row.metadata)).toEqual(['descriptionPlain']);   // 'descriptionHtml' and 'other' excluded
  // and a row with empty descriptionPlain projects ['descriptionHtml'] and falls back to its text via getDescriptionText
});
it('picker re-picks on description change', async () => {
  // seed p1 processed (attrsDescHash = contentHash = 'h1'); pick → []
  await prisma.job.update({ where: { id: 'p1' }, data: { contentHash: 'h2', metadata: { descriptionPlain: '10+ years required' } } });
  const picked = await pickJobsForEnrichment(prisma, { limit: 10, modelEnabled: false });
  expect(picked.map(j => j.id)).toEqual(['p1']);
  expect(picked[0]).toMatchObject({ descHash: 'h2', descriptionPlain: expect.stringContaining('10+ years') });
});
it('countPickable equals the number of rows the picker would return', async () => { /* same seed as test 1: 3 off, 4 on */ });
```
- [ ] **Step 2: Run, expect FAIL** — LOCAL-DB block, then `npm --prefix backend run test:integration -- EnrichPass` → module not found.
- [ ] **Step 3: Implement `picker.ts`** with the pinned SQL. Typed row interface for `$queryRaw<…[]>`; no `any`.
  Build `Prisma.sql` **only inside** `pickableWhere()` and the function bodies, never at module scope: unit Jest maps
  `@prisma/client` to `backend/__mocks__/@prisma/client.ts` (`jest.config.js:9-11`), whose `Prisma` has only
  `DbNull`/`JsonNull`/`AnyNull` (`__mocks__/@prisma/client.ts:42-46`), so unit tests that import `run.ts` (and through it
  `picker.ts`) must not hit `Prisma.sql` at import time.
- [ ] **Step 4: Run, expect PASS** (6 tests in this describe).
- [ ] **Step 5: Commit** (`feat(enrichment): keyset picker with SQL change detection`).

### Task 3: Raw-SQL writer

**Files:** Create `backend/src/enrichment/writer.ts`; Test `backend/tests/integration/EnrichPass.test.ts`

**Interfaces:**
- Consumes: `JobAttributes` (E1), `ATTRS_VERSION` (E1).
- Produces (00-PLAN): `export interface AttributeWrite { id: string; attrs: JobAttributes; descHash: string; modelTried: boolean }`;
  `export function writeAttributes(prisma: PrismaClient, rows: AttributeWrite[]): Promise<number>` — returns rows updated; `[]` → 0 without a query.

**Pinned statement** (one `prisma.$executeRaw` tagged template per batch; arrays built column-wise from `rows`;
`evidence` = `JSON.stringify(attrs.evidence)`):
```sql
UPDATE "Job" AS j SET
  "experienceMinYears" = v.years,
  "clearanceRequired"  = v.clearance,
  "attrsVersion"       = ${ATTRS_VERSION}::int,
  "attrsDescHash"      = v.desc_hash,
  "attrsSource"        = v.source,
  "attrsConfidence"    = v.confidence,
  "attrsEvidence"      = v.evidence::jsonb,
  "attrsModelVersion"  = CASE WHEN v.model_tried THEN ${ATTRS_VERSION}::int ELSE NULL END
FROM unnest(
  ${ids}::text[], ${years}::int[], ${clearance}::boolean[], ${descHashes}::text[],
  ${sources}::text[], ${confidences}::text[], ${evidence}::text[], ${modelTried}::boolean[]
) AS v(id, years, clearance, desc_hash, source, confidence, evidence, model_tried)
WHERE j."id" = v.id
  AND j."active" = true
  AND j."contentHash" = v.desc_hash
```
- Sets only the 8 attribute columns. `updatedAt` has no DB default/trigger (`@updatedAt` is client-side), so raw SQL
  leaves it alone. `WHERE id = ANY(…)` (DESIGN §6.1) cannot carry per-row values; `unnest` can (Notes 3).
- `contentHash = v.desc_hash` drops a write if the scraper changed the row after it was picked; the row stays pickable
  and is redone next run. `active = true` drops writes for jobs deactivated meanwhile.
- `attrsModelVersion` = `ATTRS_VERSION` only when the model was called **for this content**, else `NULL`, so a later
  content change makes a still-low row eligible for the model again (Notes 2).

- [ ] **Step 1: Write the failing tests**
```ts
it('writer leaves updatedAt untouched', async () => {
  // seed n1 with lastUpdatedAt = 2026-01-01, lastUpdatedSource 'ashby', contentHash 'h'; read before row
  const before = await prisma.job.findUniqueOrThrow({ where: { id: 'n1' } });
  await new Promise(r => setTimeout(r, 20));
  const n = await writeAttributes(prisma, [{ id: 'n1', descHash: 'h', modelTried: false,
    attrs: { experienceMinYears: 5, clearanceRequired: true, confidence: 'high', source: 'rules', evidence: { years: '5+ years', clearance: 'TS/SCI' } } }]);
  const after = await prisma.job.findUniqueOrThrow({ where: { id: 'n1' } });
  expect(n).toBe(1);
  expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
  expect(after.contentHash).toBe(before.contentHash);
  expect(after.lastUpdatedAt?.getTime()).toBe(before.lastUpdatedAt?.getTime());
  expect(after.lastUpdatedSource).toBe(before.lastUpdatedSource);
  expect(after.metadata).toEqual(before.metadata);
  expect(after).toMatchObject({ experienceMinYears: 5, clearanceRequired: true, attrsVersion: ATTRS_VERSION,
    attrsDescHash: 'h', attrsSource: 'rules', attrsConfidence: 'high', attrsModelVersion: null,
    attrsEvidence: { years: '5+ years', clearance: 'TS/SCI' } });
});
it('writer stores null years and false clearance', async () => { /* experienceMinYears null, clearanceRequired false, evidence {} */ });
it('writer skips a row whose contentHash changed after pick', async () => {
  // seed contentHash 'h2', write with descHash 'h1' → returns 0, attrsVersion still null
});
it('writer skips inactive rows', async () => { /* active=false → 0 */ });
it('writer sets attrsModelVersion only when the model was tried', async () => {
  // two rows, modelTried true/false → ATTRS_VERSION / null; then rewrite the first with modelTried false → null
});
it('writer writes a 500-row batch in one call', async () => { /* 500 seeded rows, experienceMinYears alternating null and numbers (::int[] with nulls) → returns 500; spot-check a null and a numeric row */ });
```
- [ ] **Step 2: Run, expect FAIL** — LOCAL-DB block, then `npm --prefix backend run test:integration -- EnrichPass` (writer module missing).
- [ ] **Step 3: Implement `writer.ts`** with the pinned statement.
- [ ] **Step 4: Run, expect PASS.** (The no-Prisma-update rule is enforced by `enrichment-raw-sql.test.mjs`, Task 6.)
- [ ] **Step 5: Commit** (`feat(enrichment): raw SQL attribute writer that never touches updatedAt`).

### Task 4: Run loop (batching, budget, max-jobs, dry run)

**Files:** Create `backend/src/enrichment/run.ts`; Tests in both `EnrichPass.test.ts` files

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:
```ts
export const ENRICH_BATCH_SIZE = 500;
export type StopReason = 'done' | 'budget' | 'maxJobs';
export interface EnrichOptions { maxJobs: number | null; budgetMin: number; dryRun: boolean; modelMaxCalls: number; batchSize?: number }
export interface EnrichDeps {
  pick: typeof pickJobsForEnrichment; write: typeof writeAttributes; count: typeof countPickable;
  steps: EnrichmentStep[]; now: () => number;
}
export interface EnrichResult extends EnrichCounts { remaining: number; durationMs: number; stoppedBy: StopReason; descBytes: number }
export function runEnrichment(prisma: PrismaClient, opts: EnrichOptions, deps?: Partial<EnrichDeps>): Promise<EnrichResult>;
```
Defaults: real picker/writer/count, `buildSteps({ modelMaxCalls, env: process.env, deadlineAt: start + budgetMin × 60_000 − 30_000 })`
(`start = deps.now()` at entry), `Date.now`. Re-evaluate `isModelEnabled(steps)` before **every** pick, so a step that
turns `exhausted` (E3) stops model-only picks for the rest of the run.

**Clock calls (pinned so fake clocks are exact):** `now()` is called once at entry (`start`), once at the top of each
iteration (budget check, before the pick), and once after the loop (`durationMs`). No other calls.

Loop (one sequential batch at a time, one Prisma client, so at most one DB connection is busy; `DbGuard` is API-only,
`backend/src/api/middleware/dbGuard.ts`):
1. Before each batch: if `now() - start >= budgetMin × 60_000` → `stoppedBy='budget'`; if `maxJobs !== null && picked >= maxJobs` → `'maxJobs'`.
2. `limit = min(batchSize, maxJobs − picked)`; `pick({ limit, afterId, modelEnabled: isModelEnabled(steps) })`; empty → `'done'`.
   `remaining` at the end uses `hasModelStep(steps)`, **not** `isModelEnabled`: while a model step is registered the
   count keeps the model arm (untried low rows) even after the step is exhausted, so `remaining = 0` ("Backfill
   complete: yes") never appears while Gemini work is left (00-PLAN Amendments).
3. `ctx = { counts, modelTried: new Set(), modelMaxCalls }`; run steps in order, merging maps over `prior`.
4. Rows = picked → `{ id, attrs: prior.get(id)!, descHash: job.descHash, modelTried: ctx.modelTried.has(id) }`.
5. Not dry run → `counts.written += await write(prisma, rows)`. `afterId = last id` **always** (dry run must advance, and
   rows the writer skipped must not loop). `descBytes += Buffer.byteLength(descriptionPlain)`.
6. After the loop: `remaining = await count(prisma, { modelEnabled: hasModelStep(steps) })` (also in dry run). Errors from pick/write/count propagate (CLI exit 1); rows already written stay (resumable).
A run makes **one pass** in id order; rows that become pickable behind the cursor wait for the next run.

- [ ] **Step 1: Write the failing unit tests** (fake `pick`/`write`/`count`, fake clock)
```ts
it('processes batches in id order and passes afterId', async () => { /* pick called with afterId undefined, then last id of batch 1; stoppedBy 'done' */ });
it('budget stop', async () => {
  // now() sequence: [0 (start), 0 (iteration 1 check), 11*60_000 (iteration 2 check → stop), 11*60_000 (durationMs)];
  // budgetMin 10 → pick called once, one batch written, stoppedBy 'budget', durationMs 660_000, no throw
});
it('maxJobs stop caps the last batch limit', async () => { /* maxJobs 700, batch 500 → limits [500, 200], stoppedBy 'maxJobs', picked 700 */ });
it('dry run writes nothing but still advances and counts', async () => { /* write never called; picked > 0; written 0; afterId advances */ });
it('model-tried ids reach the writer', async () => { /* fake model step adds 'b' to ctx.modelTried → write row b.modelTried true, a false */ });
it('default steps get deadlineAt = start + budget − 30 s', async () => { /* spy buildSteps via a fake factory list: now() = 1_000, budgetMin 10 → StepOptions.deadlineAt === 1_000 + 600_000 − 30_000 */ });
it('remaining includes untried low rows after the model step is exhausted; Backfill complete: yes only when remaining = 0', async () => {
  // fake model step with exhausted = true from the start; fake count records its opts
  // → every pick called with modelEnabled false; count called once with modelEnabled true;
  // count returns 3 → formatEnrichSummary contains 'Backfill complete: no'; count returns 0 → 'Backfill complete: yes'
});
it('a pick error propagates', async () => { await expect(runEnrichment(p, opts, { pick: async () => { throw new Error('db down'); } })).rejects.toThrow('db down'); });
```
- [ ] **Step 2: Write the failing integration tests** (real picker/writer, fake clock only)
```ts
it('runEnrichment fills every active job and is idempotent', async () => {
  // 1,200 unprocessed active + 3 inactive → written 1200, remaining 0, stoppedBy 'done'; second run picked 0, written 0
});
it('budget stop leaves the rest pickable', async () => { /* clock jumps after first batch → written 500, remaining 700 */ });
it('dry run writes nothing', async () => { /* every attrsVersion still null afterwards; result.picked 1200, written 0, remaining 1200 */ });
it('inactive jobs are never written', async () => { /* the 3 inactive rows keep attrsVersion null */ });
```
- [ ] **Step 3: Run both, expect FAIL** — `npm --prefix backend test -- EnrichPass`, then LOCAL-DB block and `npm --prefix backend run test:integration -- EnrichPass`.
- [ ] **Step 4: Implement `run.ts`.**
- [ ] **Step 5: Run both, expect PASS** — `npm --prefix backend test -- EnrichPass`, then LOCAL-DB block and `npm --prefix backend run test:integration -- EnrichPass`.
- [ ] **Step 6: Commit** (`feat(enrichment): batched run loop with budget, max-jobs and dry run`).

### Task 5: Report, `remaining`, step summary, CLI, npm script

**Files:** Create `backend/src/enrichment/report.ts`, `backend/src/enrichment/EnrichCli.ts`; Modify `backend/src/lib/ErrorTracker.ts:148`, `backend/package.json:21`; Test `backend/tests/unit/EnrichPass.test.ts`, `backend/tests/integration/EnrichPass.test.ts`

**Interfaces:**
```ts
// report.ts
export interface EnrichReport {
  schemaVersion: 'enrich-1';
  run: { runId: string; startedAt: string; finishedAt: string; dryRun: boolean; attrsVersion: number;
         modelEnabled: boolean; flags: { maxJobs: number | null; budgetMin: number; modelMaxCalls: number } };
  counts: { picked: number; rulesHigh: number; rulesLow: number; modelCalls: number; modelAccepted: number;
            modelRejected: number; modelErrors: number; written: number; remaining: number;
            durationMs: number; stoppedBy: 'done' | 'budget' | 'maxJobs'; descBytes: number };
}
export function writeEnrichReport(report: EnrichReport, baseDir?: string): { reportPath: string; latestPath: string };
export function formatEnrichSummary(report: EnrichReport): string;
// EnrichCli.ts
export interface EnrichCliArgs { maxJobs: number | null; budgetMin: number; dryRun: boolean; modelMaxCalls: number }
export function parseEnrichArgs(argv: string[]): EnrichCliArgs;   // throws Error with a clear message on bad input
// ErrorTracker.ts:148 (only change in that file)
export function generateRunId(mode: 'cluster' | 'single' | 'csv' | 'enrich', startTime: number): string;
```
- **Paths:** `baseDir` default `path.join(process.cwd(), 'output')` (same as `ErrorTracker.ts:507`); month folder
  `reports/<YYYY-MM>` from `startedAt` in UTC (same as `ErrorTracker.ts:509-511`); files
  `reports/<YYYY-MM>/enrich-<runId>.json` and `latest-enrich.json`. `runId = generateRunId('enrich', start)` →
  `<YYYYMMDDTHHmmssZ>-enrich-<sha>`. Never write `latest-error-report.json`: `report:classify` reads that file by
  default (`backend/src/utils/ReportClassifyCli.ts:38-40`) and the scrape writes it (`ErrorTracker.ts:521-525,708-712`),
  so an enrichment file can never be classified or fed to the fixer.
- **Flags:** `--max-jobs=N` (int ≥ 1, default **20000**), `--all` (= `maxJobs: null`; with `--max-jobs` → error),
  `--budget-min=M` (int 1–130, default **10**; 130 = 150-min job timeout minus setup), `--dry-run`,
  `--model-max-calls=N` (int 0–100000, default **2000**). Unknown `--x` → error. Errors: print `❌ <message>`, exit 1.
- **`main`:** dotenv like other CLIs, `new PrismaClient()`, `runEnrichment`, build report, `writeEnrichReport`, print
  the summary, append `formatEnrichSummary` to `$GITHUB_STEP_SUMMARY` when set (pattern:
  `backend/src/database/SourceDeactivate.ts:112-116`), `$disconnect`, exit 0. Any thrown error → print it (no
  connection strings), try to write a report with what is known is **not** required, exit 1.
- **Summary format (pinned, ROLLOUT.md Step 3 reads these names):**
```
### Job attribute enrichment
| picked | rulesHigh | rulesLow | modelCalls | modelAccepted | modelRejected | modelErrors | written | remaining | durationMs | stoppedBy |
|---|---|---|---|---|---|---|---|---|---|---|
| 500 | 410 | 90 | 0 | 0 | 0 | 0 | 500 | 128000 | 61234 | budget |

Backfill complete: no (`remaining` = 128000). Dry run: no. Description bytes read: 2.4 MB.
```
  `Backfill complete: yes` exactly when `remaining === 0`.

- [ ] **Step 1: Write the failing unit tests**
```ts
it('parseEnrichArgs defaults', () => expect(parseEnrichArgs([])).toEqual({ maxJobs: 20000, budgetMin: 10, dryRun: false, modelMaxCalls: 2000 }));
it('parseEnrichArgs --all removes the cap', () => expect(parseEnrichArgs(['--all', '--budget-min=120']).maxJobs).toBeNull());
it.each([['--budget-min=0'], ['--budget-min=131'], ['--budget-min=abc'], ['--max-jobs=0'], ['--model-max-calls=-1'], ['--all', '--max-jobs=5'], ['--nope']])(
  'parseEnrichArgs rejects %s', (...a) => expect(() => parseEnrichArgs(a)).toThrow());
it('writeEnrichReport writes the month report and latest-enrich.json only', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'enrich-'));
  const { reportPath, latestPath } = writeEnrichReport(sampleReport('2026-11-23T05:00:00.000Z'), dir);
  expect(reportPath).toBe(path.join(dir, 'reports', '2026-11', `enrich-${sampleReport().run.runId}.json`));
  expect(latestPath).toBe(path.join(dir, 'latest-enrich.json'));
  expect(fs.existsSync(path.join(dir, 'latest-error-report.json'))).toBe(false);   // does not write latest-error-report.json
  expect(JSON.parse(fs.readFileSync(latestPath, 'utf8')).counts.remaining).toBe(42);
});
it('generateRunId accepts enrich', () => expect(generateRunId('enrich', Date.UTC(2026, 10, 23, 5))).toMatch(/^20261123T050000Z-enrich-/));
it('formatEnrichSummary prints remaining and the completion line', () => {
  expect(formatEnrichSummary(withRemaining(0))).toContain('Backfill complete: yes');
  expect(formatEnrichSummary(withRemaining(7))).toMatch(/\| 7 \|.*\| (done|budget|maxJobs) \|/);
});
```
- [ ] **Step 2: Write the failing integration test**
```ts
it('remaining counts the picker WHERE clause', async () => {
  // 10 unprocessed active, 2 inactive, 3 processed-high, 2 low with attrsModelVersion null
  expect(await countPickable(prisma, { modelEnabled: false })).toBe(10);
  expect(await countPickable(prisma, { modelEnabled: true })).toBe(12);
  const r = await runEnrichment(prisma, { maxJobs: 4, budgetMin: 10, dryRun: false, modelMaxCalls: 0 });
  expect(r).toMatchObject({ written: 4, remaining: 6, stoppedBy: 'maxJobs' });
});
```
- [ ] **Step 3: Run, expect FAIL.**
- [ ] **Step 4: Implement** `report.ts`, `EnrichCli.ts` (with `require.main === module` guard; importing it must not
  run anything), the one-line `generateRunId` union change, and the npm script.
- [ ] **Step 5: Run, expect PASS**; `npm --prefix backend run typecheck && npm --prefix backend run lint` clean.
- [ ] **Step 6: Local rehearsal on the throwaway DB only:**
```bash
export DATABASE_URL='postgresql://test:test@localhost:5432/enrich_test?schema=enrich_rehearsal'
case "$DATABASE_URL" in *localhost*|*127.0.0.1*) ;; *) echo "not local" >&2; exit 1;; esac
cd backend && npx prisma db push --skip-generate && npx ts-node tests/integration/enrichSeed.ts 1000 \
  && npm run enrich:jobs -- --dry-run --budget-min=1
```
  The rehearsal uses its own schema `enrich_rehearsal`, so the integration suite's `--force-reset` of `enrich_pass`
  never wipes it and the rehearsal never depends on what the suite left behind. `enrichSeed.ts` (new, JSDoc header,
  `require.main` guard, refuses a non-localhost `DATABASE_URL`) exports `seedEnrichJobs(prisma, n)`, the same helper the
  Task 2–5 integration tests import (pattern: `tests/integration/searchSeed.ts`).
  → prints the table, exit 0, nothing written. (Writes the report under `backend/output/`; never stage or print it.)
- [ ] **Step 7: Commit** (`feat(enrichment): enrich:jobs CLI, report with remaining, step summary`).

### Task 6: Workflow step, backfill dispatch, repo tests

**Files:** Modify `.github/workflows/scrape-daily.yml`; Modify `scripts/repo-tests/toggles.test.mjs` (append one test);
Modify `scripts/repo-tests/settings-allowlist.test.mjs:17-32` (add `'enrich:jobs'` to `DANGEROUS`); Create
`scripts/repo-tests/enrichment-raw-sql.test.mjs`

**Placement decision: after "Classify scrape telemetry" (`scrape-daily.yml:194-198`), before "Upload scrape report
artifact" (`:200-206`).** Reasons: (1) classification and its outputs (`actionable`, `run_id`, `infra_alert`) are final
before enrichment starts, so enrichment can never change what the fixer sees; classify reads only
`latest-error-report.json` (`ReportClassifyCli.ts:38-40`); (2) the upload step (`path: backend/output/reports/**`) then
carries `enrich-<runId>.json` inside the same `scrape-report-…` artifact, where ROLLOUT.md Step 3 looks for it;
(3) running it before classify would only delay classification and expose it to the enrichment budget.

**BUILD:**
1. Inputs (after `deactivate_source`):
```yaml
      enrich_backfill:
        description: 'Job attribute backfill: run enrich:jobs --all alone (no scrape, no classify); works with ENRICH_ENABLED off'
        type: boolean
        default: false
      enrich_budget_min:
        description: 'Backfill only: enrichment budget in minutes, 1 to 130 (job timeout is 150)'
        default: '120'
```
2. Skip the scrape path on backfill runs: add `if: inputs.enrich_backfill != true` to "Run scrape or fixture"
   (`:149-150`); extend "Enrich active companies metadata" (`:145`) with `&& inputs.enrich_backfill != true`; extend
   "Classify scrape telemetry" (`:197`) with `&& inputs.enrich_backfill != true` (no new report exists on a backfill run,
   and classify exits 1 without one, `ReportClassifyCli.ts:42-45`). Alert and propagate steps already key on
   `steps.scrape.outputs.exit_code` and stay skipped. Do not change anything else in those steps.
3. New step, directly after classify:
```yaml
      - name: Enrich job attributes
        if: >-
          vars.ENRICH_ENABLED == 'true' && inputs.enrich_backfill != true
          && (inputs.fixture_report == '' || inputs.fixture_report == null)
          && (inputs.deactivate_source == '' || inputs.deactivate_source == 'none')
          && inputs.publish_only != true
          && (steps.scrape.outputs.exit_code == '0' || steps.scrape.outputs.exit_code == '2')
        continue-on-error: true
        timeout-minutes: 15
        env:
          GEMINI_MAX_CALLS_VAR: ${{ vars.GEMINI_MAX_CALLS }}
        run: |
          MAX_CALLS=300
          if [ -n "$GEMINI_MAX_CALLS_VAR" ]; then
            if printf '%s' "$GEMINI_MAX_CALLS_VAR" | grep -Eq '^[0-9]+$' && [ "$GEMINI_MAX_CALLS_VAR" -le 100000 ]; then
              MAX_CALLS=$GEMINI_MAX_CALLS_VAR
            else
              echo "Invalid GEMINI_MAX_CALLS (0-100000); using 300" >> "$GITHUB_STEP_SUMMARY"
            fi
          fi
          npm run enrich:jobs -- --budget-min=10 --model-max-calls=$MAX_CALLS
```
   Exit 2 (scrape fine, publish failed/gated) still enriches; exit 1 never does. The name must not contain "run scrape"
   and the command must not contain `enrich:companies` (`workflows.test.mjs:66-69`, `toggles.test.mjs:36-38` find
   steps by those strings).
4. New backfill step, directly after the one above:
```yaml
      - name: Backfill job attributes
        if: inputs.enrich_backfill == true
        env:
          ENRICH_BUDGET_INPUT: ${{ inputs.enrich_budget_min }}
          GEMINI_MAX_CALLS_VAR: ${{ vars.GEMINI_MAX_CALLS }}
        timeout-minutes: 140
        run: |
          if ! printf '%s' "$ENRICH_BUDGET_INPUT" | grep -Eq '^[0-9]+$' || [ "$ENRICH_BUDGET_INPUT" -lt 1 ] || [ "$ENRICH_BUDGET_INPUT" -gt 130 ]; then
            echo "Invalid enrich_budget_min (1-130); using 120" >> "$GITHUB_STEP_SUMMARY"
            ENRICH_BUDGET_INPUT=120
          fi
          MAX_CALLS=300
          if [ -n "$GEMINI_MAX_CALLS_VAR" ]; then
            if printf '%s' "$GEMINI_MAX_CALLS_VAR" | grep -Eq '^[0-9]+$' && [ "$GEMINI_MAX_CALLS_VAR" -le 100000 ]; then
              MAX_CALLS=$GEMINI_MAX_CALLS_VAR
            else
              echo "Invalid GEMINI_MAX_CALLS (0-100000); using 300" >> "$GITHUB_STEP_SUMMARY"
            fi
          fi
          npm run enrich:jobs -- --all --budget-min=$ENRICH_BUDGET_INPUT --model-max-calls=$MAX_CALLS
```
   No `continue-on-error`: a failed backfill should show red to the owner (no scrape rides on that run).
   **Spend default (00-PLAN Amendments):** both steps pass `--model-max-calls` from repo variable `GEMINI_MAX_CALLS`
   (digits, ≤ 100000), or **300** when it is empty or invalid; the CLI default 2000 applies to manual runs only. In E2
   no model step exists, so the value is parsed and unused.
5. Timing comment (`:72-73`) becomes: `# Staged run: about 75-80 min expected, about 132 min worst case (setup 5,
   company enrichment 8, Ashby 15, Greenhouse 15, Lever 75, classify 2, job attribute enrichment 12). A backfill run
   (enrich_backfill) is setup 5 + at most 130. Must stay below the 3-hour cron cadence so runs never overlap
   (docs/deployment-and-operations.md).` `timeout-minutes: 150` and the workflow-level `concurrency` group
   `scrape-production` (`:63-65`) stay unchanged: a backfill run is serialized with scheduled runs (a scheduled run
   that fires during a backfill waits; GitHub keeps at most one pending run per group).

- [ ] **Step 1: Write the failing repo test** appended to `toggles.test.mjs`:
```js
test('scrape-daily.yml wires job attribute enrichment behind ENRICH_ENABLED and an enrich_backfill dispatch', () => {
  // parse like the test at toggles.test.mjs:180
  // inputs.enrich_backfill.type === 'boolean' && default false; inputs.enrich_budget_min.default === '120'
  // step 'Enrich job attributes': if includes "vars.ENRICH_ENABLED == 'true'", 'inputs.enrich_backfill != true',
  //   'inputs.fixture_report', 'inputs.deactivate_source', 'inputs.publish_only != true',
  //   "steps.scrape.outputs.exit_code == '0'" and "== '2'"; continue-on-error === true; run includes 'enrich:jobs', '--budget-min=10',
  //   'MAX_CALLS=300', '--model-max-calls=$MAX_CALLS' and "grep -Eq '^[0-9]+$'"; env.GEMINI_MAX_CALLS_VAR from vars.GEMINI_MAX_CALLS (both steps)
  // index(classify) < index('Enrich job attributes') < index('Upload scrape report artifact')
  // step 'Backfill job attributes': if === 'inputs.enrich_backfill == true'; run includes '--all' and
  //   "grep -Eq '^[0-9]+$'"; run does not include '${{ inputs.enrich_budget_min'; env.ENRICH_BUDGET_INPUT from the input
  // scrape step (id 'scrape').if, the classify step .if and the 'Enrich active companies metadata' step .if include 'inputs.enrich_backfill != true'
  // scrape job timeout-minutes still 150 and job-level concurrency still absent
});
```
- [ ] **Step 1b: Agent safety tests.** Add `'enrich:jobs'` to `DANGEROUS` after `'enrich:companies'`
  (`settings-allowlist.test.mjs:28`); the existing loop (`:55-59`) then asserts no allow rule matches
  `npm run enrich:jobs` (`EnrichCli` loads dotenv and `backend/.env` points at production). New
  `enrichment-raw-sql.test.mjs` (JSDoc header, `node:test`, `getRepoRoot`):
```js
test('enrichment writes Job only through the raw SQL writer', () => {
  // walk backend/src/enrichment/**/*.ts; for each file assert !/\.job\.(update|updateMany|upsert)\s*\(/.test(src)
  // and writer.ts contains '$executeRaw' and 'FROM unnest('; fail message names the file
});
```
- [ ] **Step 2: Run, expect FAIL** — `node --test 'scripts/repo-tests/**/*.test.mjs'` → the new tests fail (allowlist passes already unless a rule matches; the raw-SQL test fails until `writer.ts` exists on this branch — run after Task 3).
- [ ] **Step 3: Edit the workflow** per BUILD 1–5. Per ci-and-workflows rule 7 (`docs/agents/rules/ci-and-workflows.md:17`)
  also change the assert message at `toggles.test.mjs:206` from "staged worst case about 120" to "staged worst case about
  132" (value 150 unchanged).
- [ ] **Step 4: Run, expect PASS** (all repo tests, including the existing `toggles`/`workflows` ones unchanged).
- [ ] **Step 5: Commit** (`ci(scrape): job attribute enrichment step and enrich_backfill dispatch`).

### Task 7: Docs, agent files, BF-027, changelog, explorer

**Files:** as listed; canonical agent sources only, then `node scripts/agents/sync-shells.mjs`.

- [ ] **Step 1: BF-027 entries**
  - `docs/bug-fix-log.md`: summary-table row after BF-025 (`:43`) and a `### BF-027` section: "Job attribute enrichment
    pass: keyset picker (`attrsVersion` null/old, `attrsDescHash IS DISTINCT FROM contentHash`, low + model untried),
    raw `UPDATE … FROM unnest` writer that never changes `updatedAt`/`contentHash`/`lastUpdatedAt`/`lastUpdatedSource`
    and refuses stale writes, budget/max-jobs stop, `remaining`, own report not classified (ADR-0023)" — guarded:
    `tests/integration/EnrichPass.test.ts`, `tests/unit/EnrichPass.test.ts`, `toggles.test.mjs`.
  - `docs/testing.md` §6 (`:361-395`): BF-027 row with the named tests; §3 inventory and §0 map mention the new files.
  - `docs/agents/context.md`: add `- **BF-027:** Enrichment pass (raw-SQL writes never touch updatedAt/contentHash/lastUpdated*; picker re-picks on contentHash change; guarded: EnrichPass.test.ts).`
    and one CLI line `npm run enrich:jobs [-- --all --budget-min=M --dry-run]`. Keep the file ≤ 6,144 bytes
    (`wc -c docs/agents/context.md` before and after; E1 collapses the BF-001…BF-016 lines and should leave ≥ 450 B).
    If the two new lines (~230 B) do not fit, shorten in this order without dropping a fact: line 8 (Backend API
    components, ~400 B: drop the repeated `backend/src/api/` prefixes), line 30 (Multi-source, ~289 B), line 53 (Deploys
    gotcha, ~271 B: it repeats AGENTS.md Flow step 6).
- [ ] **Step 2: Backend docs**
  - `backend/docs/cli-commands.md`: summary-table row + `### npm run enrich:jobs [-- --max-jobs=N|--all] [-- --budget-min=M] [-- --dry-run] [-- --model-max-calls=N] — src/enrichment/EnrichCli.ts` (defaults, exit codes, examples: scheduled `--budget-min=10`, backfill `--all --budget-min=120`, local `--dry-run`). Say clearly it is **job attribute** enrichment, unlike `enrich:companies`, and state the localhost guard: `EnrichCli`
    loads dotenv and `backend/.env` may point at production, so local runs always start with the quoted
    `export DATABASE_URL='…localhost…'` + `case` guard.
  - `backend/docs/configuration.md`: repo variable `ENRICH_ENABLED` (workflow gate only; the CLI does not read it) and the
    `enrich_backfill`/`enrich_budget_min` dispatch inputs.
  - `backend/docs/outputs-and-artifacts.md`: new section "`output/latest-enrich.json` and `reports/<YYYY-MM>/enrich-<runId>.json`"
    with the `EnrichReport` shape, `remaining` meaning (`0` = backfill complete), and "not read by `report:classify`
    or the fixer".
  - `backend/docs/architecture-and-workflows.md`: new "Workflow G — Job attribute enrichment" (picker → steps → writer
    flow, change detection via `contentHash`, why raw SQL, cache lag: values reach the cache only from E4 on, at the
    next publish).
  - `backend/docs/module-reference.md`: entries for the seven new files.
  - `backend/docs/known-issues.md`: rows changed behind the cursor wait one run; any non-description content change
    re-runs rules (cheap); a `computeJobContentHash` change or `db:normalize-countries` re-picks every job once.
- [ ] **Step 3: Ops docs** — `docs/deployment-and-operations.md` §3.2 (`:50-107`): new input bullets, a step
  "7b. Enrich job attributes (`ENRICH_ENABLED`, `continue-on-error`, `--budget-min=10`)", timing row
  "job attribute enrichment | 0–10 min | 12 min", total worst case **~132 min** (still under 150 and 20+ min below the
  cadence), a "Job attribute backfill" subsection (dispatch `enrich_backfill`, read `remaining` in the summary, repeat
  until `remaining = 0`, then set `ENRICH_ENABLED=true`), and an egress note: the one-off backfill reads ≈ 0.6–1.3 GB
  (128.5k × ~5 KB, more where the `descriptionHtml` fallback is used) of Neon's 5 GB/month; check the Neon usage page
  after the backfill; scheduled runs: watch `descBytes`.
  `docs/system-architecture-and-flows.md`: one line in the scrape flow. `docs/decisions/ADR-0023-*.md`: status note
  "E2: enrichment pass implemented (BF-027)".
- [ ] **Step 4: Agent files (canonical, then sync)**
  - `docs/agents/rules/ci-and-workflows.md` rule 5 (`:15`): add `ENRICH_ENABLED` to the toggle list; append "8. Job
    attribute enrichment runs after classify, is `continue-on-error`, and never runs when the scrape exit code is 1;
    the `enrich_backfill` dispatch runs it alone."
  - `docs/agents/rules/scraper-invariants.md:13`: "BF-001 through BF-025" → "BF-001 through BF-027" (E1 bumps it to
    BF-026 first; take whichever is on main and end at BF-027). Append "9. Job attribute enrichment (BF-027) writes only `attrs*`,
    `experienceMinYears`, `clearanceRequired` with one raw SQL `UPDATE`; never Prisma `update`/`updateMany` on `Job`, never
    `updatedAt`, `contentHash`, `lastUpdatedAt`, `lastUpdatedSource`."
  - `docs/agents/roles/run-reviewer.md`: the enrich report is informational; `stoppedBy: budget` on scheduled runs for
    two runs in a row, or `remaining` growing, is worth reporting, never auto-fixed.
  - `node scripts/agents/sync-shells.mjs` then `node scripts/agents/sync-shells.mjs --check`.
- [ ] **Step 5: CHANGELOG** (skill `release-notes`) under `## [Unreleased]`:
  `- **feat(enrichment)**: Job attribute enrichment pass (BF-027, ADR-0023). npm run enrich:jobs … ; raw SQL writes never change updatedAt/contentHash/lastUpdated*; own report latest-enrich.json with remaining; scrape-daily step behind ENRICH_ENABLED (default off) and enrich_backfill dispatch. Guarded by EnrichPass unit + integration tests and toggles.test.mjs.`
- [ ] **Step 6: Explorer** — `npm --prefix backend run docs:generate`; commit `backend/docs/project-explorer.html`.
- [ ] **Step 7: Commit** (`docs(enrichment): BF-027, CLI, outputs, ops and agent rules`).

---

## VERIFY
- `scripts/check-all.sh --no-install` → all green.
- LOCAL-DB block, then `npm --prefix backend run test:integration` → all suites pass (existing + `EnrichPass`).
- `node --test 'scripts/repo-tests/**/*.test.mjs'` → pass. `node scripts/agents/sync-shells.mjs --check` → pass.
- `npm --prefix backend run docs:generate` leaves no diff. `wc -c docs/agents/context.md AGENTS.md` → each ≤ 6,144.
- Paste in the PR: the dry-run summary table from Task 5 Step 6, and one real local run on the throwaway DB (first the
  quoted `export DATABASE_URL='postgresql://test:test@localhost:5432/enrich_test?schema=enrich_rehearsal'` and the `case`
  guard from Task 5 Step 6, in the same shell; seed ~1,000 jobs with `npx ts-node tests/integration/enrichSeed.ts 1000`)
  showing `written`, then a second run showing `picked 0`, `remaining 0`.

## COMMIT + PUBLISH
Squash title: `feat(enrichment): enrich:jobs pass, raw SQL writer and workflow step behind ENRICH_ENABLED (BF-027, ADR-0023)`.
Body bullets: root cause (no attribute values yet; E1 only adds columns and rules), changes (files above), tests (named
tests), docs. End with the session attribution lines. Publish: `scripts/agents/push-branch.sh`. PR body: summary,
placement justification (Task 6), timing (~132 min worst case), the pasted rehearsal output, and "nothing changes in
production until the owner runs `enrich_backfill` or sets `ENRICH_ENABLED=true` (ROLLOUT.md Steps 3–4)".

## DONE (acceptance)
- [ ] `npm run enrich:jobs` exists, flags/defaults as pinned, exit 0/1 as pinned.
- [ ] Picker and writer SQL match the pinned text; no Prisma `update*` on `Job` under `backend/src/enrichment/`.
- [ ] `writer leaves updatedAt untouched`, `picker re-picks on description change`, budget stop, dry run, inactive skip,
      stale-write skip and `remaining` tests pass on real Postgres.
- [ ] Report files at `output/latest-enrich.json` and `output/reports/<YYYY-MM>/enrich-<runId>.json` with `remaining`;
      summary table printed; `latest-error-report.json` never written by enrichment.
- [ ] Workflow: step after classify, gated, `continue-on-error`, skipped on fixture/deactivate/publish_only/exit 1;
      `enrich_backfill` runs alone; repo test green; timeout and concurrency unchanged.
- [ ] BF-027 in bug-fix-log, testing §6, context.md; docs and explorer updated; CHANGELOG entry.

## ROLLOUT
Merge. No deploy, no variable. Owner follows ROLLOUT.md Step 3 (backfill via `enrich_backfill` until the summary says
`remaining = 0`), then Step 4 (`ENRICH_ENABLED=true`). Rollback: `ENRICH_ENABLED=false`; or revert the PR (values in the
new columns stay and are unused until E4).

---

## Notes for the plan owner
1. **`attrsDescHash` holds `contentHash`, not `hashDescription(text)`** (DESIGN §6.1 / 00-PLAN `text.ts`). The TS hash
   cannot be evaluated in SQL, and computing it in TS means reading every active description each run (Neon egress 5
   GB/month, `docs/deployment-and-operations.md:14`; metadata is the full raw payload, `Scraper.ts:674`). `contentHash`
   covers both description fields (`Scraper.ts:107-108`), so the picker test is exact and cheap, and it enables the
   stale-write guard. Cost: re-picks on non-description content changes too, and once for every job if
   `computeJobContentHash` or `db:normalize-countries` (`NormalizeCountries.ts:81`) rewrites hashes. E2 does not use
   `hashDescription`; E1 may keep it for fixtures. Column names unchanged. If you prefer the DESIGN semantics, a new
   column (e.g. `attrsContentHash`) would be needed.
2. **`attrsModelVersion` is reset to `NULL` when the model was not tried for the current content.** DESIGN's rule as
   written never retries the model after a description change (the row keeps `attrsModelVersion = CURRENT`). E3's
   model step must therefore call the model for every picked job whose rules result is low (within the cap and
   `deadlineAt`) and add the id to `ctx.modelTried` only when a model answer (HTTP 200) arrived; network errors, 429s
   and timeouts leave it untried so the row is retried next run. E3 also sets `exhausted` when its cap is spent;
   `isModelEnabled` then returns false and the runner stops model-only picks.
3. **`UPDATE … FROM unnest(…)`** replaces DESIGN §6.1 `WHERE id = ANY(…)` / §6.3 "`updateMany`-style": per-row values
   need per-row parameters. DESIGN §6.3 "DbGuard-friendly" does not apply: `DbGuard` is API middleware
   (`backend/src/api/middleware/dbGuard.ts`); the CLI uses one sequential connection.
4. **Additive interface changes:** `EnrichmentStep.run` gains an optional third arg `StepRunContext` (counters and
   `modelTried`; E3 needs both), an optional `exhausted` flag on steps and `deadlineAt` in `StepOptions` (both consumed by
   E3); `generateRunId` mode union gains `'enrich'` (`ErrorTracker.ts:148`); the report adds
   `descBytes` (egress watch), `run` metadata and `schemaVersion`. `--budget-min` max 130 and `--max-jobs` default 20000
   are E2 choices.
5. **Classifier input is `latest-error-report.json`** (`ReportClassifyCli.ts:38-40`), not `latest-<mode>.json` as the
   brief assumed; `latest-enrich.json` cannot collide either way. Local `pruneOldReports` keeps 60 JSON files across
   `reports/*/` and will count enrich reports (`ErrorTracker.ts:459-490`); CI runners start empty, so no effect there.
6. **Workflow placement is after classify** (DESIGN says "after Run scrape or fixture"; both are true). The backfill
   needs a separate `enrich_budget_min` input (default 120) because the 150-min job timeout bounds it; the name
   `enrich_backfill` matches ROLLOUT.md.
7. **Naming collision:** "enrichment" already means company metadata (`enrich:companies`, step "Enrich active companies
   metadata", the timing row "enrichment" in `docs/deployment-and-operations.md`). Docs should say "job attribute
   enrichment". Repo tests find steps by substrings (`toggles.test.mjs:36-38`, `workflows.test.mjs:66-69`).
8. **Egress estimate:** 850–3,200 picked jobs per run × ~5 KB ≈ 4–16 MB/run ≈ 0.9–3.4 GB/month at 7 runs/day, on top
   of the scraper's own reads (it selects `metadata`, `Scraper.ts:451`). The one-off backfill adds ≈ 0.6–1.3 GB
   (128.5k × ~5 KB, more where the `descriptionHtml` fallback is used); check Neon's usage page after it. Watch
   `descBytes` after Step 4; if high, cap
   `left(descriptionPlain, N)` in the picker SQL in a follow-up.
9. **`docs/agents/context.md` is 6,021 bytes**; BF-026 (E1) + BF-027 need trimming to stay ≤ 6,144.
10. **No root `package.json`**, so no proxy script. ROLLOUT.md Step 3 item 2 can now name the exact file
    (`reports/<YYYY-MM>/enrich-<runId>.json` in the `scrape-report-…` artifact) and use `remaining = 0` as the completion test.
