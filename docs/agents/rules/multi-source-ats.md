---
id: multi-source-ats
scope: backend
always: false
applies_to:
  - "backend/src/**"
  - "backend/prisma/**"
  - "frontend/src/**"
  - ".github/workflows/**"
description: "Multi-source ATS Invariants (ADR-0021, ADR-0022)"
---
# Multi-source ATS Invariants (ADR-0021, ADR-0022)
1. Sources come from one registry, `backend/src/lib/ats/source.ts` (`SUPPORTED_ATS_SOURCES`, `ATS_SOURCES`). Never hard-code source unions or slug prefixes elsewhere. `API_SOURCES` (backend) and `FILTER_SOURCES` (frontend) gate what the API and UI accept.
2. `Company.slug` is globally unique and permanent: Ashby = token, Greenhouse = `gh--<token>`, Lever = `lv--<sanitized token>`. `Job.ashbyId` is the legacy global key (`greenhouse:<id>`, `lever:<uuid>`). Uniques: `(source, externalId)`, `(source, atsToken)`.
3. Build board/job URLs from `atsToken` with `backend/src/lib/ats/urls.ts`, server-side only (`boardUrl` in DTOs). Never derive a token from a slug when `atsToken` exists. The frontend never builds ATS URLs.
4. Deactivation, quarantine and empty-board deferral are keyed by `companySlug` + legacy key. Scraping one source must never change another source's rows.
5. Existing telemetry message strings stay byte-identical (classifier fingerprints hash them); a new source's messages use `ATS_SOURCES[src].apiName`.
6. A new source ships disabled: `--sources` defaults to `ashby`; turned on only by a repo variable.
7. Schema: adding an enum value is safe; never add `@@unique` in the same `db push` as its new columns; never `--accept-data-loss`.
8. Clients are built eagerly only for `DEFAULT_CLIENT_SOURCES`; never construct clients by iterating `SUPPORTED_ATS_SOURCES`.
9. Lever: <= 1 request/s for the whole run (robots `Crawl-delay: 1`; pacer = 1000 ms x worker count, staggered start). Greenhouse <= 5 concurrent per worker. 404 is decided by HTTP status, never body text.
10. Lever site names are case-sensitive and may contain `.` and `&`: keep them exactly, URL-encode them; slugs come from `allocateCompanySlug`.
11. The Lever board cap is applied where companies are selected (`selectCompanies`, coordinator for `scrape:parallel`); each scraper stops starting Lever boards at `leverDeadlineMs` so the worker watchdog never blocks the publish.
12. Lever discovery uses Wayback CDX (Common Crawl is blocked by `jobs.lever.co`), keeps token case, seeds a site only when `validateSite` is `live` (API >= 1 posting **and** board page 200), and persists progress in `output/lever-discovery-state.json` (never printed). EU (`jobs.eu.lever.co`) is not supported yet.
13. Order of operations for any new enum value or source: deploy the backend that knows it **before** any script, discovery run or scrape writes it to the production database (17 Nov: Lever rows written before the deploy made `/v1/companies?sort=jobs` return 500). Never raise a source's request rate to speed a run up; change its cap or time budget.
14. Staged scrape: `--staged` scrapes one source per stage (ashby, greenhouse, lever). The Lever stage has its own deadline (`--lever-stage-min`, default 70) and `--lever-max-boards` accepts `all`; outside staged mode the 600-board cap and 11-min deadline still apply.
