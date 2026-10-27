# G3 — Greenhouse client + normalizer, disabled by default (Antigravity prompt)

> Owner: after G2 is merged and one scrape-daily run looked normal, paste
> "Read docs/plans/greenhouse/G3-greenhouse-client.md and implement it exactly." Background: `00-PLAN.md` §1 has the
> verified Greenhouse API facts — use them, do not re-research.

You are working in the Ashby Job Scraper monorepo. Implement ONE PR: a Greenhouse `AtsClient` and normalizer, wired into
the registry but **not scraped by default** (`--sources` default stays `ashby`). Squash-merge. Follow AGENTS.md,
CLAUDE.md, docs/agents/context.md and every rule in docs/agents/rules/.

## HARD RULES (non-negotiable)
- Never read, print, stage, or commit `.env*`, `apikeys/`, `backend/apikeys/`, `output/`, `backend/output/`, `.vercel/`.
- Agents never push to `main`/`master`, never merge, never force-push, push tags or delete branches, and never run raw
  `git push` or `gh`. Publish only with `scripts/agents/push-branch.sh`. Owner reviews and merges.
- Never connect to production DB/Redis/API; no scrapes against prod, no publishes, no deploys. Local manual tries only
  against a throwaway local Postgres. Public Greenhouse GETs are allowed while developing (≤ 1 request/second, send
  `Accept-Encoding: gzip` and a User-Agent); **unit tests must use recorded fixtures, never the network.**
- No API/DTO/frontend change (that is G4). No schema change. Ashby behaviour unchanged (all Ashby tests green).
- No new `any`. Commit before running check-all.

## PRECONDITION
- origin/main contains G2 (`backend/src/lib/ats/AtsClient.ts` exists). Otherwise STOP. Branch: `feat/gh-3-client`.

## BUILD
1. `backend/src/lib/ats/GreenhouseClient.ts` implementing `AtsClient`:
   - Decide 404/notFound by **HTTP status, never by message text** (verified bodies differ: `/jobs` → "Job not found",
     `/v1/boards/{t}` → "Job board not found"; record both as fixtures).
   - `fetchBoard`: `GET https://boards-api.greenhouse.io/v1/boards/{atsToken}/jobs?content=true&pay_transparency=true`,
     gzip, timeout, retry/backoff using the **shared** retry helper (lift `isRetryableError` + Retry-After handling out of
     AshbyClient into `lib/ats/http.ts` without changing Ashby behaviour). Only HTTP 429 sets `rateLimited`
     (BF-015); Retry-After capped at 10 s. 404 → `notFound: true`. 200 with `jobs: []` → empty board (existing
     empty-board deferral applies). `fetchMode: 'primary'` always (no fallback path).
   - `fetchCompanyMetadata`: `GET /v1/boards/{token}` → `name`; logo: none (null) in this PR.
   - `canonicalUrls`: `https://job-boards.greenhouse.io/{token}/jobs/{id}` (built from `atsToken`, never from the `gh--`
     slug) — verified to work for EU boards too; prefer the host from `absolute_url` when it is a greenhouse.io host.
