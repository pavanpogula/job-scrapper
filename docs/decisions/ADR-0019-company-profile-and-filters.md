# ADR-0019: Company Profile Endpoint and Company / Posted-Within Job Filters

- Status: Accepted
- Date: 2026-10-27
- Deciders: owner, api-cache agent
- Related: ADR-0018, BF-020, BF-021, BF-022

## Context
The B.O.O.L.E.A.N web application requires dedicated company directory pages and enriched job filtering:
1. Company pages require a company profile endpoint returning metadata, active job count, salary availability, latest job posting timestamp, and facet breakdowns for top departments and locations.
2. Job browsing requires filtering by an exact company slug, seamlessly combining with full-text search (BF-020) and other existing criteria (workplace type, employment type, location, country, salary).
3. Job browsing requires filtering listings by posting recency (`postedWithin=1d|7d|30d`), evaluating against effective freshness `COALESCE(lastUpdatedAt, publishedAt) >= now - window` (leveraging ADR-0018 timestamps).
4. Company directory browsing requires sorting companies by active job volume (`sort=jobs|name`).
5. Owner decision O5 requires that `totalPages` in companies listings is always at least 1 (`Math.max(1, Math.ceil(total / pageSize))`) across both database and pre-rendered Redis Publisher paths, maintaining Cache Parity (BF-021).
6. Owner decision O14 requires that unknown routes under `/v1/*` return standard JSON 404 envelopes rather than default HTML error pages (BF-022).

## Options Considered
1. **Compute company profile on frontend from `/v1/jobs?company=slug` and `/v1/facets`**: Rejected because `/v1/facets` returns global facet counts across the entire corpus, not company-scoped counts, and fetching all jobs for a company to calculate facets client-side is inefficient and bandwidth-heavy.
2. **Pre-render company profiles in Upstash Redis (`jc:v1:company:*`)**: Rejected because pre-rendering profiles for thousands of companies would inflate Redis memory usage and scrape publish duration. Serving through `ReadThroughService.serveView` as an uncacheable DB view with edge CDN caching (`s-maxage=300`) delivers sub-millisecond cached responses at the edge with zero Redis footprint.
3. **Database query backed by Prisma relations and `ReadThroughService`**: Implement `queryCompanyProfile` in `queries.ts`, querying Prisma for active job counts, salary availability, latest publishedAt, and top 10 departments and locations by job count. Mount `GET /v1/companies/:slug` with edge caching matching `/v1/companies`.

## Decision
Adopt Option 3:
1. **Endpoint `GET /v1/companies/:slug`**: Returns `CompanyProfileDTO` (`slug`, `name`, `logoUrl`, `jobCount`, `withSalary`, `latestPublishedAt`, `workplaceTypes`, `employmentTypes`, `departments` [top 10], `locations` [top 10]). Validates slug against `/^[a-z0-9-]{1,100}$/` and requires company `status === 'ACTIVE'`; returns 404 `{ "error": "Company not found" }` otherwise.
2. **`GET /v1/jobs?company=<slug>`**: Exact company slug filter combining with all search tokens and filters. Sets `isCacheableView: false` in cache key parsing.
3. **`GET /v1/jobs?postedWithin=1d|7d|30d`**: Filters jobs where `COALESCE(lastUpdatedAt, publishedAt) >= now - window`. Unknown values are safely ignored. Sets `isCacheableView: false`.
4. **`GET /v1/companies?sort=jobs|name`**: Default `name` (alphabetical). `sort=jobs` orders by `_count.jobs DESC`, then `name ASC`, then `slug ASC`.
5. **Owner Decision O5 (BF-021)**: Ensure `totalPages = Math.max(1, Math.ceil(total / limit))` in both `queryCompanies` and `publishCacheGeneration`.
6. **Owner Decision O14 (BF-022)**: Mount a catch-all middleware on `/v1` returning JSON 404 `{ "error": "Not found" }`.

## Consequences
- Enables full Company Profile page and company-filtered job searches in the frontend.
- Zero extra memory overhead in Redis; edge CDN caches active profiles for 5 minutes (`s-maxage=300, stale-while-revalidate=3600`).
- Contract fixtures guarantee API parity and deterministic serialization across frontend and backend.
