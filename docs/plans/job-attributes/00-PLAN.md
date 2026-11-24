# Plan — Experience and Security Clearance filters (job attribute enrichment)

> **For agentic workers:** each `E<n>-*.md` file is a self-contained Antigravity prompt for ONE PR. Run them **in
> order**; each is squash-merged before the next starts. Owner pastes: "Read docs/plans/job-attributes/E<n>-….md and
> implement it exactly." Reviews use `REVIEW.md`; the owner's step-by-step rollout is `ROLLOUT.md`.

**Goal:** users can filter jobs by required years of experience (buckets) and by "security clearance required".

**Architecture:** jobs keep landing from the scrape with new attribute columns empty. A separate, time-boxed
post-scrape pass (`npm run enrich:jobs`) picks unprocessed / changed jobs, runs a deterministic rules step, sends only
low-confidence jobs to a cheap Gemini model (optional), validates every model answer with rules, and writes the values
with raw SQL. The API exposes the values as DTO fields, filters and facets; the UI adds two filters and badges.

**Tech stack:** TypeScript, Node, Prisma 5 + Neon Postgres, Jest (backend), Express 5, Upstash Redis cache generations,
React 19 + Redux Toolkit + MUI (frontend, its own test runner via `npm --prefix frontend run check`), GitHub Actions,
Gemini API (REST via `axios`, no new SDK unless E3 justifies it).

**Spec:** `docs/plans/job-attributes/DESIGN.md` (read it first; it holds the research, decisions and the calls made).
Research data for the golden test set: `docs/plans/job-attributes/research/`.

## Global constraints (apply to every PR)
- Follow `AGENTS.md`, `CLAUDE.md`, `docs/agents/context.md`, every file in `docs/agents/rules/`.
- Never read, print, stage or commit `.env*`, `apikeys/`, `backend/apikeys/`, `output/`, `backend/output/`, `.vercel/`.
- Never push to `main`/`master`, never merge, force-push, push tags or delete branches; never run raw `git push` or `gh`.
  Publish only with `scripts/agents/push-branch.sh`. The owner reviews and merges. Deploys are manual (ADR-0016).
- Never connect to production DB/Redis/API; never scrape, publish or deploy against prod. Local throwaway Postgres only
  (integration tests via `TEST_DATABASE_URL` on localhost). Never call Gemini from tests.
- Every PR: `scripts/check-all.sh --no-install` passes; `npm --prefix backend run docs:generate` run and committed;
  JSDoc `@file` / `@summary` / `@tags` on every new file and function; `CHANGELOG.md` `## [Unreleased]` entry
  (skill `release-notes`); Conventional Commit with bulleted body (root cause / changes / tests / docs) ending with the
  attribution lines from the session; no new `any` (`scripts/any-ratchet.mjs`); no existing test weakened.
- **Must not change:** `computeJobContentHash` and its 17 fields (BF-011), `lastUpdatedAt` / `lastUpdatedSource`
  (ADR-0018), `Job.updatedAt` on enrichment writes, scrape exit codes (0/1/2), BF-017 publish orchestration, BF-025
  staged runner, existing API filter behaviour, existing cache bodies other than the added fields.
- Feature flags default **off**: repo variables `ENRICH_ENABLED`, `GEMINI_ENABLED`; secret `GEMINI_API_KEY`.
- Ids: **ADR-0023** (job attribute enrichment, written in E1). Invariants: **BF-026** extractor + golden set (E1),
  **BF-027** enrichment pass writes (E2, extended by E3), **BF-028** API/cache/UI filters (E4, extended by E5).

## PR sequence

