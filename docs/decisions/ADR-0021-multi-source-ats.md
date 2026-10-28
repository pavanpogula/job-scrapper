# ADR-0021: Multi-Source ATS Architecture (Greenhouse Onboarding)

- Status: Implemented (Phases G1–G6 Implemented)
- Date: 2026-10-27
- Deciders: owner, scraper-architect
- Related: ADR-0001, ADR-0004, ADR-0009, ADR-0010, ADR-0018, ADR-0019, ADR-0020

> **Implementation Note (Phase G6 - 2026-10-27)**:
> Phase G6 implemented: Greenhouse enabled in daily scrape behind `GREENHOUSE_ENABLED` repo variable with `sources` dispatch override; per-source sanity gate in `Publisher.ts` (drops > 30% for sources with baseline ≥ 100 exit 2); emergency rollback CLI `npm run source:deactivate -- greenhouse` exposed in `scrape-daily.yml` as `deactivate_source` input; `force_publish` input added for post-rollback baseline resets; fixer scope restored for `schema.prisma`; additive nullable `Company.lastEnrichedAt` introduced to decouple 7-day logo retry from scraper `lastCheckedAt` updates; initial Greenhouse worker concurrency capped at ≤ 5 with `Accept-Encoding: gzip`.

> **Implementation Note (Phase G5 - 2026-10-27)**:
> Phase G5 implemented: Greenhouse board discovery at scale via paged Common Crawl CDX targeting boards/job-boards hosts; candidate token validation against `GET /v1/boards/{token}` at ≤ 5 concurrent; best-effort logo enrichment from hosted board pages; empty Greenhouse boards hidden from public API listings and profiles until scraped; gated `discover-greenhouse` job added to `discover-weekly.yml`.

> **Implementation Note (Phase G4 - 2026-10-27)**:
> Phase G4 implemented: additive `source` and `externalId` exposed on Job DTOs with `ashbyId` marked deprecated; `source` and `boardUrl` exposed on Company DTOs; `source` facet count group added; `source=ashby|greenhouse` query filter supported in API and synced to UI `JobFiltersBar`; `SourceBadge` added to JobCard, JobDetailPanel, and CompanyHeader; all user-facing copy neutralized for multi-source ATS.

> **Implementation Note (Phase G2 - 2026-10-27)**:
> Phase G2 implemented: `AtsClient` interface and `AshbyAtsClient` adapter put in place, scraper core, cluster coordinator, and enrichment made source-agnostic with per-source adaptive limiters and `--sources`/`--slugs` flags, and Prisma schema updated with `@@unique([source, externalId])` on `Job` and `@@unique([source, atsToken])` on `Company`.

## Context
The Ashby Job Scraper (B.O.O.L.E.A.N) was originally designed around Ashby as its single Applicant Tracking System (ATS) source. Public job boards hosted on Greenhouse (`https://job-boards.greenhouse.io/{token}`) provide an unauthenticated, unpaginated REST API returning active job postings. Expanding the platform to ingest Greenhouse job postings alongside Ashby boards requires supporting multiple ATS providers without disrupting existing database queries, API contracts, cache generation publishing, or frontend components.

A naive single-step schema change adding `@@unique([source, externalId])` and `@@unique([source, atsToken])` causes Prisma 5.22 `prisma db push` to fail with exit code 1 (data loss abort), which would break the production daily scrape. Furthermore, company slug collisions between Ashby and Greenhouse boards could cause cross-source quarantine or job deactivation if namespaces overlap.

## Options Considered
1. **Replace `Company.slug` and `Job.ashbyId` with new composite keys across the entire stack**:
   Drop or rename existing columns to generic identifiers (`atsProvider`, `atsJobId`).
   *Rejected*: Destructive migration; breaks existing REST API contracts, raw SQL queries, Redis cache serializer keys, and forces synchronized redeployment of backend and frontend.

2. **Separate Databases or Tables per ATS**:
   Create dedicated `GreenhouseJob` and `GreenhouseCompany` tables.
   *Rejected*: Proliferates schema duplication, complicates cross-source search and filtering, prevents unified cache generations, and duplicates API endpoints.

3. **Additive Provenance Columns with Two-Step Unique Indexes, `gh--` Slug Namespacing, and Legacy Global Key Retention**:
   Introduce `enum Ats { ASHBY GREENHOUSE }`, additive columns `Company.source`, `Company.atsToken`, `Job.source`, and `Job.externalId`. Retain `Job.ashbyId` as the legacy non-null global key (e.g. `greenhouse:<id>`). Prefix Greenhouse company slugs with `gh--` (`/companies/gh--stripe`). Apply unique indexes via two-step migration (SQL unique index in G1, Prisma `@@unique` declaration in G2).

## Decision
Adopt Option 3 across a phased rollout (PRs G1–G6):

1. **Additive Schema & Two-Step Uniques**:
   - `enum Ats { ASHBY GREENHOUSE }` added to Prisma schema.
   - `Company`: `source Ats @default(ASHBY)`, `atsToken String?`, `@@index([source, status])`.
   - `Job`: `source Ats @default(ASHBY)`, `externalId String?`, `@@index([source, active, isListed, publishedAt(sort: Desc)])`.
   - G1 applies plain indexes and backfills existing rows with `source='ASHBY'`, `externalId=ashbyId`, `atsToken=slug`. Unique indexes `"Job_source_externalId_key"` and `"Company_source_atsToken_key"` are created via SQL outside transactions. G2 declares `@@unique` in Prisma schema with zero schema drift.

2. **Permanent Slug Namespacing (`gh--`)**:
   - Ashby company slugs remain unchanged (e.g. `deel`, `stripe`).
   - Greenhouse company slugs use the immutable prefix `gh--<token-lowercased>` (e.g. `gh--stripe`, `gh--airbnb`).
   - Ashby discovery and seed scripts strictly reject slugs with `--` (`isValidSlug`), preventing collisions. `DbClean` is restricted to `source='ASHBY'` to protect Greenhouse slugs from deletion.

3. **Legacy Global Key Retention (`ashbyId`)**:
   - `Job.ashbyId` remains the `NOT NULL @unique` primary lookup key across internal systems, cache serializers, and the API.
   - Ashby jobs keep their Ashby UUID. Greenhouse jobs use `greenhouse:<id>`.
   - `externalId` stores the native ATS string/numeric identifier.

4. **Adapter Boundary**:
   - Abstract ATS ingestion behind `AtsClient` interface.
   - `AshbyAtsClient` wraps existing logic unchanged (preserving BF-001, BF-015, BF-016).
   - New `GreenhouseClient` ingests `boards-api.greenhouse.io` payload.
   - Scraper core deactivation, stale checks, hashing, and quarantine remain source-agnostic, keyed by `legacyKey` (`ashbyId`).

5. **Freshness & Content Hash**:
   - Greenhouse `first_published` maps to `publishedAt` (UTC).
   - Freshness detection adheres to ADR-0018 (hash-detected `lastUpdatedAt`, `'detected'`). `metadata._normVersion` prevents normalizer bumps from triggering false updates.

6. **Unified Daily Pipeline**:
   - Both sources scrape within the single daily GitHub Actions workflow (`scrape-daily.yml`), generating a single atomic Upstash Redis generation swap.
   - Independent per-source rate limiters ensure a 429 on one ATS does not stall the other.

## Consequences
- Zero breaking changes to existing REST endpoints or frontend consumers in initial phases.
- Zero risk of `prisma db push` data loss abort in production.
- Guaranteed slug and job key isolation between Ashby and Greenhouse boards.
- Full backwards compatibility with all existing database queries, cache read-through logic, and telemetry reports.
