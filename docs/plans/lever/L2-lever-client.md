# L2 — Lever client + normalizer, disabled by default (Antigravity prompt)

> Owner: after L1 is merged and one scrape-daily run looked normal, paste
> "Read docs/plans/lever/L2-lever-client.md and implement it exactly." Background: `00-PLAN.md` §1 has the verified
> Lever API facts and §2 the decisions — use them, do not re-research.

You are working in the Ashby Job Scraper monorepo. Implement ONE PR: a Lever `AtsClient` and normalizer, registered
but **not scraped by default** (`--sources` default stays `ashby`). Squash-merge. Follow AGENTS.md, CLAUDE.md,
docs/agents/context.md and every rule in docs/agents/rules/ (scraper-invariants).

## HARD RULES (non-negotiable)
- Never read, print, stage, or commit `.env*`, `apikeys/`, `backend/apikeys/`, `output/`, `backend/output/`, `.vercel/`.
- Agents never push to `main`/`master`, never merge, never force-push, push tags or delete branches, and never run raw
  `git push` or `gh`. Publish only with `scripts/agents/push-branch.sh`. Owner reviews and merges.
- Never connect to production. Local manual tries only against a throwaway local Postgres. Public Lever GETs are allowed
  while developing (≤ 1 request/second). **Unit tests use recorded fixtures and mocked axios, never the network.**
- No API/DTO/frontend change (L3). No schema change. Ashby and Greenhouse behaviour unchanged (their suites green,
  their telemetry message strings byte-identical).
- No new `any`. Commit before check-all. Never stage `.impeccable/`.

## PRECONDITION
- `git fetch origin`; origin/main contains L1 (`backend/src/lib/ats/registry.ts`, `enum Ats` has `LEVER`). Otherwise
  STOP. Branch `feat/lv-2-client` from `origin/main`.

## BUILD
1. `backend/src/lib/ats/LeverClient.ts` implementing `AtsClient` (`source = 'lever'`), modelled on
   `GreenhouseClient.ts` (axios, inline retry loop ≈629-710):
   - Constructor `new LeverClient({ minIntervalMs?: number, initialDelayMs?: number, timeoutMs?: number })`; defaults
     `1000`, `0`, `60000`.
   - **Pacer**: every request start (retries included) is serialized per instance so two starts are ≥ `minIntervalMs`
     apart, and the first waits `initialDelayMs`. Promise chain + timestamp; no busy wait.
   - Headers: API calls use `BROWSER_HEADERS` (`lib/AshbyClient.ts:23`) unchanged; board-page (HTML) calls use
     `{ ...BROWSER_HEADERS, Accept: 'text/html,application/xhtml+xml,*/*;q=0.8' }`. No `Accept-Encoding` (Lever does
     not compress).
   - `fetchBoard(ref, opts)`: `GET https://api.lever.co/v0/postings/${encodeURIComponent(ref.atsToken)}?mode=json`
     (token case kept). Retry defaults `maxRetries = 2`, `baseDelayMs = 300`, delays via `computeRetryDelayMs`
     (Retry-After capped at 10 s, BF-015), failures via `classifyFetchFailure`. Decide by **HTTP status, never body
     text**: 404 → `notFound: true`; 429 → `rateLimited: true`; 5xx/timeout exhaustion → `failure`. 200 with a
     non-array body → `failure { kind:'http', status:200, code:'unexpected_body', attempts }`. 200 `[]` → empty board.
     `fetchMode: 'primary'`. Normalize each posting; skip `null` results; **dedupe by `id`** like Greenhouse
     (≈651-663, BF-007) with a validation issue.
   - `validateSite(token): Promise<'live' | 'empty' | 'not_found' | 'dead_board' | 'error'>` (used by `seed:lever` and
     L4): `GET …/postings/{token}?mode=json&limit=1` → 404 `not_found`, `[]` `empty`; non-empty → then
     `GET https://jobs.lever.co/{token}` → 200 `live`, 404 `dead_board` (AIFund case, 00-PLAN §1); other → `error`.
   - `fetchCompanyMetadata(ref, { includeLogo })`: `GET https://jobs.lever.co/{token}` (same pacer). `name` = `<title>`
     text trimmed and decoded with the existing `decodeHtmlEntities` (`Sanitizer.ts` ≈47). Logo (unless
     `includeLogo === false`, the interface convention — `EnrichCompanies` calls it with no options) = `src` of the first `<img>` whose `alt` ends with
     " logo" (case-insensitive) **and** whose host is `lever-client-logos.s3.amazonaws.com` or matches
     `/^lever-client-logos\.s3\.[a-z0-9-]+\.amazonaws\.com$/`. Never `og:image` (banner; can be on the same host).
     404 → `not_found`; 429 → `rate_limited` + `retryAfterSeconds`.
   - `canonicalUrls(ref, id)`: from `urls.ts` (L1), built from `ref.atsToken`.
