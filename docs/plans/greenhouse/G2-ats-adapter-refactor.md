# G2 — ATS adapter refactor, Ashby behind an interface (Antigravity prompt)

> Owner: only after G1 is merged AND a scrape-daily run showed the backfill step with "rows still NULL = 0" and both
> unique indexes present, paste "Read docs/plans/greenhouse/G2-ats-adapter-refactor.md and implement it exactly."
> Background: `docs/plans/greenhouse/00-PLAN.md`.

You are working in the Ashby Job Scraper monorepo. Implement ONE PR: put Ashby behind a source-neutral `AtsClient`
interface and make the scraper core source-agnostic. **Zero behaviour change for Ashby.** No Greenhouse code yet.
Squash-merge. Follow AGENTS.md, CLAUDE.md, docs/agents/context.md and every rule in docs/agents/rules/.

## HARD RULES (non-negotiable)
- Never read, print, stage, or commit `.env*`, `apikeys/`, `backend/apikeys/`, `output/`, `backend/output/`, `.vercel/`.
- Agents never push to `main`/`master`, never merge, never force-push, push tags or delete branches, and never run raw
  `git push` or `gh`. Publish only with `scripts/agents/push-branch.sh`. Owner reviews and merges.
- Never connect to production DB/Redis/API. No scrapes, publishes or deploys.
- No API/DTO or frontend change. Content hash (BF-011) and every BF-001…BF-022 invariant must hold; their existing
  tests must pass **unchanged** except for mechanical import/type updates (explain each in the PR body).
- No new `any` (any-ratchet; lower it where you touch code). Commit before running check-all.

## PRECONDITION
- origin/main contains G1 (`backend/prisma/schema.prisma` has `enum Ats` and `Job.externalId`). Otherwise STOP.
- Branch: `feat/gh-2-ats-adapter`.

## BUILD
1. Schema: add `@@unique([source, externalId])` on `Job` and `@@unique([source, atsToken])` on `Company`. G1's backfill
   already created these indexes under Prisma's names in prod, so `db push` reports "already in sync". G1's integration
   test already proves this with frozen fixtures (`backend/tests/integration/fixtures/schema.g1*.prisma`) — keep it, and
   add one step that pushes the **live** schema after the backfill on its isolated `?schema=multisource` → exit 0.
2. New files contain **zero explicit `any`** (the any-ratchet counts per file — use `unknown` + narrowing). Source enum
   mapping lives in one place, `backend/src/lib/ats/source.ts` (`'ASHBY'` ↔ `'ashby'`, `'GREENHOUSE'` ↔ `'greenhouse'`).
   New `backend/src/lib/ats/AtsClient.ts`:
   - `type AtsSource = 'ashby' | 'greenhouse'`; `interface BoardRef { slug; source: AtsSource; atsToken }`.
   - `interface NormalizedJob` — every field the scraper needs today (`externalId`, `legacyKey` [= value for
     `Job.ashbyId`], title, department, location, employmentType?, applyUrl, jobUrl, isRemote, workplaceType?, isListed,
     publishedAt?, sourceUpdatedAt?, postal?, salary, descriptionHtml?, descriptionPlain?, team?, secondaryLocations?,
     raw [sanitized metadata incl. `_source`]).
   - `interface BoardFetchResult { slug; source; jobs: NormalizedJob[]; notFound; rateLimited?; fetchMode:
     'primary'|'fallback'|'none'; validationIssues?; failure? }` (mirrors `AshbyBoardFetchResult`, AshbyClient.ts:77-90).
   - `interface AtsClient { source; fetchBoard(ref, opts?); fetchCompanyMetadata(ref); canonicalUrls(ref, externalId) }`.
3. `backend/src/lib/ats/AshbyAtsClient.ts` wraps `fetchAshbyBoardWithFallback` and `fetchOrganizationMetadata`
   **without changing them**; `rest`→`primary`, `graphql`→`fallback`.
   `normalizeAshbyJob()` = the **pure** field mapping currently inside `processCompanyJobs` (Scraper.ts ≈543-630; mapping
   ≈552-627), moved byte-for-byte (extractSalary, toIsoCountry, description fallbacks, `_source`), plus
   `externalId = legacyKey = id`. `getOrCreateDepartment`/`getOrCreateLocation` (DB side effects, ≈561-562) and the
   hash/`processedJobs.push` stay in the core. Rename the in-memory `ProcessedJob.source` (`'rest'|'graphql'`) to
   `fetchMode` to avoid confusion with the DB `source` column.