2. `normalizeGreenhouseJob(raw, ref)` (pure, exported, unit-tested) — mapping:
   | Field | From |
   |---|---|
   | externalId | `String(id)` |
   | legacyKey | `greenhouse:${id}` (goes to `Job.ashbyId`) |
   | title | `title.trim()` |
   | department | `departments[0]?.name ?? ''` |
   | location | **first** segment of `location.name` split on `•`, `;`, ` or ` (trimmed); `"N/A"` → `''` |
   | secondaryLocations | split `location.name` on `•`, `;`, `,` followed by ` or `, and ` or ` (trimmed, deduped, excluding the first); keep simple comma-separated "City, Region" pairs intact when there is no list marker |
   | postal.addressCountry / Region / Locality | from the first non-null `offices[].location`, parsed **from the right**: last part = country (`toIsoCountry`), first part = city, middle (if 3 parts) = region — handles `"Lisbon, Portugal"`; null when all are null |
   | isRemote | `/\bremote\b/i` on location or title, or `metadata[]` entry named "Workplace Type" = Remote |
   | workplaceType | metadata "Workplace Type" (Remote/Hybrid/On-site → Remote/Hybrid/OnSite), else `'Remote'` if isRemote, else null |
   | employmentType | null unless title matches `/\bintern(ship)?\b/i` → `Intern`, `/\bcontract(or)?\b/i` → `Contract`, `/\bpart[- ]time\b/i` → `PartTime` |
   | publishedAt | `first_published` → ISO UTC |
   | sourceUpdatedAt | **null** in v1 (store `updated_at` in raw only — see 00-PLAN.md decision 5) |
   | salary | first `pay_input_ranges` entry: min/max = cents ÷ 100, currency = `currency_type`, interval `'1 HOUR'` if the range **title** matches `/\bhourly\b\|per hour/i` (fallback: blurb), else `'1 YEAR'`; none → empty |
   | descriptionHtml | HTML-entity-**unescape** `content` exactly once (reuse the Sanitizer's existing entity decoder if it handles `&lt; &gt; &quot; &amp; &#39;` and numeric entities; otherwise add a small tested decoder), then `sanitizeJobDescriptionHtml` |
   | descriptionPlain | `sanitizeJobDescriptionPlain(undefined, html)` |
   | applyUrl / jobUrl | `absolute_url` (keep company career sites, e.g. `?gh_jid=`), sanitized with the Greenhouse canonical as fallback |
   | isListed | true |
   | team | null |
   | raw (→ `Job.metadata`) | **must carry the keys the API mapper and the content hash read** (`contract.ts` ≈180-200, `Scraper.ts` ≈590-593): `descriptionHtml`, `descriptionPlain`, `jobUrl`, `team` (null), `secondaryLocations`; plus `_source: 'rest'`, `_ats: 'greenhouse'`, `_normVersion: 1`, `updated_at`, `departments`, `offices`, `metadata`. **Drop the escaped `content`** (never store the description twice). Without these keys Greenhouse detail pages would show empty descriptions and the hash would miss description edits — add a test |
   Validation (BF-002/003/007) runs through the shared Sanitizer with the Greenhouse URL builder. Keep every post the
   `/jobs` endpoint returns (it only returns published posts); never dedupe on `internal_job_id`.
3. Register `greenhouse` in the client registry (only scraped when `--sources` includes it).
4. Companies: new script `npm run seed:greenhouse -- discord,figma,gitlab,airbnb,stripe` (add to the `DANGEROUS` list
   in `scripts/repo-tests/settings-allowlist.test.mjs`; **local throwaway DB only — never run against prod before G6**) (and a default curated list in
   `backend/src/config/GreenhouseBoards.ts`) that validates each token with `GET /v1/boards/{token}` and upserts
   `Company { slug: 'gh--' + token, source: GREENHOUSE, atsToken: token, name }` by `(source, atsToken)`. Not run in CI.
5. Freshness: `resolveLastUpdated` gains the `_normVersion` rule — if the content hash changed **and**
   `prev.metadata._normVersion !== next.metadata._normVersion` (the normalizer's `raw` becomes the row's `metadata`),
   update the row but keep `lastUpdatedAt`/`lastUpdatedSource` (treated like rule 4). Extend `PrevJobState` and
   `NextJobInput` (`ResolveLastUpdated.ts` ≈9-22) with an optional `metadata` field for this; the scraper's prev select
   already includes `metadata`. Ashby rows have no `_normVersion`
   → unaffected. `lastUpdatedSource = 'ashby'` is never produced for Greenhouse jobs (sourceUpdatedAt is null).
6. ErrorTracker v2 (additive): optional `source` on every event; `summary.bySource[source] = { companiesAttempted,
   companiesWithJobs, jobsCollected, notFound, apiErrors }`; `mergeReports` sums it. Greenhouse messages say
   "Greenhouse Board API …"; **existing Ashby message strings stay byte-identical** (issue fingerprints hash them).
   `ReportClassifier` BF mapping becomes source-aware (Greenhouse api_error is not BF-001). Register **BF-023**
   "Greenhouse board fetch & normalization" in `docs/bug-fix-log.md` with its guarding tests.

## TESTS (write first; recorded fixtures only)
- Record trimmed fixtures from the public API (3–5 jobs each) into `backend/tests/fixtures/greenhouse/`: a normal board,
  one with pay ranges incl. an hourly range, one with multi-location text, a 404 body, an empty board.
- `GreenhouseClient.test.ts`: entity-unescape, numeric id → externalId/legacyKey, cents→units, hourly interval,
  multi-location split, remote/workplace heuristics, first_published → UTC, 404 → notFound, 429 + Retry-After cap,
  5xx exhaustion → failure, empty 200, hash determinism.
- **Deactivation safety**: activeIds passed to deactivation are `greenhouse:<id>` values; a present job is never
  deactivated.
- Integration (real Postgres): Ashby company `stripe` and Greenhouse company `gh--stripe` coexist; scraping one never
  deactivates, quarantines or touches the other's jobs; `(source, externalId)` uniqueness holds.
- `_normVersion` rule cases in `LastUpdated.test.ts`. ErrorTracker/ReportClassifier `source`/`bySource` cases.
- Ashby suites unchanged and green.

## DOCS
`backend/docs/external-apis.md` (new Greenhouse section from 00-PLAN.md §1), `backend/docs/architecture-and-workflows.md`,
`backend/docs/cli-commands.md` (`seed:greenhouse`, `--sources=greenhouse`), `docs/self-healing-loop.md` (reading
`source`), `docs/testing.md` §6 BF-023 row, `docs/agents/context.md` BF-023 line (byte budget) + sync-shells, CHANGELOG,
`docs:generate`.

## VERIFY
`scripts/check-all.sh --no-install` · `npm --prefix backend run test:integration` · repo tests · sync-shells --check.
Optional manual proof (**local throwaway Postgres only, never prod**): `seed:greenhouse discord` then
`scrape -- --sources=greenhouse --slugs=gh--discord --skip-publish` → jobs saved with source=GREENHOUSE; paste counts.

## COMMIT + PUBLISH
`feat(scraper): Greenhouse client and normalizer, disabled by default (BF-023)`; `scripts/agents/push-branch.sh`.

## ROLLOUT (PR body)
Merge. Nothing runs in prod yet (default sources = ashby, no Greenhouse companies in prod). No deploy needed.