2. `normalizeLeverJob(raw: LeverPosting, ref: BoardRef, issues: ValidationIssue[] = []): NormalizedJob | null` — pure,
   exported, same contract as `normalizeGreenhouseJob` (≈414): returns `null` and records an issue when `id` or `text`
   is missing/blank (BF-002). Define a typed `LeverPosting` interface (00-PLAN §1; everything optional except what you
   validate). Mapping:
   | Field | From |
   |---|---|
   | externalId | `raw.id` |
   | legacyKey | `lever:${raw.id}` |
   | title | `text.trim()` |
   | department | `categories.department ?? categories.team ?? ''` (trimmed) |
   | team | `categories.team` (trimmed) when `categories.department` is set, else null |
   | location | `categories.location` trimmed, else first `allLocations` entry, else `''` |
   | secondaryLocations | `allLocations` minus `location`, trimmed, deduped, as `[{ location }]` (`[]` allowed) |
   | postal / country / region / city | `addressCountry` = `toIsoCountry(raw.country)` when present, else from the place parser; region/city from `parsePlace(location)` — **move** `parseGreenhousePlace` to `lib/ats/place.ts` as `parsePlace` and re-export the old name from GreenhouseClient (its test imports it) |
   | workplaceType | `remote`→`Remote`, `hybrid`→`Hybrid`, `onsite` or `on-site`→`OnSite`; `unspecified`/missing → `'Remote'` if isRemote else null |
   | isRemote | `workplaceType === 'remote'` or `/\bremote\b/i` on location or commitment |
   | employmentType | 00-PLAN decision 11 exactly; title fallback = `inferEmploymentTypeFromTitle` (move it to `lib/ats/place.ts` too) |
   | publishedAt | `new Date(createdAt)` when `createdAt` is a finite number, else null |
   | sourceUpdatedAt | null |
   | salary | `salaryRange` with 00-PLAN decision 10 (`per-year-salary`/`per-month-salary`/`per-hour-wage`; else all null). Numbers as given |
   | descriptionHtml | 00-PLAN decision 8: `description` + per list `<h3>${escapeHtml(text)}</h3>` (define a local `escapeHtml` for `& < > " '`) + content (wrap in `<ul>…</ul>` only if trimmed content starts with `<li`) + `salaryDescription` (if any) + `additional`, then `sanitizeJobDescriptionHtml`. No unescape |
   | descriptionPlain | `sanitizeJobDescriptionPlain(undefined, descriptionHtml)` |
   | jobUrl / applyUrl | `hostedUrl` / `applyUrl` via `sanitizeJobUrl`; the fallback comes from `canonicalUrls(ref, id)` built from `ref.atsToken` (ignore the slug-based first argument, as Greenhouse does ≈487-492) |
   | isListed | true |
   | raw (→ `Job.metadata`) | `descriptionHtml`, `descriptionPlain`, `jobUrl`, `team`, `secondaryLocations` (**exactly equal** to the NormalizedJob values — `NormalizeCountries.ts:81-101` recomputes the hash from metadata), plus `_source:'rest'`, `_ats:'lever'`, `_normVersion: 1`, `categories`, `country`, `workplaceType`, `createdAt`. **Drop** `description`, `opening*`, `descriptionBody*`, `lists`, `additional*`, `salaryDescription*` |