4. `backend/src/core/Scraper.ts` becomes source-agnostic:
   - Clients are injected: `new AshbyScraper({ clients })` with a default registry (only `ashby` registered in this
     PR), so tests can pass fake clients.
   - **Company selection is filtered by the enabled sources everywhere** — this prevents Greenhouse companies ever being
     sent to Ashby (404 → 3-strike quarantine):
     * `ClusterScraper.ts` company query (≈245) adds `source: { in: enabledSources }`;
     * the worker/`runAll({ slugs })` path selects `source` + `atsToken` for the given slugs and **skips** (with an
       error event) any slug whose source is not enabled or has no registered client; unknown slugs are skipped, never
       defaulted to Ashby;
     * `ScraperCSV.ts` (≈146) and `utils/Verify.ts` select `source = 'ASHBY'` only (they are Ashby-only tools).
   - `atsToken` falls back to `slug` when null.
   - **Deactivation, empty-board touch and every `ashbyId` lookup use `NormalizedJob.legacyKey`** (not a raw id).
   - The "fallback never overwrites primary" guard (BF-016) exists at **three** sites — Scraper.ts ≈407 (batch update),
     ≈477 (createMany-conflict fallback), ≈510 (per-row upsert fallback); convert all three. It becomes
     `fetchMode === 'fallback' && prev.metadata._source === 'rest'` — identical for Ashby.
   - One adaptive limiter **per source** (extends BF-015 scoping); Ashby limiter settings unchanged.
   - `AshbyScraper` keeps its name and exports.
5. `backend/src/lib/Sanitizer.ts`: `sanitizeJobUrl`/`validateAndSanitizeJob`/`sanitizeJobBatch` take an optional URL
   builder / canonical base (fed with `atsToken`, never the `gh--` slug); the default reproduces today's
   `jobs.ashbyhq.com` behaviour and issue-message text exactly (classifier fingerprints hash them).
6. CLI: `--sources=ashby[,greenhouse]` (default `ashby`) and `--slugs=a,b` (explicit company list; uses the existing
   `runAll({slugs})`) for `scrape`, `scrape:parallel` (ClusterScraper passes them to workers; partitioning interleaves
   sources round-robin). Unknown source → exit 1 with a clear message.
7. `backend/src/utils/EnrichCompanies.ts` + discovery enrichment: select `source`; dispatch to the source's
   `fetchCompanyMetadata`; companies of an unregistered source are skipped and counted (never sent to Ashby).
8. Pure URL builders in `backend/src/lib/ats/urls.ts` (no HTTP imports): `jobUrl(source, token, externalId)`,
   `boardUrl(source, token)`. `contract.ts` jobUrl fallback (≈193-196) uses them — unchanged output for Ashby — so the
   Vercel API bundle never imports axios-based clients. Clients' `canonicalUrls` delegate to the same builders.
9. `enrich:companies` gains `--sources=` (default `ashby`) using the same selection filter.

## TESTS (write first)
- **Golden equivalence**: for `backend/tests/fixtures/ashby-sample.json` (and the AshbyClient test fixtures), the old
  `processCompanyJobs` output equals the new normalizer path field-for-field **including `contentHash` and
  `ashbyId`/`legacyKey`**. Capture the old output first (commit the expected JSON), then refactor.
- Deactivation test: `deactivateStaleJobs` receives `legacyKey` values; a job present in the board is never deactivated.
- Per-source limiter: a 429 on one source does not change the other source's concurrency (fake second client).
- `--sources`/`--slugs` parsing (unit) and ClusterScraper interleaving (unit; `partitionSlugs` may change signature to
  take `{slug, source}` — that test change is expected, explain it).
- Selection filter: a `GREENHOUSE` company row is never selected or fetched when sources = `ashby` (ClusterScraper,
  `--slugs`, ScraperCSV, Verify, enrich).
- Enrichment dispatch: an unregistered-source company is skipped, never fetched from Ashby.
- Integration (real Postgres): G1 schema → backfill → this schema pushes in sync (no accept-data-loss).
- All existing suites green; snapshots unchanged.

## DOCS
`backend/docs/architecture-and-workflows.md` (adapter boundary), `backend/docs/module-reference.md` (new files),
`backend/docs/cli-commands.md` (`--sources`, `--slugs`), `docs/agents/rules/scraper-invariants.md` (canonical: BF-016
guard is now "fallback over primary", Ashby-only) then `node scripts/agents/sync-shells.mjs` + `--check`, ADR-0021
status note, CHANGELOG, `npm --prefix backend run docs:generate`.

## VERIFY (paste in PR body)
`scripts/check-all.sh --no-install` · `npm --prefix backend run test:integration` · repo tests · sync-shells --check ·
golden test output.

## COMMIT + PUBLISH
`refactor(scraper): AtsClient adapter with Ashby behind the interface (ADR-0021)`; `scripts/agents/push-branch.sh`.

## ROLLOUT (PR body)
Merge → next scheduled (or dispatched) scrape-daily. Owner sends Claude the run summary: jobs collected and "changed"
counts must be within normal day-to-day variance and there must be **no** mass "Updated" freshness change.
Rollback: revert (no data shape changed).