| PR | Branch | Content | Deploy |
|---|---|---|---|
| E1 | `feat/ja-1-schema-and-rules` | ADR-0023, schema columns + indexes, pure rules extractor, golden set (BF-026) | none (columns appear via `db push` in the next scheduled run) |
| E2 | `feat/ja-2-enrich-pass` | `enrich:jobs` CLI, picker, raw-SQL writer, report, workflow step + backfill input (BF-027) | none (workflow only; `ENRICH_ENABLED` off) |
| E3 | `feat/ja-3-gemini-step` | Gemini model step, validation, caps, mocked tests; Gemini setup steps for the owner | none (`GEMINI_ENABLED` off) |
| E4 | `feat/ja-4-api-filters` | DTO fields, `experience` / `clearance` filters, facets, Publisher detail hash, contract fixtures (BF-028); also the frontend contract-sync files it must touch (`frontend/src/types/api.ts`, `contract.test.ts`, typed mocks, `jobCard.test.tsx`) | backend, **only after backfill complete** |
| E5 | `feat/ja-5-ui-filters` | Experience + Clearance filters, chips/badges, URL sync, UI tests | frontend, after E4 deployed |
| E6 | `docs/ja-6-rollout-and-release` | ops runbook, docs sweep, agent context, release cut | none |

Rollout order between PRs (owner actions, details in `ROLLOUT.md`): E1 merged → E2 merged → backfill rules-only →
`ENRICH_ENABLED=true` → E3 merged → Gemini setup → `GEMINI_ENABLED=true` (low-confidence rows reprocessed) → E4 merged →
deploy backend → E5 merged → deploy frontend → E6.

## Shared interfaces (every PR uses exactly these names)

### Prisma `Job` columns (E1)
```prisma
experienceMinYears Int?
clearanceRequired  Boolean?
attrsVersion       Int?
attrsModelVersion  Int?
attrsDescHash      String?
attrsSource        String?   // 'rules' | 'model'
attrsConfidence    String?   // 'high' | 'low'
attrsEvidence      Json?     // { years?: string; clearance?: string }
@@index([active, attrsVersion])
@@index([experienceMinYears])
@@index([clearanceRequired])
```

### `backend/src/enrichment/` (E1 creates, E2/E3 extend)
```ts
// types.ts
export type AttrsConfidence = 'high' | 'low';
export type AttrsSource = 'rules' | 'model';
export interface EnrichmentInput { id: string; title: string; descriptionPlain: string }
export interface JobAttributes {
  experienceMinYears: number | null;
  clearanceRequired: boolean;
  confidence: AttrsConfidence;
  source: AttrsSource;
  evidence: { years?: string; clearance?: string };
}
// version.ts
export const ATTRS_VERSION = 1;              // bump re-processes every job
// text.ts
export function getDescriptionText(metadata: unknown): string;   // metadata.descriptionPlain, else plain of descriptionHtml via sanitizeJobDescriptionPlain
export function hashDescription(text: string): string;           // sha256 hex of whitespace-normalized text
// rules/years.ts
export interface YearsResult { value: number | null; evidence: string | null; ambiguous: boolean }
export function extractMinYears(text: string): YearsResult;
// rules/clearance.ts
export interface ClearanceResult { required: boolean; evidence: string | null; ambiguous: boolean }
export function detectClearance(text: string): ClearanceResult;
// rules/index.ts
export function extractAttributesByRules(input: EnrichmentInput): JobAttributes;  // source 'rules'; confidence 'low' iff either result ambiguous
// buckets.ts
export const EXPERIENCE_BUCKETS = ['0-2', '3-5', '6-9', '10plus', 'unspecified'] as const;  // '10plus', not '10+': '+' decodes to a space in query strings
export type ExperienceBucket = typeof EXPERIENCE_BUCKETS[number];
export function bucketRange(b: Exclude<ExperienceBucket, 'unspecified'>): { min: number; max: number | null }; // 0-2→{0,2} 3-5→{3,5} 6-9→{6,9} 10plus→{10,null}
export function bucketOf(years: number | null): ExperienceBucket;
```