3. Registry and client maps: extend L1's `createAtsClient(source, opts?: { minIntervalMs?: number; initialDelayMs?:
   number })`; `lever` returns a `LeverClient`. `AshbyScraperOptions` (`Scraper.ts` ≈158-161) gains
   `leverMinIntervalMs?` and `leverInitialDelayMs?`. In `runAll`, right after `enabledSources` is resolved and **before**
   the `this.clients.has(...)` filters (≈784, 813):
   `if (enabledSources.includes('lever') && !this.clients.has('lever')) this.clients.set('lever', createAtsClient('lever', {...}))`.
   Do the same in `EnrichCompanies` after it parses `--sources` (its own map, ≈53-58), so Lever enrichment is not
   skipped as "no AtsClient registered". One `LeverClient` instance per process, so the pacer covers every Lever call.
   `DEFAULT_CLIENT_SOURCES` stays `['ashby','greenhouse']`. Scraper limiter for `lever` = concurrency 1.
4. Worker count to workers: `ClusterScraper.runWorkerShard` gets `workerCount: shards.length`; `child.send` (≈243-248)
   includes it; the message type at `Scraper.ts` ≈1177 gains `workerCount: number`; the handler constructs the scraper
   with `leverMinIntervalMs = 1000 * workerCount` and `leverInitialDelayMs = (workerId - 1) * 1000`. Single-process
   `scrape` = `1000` / `0`.
5. `--lever-max-boards=N` (default 600): new shared helper in `backend/src/core/selectCompanies.ts`:
   `selectCompanies<S extends Prisma.CompanySelect>(db, { sources, statusFilter, explicitSlugs, leverMaxBoards, select: S }):
   Promise<{ companies: Prisma.CompanyGetPayload<{ select: S }>[]; leverAvailable: number; leverCap: number }>`
   (the coordinator selects `{slug, source}`; `runAll` selects the fields it uses today, ≈796-808).
   Called from **both** `ClusterScraper.runClusterScrape` (≈303-316, the coordinator; workers get explicit slugs) and
   `Scraper.runAll`'s non-explicit branch (≈772). Non-Lever sources: today's query unchanged. Lever: same
   `statusFilter`, `orderBy: { lastCheckedAt: { sort: 'asc', nulls: 'first' } }`, `take: N`. `--slugs` skips the cap.
   Log "Lever: scraping X of Y boards (cap N)".
5b. **Lever deadline**: each scraper instance stops *starting* new Lever boards once `leverDeadlineMs` (default
   `11 * 60_000`, option on `AshbyScraperOptions`) has passed since `runAll` began. Unstarted boards are not touched
   (their `lastCheckedAt` stays old, so the next run picks them first) and are counted in
   `bySource.lever.skippedByDeadline` (new optional ErrorTracker field, merge = sum). Reason: a worker that hits the
   15-min watchdog marks the run incomplete and skips the cache publish for **all** sources (`ClusterScraper.ts`
   ≈394-401).
   Extend `tests/helpers/prismaFactory.ts` company `orderBy` to support `lastCheckedAt` nulls-first.
6. Seed: `npm run seed:lever -- spotify,palantir,zoox,matchgroup,outreach` (default list in
   `backend/src/config/LeverBoards.ts`; add to `DANGEROUS` in `scripts/repo-tests/settings-allowlist.test.mjs`; **local
   throwaway DB only**). Token must match `/^[A-Za-z0-9][A-Za-z0-9._&-]{0,79}$/` (case kept). `validateSite` must be
   `live` (log and skip otherwise). New `backend/src/lib/ats/slug.ts`:
   `allocateCompanySlug(db, source: AtsSource, token: string): Promise<string>` — `companySlug(source, token)`, plus
   `-2`, `-3`… if that slug belongs to another company; returns the existing slug when `(source, atsToken)` already
   exists. Upsert by `(source, atsToken)`: `Company { slug, source: LEVER, atsToken: token, name }`. L4 reuses it.
7. Telemetry: ErrorTracker events get `source: 'lever'`. New Lever messages use `ATS_SOURCES.lever.apiName`
   ("Lever Postings API"), e.g. `HTTP 429 Too Many Requests received from Lever Postings API`. `ReportClassifier`
   `resolveRelatedBF` (≈115-127) maps Lever api_error to **BF-024**. Register **BF-024** "Lever postings fetch &
   normalization" in `docs/bug-fix-log.md` with its guarding tests.
8. Restore `^backend/prisma/schema\.prisma` in `scripts/ci/check-fixer-scope.sh` and flip the repo test back to
   "allowed" (title "(restored in L2)").

## TESTS (write first; recorded fixtures; mocked axios)
- Fixtures in `backend/tests/fixtures/lever/` (3–5 postings each, trimmed): `palantir` (no department, `<li>` lists,
  Internship), `spotify` (department+team, `<div>` lists, multi `allLocations`, remote), `outreach` (yearly
  `salaryRange` + salaryDescription), `matchgroup` (`per-hour-wage`, one without `country`), `aprio-or-aifund`
  (`per-month-salary`), `appen` (`one-time`), one posting with no `location`, `allLocations: []` and no `team`,
  `empty.json` = `[]`, `notfound.json`, `board-spotify.html` (title, header logo img, og:image banner on the same S3
  host), `board-arcteryx.html` (logo on `lever-client-logos.s3.amazonaws.com`).
- `backend/tests/unit/LeverClient.test.ts`: externalId/legacyKey; missing id or title → null + issue; duplicate id →
  deduped; department→team fallback; missing location/team; secondaryLocations; country present and missing;
  workplaceType incl. `on-site`/`unspecified`; **every commitment in 00-PLAN §1 → decision-11 value** (incl.
  "Full Time/Part Time"→FullTime, "PT Temp/Seasonal"→Temporary, "Freelance"→Contract, "Scholarship"→Intern);
  `createdAt` ms → exact ISO; yearly/monthly/hourly salary, `one-time` → null; `descriptionHtml` contains list headings,
  an `<li>` from both list shapes, the salary blurb and `additional` text, no `<script>`; metadata has no
  `lists`/`opening`/`additional`; metadata `team`/`secondaryLocations` equal the normalized values; token `AIFund`
  requested as `/postings/AIFund`, `1840&Company` as `/postings/1840%26Company`; 404 → notFound; `[]` → empty;
  non-array 200 → `unexpected_body`; 429 + Retry-After 30 → 10 s; 5xx exhaustion → failure; `validateSite` →
  live / empty / not_found / dead_board; logo from header img (both hosts), never og:image; name from title; hash
  determinism.
- Pacer (fake timers): `minIntervalMs: 2000, initialDelayMs: 1000` → starts at 1000, 3000, 5000; a retry also waits.
- Lever deadline (fake timers): boards not started before `leverDeadlineMs` are skipped, untouched, and counted.
- Board-page requests send the HTML Accept header; API requests send `BROWSER_HEADERS`. `fetchCompanyMetadata(ref)`
  with no options returns the logo.
- Commitment "International" does not map to Intern.
- `selectCompanies`: 5 Lever companies, cap 2 → the 2 oldest `lastCheckedAt` (nulls first); `--slugs` ignores the cap;
  Ashby selection unchanged. ClusterScraper passes `workerCount` in the IPC message.
- **Deactivation safety**: activeIds for a Lever board are `lever:<uuid>`; a present job is never deactivated.
- Integration (real Postgres): Ashby `spotify` and Lever `lv--spotify` coexist; scraping one never deactivates,
  quarantines or touches the other's jobs; `(source, externalId)` holds when an Ashby and a Lever job share a UUID;
  `allocateCompanySlug`: `arcteryx.com` → `lv--arcteryx-com`, a second token mapping to the same slug gets `-2`, an
  existing company keeps its slug.
- ErrorTracker/ReportClassifier: `source:'lever'` → BF-024. Ashby and Greenhouse suites unchanged and green.

## DOCS
`backend/docs/external-apis.md` (Lever section from 00-PLAN §1), `backend/docs/architecture-and-workflows.md`,
`docs/system-architecture-and-flows.md` (ATS node ≈29: "Ashby (REST/GraphQL), Greenhouse (Job Board REST) & Lever
(Postings REST)"), `backend/docs/module-reference.md` (`LeverClient`, `place.ts`, `slug.ts`, `selectCompanies.ts`),
`backend/docs/cli-commands.md` (`seed:lever`, `--sources=lever`, `--lever-max-boards`), `docs/self-healing-loop.md`
(Lever messages), `docs/testing.md` BF-024 row, `docs/agents/context.md` BF-024 line (byte budget) + sync-shells,
CHANGELOG, `docs:generate`.

## AGENT FILES (hard requirement)
Canonical sources only, then `node scripts/agents/sync-shells.mjs`:
- `docs/agents/rules/multi-source-ats.md` append: "9. Lever: ≤ 1 request/s for the whole run (robots `Crawl-delay: 1`;
  pacer = 1000 ms × worker count, staggered start). Greenhouse ≤ 5 concurrent per worker. 404 is decided by HTTP
  status, never body text. 10. Lever site names are case-sensitive and may contain `.` and `&`: keep them exactly,
  URL-encode them; slugs come from `allocateCompanySlug`. 11. The Lever board cap is applied where companies are
  selected (`selectCompanies`, coordinator for `scrape:parallel`); each scraper stops starting Lever boards at
  `leverDeadlineMs` so the worker watchdog never blocks the publish."
- `docs/agents/rules/scraper-invariants.md`: rule 2 → "Invariants BF-001 through BF-024 must be preserved"; add
  "7. Every new ATS client mirrors `GreenhouseClient`: axios, inline retry with `lib/ats/http.ts` helpers, normalizer
  returns `null` + issue on bad id/title, dedupe by id."
- `docs/agents/roles/scraper-bugfixer.md` + `roster.md`: schema line → "(additive only)" (restored).
- `docs/agents/roles/run-reviewer.md`: add "Read `summary.bySource`; Lever api_error → BF-024, Greenhouse → BF-023,
  Ashby → BF-001."

## VERIFY
`scripts/check-all.sh --no-install` · `npm --prefix backend run test:integration` · repo tests · sync-shells --check.
Optional manual proof (**local throwaway Postgres only**): `seed:lever spotify,arcteryx.com` then
`scrape -- --sources=lever --slugs=lv--spotify,lv--arcteryx-com --skip-publish` → jobs saved with `source=LEVER`; a
second run rewrites 0 rows. Paste both counts in the PR body.

## COMMIT + PUBLISH
`feat(scraper): Lever client and normalizer, disabled by default (BF-024)`; `scripts/agents/push-branch.sh`.

## ROLLOUT (PR body)
Merge. Nothing runs in prod (default sources = ashby; no Lever companies in prod). No deploy needed.
