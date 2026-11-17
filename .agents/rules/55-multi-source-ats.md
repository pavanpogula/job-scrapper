---
trigger: glob
globs: "backend/src/**, backend/prisma/**, frontend/src/**, .github/workflows/**"
description: "Multi-source ATS Invariants (ADR-0021, ADR-0022)"
---
<!-- GENERATED from docs/agents/rules/multi-source-ats.md - DO NOT EDIT DIRECTLY -->

# Multi-source ATS Invariants (ADR-0021, ADR-0022)
1. Sources come from one registry, `backend/src/lib/ats/source.ts` (`SUPPORTED_ATS_SOURCES`, `ATS_SOURCES`). Never hard-code source unions or slug prefixes elsewhere. `API_SOURCES` (backend) and `FILTER_SOURCES` (frontend) gate what the API and UI accept.
2. `Company.slug` is globally unique and permanent: Ashby = token, Greenhouse = `gh--<token>`, Lever = `lv--<sanitized token>`. `Job.ashbyId` is the legacy global key (`greenhouse:<id>`, `lever:<uuid>`). Uniques: `(source, externalId)`, `(source, atsToken)`.
3. Build board/job URLs from `atsToken` with `backend/src/lib/ats/urls.ts`, server-side only (`boardUrl` in DTOs). Never derive a token from a slug when `atsToken` exists. The frontend never builds ATS URLs.
4. Deactivation, quarantine and empty-board deferral are keyed by `companySlug` + legacy key. Scraping one source must never change another source's rows.
5. Existing telemetry message strings stay byte-identical (classifier fingerprints hash them); a new source's messages use `ATS_SOURCES[src].apiName`.
6. A new source ships disabled: `--sources` defaults to `ashby`; turned on only by a repo variable.
7. Schema: adding an enum value is safe; never add `@@unique` in the same `db push` as its new columns; never `--accept-data-loss`.
8. Clients are built eagerly only for `DEFAULT_CLIENT_SOURCES`; never construct clients by iterating `SUPPORTED_ATS_SOURCES`.