### Enrichment pass (E2)
```ts
// picker.ts
export interface PickedJob extends EnrichmentInput { attrsConfidence: AttrsConfidence | null; descHash: string }
export function pickJobsForEnrichment(prisma: PrismaClient, opts: { limit: number; afterId?: string; modelEnabled: boolean }): Promise<PickedJob[]>;
// writer.ts
export interface AttributeWrite { id: string; attrs: JobAttributes; descHash: string; modelTried: boolean }
export function writeAttributes(prisma: PrismaClient, rows: AttributeWrite[]): Promise<number>;   // raw SQL, never touches updatedAt
// step.ts
export interface EnrichmentStep {
  readonly name: 'rules' | 'model';
  readonly exhausted?: boolean;   // model step: cap/deadline/fatal reached; the picker then stops asking for model rows
  run(jobs: PickedJob[], prior: Map<string, JobAttributes>, ctx?: StepRunContext): Promise<Map<string, JobAttributes>>;
}
// StepOptions (E2) carries deadlineAt (start + budget); exact fields of StepRunContext/StepOptions/EnrichCounts are defined in E2 and extended by E3.
// EnrichCli.ts  → npm run enrich:jobs [-- --max-jobs=N --budget-min=M --dry-run --all --model-max-calls=N]
```
Report: `output/latest-enrich.json` and `output/reports/<YYYY-MM>/enrich-<runId>.json` with counts
`{ picked, rulesHigh, rulesLow, modelCalls, modelAccepted, modelRejected, modelErrors, written, remaining, descBytes, durationMs, stoppedBy: 'done'|'budget'|'maxJobs' }`,
plus E3's `modelStoppedBy`, `modelTokensIn`, `modelTokensOut`. E2 and E3 own the final field list; reviewers compare against
00-PLAN **plus** the E2/E3 additions.
`remaining` = a `COUNT(*)` with the picker's WHERE clause at the end of the run (also printed in the step summary); the
owner has no DB access, so `remaining = 0` is how the runbook decides the backfill is complete.
Exit codes: 0 success (including budget stop), 1 hard failure (DB unreachable). The workflow step is `continue-on-error`.

### Model step (E3)
```ts
// model/ModelClient.ts
export interface ModelAnswer { minYears: number | null; clearanceRequired: boolean; yearsEvidence: string | null; clearanceEvidence: string | null }
export interface ModelClient { classify(input: EnrichmentInput): Promise<ModelAnswer> }
// model/GeminiClient.ts   implements ModelClient (env GEMINI_API_KEY, GEMINI_MODEL; temperature 0; JSON schema output)
// model/validate.ts
export function validateModelAnswer(input: EnrichmentInput, answer: ModelAnswer): JobAttributes | null;  // null = rejected
// model/modelStep.ts      implements EnrichmentStep ('model'); only low-confidence jobs; honours --model-max-calls (default 2000)
```

### API (E4)
- Query params on `/v1/jobs`: `experience` (comma list of `EXPERIENCE_BUCKETS`, OR within), `clearance`
  (`required` | `exclude`). Invalid values silently dropped (like `source`, `postedWithin`).
- `clearance=exclude` → `clearanceRequired IS NOT TRUE`. `experience=unspecified` → `attrsVersion IS NOT NULL AND experienceMinYears IS NULL`.
- DTO (list + detail): `experienceMinYears: number | null`, `clearanceRequired: boolean | null`.
- Facets: `experience: Record<ExperienceBucket, number>`, `clearance: { required: number; exclude: number }` where
  `exclude` counts exactly what `clearance=exclude` returns (`clearanceRequired IS NOT TRUE`), so a filter's count always
  equals its result total.
- Publisher detail-index value: `contentHash + ':' + attrsFingerprint(job)` where
  `attrsFingerprint = sha256(`${attrsVersion}|${experienceMinYears}|${clearanceRequired}`).slice(0, 12)`.

### UI (E5)
- URL params mirror the API (`experience`, `clearance`; bucket value `10plus`). Labels: `0–2 yrs`, `3–5 yrs`, `6–9 yrs`, `10+ yrs`,
  `Not specified`; `Any`, `Required`, `Exclude`. Badge text: `Clearance required`; chip text: `<N>+ yrs`.

## Amendments from plan writing (2026-11-23, supersede DESIGN where they differ)
- **Change detection uses `contentHash`.** `attrsDescHash` stores the job's `contentHash` at processing time. SQL can
  compare it without loading descriptions, which saves Neon egress, and `contentHash` already covers both description
  fields (`Scraper.ts:107-108`). Trade-off: a salary or location change also re-runs the rules, which is cheap. `hashDescription` stays in E1
  for evidence checks and tests only.
- **Model retry after a change:** the writer resets `attrsModelVersion` to NULL when a row is re-processed without a
  model try, so a changed description gets one new model attempt.
