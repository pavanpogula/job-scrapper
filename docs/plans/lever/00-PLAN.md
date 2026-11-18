# Plan — Lever as a third job source (`jobs.lever.co/<company>`)

> Owner request (2026-11-16): "extend the repo to also scrape https://jobs.lever.co/<company>, the way we did
> Greenhouse". This folder holds the plan (this file) and one Antigravity prompt per PR (`L1-…` to `L6-…`). Run the
> PRs **in order**; each is squash-merged (and deployed where the table says) before the next starts.
> Decision record: **ADR-0022** (written in L1). It extends ADR-0021 (multi-source ATS) and does not replace it.

## Status (2026-11-18)
- **Merged:** L1 #47 (registry + enum), L2 #48 (client), L3 #49 (API + UI), L4 #50 (discovery). Backend and frontend are deployed on L3.
- **Discovery done locally** (owner's Mac, against production): 5,993 Wayback board names, about 1,823 live Lever boards inserted.
- **First Lever scrape done locally** (`--sources=lever --skip-publish`): 782 boards gave 36,103 jobs (~46 jobs per board); the full
  site had 128,506 active jobs. The scheduled GitHub scrape still excludes Lever (`LEVER_ENABLED` unset), so those rows do not refresh yet.
- **Next:** L5 (staged runner, code) → L6 (workflow wiring + enable). L7 (optional hardening) is described in §4.

## 0. Why this is smaller than Greenhouse

Greenhouse needed 6 PRs because the repo was Ashby-only. G1–G6 already built the multi-source parts: `Ats` enum,
`Company.source/atsToken`, `Job.source/externalId`, both unique indexes, the `AtsClient` interface
(`backend/src/lib/ats/AtsClient.ts`), per-source limiter (`Scraper.getLimiter`), `--sources`, `bySource` telemetry,
per-source sanity gate (`Publisher.ts` ≈224), the `source=` API filter, `SourceBadge`, and `source:deactivate`.
Lever plugs into those. What is left:
1. Many places still hard-code the two-source union `'ashby' | 'greenhouse'` or the `gh--` prefix (list in §3).
2. A Lever client + normalizer, Lever discovery, and turning it on.

## 1. What we verified (2026-11-16) — facts, not guesses

Live calls against the **public Lever Postings API** on palantir (303 jobs), spotify (88), zoox (237),
matchgroup (69), veeva (859), outreach (14), binance (4), plus empty boards and unknown boards.

**Endpoints**
- List: `GET https://api.lever.co/v0/postings/{site}?mode=json` → **JSON array** of every published posting. No auth.
  The whole board comes back in one call when `limit` is not set (veeva: 859 jobs, 12.1 MB).
- Paging works: `&limit=N&skip=M` (verified: `limit=5&skip=5` returns exactly items 5–9 of the full list).
- One posting: `GET https://api.lever.co/v0/postings/{site}/{id}` → one object (same shape).
- Unknown site → **HTTP 404**, body `{"ok":false,"error":"Document not found"}`.
- A site that exists but has no open jobs → **HTTP 200, body `[]`** (seen on `lever`, `wealthsimple`, `whoop`,
  `shieldai`).
- **Site names are case-sensitive and not always lower-case**: `spotify` → 200, `Spotify` → 404; real active sites
  include `AIFund`, `BDG`, `Aprio` (189 jobs), `arcteryx.com` (229 jobs; `arcteryx` → 404) and `1840&Company`
  (request as `1840%26Company`). ~13–14% of Wayback first segments have upper case or dots.
- **Dead boards exist**: AIFund's API returns 39 postings but its board page, `hostedUrl` and `/apply` all 404
  (1840&Company too). The API alone does not prove a site is live.
- `mode=json` is optional (JSON is the default); keep it, it is documented.
- **No gzip/br**: the API ignores `Accept-Encoding` (no `Content-Encoding`, same `Content-Length`).
- `ETag` + `If-None-Match` → **304** works (not used in v1).
- No rate-limit headers, no 429 at ~1 req/s. `https://api.lever.co/robots.txt` = `Allow: /` + **`Crawl-delay: 1`**
  → we keep the whole run at **≤ 1 Lever request per second** (across all workers). The README documents no read
  rate limit and no republishing terms.
- **EU boards exist** (e.g. engelvoelkers, 336 jobs) and are served **only** by `api.eu.lever.co` (US API → 404),
  same schema, `hostedUrl` on `jobs.eu.lever.co`, logos on `s3.eu-central-1.amazonaws.com/co.lever.eu.client-logos`.
  **Out of scope for v1 by choice** (needs a region per company; follow-up ADR).
- `https://jobs.lever.co/robots.txt` = `Content-Signal: search=yes, ai-train=no, use=reference`, and it
  **disallows CCBot** → Common Crawl has almost nothing for Lever (CC-MAIN-2026-43: 524 URLs for `jobs.lever.co/*`,
  7 for the EU host, measured once). **Discovery uses the Wayback Machine CDX API**: 15–28 s per prefix call;
  ~40% of calls get a transient 503 "Temporarily Offline"; big prefixes (`m`) hit the 20,000-row limit;
  `collapse=urlkey` still returns one row per job URL (65–100 rows per site); `urlkey` is lower-cased so the real
  case only survives in `original`. Estimate: 4–6k distinct first segments since 2024 → **≈ 2–3k live boards**.

**Posting fields (present on 100% of the jobs sampled unless noted)**
| Field | Shape / notes |
|---|---|
| `id` | UUID string, unique per board |
| `text` | job title |
| `categories.team` | almost always (missing 1 of 976) |
| `categories.department` | **optional** (spotify, binance have it; palantir, zoox do not) |
| `categories.location` | free text: `"New York, NY"`, `"London"`, `"North America"`, `"Palo Alto, California"`; **can be missing** |
| `categories.allLocations` | array; first entry = `location`; >1 entry for multi-location posts; **can be `[]`** |
| `categories.commitment` | **optional** free text: `Full-time`, `Full-Time`, `Permanent`, `Internship`, `Contract`, `Fixed-Term`, `Short Term`, `Scholarship`, `Full-time: Remote`, `Full Time/Part Time` (332 gopuff jobs), `Seasonal`, `Freelance`, `Temp Full-time`, `PT Temp/Seasonal` |
| `country` | ISO-3166 alpha-2 (~50 codes seen); **can be missing/null** (~1 in 700) |
| `workplaceType` | live values `remote` / `hybrid` / `onsite` (docs say `on-site`, `unspecified` — accept both, never seen live) |
| `createdAt` | epoch **milliseconds** (e.g. `1786469891368` → `2026-08-11T17:38:11.368Z`) |
| `description` / `descriptionPlain` | opening + body, **raw HTML (not entity-escaped)** |
| `opening`, `descriptionBody` (+Plain) | the two halves of `description`; do not store separately |
| `lists[]` | `{ text, content }` sections ("What You'll Do"…). `content` is HTML: mostly bare `<li>…</li>` or `<div>…</div>`, also `<p>`, `<h3>`, `<h4>`, `<ol>`. **Not part of `description`** |
| `additional` / `additionalPlain` | closing section (EEO, pay text). **Not part of `description`** |
| `salaryRange` | **optional** `{ min, max, currency, interval }`, plain units (not cents). Intervals seen: `per-year-salary`, `per-month-salary` (PHP, EUR, VND), `per-hour-wage`, `one-time` (appen: 0.01–50 USD per task). Docs list none |
| `salaryDescription` / `salaryDescriptionPlain` | optional pay blurb HTML, **independent of `salaryRange`** (126 of 271 ranges had none) |
| `hostedUrl` | `https://jobs.lever.co/{site}/{id}` |
| `applyUrl` | `https://jobs.lever.co/{site}/{id}/apply` |

Size: 10–24 KB raw JSON per job (Greenhouse was 9.2 KB stored per job).
**Missing vs Ashby:** no updated-at timestamp, no `isListed`, no city/region split.

**Board page (for name + logo):** `GET https://jobs.lever.co/{site}` → 200 HTML with `<title>Spotify</title>` and the
header logo `<img alt="Spotify logo" src="https://lever-client-logos.s3.us-west-2.amazonaws.com/…png">`.
`og:image` is the 1200×630 **banner**, not the logo (same trap as Greenhouse, fixed in G5 e92d583) → never use it.
The banner can sit on the same S3 host, so the `alt="… logo"` check is what tells them apart. Older logos live on
`lever-client-logos.s3.amazonaws.com` (no region). Unknown site → 404.

**Database (rehearsed 2026-11-16, Prisma 5.22.0, Postgres 17.5 throwaway):** pushing the current schema, inserting
rows, then adding `LEVER` to `enum Ats` and running `prisma db push --skip-generate` → **exit 0**, "now in sync", no
prompt; second push "already in sync"; rows intact; inserting `source='LEVER'` works. (Postgres refuses to *use* a new
enum value in the same transaction that adds it — nothing we run does that.)

## 2. Decisions

1. **Identity (additive):** `enum Ats { ASHBY GREENHOUSE LEVER }`. No new columns. Rehearsed safe (§1 Database);
   L1 repeats the rehearsal as a guard and STOPs if `db push` does not exit 0.
2. **Token and slug.** `atsToken` = the site name **exactly** as Lever serves it (case, `.`, `&` kept; URL-encoded in
   requests and URLs). Token pattern: `/^[A-Za-z0-9][A-Za-z0-9._&-]{0,79}$/`. Slug = `lv--` + token lower-cased with
   every char outside `[a-z0-9-]` replaced by `-` (`arcteryx.com` → `lv--arcteryx-com`, `1840&Company` →
   `lv--1840-company`); if that slug is taken by another company, append `-2`, `-3`… Slug is computed once at insert
   and never recomputed. Lever rows always carry `atsToken`; never derive a Lever token from its slug (lossy).
3. **Legacy key** `Job.ashbyId` = `lever:<uuid>`; `externalId` = the UUID. (Lever and Ashby both use UUIDs, so the
   prefix is what keeps `ashbyId` collision-free.)
4. **One source registry.** Every place that lists sources derives from `SUPPORTED_ATS_SOURCES` /
   per-source descriptors (`slugPrefix`, `label`, `apiName`, URL builders). `API_SOURCES` / `FILTER_SOURCES` gate
   what the API and UI accept (Lever added in L3). Adding a 4th source later touches one table, the client and the UI
   label. This is the whole of L1.
5. **Fetch:** one `GET …/postings/{site}?mode=json` per board (no paging: under `Crawl-delay: 1` every extra request
   costs one second). axios, like GreenhouseClient, timeout 60 s (12 MB boards), inline retry loop with the
   `lib/ats/http.ts` helpers (`computeRetryDelayMs`, Retry-After capped at 10 s, `classifyFetchFailure`); only 429 sets
   `rateLimited` (BF-015); 404 → `notFound`; 200 `[]` → empty board (existing empty-board deferral applies).
6. **Politeness:** a per-process pacer in `LeverClient` keeps at least `1000 ms × workerCount` between request starts
   (retries included), and worker *k* delays its first Lever request by `(k-1) × 1000 ms`, so the whole parallel run
   stays ≤ 1 req/s. `workerCount` travels in the ClusterScraper → worker IPC message (new field). Lever limiter
   concurrency = 1. Headers = the existing `BROWSER_HEADERS` (as Greenhouse) with `Accept: application/json`.
7. **Run-time budget (superseded by decision 12 for the scheduled run):** outside staged mode the scrape job has a short
   timeout, so Lever is limited: `--lever-max-boards` (default **600**, oldest `lastCheckedAt` first) and a per-scraper
   `leverDeadlineMs` of 11 min (L2). The cap is applied where companies are selected — in the **coordinator**
   (`ClusterScraper`) for `scrape:parallel` and in `Scraper.runAll` for `scrape` — through one shared helper. A board not
   picked is scraped on a later run (its jobs are not deactivated: deactivation only runs for boards scraped in this run).
8. **Description:** `description` + each `lists[]` as `<h3>{text}</h3>` + content (wrapped in `<ul>` only when the
   trimmed content starts with `<li`) + `salaryDescription` + `additional`, then `sanitizeJobDescriptionHtml`.
   No entity-unescape (the HTML is raw). `descriptionPlain = sanitizeJobDescriptionPlain(undefined, html)`.
9. **Freshness:** `createdAt` → `publishedAt`. `sourceUpdatedAt = null` (Lever has none). `_normVersion: 1` in
   metadata, so the existing rule (BF-023) stops a later normalizer change from marking every Lever job "Updated".
10. **Salary:** `salaryRange` as given (no ÷100). Interval map: `per-year-salary`→`'1 YEAR'`,
    `per-month-salary`→`'1 MONTH'`, `per-hour-wage`→`'1 HOUR'`; `one-time` or anything else → no salary (all null).
11. **Employment type** (UI values `FullTime | PartTime | Contract | Intern | Temporary`), from `commitment`,
    case-insensitive, first match wins: `/\bintern(ship)?s?\b|scholarship/`→`Intern`; `/\btemp\b|temporary|seasonal|fixed[- ]?term|short[- ]?term/`
    →`Temporary`; `/contract|freelance/`→`Contract`; `/full[- ]?time|permanent/`→`FullTime` (so "Full Time/Part
    Time" → FullTime); `/part[- ]?time|\bpt\b/`→`PartTime`; else the title heuristic; else null.
11b. **Discovery:** Wayback CDX over `jobs.lever.co/` (per-prefix, `showResumeKey` continuation, 503/504 retried),
    tokens from `original` (case kept). A site is seeded only if the API returns ≥ 1 posting **and** the board page
    `https://jobs.lever.co/{site}` returns 200 (rules out dead boards like AIFund). ≤ 1 req/s. Behind repo variable
    `DISCOVERY_LEVER_ENABLED`. EU host skipped in v1.
12. **Turn-on:** repo variable `LEVER_ENABLED`, same pattern as `GREENHOUSE_ENABLED`. Same scheduled run, one cache
    generation. Per-source sanity gate already generic.
13. **UI:** "via Lever" badge, Lever in the Source filter, copy says "Ashby, Greenhouse & Lever". Board links always
    come from API `boardUrl`. The two places that build Greenhouse URLs from the slug in the browser
    (`CompanyHeader.tsx:38`, `CompanyCard.tsx:23`) are removed in L1.

12. **Staged scrape (L5 code, L6 wiring):** with ~1,800 live Lever boards at ≤ 1 request/s, Lever needs ~50 min per
    pass, while Ashby and Greenhouse need ~6–8 min each. So the scheduled run goes **staged**: `--staged` scrapes one
    source completely, then the next (registry order ashby → greenhouse → lever), each with its own worker count and
    wall time, then publishes the cache **once**. Rules:
    - Ashby and Greenhouse stages use the normal worker count and the 15-min worker watchdog. The Lever stage always uses
      **1 worker** (the 1 req/s limit is global), stops starting boards at `--lever-stage-min − 5` min and has a watchdog of
      `--lever-stage-min + 5` min. `--lever-stage-min` defaults to **70**; the Lever cap in staged mode defaults to 3000
      boards (`--lever-max-boards=all` removes it).
    - A failed stage never stops the later stages (so a Greenhouse block cannot hide a Lever pass). BF-017 is unchanged:
      any failed worker means no cache publish and exit 1. Earlier stages' rows are already written.
    - The report gains per-source wall time (`durationMs`), Lever `boardsAvailable/boardsCap` and stage-tagged workers
      (all additive, `schemaVersion` stays `2.0`).
    - Timing table (expected / worst case): setup 3 / 5 min, enrichment 4–7 / 8, Ashby 6 / 15, Greenhouse 8 / 15,
      Lever 50–55 / 75, classify + artifacts 1 / 2 → **~75–80 min expected, ~120 min worst case**. The `scrape` job
      timeout is **150 min**, under the 180-min cadence (7 runs a day, 3 h apart), so runs never overlap.
    - Free GitHub Actions (public repo): standard runners are free and unlimited, one job may run up to 6 h, 20 jobs run
      at once, the cache is 10 GB with 7-day eviction, scheduled workflows stop after 60 days without repo activity.
    - Lever load: ~1,800 requests per run, ~12,600 per day, always ≤ 1 request/s. If Lever asks for less, lower the cap or
      run Lever on fewer runs; never raise the rate.
    - Rollout is two variables, both default off: `STAGED_SCRAPE=true` (staged run) then `LEVER_ENABLED=true`
      (include Lever). Rollback: `LEVER_ENABLED=false` → `deactivate_source=lever`; `STAGED_SCRAPE=false` returns to the
      interleaved run.

## 3. Hard-coded spots L1 must generalize (from `grep -i greenhouse` on main @ 78efdfe)

Backend: `lib/ats/source.ts` (type, `toDbAts`, `toAtsSource`, `isAtsSource`), `lib/ats/urls.ts` (switches),
`api/types.ts:18,80,96,170,204,366,433`, `api/db/queries.ts:60,274,313,354,422,481,512`,
`lib/cache/keys.ts:187-190`, `lib/ReportClassifier.ts:116,197`, `database/SourceDeactivate.ts:36`,
`discovery/CdxWorker.ts:392,401,516,648`, `core/Scraper.ts:184,195,884,1025` (client map, limiter, messages),
`utils/EnrichCompanies.ts:57,106,192,201` (client map, candidate block, `lastEnrichedAt` writes),
`prisma/schema.prisma:16,60` (enum + comment), `api/contract.ts:209` (`gh--` fallback in `toJobDetail`),
`api/types.ts:265` (comment), `lib/ReportClassifier.ts:115-127` (`resolveRelatedBF`, L2).
Tests that pin the two-source world: `tests/unit/ClusterPartition.test.ts:20`, `tests/unit/SourceDeactivate.test.ts:161`,
`tests/unit/ApiTypes.test.ts:57-90`, `tests/helpers/prismaFactory.ts:263`.
Correctly Ashby-only, leave alone: `DbClean.ts`, `Verify.ts`, `ScraperCSV.ts`, `BackfillSource.ts`, `Seed.ts`.
Frontend: `types/api.ts:10,158`, `hooks/useJobFilters.ts:39`, `store/slices/filterSlice.ts:26`,
`components/common/SourceBadge.tsx:18-25`, `components/jobs/JobFiltersBar.tsx:382,420,576,583`,
`components/companies/CompanyHeader.tsx:38`, `CompanyCard.tsx:23`, `pages/AboutPage.tsx:115`, `components/Footer.tsx:57`,
`index.html:9`. Workflows: `scrape-daily.yml:31,42,77-78`, `discover-weekly.yml:68-106`.

## 4. PR sequence

| PR | Prompt file | What | After merge |
|---|---|---|---|
| L1 | `L1-source-registry-and-enum.md` | ADR-0022; `LEVER` enum value (rehearsed); one source registry (descriptors); all §3 spots derive from it; `lv--` guard; UI reads `boardUrl` only. **No behaviour change, Lever not scraped, no Lever in the UI yet** | Dispatch scrape-daily (applies `db push`), check counts normal. Deploy backend → frontend (smoke) |
| L2 | `L2-lever-client.md` | `LeverClient` + `normalizeLeverJob` + pacer + `seed:lever` + `--lever-max-boards`; BF-024; source-aware telemetry; **disabled by default** | Nothing live. Owner may run a local `--slugs=lv--spotify` try on a throwaway DB |
| L3 | `L3-api-and-ui.md` | `source=lever` filter/facet/cache key, contract fixtures; "via Lever" badge, filter option, copy | Deploy backend → frontend |
| L4 | `L4-lever-discovery.md` | Wayback CDX discovery, token validation, name+logo enrichment, weekly workflow job behind `DISCOVERY_LEVER_ENABLED` | Set variable, dispatch discover-weekly, send step summary |
| L5 | `L5-staged-scrape.md` | `scrape:parallel --staged` (one source per stage, Lever 1 worker + own deadline, one publish), `--lever-max-boards=all`, `--lever-stage-min`, per-source wall time in the report, BF-025. **Opt-in, no workflow change** | Nothing live |
| L6 | `L6-enable-lever.md` | scrape-daily: `STAGED_SCRAPE` + `LEVER_ENABLED` variables, `staged`/`lever_max_boards`/`lever_stage_min` inputs, job timeout 150, rollback choice `lever`, docs and agent files | Set `STAGED_SCRAPE=true`, then a `staged=true` + `skip_publish` measure run with Lever, then `LEVER_ENABLED=true` |
| L7 (optional) | no prompt yet | Source circuit breaker: stop starting boards of a source after a burst of 403s, and an S1 alert when most of a source's boards fail (the 17 Nov Greenhouse block) | Write only if the owner asks |

## 5. Risks (and mitigations)

| Risk | Mitigation |
|---|---|
| Adding the enum value makes `db push` fail in prod (would stop the daily scrape) | L1 rehearses old→new push on throwaway Postgres (exit 0 required) + isolated-schema integration test |
| Lever slug collides with an Ashby/Greenhouse slug | `lv--` prefix; Ashby/Greenhouse seed + discovery already reject `--`; L1 adds a test that no source's discovery yields a `xx--` slug |
| Raw UUID passed to deactivation (Ashby UUIDs look the same) | L2 test: activeIds for Lever are `lever:<uuid>`; coexistence integration test Ashby `spotify` + Lever `lv--spotify` |
| Breaking `Crawl-delay: 1` / getting blocked | Pacer at `1000 ms × workers`, concurrency 1, honour 429 Retry-After (cap 10 s), discovery ≤ 1 req/s |
| Scrape job passes its timeout | Outside staged mode: cap 600 + 11-min deadline. Staged (L5/L6): per-stage deadlines and watchdogs, job timeout 150 min vs 180-min cadence; the measure run in L6 checks real timings before `LEVER_ENABLED` |
| 12 MB boards → slow / memory | 60 s timeout; normalizer drops `description/opening/descriptionBody/lists/additional` from stored metadata (description stored once, as sanitized HTML + plain) |
| Description missing "lists"/"additional" sections | Decision 8 + fixture test that asserts list headings and the EEO text appear in `descriptionHtml` |
| `og:image` banner used as logo | Logo only from the header `<img alt="… logo">` on the `lever-client-logos` S3 host; test with recorded HTML |
| Discovery junk tokens (`*`, `%2a`, quotes, `<`) | Token pattern + reserved list + validation; only sites with ≥ 1 posting are seeded |
| Real mixed-case / dotted sites dropped (`AIFund`, `arcteryx.com`) | Token keeps case, `.`, `&`; slug is a sanitized lower-case form with collision suffix (decision 2) |
| Dead boards → dead Apply links (AIFund: API 200, board 404) | Seed only when the board page is also 200; L2 seed does the same check |
| Wayback 503s / 20k-row truncation | Retry 503/504 with 30–60 s backoff ×3, `showResumeKey` continuation, two-character split only on repeated failure; summary counts failed prefixes |
| Discovery takes weeks to validate ~2–3k boards at 1 req/s | Accepted: `--budget` per run; harvest progress + every validation outcome persist in a cached state file, so each run resumes and rejected tokens are re-checked only after 30 days (L4) |
| One slow Lever board overruns the 15-min worker watchdog → no cache publish for any source | Lever deadline per scraper instance (`leverDeadlineMs`, 11 min): stop starting Lever boards; unstarted boards keep `lastCheckedAt` and go first next run (L2) |
| Lever ToS / `use=reference` content signal | **Owner reviews Lever's terms before L5**; we show title/summary/description and always link back to the Lever posting for applying |
| Neon storage (+10–24 KB raw per job) | L6 measure run (`skip_publish`) reports bytes per job before the flip; at ~46 jobs per board Lever may add 60–85k jobs, so watch the Neon size after the first full pass |
| A staged stage fails or hangs and blocks the others | Stages are isolated (later stages still run); every stage has its own watchdog; BF-017 only skips the publish, never the writes (L5) |
| Lever stage grows past its budget as discovery adds boards | `skippedByDeadline` and `boardsAvailable/boardsCap` in the By Source table; two consecutive runs with skips = S2; tune `--lever-stage-min` or the cap, never the rate |
| Writing Lever rows before the deployed backend knows `LEVER` breaks `/v1/companies` (happened 17 Nov: the Prisma client of the old deploy rejected the new enum value) | Rule: deploy the backend that knows a new enum value **before** any code or script writes that value to the production database |
| Auto-fixer editing `schema.prisma` during L1 | L1 temporarily removes `schema.prisma` from fixer scope; L2 restores it (same as G1/G6) |

## 6. Verification per PR (all PRs)

Integration tests that push older/other schemas use an **isolated Postgres schema** (`?schema=…`).
`scripts/check-all.sh --no-install` · `node --test 'scripts/repo-tests/**/*.test.mjs'` ·
`node scripts/agents/sync-shells.mjs --check` · `npm --prefix backend run test:integration` (real Postgres) ·
`npm --prefix backend run docs:generate` · contract fixtures re-recorded + synced where the API changes.
**Agent files are a hard requirement in every PR:** each L-file has an "AGENT FILES" section; edits go to the
canonical `docs/agents/` sources (new rule `multi-source-ats` from L1) and are regenerated with `sync-shells.mjs`.
Claude reviews each PR (worktree checks, real-Postgres tests, Chrome check for UI PRs) before the owner merges, using
`docs/plans/lever/REVIEW.md` (includes the per-phase docs checklist).
