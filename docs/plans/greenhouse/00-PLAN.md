# Plan — Greenhouse as a second job source (multi-ATS)

> Owner request: "same as Ashby, also scrape https://job-boards.greenhouse.io/". This folder holds the plan (this file)
> and one Antigravity prompt per PR (`G1-…` to `G6-…`). Run the PRs **in order**; each is squash-merged and deployed
> before the next starts. Proposed decision record: ADR-0021 (written in G1).

## 1. What we verified (2026-10-26/27) — facts, not guesses

**Greenhouse public Job Board API** (live calls on airbnb, stripe, discord, figma, gitlab; ≈1,300 jobs):
- One call per board returns every job, no auth, no pagination:
  `GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true&pay_transparency=true`.
- Unknown board → `404 {"status":404,"error":"Job not found"}`. Board info: `GET /v1/boards/{token}` → `{name, content}`.
- No rate-limit headers seen; responses sit behind CloudFront + a WAF (Signal Sciences) → be polite, honour 429/403.
  `ETag` + `If-None-Match` → 304 works; gzip works (stripe: 5.5 MB raw → 1.9 MB gzip).
- Tokens are **case-insensitive** (lower-case them). EU boards (`job-boards.eu.greenhouse.io/{t}`) are served by the
  **same** API host; their `absolute_url` keeps the EU host. `boards.greenhouse.io/*` 301-redirects to `job-boards…`.