- The classifier reads `latest-error-report.json` (`ReportClassifyCli.ts:38-40`), so the enrich report cannot collide.
  The enrich workflow step runs **after** "Classify scrape telemetry".
- Extra workflow input `enrich_budget_min` (max 130). There is no root `package.json`, so no proxy script.
- Bucket API value `10plus`. Clearance facet `{ required, exclude }`. Report field `remaining`.
- Golden set is re-fetched as raw HTML and normalized (research samples carry `- ` bullets); max 15% per board.
- Numbers above 30 years are discarded, not clamped. Extra E1 metrics: high-confidence precision ≥ 0.95, low share ≤ 35%.
- `docs/agents/context.md` is near its 6,144-byte cap: E1 collapses the BF-001…BF-016 lines to make room.
- **Neon egress watch:** scheduled enrichment may read roughly 0.9–3.4 GB/month of descriptions (estimate), so E2 reports
  `descBytes` and ROLLOUT checks the Neon usage page after the first week.

- **Step 0 of every rollout: merge this plan PR first** (the `docs/job-attributes-plan` branch holding this folder). E1's
  precondition requires `docs/plans/job-attributes/` (including `research/`) on `origin/main`.
- **DB safety rule (all PRs, reviewers too):** every command that can reach a database (`prisma …`, `enrich:jobs`,
  `api:start`, `test:integration`, fixture/EXPLAIN scripts) runs only after `export DATABASE_URL='postgresql://…localhost…'`
  (quoted: `?` is a zsh glob) in the same shell and the guard
  `case "$DATABASE_URL" in *localhost*|*127.0.0.1*) ;; *) echo "not local" >&2; exit 1;; esac`, because `backend/.env`
  is auto-loaded and points at production.
- **Cache timing:** the Publisher detail-index change takes effect at the first scheduled publish after the E4 **merge**
  (scheduled scrapes run `main`). It is inert while production Redis is unconfigured. Pre-render choices and the one-time
  detail rewrite only matter once Redis is enabled.
- `scraper-invariants.md` "BF-001 through BF-0xx" is bumped by each PR: E1 → BF-026, E2 → BF-027, E4 → BF-028.
- **`remaining` keeps the model arm.** Picking stops asking for model rows once the model step is `exhausted`, but the final
  `remaining` count still includes untried low-confidence rows while a model step is registered, so "Backfill complete:
  yes" (`remaining = 0`) can never appear while Gemini work is left. If the key is invalid or the model keeps failing,
  `remaining` stays above 0: ROLLOUT's stop-and-ask list covers it.
- **Spend default:** when `GEMINI_MAX_CALLS` is empty the workflow passes `--model-max-calls=300` (the CLI default of 2000
  applies only to manual runs). ROLLOUT raises the variable temporarily for the first pass.
- **Deploying E4 before the backfill finishes** makes `experience` buckets, `unspecified` and `clearance=required` undercount
  (unprocessed jobs sit in no bucket; only `exclude` still lists them), so the UI looks wrong without any error. That is why E4/E5 deploy
  only after `remaining = 0`.
- `JobAttributesNotExposed.test.ts` (E1) is replaced by E4: after E4 only `experienceMinYears` and `clearanceRequired` may be
  exposed; `attrsEvidence`, `attrsSource`, `attrsDescHash`, `attrsModelVersion`, `attrsConfidence`, `attrsVersion` never.
- `enrich:jobs` and `enrich:model-eval` are added to the `DANGEROUS` list in `scripts/repo-tests/settings-allowlist.test.mjs`
  (E2 adds the first, E3 the second) so agents cannot run them unprompted.

## Review focus (failure modes most likely to bite; each has a named test in its PR)
1. Description changes after enrichment → job re-picked and values replaced (E2 `picker re-picks on description change`).
2. Enrichment write bumps `updatedAt` / `contentHash` / `lastUpdatedAt` → must not (E2 `writer leaves updatedAt untouched`).
3. Model hallucinates evidence or years → rejected, rules answer kept as low (E3 `rejects evidence not in description`).
4. "Exclude clearance" hides freshly scraped unprocessed jobs → must not (E4 `exclude keeps unprocessed jobs`).
5. Cached job detail keeps old attributes after enrichment → rewritten on next publish (E4 `detail rewritten when attrs change`).
