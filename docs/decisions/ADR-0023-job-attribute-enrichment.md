# ADR-0023: Job Attribute Enrichment (Experience & Security Clearance)

- Status: Accepted (E1: schema & rules implemented, `ATTRS_VERSION = 2` via `BF-026` real-data rule hardening; E2: enrichment pass implemented, `BF-027`)
- Date: 2026-11-24
- Deciders: owner, scraper-architect, implementer
- Related: BF-026, BF-011, [ADR-0018](./ADR-0018-job-last-updated-detection.md), [ADR-0021](./ADR-0021-multi-source-ats.md), [ADR-0022](./ADR-0022-lever-source.md)

## Context
Job seekers browsing direct company boards across Ashby, Greenhouse, and Lever need structured filtering by minimum required years of experience and security clearance without missing qualifying roles due to inconsistent titles or unparsed prose. In real postings:
1. Titles frequently omit requirements or use ambiguous seniority labels (`Senior`, `Staff`).
2. Descriptions combine required qualifications with preferred/bonus sections, multi-degree paths (`5+ with BS / 3+ with MS / PhD`), sub-skill minimums (`8+ overall, 3+ in PM`), company-history blurbs (`For 10 years, Scale has...`), and salary ranges (`$120,000 per year`).
3. Security clearances span US frameworks (`Public Trust`, `Secret`, `Top Secret`, `TS/SCI`, `polygraph`, `DOE Q/L`) and allied international frameworks (`UK BPSS/SC/DV`, `NATO`, `Canadian Reliability/Secret`, `Australian Baseline/NV1/NV2`, European/German national clearances), while negated clauses (`clearance not required`), physical/regulatory false friends (`range clearance`, `low-clearance`, `regulatory clearance`, `trade secrets`), and ITAR/export-control/`U.S. person` clauses must not be misclassified as clearances.

## Options Considered
| Option | Summary | Trade-off |
|---|---|---|
| 1. Rules only | Deterministic regex/section rules in TypeScript | Zero API cost & fast, but leaves ~8–35% of ambiguous/unusual phrasings uncertain |
| 2. LLM for every job | Send all ~128k jobs to a model | High token cost, rate-limit latency, and unnecessary on straightforward postings |
| 3. Rules-first + bounded LLM fallback (**Chosen**) | Pure rules run first on all jobs; optional Gemini Flash-Lite runs only on `low`-confidence rows under time/job budgets | Fast & free on >90% high-confidence rows; bounded cost on ambiguous tail; deterministic baseline always available |

## Decision
Implement a phased hybrid enrichment architecture (PRs E1–E6) following `docs/plans/job-attributes/DESIGN.md` and `00-PLAN.md` Amendments:

1. **Additive Schema (`E1`):**
   Add 8 nullable columns to `Job` (`experienceMinYears Int?`, `clearanceRequired Boolean?`, `attrsVersion Int?`, `attrsModelVersion Int?`, `attrsDescHash String?`, `attrsSource String?`, `attrsConfidence String?`, `attrsEvidence Json?`) and 3 indexes (`Job_active_attrsVersion_idx` on `(active, attrsVersion)`, `Job_experienceMinYears_idx`, `Job_clearanceRequired_idx`). Processed state is marked exclusively by `attrsVersion IS NOT NULL`.
2. **Content-Hash & Scraper Isolation (`00-PLAN Amendment`):**
   Enrichment columns remain outside `computeJobContentHash` (BF-011) and are never written by the scraper. `attrsDescHash` stores the job's `contentHash` at processing time (not a separate hash of `descriptionPlain`), so `enrich:jobs` re-evaluates only when `contentHash` changes or `ATTRS_VERSION` bumps (`hashDescription` in `text.ts` is reserved for evidence checks and tests).
3. **Pure Rules-First Extractor (`E1`):**
   - `backend/src/enrichment/` houses pure, zero-I/O TypeScript helpers and rules (`types.ts`, `version.ts`, `buckets.ts`, `text.ts`, `rules/{years,clearance,index}.ts`).
   - `EXPERIENCE_BUCKETS` is pinned to `['0-2', '3-5', '6-9', '10plus', 'unspecified']`.
   - `extractMinYears` scans normalized `descriptionPlain` only for numbers (using optional `opts.title` strictly for multi-level ambiguity cues like `"all levels"` or `"Senior/Staff"`, never to inject experience numbers), supports spelled-out/repeated-`years` ranges, rejects age phrases, keeps original non-dash-normalized substrings (<= 160 chars) for evidence checks, discards values `> 30`, and flags conflicting/multi-level/preferred-only/sentence-scoped unparsed cases as `ambiguous`.
   - `detectClearance` scans `` `${input.title}\n${input.descriptionPlain}` `` (E1 Note 8) so title-only clearances (`Engineer (TS/SCI)`) are captured, strips physical/regulatory/background/fingerprinting/child-abuse/customs/clearance-sale false friends first, matches `polygraph` and qualified `(ci|full-scope|lifestyle|counter-intelligence) poly` (never bare `"poly"`), evaluates strong US/agency/obtain/active/non-US patterns plus weak bare `"clearance"`, respects sentence-scoped negation, and marks preferred/weak/mixed cases `ambiguous`.
4. **Labelling Rule (`DESIGN §6.2`):**
   Minimum years required for a typical applicant: overall beats sub-skill, base lowest-degree path wins (`5+ BS / 3+ MS`), required beats preferred (preferred-only yields `null`), and ranges use the lower bound.
5. **Phased Rollout (`E1–E6`):**
   E1 ships schema + pure rules + hand-labelled 242-job golden set (`tune=145`, `holdout=97`). E2 adds `enrich:jobs` CLI (raw SQL writes preserving `@updatedAt`) and workflow wiring behind `ENRICH_ENABLED=false`. E3 adds optional Gemini fallback behind `GEMINI_ENABLED=false`. E4 exposes attributes in API DTOs/filters, Redis cache, and contract fixtures; E5 adds UI filters and badges; E6 completes ops runbook and release.

## Consequences
- Enrichment columns live outside `contentHash` (BF-011 preserved) and remain completely invisible to production API/cache/UI until E4.
- Future E2 enrichment writes use raw SQL so Prisma `@updatedAt` / `lastUpdatedAt` (ADR-0018) is never mutated.
- All automated enrichment and model flags default off in E1; nothing calls the extractor in production yet.
- Guarded by new invariant **BF-026** (E1), with **BF-027** (E2) and **BF-028** (E4) planned next.
