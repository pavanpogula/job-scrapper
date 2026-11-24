# Design: Experience and Security Clearance filters (job attribute enrichment)

> Owner request (2026-11-23): "we are missing experience and security required fields from our search filters."
> Status: **design, awaiting owner approval.** After approval: `00-PLAN.md` + one Antigravity prompt per PR (`E1-…`).
> Decision record to write in E1: **ADR-0023 job attribute enrichment**.

## 1. Intent

Users of B.O.O.L.E.A.N want to narrow jobs by **how much experience is required** and **whether a security clearance is
required**. Neither exists in the scraper, DB, API or UI today. The owner also wants the work that reads descriptions to
become the foundation for later model-powered features (semantic search, more filters).

## 2. Research findings (2026-11-23, measured)

**Structured fields at scrape time: not available.** Live calls on 43 boards / ~14.5k jobs:
- Ashby: same 18 keys on every job; nothing about level or clearance. GraphQL introspection off; guessed fields rejected.
- Greenhouse: `metadata[]` custom fields carry a level on ~3% of jobs (Dropbox "IC4", Astranis "P3", Pinterest "Career
  Track"), each on a private scale. No clearance key anywhere (even Anduril, ~80% of whose descriptions mention one).
- Lever: `categories.level` only at Zoox (27 jobs). No clearance field.
- Per-job application questions (Anduril, Saronic) are noisy and cost one request per job. Rejected.

So the description is the only source with coverage. Mention rates in descriptions:

| Source | years of experience | clearance |
|---|---|---|
| Ashby | 61% | 5% |
| Greenhouse | 83% | 25% |
| Lever | 78% | 10% |

Clearance is concentrated in defense boards (Anduril, Vannevar, Palantir, Saronic, Epirus, Picogrid); mainstream tech ≈ 0%.

**Regex accuracy** (100 hand-labelled real descriptions, rules tuned on 60, scored on a 40-job holdout):
min years P 0.96 / R 0.96; clearance mentioned 12/12 found, 1 false positive. An untuned first version scored
P 0.86 / R 0.75 on years. ~20% of postings state no years at all.
Failure modes seen: picking a sub-requirement ("8+ overall, 3+ in PM"), company-blurb numbers ("for 10 years, Scale has"),
"required vs preferred", "not required", wording variants, non-US clearances.

Research data and the throwaway extractor are kept in `research/` (samples, labels, `extract.py`, `evaluate.py`,
`analysis.txt`) and become the golden test set in E1.

Volume: ~128.5k active jobs (Lever plan §Status); roughly 850–3,200 new or changed jobs per scheduled run (estimate).

## 3. Goals, non-goals, anti-goals

**Goals**
- Two new user filters: **Experience** (years buckets) and **Security clearance** (any / required / exclude).
- A post-scrape enrichment pass that processes each job once, and again only when its description changes or the
  extraction logic is upgraded.
- A pluggable step design so a model step (Gemini now) and later an embedding step (semantic search) reuse the same pass.

**Non-goals (v1)**
- Clearance levels (Secret vs TS/SCI) or active vs eligible as filters. Stored nowhere in v1.
- Seniority levels (Entry/Mid/Senior), semantic search, embeddings, pgvector.
- Reading per-job application questions or Greenhouse per-company level fields.

**Anti-goals (a failure even if it "works")**
- The scheduled scrape run gets slower than its budget, or a scrape fails because enrichment failed.
- Any change to the 17-field `contentHash` (BF-011) or to job freshness ("Updated" badges) caused by enrichment.
- A model answer written to the DB without a deterministic check.
- `check-all.sh` or any test calling the network or needing an API key.

## 4. Decisions (owner)

1. **Clearance = one yes/no.** Any clearance mention counts as "Security clearance required": Public Trust, Secret,
   Top Secret, TS/SCI, polygraph, "able to obtain / eligible for". Owner: "All securities should be categorized as
   security clearance required."
2. **Post-scrape pass, not scrape-time.** Jobs land with the new fields empty; a separate process fills them; "not
   found" is written as a value so the job is not re-processed.
3. **Rules + cheap Gemini model in v1.** Rules decide the clear cases for free; a cheap Gemini model handles the
   ambiguous rest; rules validate the model's answer. Gemini because it can later provide embeddings for semantic search.
4. **Jev (TypeSafe AI) skipped.**
5. **Gemini paid tier on the owner's own developer account (2026-11-23).** The owner creates the key, enables billing
   and a budget alert, and stores the key only as GitHub secret `GEMINI_API_KEY` (and in their own shell for local
   runs). Agents never see or handle the key. The plan contains the step-by-step setup (E3 / E6). Spend is bounded in
   code by per-run caps (`--model-max-calls`, default 2,000 per scheduled run; backfill chunks capped too), because
   billing budgets alert rather than hard-stop.

## 5. Approaches considered

| Approach | Trade-off | Verdict |
|---|---|---|
| Scrape-time structured fields | Zero cost, but the fields do not exist (≤3% coverage, per-company scales) | Rejected by data |
| Rules only | Free, deterministic, fully testable; weak on "preferred / not required" and odd wording | v1 fallback mode |
| Model for every job | Best context handling; more cost, non-deterministic, Gemini free tier (~500 req/day reported) cannot cover ~128k jobs | Rejected |
| **Rules first, Gemini for the ambiguous rest, rules validate** | Two code paths and an escalation rule; small model volume (~20–30%) | **Chosen (owner)** |

## 6. Design

### 6.1 Data model (additive columns on `Job`, `prisma db push` safe)

| Column | Type | Meaning |
|---|---|---|
| `experienceMinYears` | `Int?` | minimum required years; `null` = none stated (or not processed) |
| `clearanceRequired` | `Boolean?` | `null` = not processed, `false` = no clearance found, `true` = required |
| `attrsVersion` | `Int?` | extractor version that produced the values; `null` = **not processed** |
| `attrsDescHash` | `String?` | hash of the description text the values came from |
| `attrsSource` | `String?` | `'rules'` \| `'model'` |
| `attrsConfidence` | `String?` | `'high'` \| `'low'` (low = rules were unsure and no model answer was accepted) |
| `attrsEvidence` | `Json?` | short evidence snippets (`{years?: string, clearance?: string}`) for audits |
| `attrsModelVersion` | `Int?` | extractor version at which the model was last tried for this row (prevents re-sending a rejected row every run) |

Why a separate "processed" marker: the owner's "null = not done, false = not found" works for clearance, but "no years
stated" is a real answer for ~20% of jobs. `attrsVersion` makes "processed" explicit for both fields.

**A job is picked for processing when:** `active = true` AND (`attrsVersion IS NULL` OR `attrsVersion < CURRENT` OR
`attrsDescHash <> hash(current description)` OR (`attrsConfidence = 'low'` AND the model step is enabled AND
(`attrsModelVersion IS NULL` OR `attrsModelVersion < CURRENT`))). The model is tried **at most once per row per
version and description**; a rejected answer stays low confidence until the description or version changes.
Unchanged jobs are never re-processed. Bumping `CURRENT` re-runs improved rules over every job.

The columns are **not** part of `computeJobContentHash` and never touch `lastUpdatedAt` / `lastUpdatedSource`.
Enrichment writes use raw SQL (`$executeRaw` `UPDATE … WHERE id = ANY(…)`), not Prisma `update`/`updateMany`, because
`Job.updatedAt` is `@updatedAt` (`schema.prisma:105`) and is exposed in the list DTO (`contract.ts:50,99,170`); an
enrichment write must not change it. A test guards this.
Indexes: on `(active, attrsVersion)` for the picker; on `experienceMinYears` and `clearanceRequired` for filters
(the plan verifies index use with `EXPLAIN` on a seeded DB).

### 6.2 Extraction

**Input:** `descriptionPlain` from `Job.metadata` (fallback: plain text of `descriptionHtml`). For Lever, the
"Requirements / Qualifications" sections are already merged into the description.

**What "minimum required years" means (labelling rule, used by rules, model prompt and gold labels):** the years a
typical applicant must have to apply.
- Overall requirement beats a sub-skill requirement: "8+ years overall, 3+ in PM" → 8.
- With degree-dependent paths, use the base (lowest-degree) path: "5+ with BS / 3+ with MS / PhD" → 5.
- Required beats preferred. A number that appears only as preferred / nice-to-have → `null` ("Not specified").
- Range → its lower bound: "3–5 years" → 3.
The research extractor took the first match (`research/extract.py:17`), so the rule above is re-labelled and
re-measured in E1 before CI thresholds are set.

**Clearance lexicon scope:** "all securities" (owner) includes non-US government clearances (UK SC/DV/BPSS, Canadian
Reliability/Secret, NATO, Australian Baseline/NV1/NV2). Export-control or "US person" text on its own is not a clearance.

**Rules step (deterministic, pure TypeScript, no I/O):**
- Years: patterns for `N+ years`, `N-M years` (hyphen and en-dash), `N or more years`, `at least N years`, number words
  (`five years`), bullets without the word "experience" (`6+ years building …`). Take the **largest overall
  requirement in the requirements context**, not the smallest sub-requirement. Ignore company-blurb, money, and date
  contexts ("for 10 years, Scale has", "$10,000 per year", "four years in a row", "three-year vision"). Range → min.
  Clamp 0–30.
- Clearance: keyword lexicon (clearance, Public Trust, Secret, Top Secret, TS/SCI, SCI, polygraph/poly, DoD clearance,
  "obtain and maintain … clearance"). Negations ("no clearance required", "not required", "beneficial but not
  required") and false friends ("range clearance", "low-clearance", export-control / US-person text alone) are handled.
- Output: values + `confidence`. **Low confidence** when: several conflicting year candidates, a "preferred / not
  required / or" cue near a match, a clearance keyword in an ambiguous context, or no years found in a description that
  contains the word "years".
- No clearance keyword at all → `clearanceRequired = false`, high confidence, no model call (most jobs).

**Model step (Gemini, optional, behind `GEMINI_ENABLED` + secret `GEMINI_API_KEY`):**
- Only low-confidence jobs. The cheapest current Gemini Flash-Lite model, ID pinned in config and verified against
  Google's docs at implementation time. Structured JSON output: `{minYears: int|null, clearanceRequired: bool,
  yearsEvidence: string|null, clearanceEvidence: string|null}`. Temperature 0.
- Description trimmed to a token cap (requirements-looking sections first).
- **Validation by rules before writing:** each evidence string must appear in the description (normalized
  whitespace); `minYears` 0–30 and its number must appear in the years evidence; `clearanceRequired = true` needs a
  lexicon keyword in the clearance evidence. Fail → keep the rules answer with `attrsConfidence = 'low'`.
- Per-run caps (max jobs, max wall time), bounded concurrency, retry/backoff on 429/5xx using the existing
  `lib/ats/http.ts` helpers. Any model failure degrades to rules output; it never fails the run.
- Gemini Batch mode is considered for the initial backfill if the plan verifies it is available and cheaper.

**Modes:** `GEMINI_ENABLED` off or no key → rules decide everything; unsure jobs are written with
`attrsConfidence = 'low'` (not left pending, so they are not re-scanned every run). Turning Gemini on later re-processes
only the low-confidence rows.

### 6.3 Enrichment pass (CLI + workflow)

- New CLI `npm run enrich:jobs [-- --max-jobs=N --budget-min=M --dry-run --all]`, a `backend/src/enrichment/` module with
  a small step interface (`rules`, `model`), so a later `embedding` step plugs into the same picker and versioning.
- Batches of jobs (keyset pagination by id), `updateMany`-style writes, DbGuard-friendly concurrency; writes only the
  `attrs*`, `experienceMinYears`, `clearanceRequired` columns.
- Telemetry: counts (picked, rules-high, rules-low, model-accepted, model-rejected, model-errors, written) written to
  its **own** report `output/latest-enrich.json` (plus the monthly reports folder) and the GitHub step summary. It does
  not patch the scrape report and does **not** feed the classifier / auto-fixer in v1 (enrichment failures are
  non-blocking by design).
- **Scheduled workflow:** a new step after "Run scrape or fixture", gated by repo variable `ENRICH_ENABLED` (default
  off), `--budget-min=10`, runs only when the scrape step did not hard-fail; `continue-on-error` so it can never fail
  the scrape job. Total run stays within the 150-min timeout and below the 3-hour cadence.
- **Cache visibility:** the Publisher rewrites a job's detail body only when the detail-index value changes, and that
  value is `contentHash` today (`Publisher.ts:403-414`, `:491`); full rewrites happen only on Sundays. Because the
  enrichment columns are outside `contentHash`, the detail-index value becomes `contentHash` + a short hash of
  (`attrsVersion`, `experienceMinYears`, `clearanceRequired`). Effect: each publish rewrites only details whose content
  or attributes changed (≈ the jobs enriched since the last publish); the backfill causes one spread-out rewrite of
  ~128k details, the same volume as one Sunday full rewrite. List/filter views are rebuilt each generation anyway.
  Enrichment runs **after** the scrape's publish; its values reach the cache on the next scheduled publish (≤ 3 h lag).
  No second publish in v1 (keeps the run inside its time budget). BF-017 / BF-019 tests are extended for this.
- **Initial backfill (~128k jobs):** a manual `workflow_dispatch` (or local run) of `enrich:jobs --all` in repeated
  time-boxed chunks; resumable by construction because it only picks unprocessed rows.

### 6.4 API (`api-cache` owner)

- DTOs (list and detail) gain `experienceMinYears: number | null` and `clearanceRequired: boolean | null`.
- Filters on `/v1/jobs`: `experience=0-2,3-5,6-9,10plus,unspecified` (OR within the param; buckets map to ranges of
  `experienceMinYears`; `unspecified` = processed with null years) and `clearance=required|exclude`. They AND with the
  other filters (BF-013 semantics). Invalid values are **silently dropped**, like `source` and `postedWithin` today
  (`backend/src/api/types.ts:432-438, 476-482`); no new 400 behaviour.
- Semantics: `clearance=required` → `clearanceRequired = true` (any confidence). `clearance=exclude` →
  `clearanceRequired IS NOT TRUE` (false **or** not yet processed), so candidates who cannot hold a clearance never lose
  freshly scraped jobs. `experience=unspecified` → processed rows with `experienceMinYears IS NULL`.
- `/v1/facets` returns bucket counts and clearance counts.
- Cache: list/detail cache bodies carry the new fields (BF-019 parity); the plan decides which new filter views are
  pre-rendered vs DB path, following how existing single-filter views work in `ReadThrough.ts`.
- `contract.ts` and the shared type contract / fixtures (ADR-0015) are updated together.

### 6.5 UI (`frontend` owner)

- Filter panel: **Experience** multi-select (`0–2 yrs · 3–5 yrs · 6–9 yrs · 10+ yrs · Not specified`) and
  **Security clearance** (`Any · Required · Exclude`), with facet counts, URL-synced like existing filters.
- Job card / detail: small "Clearance required" badge and "N+ yrs" chip when known. Unprocessed jobs show nothing.

### 6.6 Testing (guards)

- Golden set test: the labelled research jobs as fixtures, **first passed through the production normalizer**
  (`sanitizeJobDescriptionPlain` in `backend/src/lib/Sanitizer.ts`; Greenhouse/Lever production plain text has no `- ` bullet markers
  (Ashby keeps its own `descriptionPlain`, which may), while the research samples do, so postings are re-fetched as raw HTML and normalized; see E1 Task 4), re-labelled with the §6.2
  rule, and extended in E1 to ≥ 200 jobs with ≥ 40 clearance positives so a threshold means something. CI asserts
  years P/R ≥ 0.90 and clearance P/R ≥ 0.90 on the holdout, plus a table of named regression cases for every failure
  mode in §2. A TypeScript scorer replaces `research/evaluate.py` and scores both tuning and holdout sets.
- Unit tests: picker selection rules (version bump, description change, low-confidence + model on), validation of model
  output (hallucinated evidence rejected), modes (no key → rules only), mocked Gemini client (429, timeout, bad JSON).
- Integration: enrichment writes never change `contentHash` / `lastUpdatedAt`; API filter + facet tests; cache parity;
  UI filter tests. New invariant id **BF-026** in `docs/testing.md` §6 and `docs/agents/context.md`.

## 7. Constraints (repo rules that shape the plan)

- Every PR: `scripts/check-all.sh --no-install`, `npm --prefix backend run docs:generate`, JSDoc `@file/@summary/@tags`
  on new files and functions, CHANGELOG `[Unreleased]` entry, Conventional Commit with bulleted body.
- Feature branches only; pushed with `scripts/agents/push-branch.sh`; owner merges; deploys are manual (ADR-0016).
- Never read `.env*`, `apikeys/`, `output/`. The Gemini key lives only in GitHub secrets / the owner's shell.
- Docs to update: ADR-0023 + ADR index, `backend/docs/{architecture-and-workflows,database-and-cache,api,cli-commands,
  configuration,module-reference,outputs-and-artifacts,external-apis}.md`, `frontend/docs/frontend-ui.md`,
  `docs/testing.md`, `docs/bug-fix-log.md`, `docs/agents/context.md`, `docs/deployment-and-operations.md`,
  `docs/system-architecture-and-flows.md`, CHANGELOG.

## 8. Proposed PR split (detailed in `00-PLAN.md` after approval)

| PR | Owner agent | Content |
|---|---|---|
| E1 | scraper-architect → implementer | ADR-0023, schema columns + indexes, rules extractor (pure), golden-set tests |
| E2 | implementer | `enrich:jobs` CLI, picker, writes, telemetry; workflow step behind `ENRICH_ENABLED` |
| E3 | implementer | Gemini model step + validation behind `GEMINI_ENABLED`, mocked tests |
| E4 | api-cache | DTO fields, filters, facets, cache parity |
| E5 | frontend | filters, badges, UI tests |
| E6 | docs-release-keeper | enable + backfill runbook, ops docs, release |

## 9. Calls I made (owner can override)

- Experience filter = **years buckets** (store min years); seniority levels deferred.
- Clearance filter offers **Exclude** too (useful for non-US candidates); Exclude keeps not-yet-processed jobs.
- "Minimum required years" labelling rule in §6.2 (overall over sub-skill, base degree path, preferred-only → null).
- Non-US government clearances count as clearance.
- Detail cache hash includes the attributes; no second publish per run (≤ 3 h lag for new values).
- Enrichment has its own report and does not trigger the auto-fixer in v1.
- Invalid filter values are silently dropped, matching today's API.
- **Rollout order:** API/UI filters (E4/E5) may merge early but are **deployed only after the backfill has processed
  every active job**, so filters and counts are never badly incomplete in production.
- Low-confidence rows are written (not left pending) when Gemini is off.
- Feature flags `ENRICH_ENABLED` and `GEMINI_ENABLED`, both default off, like `LEVER_ENABLED`.
- Badges on cards/detail in addition to filters.

## 10. Left to the builder

Exact regex patterns, batch size, token cap, Gemini model ID (verified at build time), cache pre-render choice (§6.3,
§6.4), index set (verified with EXPLAIN).
