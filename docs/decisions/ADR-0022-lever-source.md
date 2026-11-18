# ADR-0022: Multi-Source ATS Architecture Extension (Lever Onboarding)

- Status: Implemented (L1–L4 shipped; L5 staged runner and L6 workflow wiring behind `STAGED_SCRAPE` and `LEVER_ENABLED`, both default off)
- Date: 2026-11-16
- Deciders: owner, scraper-architect
- Related: [ADR-0021](./ADR-0021-multi-source-ats.md), [ADR-0001](./ADR-0001-postgres-source-of-truth.md), [ADR-0003](./ADR-0003-immutable-cache-generations.md), [ADR-0018](./ADR-0018-job-last-updated-detection.md)

## Context
Following the onboarding of Greenhouse (ADR-0021), the repository supports a multi-source ATS architecture with `Ats` enum, composite unique indexes `(source, externalId)` and `(source, atsToken)`, per-source adaptive limiters, source telemetry, and per-source drop sanity gating.

Expanding to Lever (`jobs.lever.co/{site}`) introduces a third major job source (~2,000–3,000 estimated live boards). Public postings are served via the unauthenticated Lever Postings API (`GET https://api.lever.co/v0/postings/{site}?mode=json`), which returns the entire board as a JSON array in a single request.

Key verified operational facts for Lever:
1. **Public API:** `GET https://api.lever.co/v0/postings/{site}?mode=json` returns an unpaginated JSON array of open jobs (e.g. Veeva: 859 jobs, 12.1 MB). Unknown sites return HTTP 404 (`{"ok":false,"error":"Document not found"}`). Empty boards return HTTP 200 with `[]`.
2. **Case Sensitivity & Characters:** Site tokens are case-sensitive and may contain dots, uppercase, and ampersands (e.g. `spotify` 200 vs `Spotify` 404; `arcteryx.com`, `1840&Company`, `AIFund`).
3. **Dead Boards:** Some sites return jobs via API but their hosted board and apply pages 404 (e.g. `AIFund`). Board validation requires verifying that `https://jobs.lever.co/{site}` responds with HTTP 200.
4. **Politeness:** `https://api.lever.co/robots.txt` specifies `Allow: /` with `Crawl-delay: 1`. The scrape run must maintain global rate <= 1 request/second across all parallel workers.
5. **Logos:** Logos reside on `lever-client-logos` S3 bucket in the HTML header `<img alt="... logo">` of the hosted board page. `og:image` is a 1200x630 banner and must never be used as a logo.
6. **EU Boards:** Hosted on `jobs.eu.lever.co` / `api.eu.lever.co`. Out of scope for v1 by choice (requires company-level region support).

## Decision
Extend the multi-source architecture established in ADR-0021 across a 5-phase plan (PRs L1–L5):

1. **Additive ATS Enum Expansion:**
   Add `LEVER` to `enum Ats { ASHBY GREENHOUSE LEVER }` in `backend/prisma/schema.prisma`. Verified safe on Postgres without data loss or table locks.
2. **Token and Slug Conventions:**
   - `Company.atsToken`: Stores native Lever site token preserving exact case and special characters (`.`, `&`).
   - `Company.slug`: Globally unique slug formatted as `lv--` + token lower-cased with non-alphanumeric characters replaced by hyphens (e.g. `1840&Company` -> `lv--1840-company`). Unique collision suffixes (`-2`, `-3`) are appended if needed.
   - `Job.ashbyId`: Legacy global key formatted as `lever:<uuid>`.
   - `Job.externalId`: Lever posting UUID.
3. **Single Source Registry:**
   Centralize ATS source descriptors in `backend/src/lib/ats/source.ts` (`SUPPORTED_ATS_SOURCES`, `ATS_SOURCES`). L1 gated API and UI exposure via `API_SOURCES` and `FILTER_SOURCES`; L3 enabled `'lever'` in both `API_SOURCES` and `FILTER_SOURCES`.
4. **Politeness and Concurrency:**
   Lever scraping concurrency capped at 1 per worker with a per-process pacer ensuring `>= 1000 ms * workerCount` between requests.
5. **Run-Time Budget:**
   Introduce `--lever-max-boards` (default 600) picking boards with oldest `lastCheckedAt` first to keep scrape duration well within the 30-minute CI workflow budget.
6. **Job Normalization:**
   Descriptions combine `description`, `lists[]` headings/content, `salaryDescription`, and `additional` (EEO blurb) into sanitized HTML. `publishedAt` is mapped from epoch ms `createdAt`. `_normVersion: 1` stops unnecessary updates.
7. **Discovery (L4 — landed):**
   Lever board discovery uses Wayback Machine CDX (`jobs.lever.co/{a..z,0..9}`, `showResumeKey=true`, 503/504 backoff + two-character prefix splits, 50% time budget, 100-min default), persists state in `backend/output/lever-discovery-state.json` (30-day rejection cooldown), validates candidates via `LeverClient.validateSite` (`live` requires both postings API and 200 HTML board), allocates `lv--<sanitized>` slugs, and enriches missing names/logos via `EnrichCompanies.ts` (7-day retry, 200 cap). Behind repo variable `DISCOVERY_LEVER_ENABLED`.
8. **Activation:**
   Disabled by default; enabled in production scheduled scrapes via repo variable `LEVER_ENABLED`.

## Consequences
- Single unified source registry eliminates ad-hoc `'ashby' | 'greenhouse'` unions across backend, database queries, and cache serializers.
- Lever jobs and companies coexist safely alongside Ashby and Greenhouse data without key collisions or cross-source deactivations.
- Rehearsed additive schema push allows prod `scrape-daily` to apply the enum value automatically without downtime or manual interventions.