- Job fields: `id` (numeric, globally unique across boards observed), `title`, `company_name`, `updated_at`,
  `first_published` (present on all 1,326 jobs), `location.name` (free text: "Remote - USA", "A • B", "A; B", "N/A"),
  `absolute_url` (often the company's own careers site with `?gh_jid=`), `departments[]`, `offices[]`, `metadata[]`
  (custom per company), `content` (**HTML-entity-escaped** → unescape once), `pay_input_ranges[]` (only with
  `pay_transparency=true`; integer **cents**; currency; **no interval** — "Hourly" only in the range title).
- **Missing vs Ashby**: no employmentType, workplaceType, isRemote, country/city, team, isListed, plain-text description.
- `internal_job_id` repeats across posts — never dedupe on it.
- robots.txt allows the API paths. Greenhouse ToS for redistribution: **owner to review before G6**.
- Common Crawl CDX queries for `job-boards.greenhouse.io/*` and `boards.greenhouse.io/*` **time out (504)** unpaged;
  the EU host works. Discovery must page (`showNumPages` / `page=`) or narrow prefixes.

**Our code** (main @ d4071f5):
- Identity is Ashby-only: `Company.slug @unique` (FK target), `Job.ashbyId @unique` (upsert key) —
  `backend/prisma/schema.prisma:22,49,54-55`.
- Stale-deactivation, 3-strike quarantine, empty-board deferral and `lastSeenAt` touches are all keyed by
  `companySlug` (+ `ashbyId`) — `backend/src/core/Scraper.ts:169-188,756-855`. **A Greenhouse board sharing a slug with
  an Ashby board would deactivate/quarantine the other source's jobs.**
- URL canonicalisation falls back to `jobs.ashbyhq.com` — `backend/src/lib/Sanitizer.ts:119,138`,
  `backend/src/api/contract.ts:193-196`; enrichment calls Ashby for every ACTIVE company —
  `backend/src/utils/EnrichCompanies.ts:34-59,80`.
- API DTOs and frontend types expose `ashbyId` (`backend/src/api/types.ts:14,82`, `frontend/src/types/api.ts:68`);
  **no component reads it** (only types, mocks, tests).
- User-facing "Ashby" copy: Header (`components/Header.tsx:43`), Footer (`Footer.tsx:46-53`), About
  (`AboutPage.tsx:71,106`), CompanyHeader "View on Ashby" (`CompanyHeader.tsx:100-106`), CompanyCard
  (`CompanyCard.tsx:102-109`), CompanyPage (`CompanyPage.tsx:50,114`), NotFound (`NotFoundPage.tsx:15`),
  `index.html:8`, `PRODUCT.md`.
- Prod schema is applied by `npx prisma db push --skip-generate` in `scrape-daily.yml:88` (no `--accept-data-loss`);
  `discover-weekly.yml` has **no** `db push`. `scrape-daily.yml` inputs: workers, skip_publish, publish_only,
  recheck_not_found, skip_fixer, fixture_report.

**Rehearsed on a real Postgres with Prisma 5.22 (critical):**
- Adding `@@unique([source, externalId])` / `@@unique([source, atsToken])` in the same push as the new columns makes
  `prisma db push` **exit 1** ("There might be data loss … Use --accept-data-loss"). In prod that would fail the whole
  daily scrape.
- Safe path (verified, exit 0 at every step): (1) push columns + plain `@@index` only — existing rows get
  `source=ASHBY` automatically; (2) backfill `externalId`/`atsToken`, then `CREATE UNIQUE INDEX` with Prisma's names
  `"Job_source_externalId_key"`, `"Company_source_atsToken_key"`; (3) a later push of the schema **with** `@@unique`
  reports "already in sync". → Uniques land in **G1 (SQL, via backfill) + G2 (schema)**, never in one push.

## 2. Decisions

1. **Identity (additive, no renames, no drops):** `enum Ats { ASHBY GREENHOUSE }`;
   `Company.source Ats @default(ASHBY)`, `Company.atsToken String?`; `Job.source Ats @default(ASHBY)`,
   `Job.externalId String?`. Unique `(source, externalId)` and `(source, atsToken)` (two-step, see above).
2. **Public company slug stays globally unique and permanent:** Ashby = token (unchanged);
   Greenhouse = `gh--<token-lowercased>` (e.g. `/companies/gh--stripe`). `--` never comes out of Ashby discovery
   (`CdxWorker.ts:19`); G1 checks prod has none and Ashby seed/discovery reject `--` from then on.
3. **`Job.ashbyId` stays the NOT NULL legacy global key** so every existing query, raw SQL and old API keeps working:
   Ashby = the Ashby UUID (unchanged); Greenhouse = `greenhouse:<id>`. `externalId` = native id. Removing `ashbyId`
   is a separate future ADR.
4. **Adapter boundary:** `backend/src/lib/ats/AtsClient.ts` interface; `AshbyAtsClient` wraps the existing client
   unchanged (BF-001/015/016 stay valid); new `GreenhouseClient`. Scraper core (batching, hashing, freshness,
   health, deactivation) becomes source-agnostic and is keyed by `legacyKey` (= `Job.ashbyId` value).
5. **Freshness:** Greenhouse `first_published` → `publishedAt` (UTC). `updated_at` is stored in metadata but **not**
   used for `lastUpdatedAt` in v1 (it may move on internal edits); freshness stays hash-detected (ADR-0018 unchanged,
   no new enum value). A `metadata._normVersion` stops a future normalizer change from marking every Greenhouse job
   "Updated".
6. **Salary:** first `pay_input_ranges` entry; cents ÷ 100; interval `'1 HOUR'` if the range title/blurb says hourly,
   else `'1 YEAR'`.
7. **One daily run** covers both sources (one cache generation, one publisher lock), gated by `--sources` and a repo
   variable; per-source limiter so a Greenhouse 429 never slows Ashby (extends BF-015).
8. **Start curated, then discover:** G3/G6 start from a small seed list (discord, figma, gitlab, airbnb, stripe) before
   broad Common Crawl discovery (G5).
9. **UI:** source badge ("via Greenhouse"/"via Ashby"), `source` filter, source-neutral copy; board links come from the
   API (`boardUrl`), never built from the slug in the browser.

## 3. PR sequence

| PR | Prompt file | What | Deploy after merge |
|---|---|---|---|
| G1 | `G1-schema-expand-and-backfill.md` | ADR-0021; new columns + plain indexes; dual-write `source/externalId/atsToken`; idempotent backfill + unique indexes via SQL; backfill step in scrape-daily; `db push` in discover-weekly; `--` guard | Dispatch **scrape-daily** (skip_publish ok) → check backfill log |
| G2 | `G2-ats-adapter-refactor.md` | `@@unique` in schema (in sync); `AtsClient` + `AshbyAtsClient`; normalizer extraction with golden test; Sanitizer URL builder; per-source limiter; `--sources`/`--slugs` flags; enrich dispatch by source. **No behaviour change** | Next scrape: counts normal, no mass "Updated" |
| G3 | `G3-greenhouse-client.md` | `GreenhouseClient` + normalizer, ErrorTracker `source`/`bySource`, source-aware classifier, curated seed command; **disabled by default** | Nothing live; owner may run a `--slugs` test locally |
| G4 | `G4-api-and-ui.md` | DTO `source`/`externalId`/`boardUrl`, `source=` filter + facet, cache keys/views, contract fixtures; UI badge, filter, source-neutral copy | **Deploy backend → scrape-daily publish_only → deploy frontend** |
| G5 | `G5-greenhouse-discovery.md` | Paged CDX discovery for Greenhouse hosts, token validation, enrichment (name; logo best-effort), weekly workflow step behind a variable | Dispatch discover-weekly manually |
| G6 | `G6-enable-greenhouse.md` | Turn Greenhouse on in scrape-daily via variable; per-source sanity gate; rollback CLI; `force` on publish_only; measurements | `skip_publish` test run → flip variable → normal run |

## 4. Risks (and mitigations)

| Risk | Mitigation |
|---|---|
| `db push` data-loss abort on uniques | Two-step uniques (verified) — G1 SQL, G2 schema |
| Shared slug → cross-source deactivation | `gh--` slugs + deactivation keyed by `legacyKey`; integration test with Ashby `stripe` + Greenhouse `gh--stripe` |
| Raw Greenhouse id passed to deactivation → mass deactivation | Explicit G3 test: activeIds are `greenhouse:<id>` values |
| Normalizer drift → every GH job "Updated" | `_normVersion` rule in `resolveLastUpdated` (G3) |
| Neon storage: descriptions ≈4–8 KB/job; 40k more jobs ≈ +250 MB | **Owner checks Neon usage/plan before G6**; G6 measures with a `skip_publish` run |
| Redis memory (if/when configured) | `cache:publish --dry-run` before G6 |
| Sparse facets (no employment type, often no country) | Documented; heuristics only where verified |
| Greenhouse ToS / WAF blocks | Owner reviews ToS before G6; per-source concurrency ≤ 5; honour 429/403 |
| Duplicate companies across ATSs | Accepted for v1; follow-up idea only |
| Auto-fixer editing `schema.prisma` mid-migration | G1 removes `schema.prisma` from fixer scope; G6 restores it |
| `db:clean` deleting `gh--` companies (it deletes every company failing `isValidSlug`) | G1 restricts DbClean to `source='ASHBY'` |
| Greenhouse companies scraped through Ashby → 404 → quarantined | G2 filters company selection by `--sources` everywhere (ClusterScraper, `--slugs`, ScraperCSV, Verify) |
| Discovered Greenhouse companies listed with 0 jobs before G6 | G5 hides Greenhouse companies with no active jobs from `/v1/companies` and Publisher pages |
| Backfill failure stopping the daily scrape | G1 runs the backfill with `continue-on-error` + a step-summary warning |

## 5. Verification per PR (all PRs)
Integration tests that push older/other schemas must use an **isolated Postgres schema** (`?schema=…`), because
`Search.test.ts`/`Companies.test.ts` push the live schema with `--accept-data-loss` into the same CI database.

`scripts/check-all.sh --no-install` · `node --test 'scripts/repo-tests/**/*.test.mjs'` ·
`node scripts/agents/sync-shells.mjs --check` · `npm --prefix backend run test:integration` (real Postgres) ·
contract fixtures re-recorded + synced where the API changes. Claude reviews each PR (worktree checks, real-Postgres
tests, Chrome check for UI PRs) before merge.
