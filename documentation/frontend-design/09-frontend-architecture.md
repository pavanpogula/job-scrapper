# 09 · Frontend Architecture

> **Status:** DESIGN ONLY. Nothing here is implemented; no `web/` folder exists yet. Snippets are illustrative (types, key
> lists, folder trees), not runnable project files. _Authored 2026-10-22._
> Inputs: [00](./00-brief-and-index.md), [01](./01-research-and-references.md), [02](./02-tech-stack-and-hosting.md),
> [03](./03-personas-and-use-cases.md), [04](./04-information-architecture-and-flows.md),
> [05](./05-screens-and-states.md), [08](./08-api-contract-proposal.md).
> **Plug-in points reserved for 06 (visual direction / design tokens) and 07 (Figma build spec):** both were being written
> concurrently and were not read. Everything visual is routed through the token layer (section 9) and the component layer
> (section 8), so 06/07 can land without changing this architecture. Where 06/07 may rename things, only the files named
> in section 9.3 change.
> Versions below come from 02 (npm registry, 2026-10-22). The implementer re-runs `npm view` before pinning (roadmap P0-06).
> Evidence labels as in 02: **[DOCS]**, **[NPM]**, **[UNVERIFIED]** (must be checked by a spike before relying on it).

---

## 1. Decisions and reconciliations

The UX docs (03/04/05), research (01/02) and the API proposal (08) disagree in several places. Each resolution is a
numbered **Decision**. Those that change or constrain the API are mirrored in 08 section 10 (column "API impact").

| # | Conflict (sources) | Decision | Rationale | API impact |
|---|---|---|---|---|
| D-01 | **Indexing of paginated and filtered URLs.** 04 3.6: every `page>=2` and every filtered URL is `noindex, follow`. 01 2.11: index `?page=n` with self-canonical; filters canonical to `/jobs`. | **Hybrid, 04-led.** (a) `/` clean and `/?page=1` normalised to `/`: `index, follow`, self canonical, in sitemap. (b) Unfiltered `/?page=2..N`: `noindex, follow`, **self canonical** (never canonical to page 1, per Google's pagination guidance in 01), **not** in sitemap, **not** disallowed in robots.txt (so the noindex stays readable and links stay crawlable for no-JS users). (c) Any URL carrying `q`, `sort`, `size`, `company`, `department`, `location`, `remote`, `salary`, `type`, `posted`: **robots.txt Disallow** (crawl-budget control, Google's faceted-navigation advice in 01 2.3) **plus** `noindex, follow` meta and self canonical as a backstop for bots that ignore robots.txt or reach the URL via a link. (d) `/companies` clean = index; `/companies?page>=2` = noindex,follow; `/companies/{slug}` clean = index; with any param = disallowed + noindex. | Crawl budget: with about 34,035 jobs at 25 per page there are about 1,362 unstable list pages; the ordering changes with every scrape, so page N content drifts and duplicates job cards that are already indexable on their own URL. Jobs are reachable through the sitemap (feed in 08 add A-10) and from company pages, so list pages are not needed for discovery. Free-tier invocations (02 4.3) are the scarcest resource. Caveat recorded: Google has said long-lived `noindex,follow` pages may eventually be treated as `noindex,nofollow`; this is acceptable because discovery does not depend on list pages. Canonical to self (not to `/`) on noindex pages avoids contradictory signals (01 suggested canonical to unfiltered). Revisit trigger: Search Console shows unindexed jobs that are in the sitemap (then make pages 2-3 indexable). | Sitemap feed (A-10) |
| D-02 | **Browse path.** 01 says `/jobs`; 04 says `/`. | Browse is `/`. `/jobs/{id}/{slug}` is detail only. `/jobs` (no id) 308-redirects to `/`. | 04 is the IA owner; one canonical home avoids duplicate list URLs. | none |
| D-03 | **Rendering strategy.** 02 recommends Next.js SSR/ISR; 05 1.7 left the no-JS fallback conditional. | Next.js 16 App Router, server-rendered. **No-JS read path is a requirement, not a stretch**: Browse/Company/Directory render results, chips, pagination and Apply as plain HTML; search, facets and sort are one `<form method="get">`; the "Apply filters" and "Update" buttons are visible by default and hidden once JS adds `html.js`. No `<noscript>` "needs JavaScript" message is shipped. Section 4.2 lists exactly what is server vs client rendered. | HTML-first is the point of choosing SSR (SEO, phones, link previews); keeping the GET form costs little because the URL schema already is the state. | none |
| D-04 | **Data-fetching boundary.** 02/09: Server Components first, TanStack Query optional; 04 5.5 wants an in-memory cache of the last 20 result sets for Back. | **Server Components fetch everything the page needs** (list, facets, meta, detail, company). Client navigation (`router.push` + transition) re-renders on the server. **TanStack Query is not installed in v1.** Three tiny client fetches (live count, suggest, facet-values search) use a small `useAbortableFetch` hook against **same-origin Route Handlers** (a BFF), never the API directly. Back/Forward instant paint comes from the Next client Router Cache and bfcache; do not build a second result cache. | Less JS (about 13 KB gz not shipped), one caching layer (server), no CORS dependency (08 principle 4 / 00 A4 relaxed), API URL stays private. Revisit if a fourth client-fetch use case appears. | CORS no longer required in v1 |
| D-05 | **Caching vs scrape cadence.** 08 5: dataset changes only per scrape (likely daily), CDN TTLs 10-30 min; 02: short explicit lifetimes. | Two layers: (1) Next **Data Cache** on every API `fetch` with `revalidate` + tags (list/facets 300 s, job 3,600 s, company 1,800 s, meta 900 s, sitemap feed 3,600 s) and (2) **on-demand revalidation**: `POST /api/revalidate` (shared secret) called by the scraper's post-run step calls `revalidateTag('catalog')`. Job detail and static pages are **ISR** (`revalidate = 3600`, `generateStaticParams` returns `[]`, `dynamicParams = true`). List routes are dynamic (they read `searchParams`) but cheap because their API calls are cached. **No CDN caching of dynamic HTML in v1** (it could freeze an inline error page, section 4.4); measure first (spike S2). | Aligns the UI's freshness with the real update event while keeping a time-based safety net if the hook is never wired. | Scraper hook is an owner decision (Q-04), not an API change |
| D-06 | **`cacheComponents` / `partialPrefetching`.** 02 5.1 lists both as `true`. | **Default v1 = classic App Router caching (`cacheComponents` off).** Spike S1 compares both on a preview deploy; switch only if (a) job detail still returns a real 404 status for unknown ids and (b) list pages stay correct with `searchParams`. | With streaming under Suspense the HTTP status is committed before data resolves, so `notFound()` inside a deferred boundary yields 200 + noindex (the soft-404 risk 01 warns about). Job detail must `await` its data before the first flush; classic ISR does that by construction. [UNVERIFIED for 16.4; hence the spike.] | none |
| D-07 | **API down at request time.** Not specified in 02/04/05 beyond inline errors. | Cached data keeps serving (Data Cache keeps the last good entry when a background revalidation fails). Cold miss + API failure: the route's `error.tsx` (client) renders the recoverable inline error in the results region with **HTTP 500, uncached**, header/footer/search remain; "Try again" calls `reset()` + `router.refresh()`. Layout-level reads (meta for the footer/subline) are wrapped to fail soft (render nothing). Static pages (About, Privacy, 404) never depend on the API. Details in 4.4 and 17. | A failure page must not be cacheable and must not poison ISR. | none |
| D-08 | **Expired job (410) vs HTTP semantics.** 04 3.6/9.4: 404/410 semantics, noindex. 08: API returns 410 with `extensions.company`. 05 3.5: show title and company. Next pages cannot set a 410. | Unknown id: `notFound()` => **404**. Known-closed job (API 410): **404** status with the `ExpiredState` content, produced by `notFound()` and a segment `not-found.tsx` that re-reads the (memoised) job lookup via a request header set by `proxy.ts`. If spike S1 shows this is not feasible, fallback = HTTP 200 + `noindex` + absent from sitemap, accepted soft-404 risk (R-05). Either way the page has no Apply control and `noindex`. | Search engines treat 404 and 410 alike for removal; showing the title and company is a UX requirement (UC-14). | 410 body must carry job title (A-08) |
| D-09 | **Job URL id.** 04 3.1: `{id}` = `Job.ashbyId`. 08: path `/v1/jobs/{id}` uses `Job.id` (uuid); lists expose only `id`. | URL id = the API's `id` (`Job.id`). Rows are never deleted by the scraper, so it is stable. `/jobs/{id}` alone 308-redirects to `/jobs/{id}/{slug}`; a wrong slug 308-redirects to the canonical slug. | One id across list, detail, sitemap, URL; no extra field needed. 04's "Ashby id is stable" benefit is already provided by `Job.id`. | none (04 wording amended) |
| D-10 | **Param vocabulary.** 04 URL: `remote=1&salary=1&type=FullTime&posted=24h&sort=salary&company=slug&size=50`. 08 API: `remote=true&hasSalary=true&employmentType=FULL_TIME&postedWithin=1d&sort=salary_desc&pageSize=50`. | **The browser URL keeps 04's vocabulary** (short, human, already specced). One module (`url-state/api-query.ts`) maps URL state to API query and back (table in 5.4). 08 is not renamed. | The two vocabularies serve different audiences; the mapping is a pure, fully tested function. | none |
| D-11 | **Page size.** 04: 25/50/100, default 25. 08: `pageSize` max 50, default 20. | UI keeps 25/50/100 and **always sends `pageSize` explicitly**. 08 must raise the `/v1/jobs` maximum to 100 (add A-01). If the owner refuses, drop the 100 option (UI constant `PAGE_SIZES`). | 04 is a deliberate UX choice (power users scanning). | A-01 |
| D-12 | **Fallback date label.** 08 8.1 suggests "Seen {x} ago" from `firstSeenAt` on cards when `postedAt` is null; 05 1.1/1.3 and 01 5 forbid substituting first-seen. | **05 wins:** cards show no age when `postedAt` is null. Detail shows "Listing last checked {date}" (freshness, not posting date). Sorting and the Posted filter still use the server's effective date (08 `sortDate`), and the Posted helper text discloses it. | Honesty rule (no fake freshness). | 08 8.1 sample VM to be amended (C-08) |
| D-13 | **Suggestions popup in v1?** 01 2.4: v1 = plain search input, no popup. 03 UC-02/04 4: combobox with grouped suggestions. | Build in two steps: **Phase 2 ships `SearchInput`** (debounced commit to URL, no popup). **Phase 4 adds `SearchCombobox`** (ARIA 1.2, React Aria Components) behind the capability flag `supports.suggest`; absent/failing endpoint => plain input remains. | Keeps Phase 2 shippable without `/v1/suggest`; matches 08 8.4 capability flags and 04's "suggest failing is silent". | none (uses existing `/v1/suggest`, `types=company,department,location`, `limit=3`) |
| D-14 | **Outbound `rel`.** 01 2.8: `noopener noreferrer`. 04 8 / 03 UC-09: `noopener nofollow`, deliberately no `noreferrer`. | **`rel="noopener nofollow"`**, `target="_blank"`, site-wide `Referrer-Policy: strict-origin-when-cross-origin` (origin only is sent to Ashby). Description links add `ugc`. Privacy copy in 05 7 already states this. | 04 is the later, reasoned decision and matches the Privacy page. | none |
| D-15 | **`JobPosting` JSON-LD gate.** 04 3.7: only when `postedAt` and valid `applyUrl`. 01 2.11: also requires a real `description` and org name. | **Union (stricter):** emit only if job active **and** `postedAt` present **and** non-empty plain description present **and** company display name present **and** `applyUrl` valid. `directApply: false`. `baseSalary` only if numeric bounds, currency and `interval` known and the salary is visible on the page. Never invent `validThrough`/`datePosted`. Enabled immediately: 99.94% of active jobs have full descriptions and `publishedAt`, and 99.0% of active companies have enriched display names. | Google's content policies (visible-match, required fields). | none |
| D-16 | **Mock/live switch naming.** 02: `API_MODE=mock\|live`. 08 8.4: `mock\|proposal\|owner`. | `API_MODE=mock\|live` (server) plus `API_ADAPTER=proposal\|owner` (live only, default `proposal`). | Orthogonal concerns: where data comes from vs which wire shape. | none |
| D-17 | **Where the app lives.** 00 A1: `web/` or new repo. | **`web/` folder in this repo**, own `package.json` and lockfile, **no npm workspaces**. Reasons and root-repo hygiene tasks in section 2. | Contract and docs live beside the backend; root `tsc`/ESLint/Jest are already path-scoped (`src/`, `tests/`). One exception found: `scripts/GenerateDocs.ts` scans every `.ts` file and must be told to skip `web/` (roadmap P0-05). | none |
| D-18 | **URL-state library.** 02 D8: nuqs. | **Own pure-TS codec (Zod)**, no nuqs in v1. | The codec must run on the server, in the BFF, in the sitemap code and in tests, and must implement 04's canonical rules (repeat keys, alphabetical order, default-stripping, notices, clamping, push-vs-replace policy) that a hook does not provide. Reversible: nuqs can be a thin client binding later. | none |
| D-19 | **Count-only and facet-values.** 03/04/05 need them (R03-3, R04-3, R04-5, R05-7); 08 has neither. | UI is built against the proposed additions A-03/A-04 and degrades through capability flags: no count endpoint => the Show-N button reads "Show results" (no number); no facet-values endpoint => facet search filters the top-50 list client-side and "Show more" ends at the loaded list. | 08 8.4 already prescribes capability flags. | A-03, A-04 |
| D-20 | **Logos.** 02 4.4: plain `<img>`, no optimiser. | Plain `<img>` with `alt=""`, fixed size, `loading="lazy"`, `decoding="async"`, `referrerpolicy="no-referrer"`, monogram rendered **underneath** (so a failed image shows the monogram with no JS). CSP `img-src 'self' https: data:`. The privacy page discloses that logos load from the companies' own hosts. | Zero image-transformation cost; no client JS for fallback. Privacy trade-off recorded (R-10). | none |
| D-21 | **Analytics.** 02 D16, 03 6. | **None in v1.** No analytics env var or script slot is created. Adding any requires a new decision and a Privacy page change first. | Hard constraint 1. | none |
| D-22 | **Package manager / runtime.** 02 silent on manager. | **npm** (matches the repo root and both hosts' defaults), `package-lock.json` committed, exact version pins, Node 24 LTS (`.nvmrc` = `24`, `engines.node >= 24`), **TypeScript 6.0.x pinned** (02 D5). | Consistency; fewer moving parts. | none |
| D-23 | **Theme without flash and without inline script.** 05/06: no flash; CSP. | A tiny same-origin blocking script `/init.js` (about 300 bytes; sets `data-theme` from `localStorage` in try/catch and adds the `js` class) in `<head>`, no inline script, so CSP does not need a per-request nonce (a nonce would force every page dynamic). | Keeps ISR pages cacheable and dark mode flash-free. | none |
| D-24 | **Time display.** 05 1.3: hydration-safe relative dates. | Relative labels are computed **on the server only** from the render time (UTC day granularity), never recomputed on the client; `<time datetime>` carries the exact value; absolute dates use `Intl.DateTimeFormat` with `timeZone: 'UTC'`. | No hydration mismatch; ISR pages show absolute dates anyway. | none |

---

## 2. Project location, layout and deployment of a subfolder

### 2.1 Recommendation: `web/` inside this repository

| Option | Pros | Cons |
|---|---|---|
| **`web/` in this repo (chosen)** | Contract (`openapi.yaml`), docs and the scraper that triggers revalidation live together; one issue tracker; 02 D17; both hosts support a root/base directory; the future API (if built in this repo under `src/`) can share the OpenAPI file | Repo-root rules in `AGENTS.md` (docs sync, commit rule) also apply; root tooling must ignore `web/` |
| Separate repo | Clean history, own CI and AGENTS.md, no coupling to the scraper's rules | Contract drift between repos; two places to update docs; extra Git remote for the owner |

Verified in this repo (read-only, 2026-10-22): root `tsconfig.json` has `include: ["src/**/*"]`; root `npm run lint` is
`eslint src/`; `jest.config.js` has `roots: ['<rootDir>/tests']`. So `web/` is **already outside** root `tsc`, ESLint and
Jest. The one coupling: `scripts/GenerateDocs.ts` walks the whole tree for `.ts` files with `EXCLUDED_DIRS = [node_modules,
dist, .git, docs, output, .vscode, apikeys]` and would pick up `web/**` (and `web/.next`). Task **P0-05** adds `web` to that
list and records the web/ rules in `AGENTS.md`.

Rules for the folder:
- Own `package.json`, own `package-lock.json`, own `node_modules`. **No workspaces** (hoisting would drag the scraper's
  Prisma/ioredis into web installs and break host install steps).
- Root `.gitignore` additions: `web/.next/`, `web/node_modules/`, `web/.env*.local`, `web/playwright-report/`,
  `web/test-results/`, `web/.lighthouseci/`. `web/.env.example` (names only) **is** committed.
- GitHub Actions live at the repo root (`.github/workflows/web-*.yml`) with `paths: ['web/**']` filters and
  `defaults.run.working-directory: web`.
- Never read, print or commit the root `.env`, `output/` or `apikeys/` (AGENTS.md). The web app has its own env file
  conventions (section 22) and never needs the root `.env`.

### 2.2 How the hosts deploy a subfolder

- **Vercel (primary):** Project Settings -> **Root Directory = `web`**. Framework preset Next.js, Install `npm ci`, Build
  `npm run build`, Output left blank, Node 24.x. Optional "Ignored Build Step" so scraper-only commits do not redeploy:
  `git diff --quiet HEAD^ HEAD -- .` run from `web` (exit 0 = skip; exact setting semantics **[UNVERIFIED]**, 02 5.3).
  Hobby limit: repo must be owned by a personal account, not an organisation (02 4.2); this repo is.
- **Netlify (fallback):** `netlify.toml` with `[build] base = "web"`, `command = "npm run build"`, `publish = ".next"`;
  runtime handles SSR/ISR (02 5.4; adapter requirements for Next 16 **[UNVERIFIED]**, spike S1).
- Everything host-specific is confined to `vercel.json` (optional) and `netlify.toml`. Headers, redirects and the
  preview `noindex` rule live in `next.config.ts` so the app behaves the same on both.

### 2.3 Versions (from 02; re-verify at P0-06)

Node 24 LTS; TypeScript 6.0.x (exact, e.g. 6.0.3); `next` 16.4.x; `react`/`react-dom` 19.3.x; React Compiler
`babel-plugin-react-compiler` 1.0.0 (exact); `tailwindcss` 4.3.x; `zod` 4.6.x; `vitest` 5.0.x; `@playwright/test` 1.64.x;
`@axe-core/playwright` 4.14.x; `msw` 3.0.x (tests only); `eslint` 10.13 + `typescript-eslint` 8.72 +
`eslint-plugin-react-hooks` 7.1 + `eslint-plugin-jsx-a11y`; `react-aria-components` 1.22 (combobox only, Phase 4);
`sanitize-html` (server-only description sanitising; version at install time); `openapi-typescript` (types only);
`ajv` + `ajv-formats` (contract tests; must support JSON Schema 2020-12 for OpenAPI 3.1); `@lhci/cli` (Lighthouse CI);
`@next/bundle-analyzer` (dev). shadcn/ui CLI is used once to copy primitives (Radix vs Base UI default **[UNVERIFIED]**,
choose consciously at P1-04).

---

## 3. Folder structure (`web/`)

```
web/
  .nvmrc                       24
  package.json                 exact pins, scripts (section 20), engines
  package-lock.json
  next.config.ts               headers (CSP etc.), redirects, reactCompiler, images.unoptimized, poweredByHeader:false
  tsconfig.json                strict, noUncheckedIndexedAccess, paths "@/*" -> src/*
  eslint.config.mjs            flat config (section 20)
  postcss.config.mjs
  vitest.config.ts   playwright.config.ts   lighthouserc.json   size-limit config (or budgets.json)
  components.json              shadcn config (only if shadcn is used)
  netlify.toml                 fallback host
  vercel.json                  optional
  .env.example                 names only (section 22)
  contracts/
    openapi.yaml               extracted from 08 section 7 + additions; source of truth for types and mocks
  public/
    init.js                    theme + "js" class, same-origin, no inline script (D-23)
    og-default.png             one static 1200x630 share image (06 supplies art)
    fonts/                     only if fonts are self-hosted manually; otherwise next/font handles it
  scripts/
    generate-api-types.ts      openapi-typescript -> src/api/generated/types.ts
    check-fixtures.ts          validates generated fixtures against openapi.yaml
  src/
    app/                       ROUTES ONLY: thin files that compose features (section 4)
      layout.tsx  globals.css  not-found.tsx  error.tsx  global-error.tsx  robots.ts
      (browse)/page.tsx                         "/"
      jobs/[id]/[[...slug]]/page.tsx  not-found.tsx
      companies/page.tsx
      companies/[slug]/page.tsx  not-found.tsx
      about/page.tsx   privacy/page.tsx
      sitemap.xml/route.ts  sitemaps/jobs/[n]/route.ts  sitemaps/companies/route.ts
      api/count/route.ts  api/suggest/route.ts  api/facet-values/route.ts  api/revalidate/route.ts
    proxy.ts                   (Next 16 name for middleware) canonical-URL redirects, x-pathname header; no API calls
    api/                       DATA ACCESS LAYER, framework-agnostic pure TS (section 6)
      client.ts                typed fetch wrapper: base URL, timeout, retry, caching hints, Problem parsing
      transport.ts             Transport interface; live (fetch) and mock (in-process) implementations
      schemas.ts               Zod schemas for every response (checked against generated types)
      errors.ts                NotFoundError, GoneError, RateLimitedError, ValidationError, UpstreamError, NetworkError
      endpoints.ts             getJobs, getJob, getCompanies, getCompany, getFacets, getCount, getFacetValues, suggest, getMeta, getSitemapFeed
      adapters/                proposal/ (identity) and owner/ (maps owner's shapes to proposal types), capabilities.ts
      generated/types.ts       generated; never edited by hand
    domain/                    VIEW-MODELS and pure formatters (section 6.4); no React, no fetch
      job-card.ts  job-detail.ts  company.ts  facets.ts
      format/ salary.ts  posted.ts  company-name.ts  location.ts  count.ts  slug.ts
    url-state/                 URL <-> state codec (section 5); no React
      schema.ts  parse.ts  serialize.ts  canonical.ts  api-query.ts  notices.ts  robots-rules.ts
    mocks/                     MOCK API (section 6.6); imported only when API_MODE=mock and by tests
      db.ts  handlers.ts  scenarios.ts  generator/  golden.json  msw.ts
    features/                  feature modules (section 8)
      browse/   job/   company/   companies/   static/
        components/  server + client components specific to the feature
        data.ts      server-only loaders (compose api/ + domain/)
        hooks/       client hooks
    components/
      ui/                      primitives (Button, Badge, Skeleton, Switch, Checkbox, Radio, Select, ExternalLink, VisuallyHidden, ...)
      patterns/                composites reused across features (Pagination, FacetGroup, EmptyState, InlineError, Notice, Breadcrumb, CompanyLogo, SiteHeader, Footer, SkipLinks)
      a11y/                    LiveRegion, FocusOnMount, useAnnounce, useFocusReturn, VisuallyHidden helpers
    lib/                       cross-cutting helpers: env.ts (Zod-validated env), cache.ts (TTL constants + tags), seo/ (metadata, json-ld, sitemap), security/ (csp, sanitize-html), logger.ts
    styles/
      tokens.css               <-- 06 PLUG-IN: semantic CSS custom properties (light/dark/forced-colors)
      theme.css                Tailwind @theme mapping of tokens
      base.css  print.css
  tests/
    unit/  component/  contract/  e2e/  a11y/  visual/  fixtures/
  .github -> (workflows are at repo root: .github/workflows/web-ci.yml, web-lighthouse.yml)
```

| Folder | Purpose and rule |
|---|---|
| `src/app` | Routing, metadata exports, and composition only. No fetch logic, no business rules, no formatting. Max about 60 lines per file. |
| `src/api` | The only code that knows the wire format. Pure TS, no React, no `next/*` imports, so a later move to another framework only rewrites `app/` and `features/`. Imported by server code only (`import 'server-only'` in `endpoints.ts`). |
| `src/domain` | Turns API DTOs into view-models and strings (05 1.1-1.5 rules live here). 100 % unit-testable. |
| `src/url-state` | Single source of truth for URL parsing, validation, canonicalisation and API-query mapping. Imported by server and client. |
| `src/mocks` | Mock database, scenario presets, handlers, fixture generator. Excluded from production bundles by dynamic import under `API_MODE=mock`. |
| `src/features/*` | Vertical slices. A feature may import `components/*`, `domain`, `url-state`, `lib`; features never import each other (shared things move to `components/patterns`). |
| `src/components/ui` | Token-driven primitives with no knowledge of jobs. |
| `src/components/patterns` | Composites that know product concepts but are reused by several screens. |
| `src/styles` | The only place where 06 plugs in (tokens) and where Tailwind is configured. |
| `tests/*` | Mirrors layers; E2E and a11y never import app internals except fixtures. |

Import direction (enforced by ESLint `no-restricted-imports` / `eslint-plugin-boundaries`-style config):
`app -> features -> components -> domain/url-state/lib -> api`. `api` imports nothing from the rest.

---

## 4. Rendering and routing

### 4.1 Routing map

"Dyn" = dynamic per request (reads `searchParams`); "ISR" = prerendered on first request then revalidated; "SSG" = static.
Data columns refer to endpoints in 08. TTLs are the Data Cache `revalidate` seconds from `lib/cache.ts` (tunable).

| Route | Rendering | Data (08 endpoints) | Cache | SEO |
|---|---|---|---|---|
| `/` Browse | Dyn, streamed: list first, facets and meta in their own `Suspense` | `GET /v1/jobs`, `GET /v1/facets`, `GET /v1/meta` | list 300 s, facets 300 s, meta 900 s, tag `catalog`; no CDN HTML cache | D-01: clean/page 1 `index`; page>=2 `noindex,follow`; any filter param `noindex,follow` + robots Disallow; title patterns per 04 11 |
| `/jobs/[id]/[[...slug]]` | **ISR** (`revalidate=3600`, `dynamicParams`, `generateStaticParams -> []`); awaits data before first flush (no `loading.tsx`) | `GET /v1/jobs/{id}` (+ company strip count from payload) | 3,600 s, tag `catalog` + `job:{id}` | active: `index`, self canonical slugged URL, JSON-LD if D-15 passes; 404 unknown; expired D-08 `noindex`; wrong/missing slug 308 |
| `/companies` | Dyn | `GET /v1/companies`, `GET /v1/meta` | 1,800 s | clean `index`; `page>=2` `noindex,follow`; `q`/`size` disallowed + noindex |
| `/companies/[slug]` | Dyn (reads `searchParams`) | `GET /v1/companies/{slug}`, `GET /v1/jobs?company=slug`, `GET /v1/facets?company=slug` | 1,800 s company, 300 s list/facets | clean `index` self canonical; any param `noindex,follow` + Disallow; unknown slug 404 |
| `/about`, `/privacy` | SSG | none (privacy host name from env constant) | static | `index` |
| `/sitemap.xml` (index) and `/sitemaps/jobs/{n}.xml`, `/sitemaps/companies.xml` | Route Handlers, `revalidate=3600` | `GET /v1/feed/sitemap` (add A-10) and `GET /v1/companies` | 3,600 s | 10,000 URLs per file (04 3.7); `lastmod` = `updatedAt` |
| `/robots.txt` | `app/robots.ts` static | none | static | rules in 13.3 |
| `/api/count`, `/api/suggest`, `/api/facet-values` | Route Handlers (GET), same-origin BFF | `GET /v1/jobs/count` (A-03), `GET /v1/suggest`, `GET /v1/facets/{name}/values` (A-04) | response `Cache-Control: public, s-maxage=300, stale-while-revalidate=600` keyed by canonical query; robots-disallowed (`/api/`) | none |
| `/api/revalidate` | Route Handler POST | none | `no-store` | none; requires `REVALIDATE_SECRET` header |
| any other path | `not-found.tsx` | none | static | 404 + `noindex` |
| runtime failure | `error.tsx` / `global-error.tsx` | none | not cached | 500 + `noindex` |

Redirects (`proxy.ts` and `next.config.ts`): `/jobs` -> `/` (308); `/jobs/{id}` -> slugged URL (308, needs data, so done in the page with `permanentRedirect`); trailing slashes stripped; non-canonical query forms of `/`, `/companies`, `/companies/{slug}` -> canonical form (308) when only ordering/defaults differ (D-01/5.3).

### 4.2 What is server-rendered and what is client-rendered (settles 05 1.7)

| Piece | Where | Why |
|---|---|---|
| Job list, cards, summary line, zero-results block | **Server component** | Core content; HTML-first; no list code in the bundle |
| Facets (groups, options, counts) | **Server component**, inside the single `<form method="get">` | Server has counts; works without JS |
| Active filter chips and "Clear all" | **Server component rendering `<a>` links** (remove = link to URL without that value) | No-JS removal; progressive. Deviates from 05 11's "button" wording while keeping the accessible name "Department: Engineering. Remove filter." |
| Pagination | **Server component**, real `<a href>` links; `PaginationJump` and `PageSizeSelect` are small client islands that fall back to GET submit | Crawlable and no-JS |
| Search input | Server-rendered `<input type="search">` inside the form; **client enhancement** `SearchInput` (debounce, push/replace policy, clear button) | Works as a GET form without JS |
| Sort select | Server-rendered `<select>` in the form; client enhancement submits on change | |
| Filter panel behaviour (desktop immediate apply, below-desktop overlay, draft + live "Show N jobs") | **Client controller** `FilterPanelController` around the server-rendered form (section 8.4) | Interaction-only logic |
| Suggestions combobox | Client (Phase 4) | |
| Live region, theme toggle, copy-link, sticky apply bar, back link, notices (dismiss), focus manager | Client islands | Browser-only APIs |
| Job detail, company header, About, Privacy | Server | |
| Description HTML | Server (sanitised at render, section 16.3) | No sanitiser in the client bundle |

Without JS: search/facet/sort are submitted by the visible "Apply filters"/"Update" buttons; mobile filters appear inside a
`<details>` "Filters" disclosure above the results (the same form DOM, restyled by `html:not(.js)` CSS); everything else is
links. `<noscript>` shows nothing extra because nothing is lost.

### 4.3 Data-fetching boundaries

- Pages `await` loaders from `features/*/data.ts` (server-only). Loaders call `api/endpoints.ts`, then `domain/*` to produce
  view-models. Components receive view-models, never DTOs.
- Browse issues `getJobs` and `getFacets` **in parallel** (08 3.5: never block the list on facets). `getFacets` and `getMeta` are in
  separate `Suspense` boundaries with skeletons; `getJobs` is awaited in the page so the first flush already contains cards
  (LCP target = first card title).
- Client navigations: filter changes call `router.push(canonicalUrl, { scroll: false })` inside `startTransition`; pending UI
  (dim list, skeleton after 100 ms) is driven by `useTransition`/`useLinkStatus`-style state (exact API verified in
  Next 16.4 docs at P2-02).
- Request memoisation: loaders are wrapped in React `cache()` so `generateMetadata` and the page share one API call.

### 4.4 Failure behaviour (API down at request time)

| Situation | Behaviour |
|---|---|
| Warm Data Cache, API healthy | normal |
| Warm cache, API down | cached entries keep serving (revalidation failure leaves last good entry); `dataUpdatedAt` is shown, so staleness is honest |
| Cold cache, API 5xx/timeout (after one retry, 08 4) | segment `error.tsx` => inline error (05 2.4 copy), HTTP 500, uncached; `Try again` = `reset()` + `router.refresh()` |
| 429 | SSR waits at most 1 s for `Retry-After`; otherwise renders the 429 copy; client "Try again" respects `retryAfterSeconds` |
| 400 (bad params) | cannot normally happen because the codec validates first; if it does: log, reset the offending param, render with the invalid-params notice |
| Detail 404 / 410 | D-08 |
| Meta/facets fail | soft-fail: subline and footer date omitted; facets show an inline retry in the sidebar; list unaffected |
| `API_MODE=live` but `API_BASE_URL` missing | build/boot fails fast via `lib/env.ts` Zod validation |

HTML for an error render is never cached by the CDN (D-05), and ISR keeps the previous good page if regeneration throws.

---

## 5. URL-state strategy

### 5.1 Principles

1. The URL is the only source of truth for search, facets, sort, page, size (04 3.4). UI controls are views of it.
2. One module owns the rules: `src/url-state`. Pages, the BFF, the sitemap/robots helper, metadata and tests all call it.
3. Parse is **total**: any garbage input yields a valid state plus a list of notices; it never throws.
4. Serialise is **canonical**: one view equals one string (04 3.3).

### 5.2 Param schema (exact, from 04 3.2)

| Key | Zod shape (illustrative) | Notes |
|---|---|---|
| `q` | `string`, trim, collapse whitespace, strip control chars, truncate 100; `< 2 chars => undefined` | case preserved |
| `company` | `string[]`, each `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`, max 50 chars, max 10; invalid entries dropped with notice | not parsed on `/companies/[slug]` |
| `department` | `string[]`, each max 100, max 10, exact case | |
| `location` | `string[]`, each max 120, max 10 | repeat keys, never comma-joined |
| `remote` | `'1'` only | else ignored |
| `salary` | `'1'` only | else ignored |
| `type` | `enum FullTime, PartTime, Contract, Intern, Temporary, Other` | `Other` added because 08 emits `OTHER` (C-14); unknown => drop + notice |
| `posted` | `enum 24h, 7d, 30d` | else drop + notice |
| `sort` | `enum relevance, newest, salary, company` | `relevance` without `q` => `newest`; default stripped |
| `page` | positive int; invalid => 1; `> totalPages` => clamp + notice (needs total; applied after fetch) | `1` stripped |
| `size` | `25 \| 50 \| 100`, else 25 | `25` stripped |

Directory params: `q`, `page`, `size` only (default size 50 on `/companies`, per 05 5).

```ts
// illustrative shape only
type BrowseState = {
  q?: string; company: string[]; department: string[]; location: string[];
  remote: boolean; salary: boolean; type: EmploymentTypeParam[]; posted?: '24h'|'7d'|'30d';
  sort: 'relevance'|'newest'|'salary'|'company'; page: number; size: 25|50|100;
};
type ParseResult = { state: BrowseState; notices: Notice[]; canonicalSearch: string; isCanonical: boolean };
```

### 5.3 Parse, validate, canonicalise

Functions (all pure): `parseBrowse(searchParams, ctx)`, `serializeBrowse(state)`, `canonicalize(url)`, `toApiQuery(state)`,
`fromApiAppliedFilters(echo)` (for tests), `indexability(state, path)` (returns robots meta + whether disallowed, used by metadata and the robots/sitemap
tests).

Canonical rules (04 3.3): drop unknown keys and defaults; keys alphabetical; multi values alphabetical; `%20` output, `+`
accepted on input; one trailing `?` never emitted.

Handling non-canonical input, **server side**:
- **Only ordering/default/unknown-key differences** (no semantic loss): `permanentRedirect` (308) to the canonical form.
  Crawlers and shared links converge; no notice needed.
- **Invalid or dropped values** (needs a notice) or **page out of range**: render the page with the notice (`role="status"`,
  dismissible, 04 3.5), canonical `<link>` points at the cleaned form, and a small client effect does `history.replaceState` to
  the cleaned URL once hydrated (04: "replace", no extra history entry). No redirect, because the notice must survive and no
  cookie/flash storage is allowed.

Client policy for history (04 3.5), implemented in `useBrowseNavigation`: discrete actions `push`; typing in search
`push` on first debounced commit of a focus session and `replace` afterwards; Enter/choosing a suggestion `push` if the value
changed; canonicalisation/clamping `replace`.

### 5.4 URL state to API query mapping (single table, D-10)

| URL (04) | API (08) |
|---|---|
| `q` | `q` |
| `company` x N | `company` x N |
| `department` x N | `department` x N |
| `location` x N | `location` x N |
| `remote=1` | `remote=true` |
| `salary=1` | `hasSalary=true` |
| `type=FullTime` | `employmentType=FULL_TIME` (`PartTime->PART_TIME`, `Contract->CONTRACT`, `Intern->INTERN`, `Temporary->TEMPORARY`, `Other->OTHER`) |
| `posted=24h/7d/30d` | `postedWithin=1d/7d/30d` |
| `sort=newest/relevance/salary/company` | `sort=newest/relevance/salary_desc/company_asc` |
| `page`, `size` | `page`, `pageSize` (always sent; `includeTotal=true`) |
| (company page) path slug | `company={slug}` fixed, plus any `department`/`location` etc. |

The reverse map is used by tests and by `appliedFilters` echo checks. The same function builds the BFF query so the
count/suggest/facet-values handlers never accept free-form pass-through (they parse with the codec and re-serialise, which also
bounds cache-key cardinality and blocks parameter smuggling).

---

## 6. Data layer

### 6.1 Layers

```
Route/feature loader -> domain (view-models) -> api/endpoints -> api/client (Zod, errors, retry) -> Transport
                                                                              |-- live:  fetch(API_BASE_URL)
                                                                              `-- mock:  in-process handlers (mocks/)
```

### 6.2 API client behaviour

- `Transport` is `(request: Request) => Promise<Response>`. `live` uses `fetch` with Next's `next: { revalidate, tags }`
  hints; `mock` calls the handler functions directly (no network, no service worker, works in SSR).
- Timeout 4 s (`API_TIMEOUT_MS`), one retry on network error/502/503/504 with 300 ms jitter; 429 handled per 4.4.
  Requests are `GET` with **no custom headers** (08 principle 4 simple-request rule; also avoids CORS preflight if a browser
  call is ever used).
- Every response is parsed with Zod (`schemas.ts`); a parse failure becomes `UpstreamError` with the offending path, logged
  with the API `requestId`. Unknown fields are ignored (08 principle 3).
- Problem bodies (RFC 9457) parse into typed errors using `code` (A-09) and fall back to the `type` URL slug.

### 6.3 Error mapping (08 section 4 to UI)

| Wire | Typed error | UI treatment (05) |
|---|---|---|
| network/timeout | `NetworkError` | inline error "Could not load jobs / Check your connection"; offline variant if `navigator.onLine === false` (client) |
| 400 `validation-error`, `offset-too-deep`, `cursor-mismatch`, `sort-requires-q` | `ValidationError(fields)` | reset offending param, invalid-params notice; never a blank page |
| 404 `job-not-found` / `company-not-found` | `NotFoundError(kind)` | 404 variants (05 3.5, 4.2) |
| 410 `job-closed` | `GoneError(job)` | `ExpiredState` (D-08) |
| 429 | `RateLimitedError(retryAfterSeconds)` | 05 2.4 429 copy with seconds |
| 500/502/503/504 | `UpstreamError(requestId)` | "Something went wrong on our side"; show `Reference: {requestId}` when present (05 9) |

### 6.4 Adapters and view-models

`domain/` holds the only translation from DTO to what components render (05 1.1-1.5, 08 8.1):
`toJobCardVM(dto, now)` -> `{ id, href, title, companyName, companyInitial, logo, locationLabel, remoteBadge, departmentLabel, employmentLabel, salary: {label, ariaLabel}|null, posted: {label, iso, absolute}|null, srSummary }`.
Rules implemented there and unit-tested with the worst-case rows from 08 8.2: company display name = `name ?? prettify(slug)`;
suppress the Remote badge if location text equals "Remote"; omit absent segments with no placeholders; salary formatting per
05 1.2 (interval from `salary.interval`, never guessed; a salary with only `summary` and no numeric bounds does not occur per
08 2.1); posted label per 05 1.3 and only from `postedAt` (D-12); title slug (lowercase ASCII, max 80); facet labels (company
label falls back to prettified slug); employment display names.
`toJobDetailVM`, `toCompanyVM`, `toFacetsVM` follow the same pattern. Components never import `api/generated/types`.

`adapters/owner/` is empty until the owner supplies endpoints; it must return **proposal-typed** objects (08 8.4) and a
`capabilities` object (`supports: { facets, suggest, cursor, count, facetValues, remoteFilter, salaryFilter, postedWithin, companyList, description }`)
that drives which controls render.

### 6.5 `API_MODE` switch

`lib/env.ts` validates env with Zod at boot. `API_MODE=mock` (default until the backend exists) selects the in-process
transport and the scenario from `MOCK_SCENARIO`; `API_MODE=live` requires `API_BASE_URL`. The mock code is loaded with a
dynamic `import()` guarded by the env check so it is tree-shaken from live builds. Preview deployments default to `mock`
until Phase 5.

### 6.6 Mock layer and keeping it contract-valid

- **One mock "database" module** (`mocks/db.ts`) implements filtering, disjunctive faceting, sorting with `id` tiebreak,
  offset and cursor pagination, count/relax, facet-values, suggest, meta, and the 404/410/429/5xx behaviours. It is the
  executable reference for 08 3.x semantics.
- **Handlers are plain `(Request) => Response` functions** (`mocks/handlers.ts`). They are used three ways: the mock
  transport (SSR, previews, Playwright), MSW 3 `http.get(...)` wrappers (`mocks/msw.ts`, Vitest and optional browser
  debugging), and the contract tests. MSW is therefore a **test-time** dependency; no service worker ships (the browser never
  calls the API, D-04).
- **Fixture generator** (`mocks/generator`): seeded RNG, generates **in memory at server start** (5,000 rows, about
  milliseconds), so no 5 MB JSON is committed. Distributions copied from 08 8.2 (40 % salary, 20-25 % null `postedAt` assigned per
  company, 60 % un-enriched companies, long tail of about 1,500 locations, 2 % titles over 100 chars, `descriptionHtml` null by
  default with a second set that has sanitised HTML and a 100 KB monster). Committed: the generator and
  `mocks/golden.json` (about 60 hand-picked edge-case rows, including all-nulls, accents/CJK, unbroken 80-char token, equal
  min/max salary, hourly/monthly salary, min>max). `MOCK_NOW` pins "now" for deterministic E2E and snapshots.
- **Scenarios** (08 8.2): `normal`, `empty`, `slow`, `flaky`, `ratelimited`, `allNulls`, `huge`; selected by `MOCK_SCENARIO`
  and, in tests, per request via a header the live code never sends (the mock transport only).
- **Contract validity chain:**
  1. `contracts/openapi.yaml` is the source of truth (extracted from 08 7 plus additions A-01..A-12).
  2. `npm run contract:types` generates `src/api/generated/types.ts` (CI fails if it differs from the committed file).
  3. `schemas.ts` Zod schemas are declared as `z.ZodType<components['schemas']['JobListItem']>` etc., so a drift between Zod and
     OpenAPI is a **compile error**.
  4. `tests/contract/mock-conformance.test.ts` runs every mock endpoint x scenario through Ajv (JSON Schema 2020-12) against the
     OpenAPI response schemas (including Problem bodies and headers like `Retry-After`).
  5. `tests/contract/fixtures.test.ts` validates the generated 5,000 rows and `golden.json`.
  6. Phase 5: the same suite runs against the live/staging API with sampled URLs (08 8.3 provider verification).

---

## 7. State management

| State | Owner | Mechanism |
|---|---|---|
| Server data (jobs, facets, company, meta) | Server | Server Components + Data Cache; no client store |
| Search, filters, sort, page, size | URL | `url-state` codec; read on server from `searchParams`, on client via `useSearchParams` |
| Facet group open/closed, "Show more", facet search text | Component `useState` | not in URL (04 3.4) |
| Mobile filter draft (unapplied changes) | The uncontrolled `<form>` DOM (read via `FormData`) | no store; cancel = close without submit |
| Live count in the filter panel | Local state in `FilterPanelController` | `useAbortableFetch('/api/count?...')` debounced 150 ms |
| Pending navigation | `useTransition` | dims list, drives skeleton |
| Announcements | `LiveRegion` context (`announce(message)`) | single instance, settled-state debounce |
| Last-opened card for focus return | module-level in-memory map (canonical URL -> job id) | lost on reload (accepted) |
| "Arrived from our list" for the Back link | module-level flag set on in-app navigation | not storage |
| Theme | `localStorage` (try/catch) + `data-theme` | only persisted preference (04 3.4) |

**No global store** (no Redux/Zustand/Context for data). Justification test: every candidate state is either URL, server, or
leaf-local; revisit only if two distant components must share non-URL, non-server state.

---

## 8. Component architecture

### 8.1 Layers and naming

- **Primitives (`components/ui`)**: no product vocabulary; consume tokens only; examples Button, Badge, Skeleton, Checkbox,
  Switch (checkbox with `role="switch"` and text state), Radio, NativeSelect, ExternalLink, VisuallyHidden.
- **Patterns (`components/patterns`)**: product-aware, reused: Pagination, FacetGroup, FacetOption, FilterChip, ChipBar,
  EmptyState, InlineError, Notice, Breadcrumb, CompanyLogo, SiteHeader, SkipLinks, Footer, SummaryLine.
- **Feature modules (`features/*`)**: screen assembly and feature-only parts (JobCard, ResultsToolbar, FilterPanelController,
  SearchInput, ApplyButton, StickyApplyBar, DescriptionBlock, CompanyHeader, CompanyRow).
- Naming: components `PascalCase.tsx`, one exported component per file, folder names `kebab-case`, hooks `useThing.ts`, tests
  colocated as `Thing.test.tsx`, server-only files import `'server-only'`, client files start with `'use client'` and are
  as small as possible (leaf islands).
- Variants via `cva`-style maps keyed by semantic props (`kind`, `size`), never by colour names.

### 8.2 Mapping from the 05 section 11 inventory

| 05 component | Layer / path | S/C | Notes |
|---|---|---|---|
| SiteHeader, SkipLinks, Footer | `patterns/` | S (ThemeToggle C) | Footer "Last updated" read in a soft-fail `Suspense` |
| ThemeToggle | `patterns/` | C | name "Theme: system. Change theme" |
| Button, Badge, Skeleton primitives, ToggleSwitch | `ui/` | S | busy state via `aria-busy` |
| ExternalLink | `ui/` | S | always appends visually hidden "(opens in a new tab)", `rel="noopener nofollow"` (+`ugc` in descriptions) |
| SearchCombobox | `features/browse/` | C | Phase 4; `SearchInput` is the Phase 2 form |
| FilterSidebar / FilterDialog | `features/browse/FilterPanel` (server form) + `FilterPanelController` (client) | S+C | 8.4 |
| FacetGroup, FacetOption | `patterns/` | S (FacetSearch C) | `fieldset`/`legend`, counts in accessible name |
| FilterChip, ChipBar | `patterns/` | S | links; collapse to "+N more" after 6 via `<details>` |
| ResultsToolbar, SortSelect, CopyLinkButton | `features/browse/` | S (+C islands) | |
| JobCard, JobCardSkeleton | `features/browse/` | S | stretched-link pattern, one tab stop, `aria-describedby` summary, `content-visibility:auto` + intrinsic size |
| CompanyLogo | `patterns/` | S | monogram under image (D-20) |
| SalaryText, PostedAge, SummaryLine | `domain/format` + `patterns/` | S | pure formatters |
| Pagination, PageSizeSelect | `patterns/` | S (+C jump) | section 11 |
| LiveRegion | `components/a11y` | C | mounted once in root layout |
| Notice, EmptyState, InlineError, FullPageError/NotFound | `patterns/` + `app/*` | mixed | InlineError markup S, retry C |
| Breadcrumb, BackLink | `patterns/` / `features/job` | S / C | BackLink needs in-app-arrival flag |
| JobHeader, FactList, TrustNote, ApplyButton | `features/job/` | S | ApplyButton is a link, not a button |
| StickyApplyBar | `features/job/` | C | IntersectionObserver; `aria-hidden` while main button visible |
| DescriptionBlock | `features/job/` | S | sanitiser 16.3 |
| CompanyHeader, CompanyRow | `features/company/`, `features/companies/` | S | |

### 8.3 Token plug-in (06/07)

Components reference **semantic tokens only** (never hex, px literals for colour/spacing/type). Required token groups
(architecture contract; 06 supplies values and may add more): colour roles (`surface`, `surface-raised`, `surface-tint`,
`text`, `text-muted`, `border`, `border-strong`, `accent`, `accent-text`, `focus-ring`, `danger`, `mark-bg`, `mark-text`,
`monogram-1..6`), spacing scale, radius, type scale (`--text-*` with line-height and tracking), font families, motion
(`--duration-*`, `--ease-*`), elevation, z-index layers, `--size-target-touch` (44px) and `--size-target-min` (24px),
`--sticky-offset` (header/toolbar height for `scroll-margin`/`scroll-padding`), breakpoints (`640`, `1024`, content max
`1200`, sidebar `280`, detail rail `320`, measure `68ch`). Light, dark and `forced-colors` values must exist for every colour
role.

### 8.4 The single-DOM filter panel (D-03 consequence)

The facets form is rendered **once** on the server. CSS presents it as: sidebar (desktop), inline `<details>` (no JS), or
a full-screen overlay (JS, below desktop). `FilterPanelController` (client) adds, below desktop: open/close button state,
`role="dialog"` + `aria-modal` + label on open, `inert` on header/main/footer siblings, focus trap (small utility), Esc closes
and **discards** the draft (form `reset()` to URL-derived defaults), focus returns to the opener. Inputs use `defaultChecked`
with a `key` derived from `name:value:checkedInUrl` so only inputs whose URL state changed remount. Desktop: `change` events
debounced 150 ms submit the form via the codec (`router.push`). Below desktop: `change` only updates the draft and the live
count; the sticky button submits. Alternative if spike S5 finds a11y problems: render a second, client-only Radix/shadcn
Dialog containing a re-rendered copy of the facets (costs duplicated payload).

---

## 9. Styling and token wiring

1. **Tailwind CSS 4** (CSS-first config). `styles/theme.css` maps tokens into Tailwind's `@theme` (colours, spacing, radii,
   fonts, breakpoints) so utilities such as `bg-surface text-text-muted` resolve to CSS variables.
2. **`styles/tokens.css` is the 06 plug-in file.** Semantic custom properties declared on `:root`, overridden under
   `[data-theme="dark"]` and `@media (prefers-color-scheme: dark)` for `:root:not([data-theme="light"])`, and under
   `@media (forced-colors: active)`. 06's token export (and 07's Figma variables) are transcribed or generated into this
   one file. If 06 uses different names, only `tokens.css` and `theme.css` change (section 8.3 names are the contract).
3. Theme selection: `prefers-color-scheme` by default; `data-theme` set by `/init.js` from `localStorage` (D-23) so the first
   paint is correct. `color-scheme` set per theme so native controls follow.
4. No CSS-in-JS runtime. Component styles = Tailwind utilities + small `@layer components` rules for patterns that need
   selectors (e.g. the single-DOM panel modes, `html:not(.js)` fallbacks, print).
5. `styles/print.css`: hides header, footer, filters, pagination, Apply bar; prints the Apply URL as text on detail (05 3.6).
6. Reduced motion: a global `@media (prefers-reduced-motion: reduce)` rule zeroes `--duration-*` and disables the skeleton pulse.
7. Fonts via `next/font/local` or `next/font/google` (self-hosted at build, no runtime third-party request), one variable
   family, `font-display: swap`, a metric-matched fallback (`size-adjust`) so swap causes no layout shift; the exact family
   comes from 06.
8. shadcn/ui is a **copy-in source** for primitives (Dialog is not needed because of 8.4; Collapsible/Checkbox/Switch maybe);
   restyle every copied component to tokens immediately and delete unused ones.

---

## 10. Forms and accessibility utilities

- All inputs are native elements with visible `<label>`s; no placeholder-only labels (05 2.1). The page is a
  `search` landmark (`<search>` element or `role="search"` labelled "Job search") wrapping the GET form.
- `components/a11y`: `LiveRegion` (one `role="status" aria-live="polite" aria-atomic="true"`, never announces on first load,
  clears then sets text in a `requestAnimationFrame` so identical consecutive messages re-announce); `FocusOnMount`
  (focus an `h1`/`h2` with `tabindex="-1"` on route-type change, 04 11); `useFocusReturn` (restore focus to opener / last card);
  `VisuallyHidden`; `useAbortableFetch`; `useReducedMotion`; `useMediaQuery` (SSR-safe, defaults to mobile).
- Error `role="alert"` is rendered once at mount in `InlineError`; it does not use the live region (05 2.6).
- Card accessible name pattern: title link + `aria-describedby` pointing to a visually hidden `srSummary` (05 1.1).
- `scroll-padding-top`/`bottom` on `html` from `--sticky-offset` so focused elements are not obscured (WCAG 2.2 2.4.11).
- Keyboard map from 05 2.6 is implemented in one `useBrowseShortcuts` hook (`/` focuses search unless in a text field).
- ESLint `jsx-a11y` strict, axe in component tests (`vitest-axe`-style matcher) and E2E (`@axe-core/playwright`).

---

## 11. Pagination implementation notes

- Markup per 04 5.3: `<nav aria-label="Pagination">`, list of real anchors built by a pure `buildPageWindow(current, total)`
  (unit-tested for the 7-slot rules and the "ellipsis never hides one page" rule), `aria-current="page"`, disabled ends as
  `aria-disabled` text removed from tab order. Mobile compact variant is CSS-switched (same DOM: Previous, number input,
  "of N", Next) to avoid duplicate controls.
- Links are built with `serializeBrowse({...state, page})`; `page=1` is stripped. `maxResultWindow` (A-02, default constant
  10,000 until supplied) caps the last page; the note "You can browse the first 10,000 results..." renders under the control.
- **After a page change** (client navigation, not initial load, not Back): `ResultsAnnouncer` (client, rendered inside the
  results region with the settled summary as props) (1) moves focus to the results heading (`h2 tabindex="-1"`), (2) scrolls
  it into view with `scroll-margin-top: var(--sticky-offset)` (instant), (3) calls `announce("Page 13 of 49. Showing
  301-325 of 1,204 jobs.")` **once**. It decides "initial load vs navigation vs Back" via a module flag toggled in a
  `popstate` listener.
- **Back/Forward:** Next restores scroll for history navigation and serves the client Router Cache entry **[verify exact
  staleness behaviour in 16.4 docs, P2-09]**; `ResultsAnnouncer` instead focuses the remembered card (04 5.5, UC-11) and does
  not announce. Revalidation that changes ids must not move the viewport (render new cards with `content-visibility` intrinsic
  size to keep CLS at zero).
- Clicks on a page link while a navigation to the same target is pending are ignored (`aria-busy` on the nav).
- Page-size change: select in a tiny form (`method="get"`), JS enhancement submits on change; resets page to 1 by
  construction (codec drops `page`).
- Out-of-range page: render the clamped last page with the notice (5.3).
- Link prefetch: card and pagination links use `prefetch={false}` with an explicit hover/focus `router.prefetch` helper that
  is disabled when `navigator.connection.saveData` or on slow connections; never prefetch outbound Apply links (04 10). Exact
  `Link` prefetch semantics verified at P2-08 **[UNVERIFIED]**.

---

## 12. Images and logos

`CompanyLogo` renders a fixed-size box (36/40/64 px per 05 1.1/4) containing the monogram (letter on a neutral tile, colour
chosen by hashing the slug into the six `monogram-*` tokens that meet 4.5:1) and, on top, `<img src={logoUrl} alt="" width
height loading="lazy" decoding="async" referrerpolicy="no-referrer">` when `logoUrl` is an `https:` URL. Failed images
render nothing (empty `alt`), so the monogram shows through. `next/image` is **not** used and `images.unoptimized: true`
(02 D15). The static `og-default.png` is the only image asset in `public/` besides icons from 06. Logo hosts are arbitrary
(CSP `img-src https:`); the Privacy page discloses this.

---

## 13. SEO implementation

### 13.1 Metadata
- `generateMetadata` per route using the cached loaders (React `cache()`), producing title patterns from 04 11, description,
  `alternates.canonical = SITE_URL + canonical path+query`, `robots` from `indexability()`, Open Graph (`og:title`,
  `og:description`, `og:url`, `og:type=website`/`article` not used, `og:image` = static default), Twitter `summary_large_image`.
- Browse title when filtered: "Remote Engineering jobs, 1,204 results | {Site}" (04 11); description generated from the
  same facts, no marketing copy.
- Preview deployments send `X-Robots-Tag: noindex, nofollow` via `next.config.ts` when `SITE_ENV !== 'production'`.
- Per-job dynamic OG images are **deferred** (cost unknown on Hobby; link previews work with text tags and the static image).

### 13.2 Canonical rules
Every page emits a self-referencing canonical built by `serializeBrowse` (noindex pages included, D-01). Job canonical is the
slugged URL. No canonical to a different path.

### 13.3 robots.txt (generated by `app/robots.ts`)

```
User-agent: *
Allow: /
Disallow: /api/
Disallow: /*?q=        Disallow: /*&q=
(same pair for: sort, size, company, department, location, remote, salary, type, posted)
Sitemap: {SITE_URL}/sitemap.xml
```
`page` is intentionally **not** disallowed (D-01). A unit test asserts that for every URL class in 04 3.6 the robots rule and
the meta robots agree with `indexability()`. When `SITE_ENV !== 'production'`, robots.txt is `Disallow: /`.

### 13.4 Sitemap
`/sitemap.xml` is an index; children are `/sitemaps/jobs/{n}.xml` (10,000 URLs each, 04 3.7; about 4 for 34 k jobs) and
`/sitemaps/companies.xml`; plus static URLs in the index's first child. Jobs come from the sitemap feed (A-10: `id`, `title`,
`companySlug`, `updatedAt`, active only) so slugs can be built without N detail calls; `lastmod = updatedAt`. Cached 3,600 s
and tagged `catalog`. Inactive/expired jobs never appear (Google policy, 01 2.11).

### 13.5 JSON-LD
Only per D-15, rendered as `<script type="application/ld+json">` with the JSON serialised via `JSON.stringify` and `<`
replaced by `<`. Mapping: `title`, `description` (sanitised plain/HTML), `datePosted = postedAt`, `hiringOrganization.name`
(+ `sameAs` board URL), `jobLocation` or `applicantLocationRequirements`+`jobLocationType: TELECOMMUTE` when remote,
`employmentType`, `baseSalary` (conditions in D-15), `directApply: false`, `identifier = id`. A Vitest test asserts the
**negative** cases (no description, no `postedAt`, inactive => no JSON-LD). Rich Results Test is a manual launch-checklist
item; Google may still not surface an aggregator (01 2.11), so no SEO promise is made.

### 13.6 Other
`<html lang="en">`; `hreflang` none; breadcrumb structured data omitted in v1; favicon/manifest from 06.

---

## 14. Performance budget

Targets are from 03 section 5 (lab: mid-range phone profile, Slow 4G throttle, Lighthouse CI) and are **assertions in CI**.

| Metric | Target | Hard fail |
|---|---|---|
| LCP (Browse, Job detail) | <= 2.0 s goal | > 2.5 s |
| INP (filter click, page change) | <= 150 ms goal | > 200 ms |
| CLS | <= 0.05 | > 0.1 |
| TTFB (cache hit, Browse) | <= 600 ms | > 800 ms |
| Total blocking time (lab proxy for INP) | <= 200 ms | > 300 ms |

**JS budget (gzip, first load incl. framework).** 03 gave a design goal under 150 KB for Browse. Framework baseline is not
yet measured; spike S3 builds an empty Next 16.4 + React 19.3 app and records it. Provisional budgets, then re-baselined and
enforced via `size-limit`/Lighthouse budgets:

| Route | Budget (gz, first-load JS) | Notes |
|---|---|---|
| `/` Browse | <= 170 KB hard, 150 KB goal | route-specific code <= 40 KB; no combobox in this chunk (loaded lazily on first focus, Phase 4) |
| `/jobs/[id]` | <= 140 KB | no client form code; StickyApplyBar tiny |
| `/companies*` | <= 150 KB | |
| static pages | <= 110 KB | |
| CSS (all) | <= 25 KB gz | |

Rules: Server Components for all list/detail rendering; client islands are leaves; no date library (use `Intl`); no icon
library (inline SVG sprites for about 6 icons); `react-aria-components` only in the lazily imported combobox chunk;
React Compiler on; fonts: one variable family, preloaded `woff2`, `font-display: swap`; `Suspense` boundaries so facets/meta
never delay the first card; skeleton heights fixed (112 px card) and `content-visibility:auto` with `contain-intrinsic-size`
for cards; no layout-affecting late content (reserve space for logo, toolbar, summary); `loading="lazy"` for logos; no
third-party requests; hover/focus-only prefetch (section 11).

CI gates: Lighthouse CI (mobile preset, 3 runs median) asserting performance >= 0.9, LCP/CLS/TBT thresholds above on `/`,
a mid-page URL (`/?page=3`), a job, a company, `/about`; bundle gate fails the PR when a route exceeds its budget.

---

## 15. Privacy

- No cookies set by the app (verify in E2E: `context.cookies()` is empty after every route). No third-party scripts, fonts
  or analytics (D-21). `localStorage` holds only the theme (try/catch everywhere; page renders without it).
- Searches travel in the URL to our server and, via the BFF, to the API as GET; the app logs route patterns and statuses, **not
  query strings** (section 18). Hosts keep their own request logs; the Privacy page says so (05 7).
- Apply: plain outbound link, no redirect, no tracking parameter, `Referrer-Policy: strict-origin-when-cross-origin` (origin
  only reaches Ashby).
- Company logos load from the companies' hosts (their servers see the visitor IP); disclosed; option to proxy/cache later
  (owner Q in 08 section 9 item 8).
- Next.js telemetry disabled in CI/dev (`NEXT_TELEMETRY_DISABLED=1`); Lighthouse CI uploads to the filesystem, not public storage.

---

## 16. Security

### 16.1 Headers (set in `next.config.ts` `headers()`, host-agnostic)
`Content-Security-Policy` (below), `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), browsing-topics=()`,
`Cross-Origin-Opener-Policy: same-origin`, `Strict-Transport-Security: max-age=63072000; includeSubDomains` (production
custom domain only), `poweredByHeader: false`.

```
default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';
img-src 'self' https: data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none';
base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests
```
`'unsafe-inline'` for scripts is required by Next's inline hydration payload unless nonces are used; nonces force dynamic
rendering of every page and defeat ISR (D-23). Mitigations: no third-party scripts, no user HTML (descriptions sanitised
server-side), all JSON-LD escaped. `'unsafe-eval'` allowed in dev only. Roll out as `Content-Security-Policy-Report-Only`
in the first preview, then enforce. Risk R-09.

### 16.2 Outbound links and URLs
`applyUrl`, `boardUrl`, description links: validated `http(s)` only (anything else treated as missing), `target="_blank"`,
`rel="noopener nofollow"` (+`ugc` in descriptions), host shown beside Apply (04 8).

### 16.3 Description HTML
Never rendered raw. Server-side `sanitize-html` with allowlist: `p, br, ul, ol, li, strong, em, b, i, a[href https only], h1-h4, blockquote, code`;
headings shifted down so they sit under the page `h2` (h1->h3, h2->h4, h3->h5, h4->h6); strip images, inline styles, classes,
event handlers; links get the `rel`/`target` above; input capped at 100 KB (matches 08 2.3). Runs in the Server Component,
so the sanitiser is not in any client bundle. Unit tests include script/iframe/`javascript:`/`data:` payloads.

### 16.4 Secrets and server boundaries
No secrets in client code: only `NEXT_PUBLIC_SITE_URL` is public. `API_BASE_URL`, `REVALIDATE_SECRET` are read in
server-only modules guarded by `server-only`. The BFF handlers accept only whitelisted, codec-parsed params and cap response
sizes; `/api/revalidate` checks a constant-time secret comparison and only calls `revalidateTag`. Rate limiting is the host's
and the API's; handlers add no state.

---

## 17. Error and empty handling patterns

| Pattern | Implementation |
|---|---|
| Zero results (filtered) | `EmptyState` with chips, "Remove X to see N jobs" buttons (from `/api/count?relax=...` when available; without it, plain "Remove X" links), "Clear all filters"; live "No jobs found." |
| Zero results (no filters, empty db) | 05 2.4 copy; scenario `empty` in mock |
| Company with zero jobs | 05 4.2 copy (not the filter-recovery pattern) |
| Recoverable data error | `InlineError` in the affected region; keeps previous good data above the error on client page-change failures |
| Route-level failure | `error.tsx` (segment) and `global-error.tsx` (root) using 05 section 9 copy, `Reference:` from `requestId` |
| Not found | `not-found.tsx` per 05 8; job and company variants per 05 3.5 / 4.2 |
| Invalid params / clamped page | `Notice` (role=status, dismissible), URL cleaned with `replaceState` (5.3) |
| Offline | client detects `navigator.onLine === false` and swaps the network-error copy |
| Slow | skeleton after 100 ms; "Still loading" line after 5 s; hard failure at 20 s (05 2.5) |
| Suggest/count/facet-values failure | silent degradation (04 4); count button falls back to "Show results" |

---

## 18. Observability without tracking

- Error boundaries (`error.tsx`, `global-error.tsx`) are the only client-side error surface; no beacon in v1.
- Server: a small `logger.ts` emits one structured JSON line per API failure and per unhandled render error: route pattern
  (e.g. `/jobs/[id]`), upstream status, duration, API `requestId`, build id. **Never** the query string, IP or user agent.
  Host logs (Vercel keeps about 1 hour on Hobby, 02 4.2) are the only retention; for longer retention an optional
  self-hosted, Sentry-free sink can be added later by owner decision.
- Health: the deployed site exposes nothing extra; operators watch API `/v1/health` separately. A synthetic E2E smoke test
  (Playwright against production, read-only, 1 request per route) can run on a schedule in GitHub Actions (optional).
- Field Web Vitals: only public CrUX data (03 5); no RUM script.

---

## 19. Testing strategy

| Layer | Tooling | What it proves | Gate |
|---|---|---|---|
| Unit | Vitest 5 | `url-state` (property-style round trips: parse(serialize(x)) = x, canonical idempotence, garbage never throws, 04 3.2 table row by row), `api-query` mapping, formatters (salary table 05 1.2, posted table 05 1.3, company-name, slug, page-window), error mapping, JSON-LD negative cases, sanitiser payloads, robots/indexability matrix vs 04 3.6 | required, coverage on `domain`, `url-state`, `api` >= 90 % lines |
| Component | Vitest + Testing Library (+ axe matcher) | JobCard omission rules and a11y name, Pagination markup and keyboard, FacetGroup, FilterChip links, InlineError, StickyApplyBar, LiveRegion once-only announcements, FilterPanelController focus trap/discard | required |
| Contract | Vitest + Ajv vs `contracts/openapi.yaml` | mock responses (all scenarios), generated fixtures and `golden.json` conform; generated types are fresh; Zod/OpenAPI compile-time link | required; Phase 5 adds live-API smoke contract job |
| E2E | Playwright 1.64 against `next build && next start` with `API_MODE=mock`, `MOCK_NOW` fixed | UC-01..UC-21 flows (traceability in 10), Back/Forward fidelity, share-link fidelity, invalid params, zero results, expired job, error + retry, 429, sitemap and robots output, no cookies | required |
| E2E projects | `desktop-chromium` (1280), `mobile-chromium` (Pixel-class 390 viewport, touch), `webkit-mobile` smoke, `nojs` (`javaScriptEnabled: false`: search, filter via submit, paginate, open job, Apply link href) | viewport and JS-off coverage | required (webkit smoke on main only) |
| Keyboard-only | Playwright scripts using only `keyboard` | UC-17 tab order from 05 2.6, Esc/focus return in filter panel, focus lands on results heading after paging, chip removal focus rules | required |
| A11y | `@axe-core/playwright` on every route and every state in 05's matrices (loading skeleton, zero, error, expired, filter panel open, dark mode, forced colors emulation) | zero serious/critical violations | required; manual NVDA/VoiceOver scripts are in the launch checklist (10) |
| Visual regression | Playwright `toHaveScreenshot` on Linux CI only, mock `golden` scenario, light+dark, 3 breakpoints, 0.1 % pixel tolerance | unintended visual drift once 06 stabilises | **optional**, enable in Phase 4 |
| Performance | Lighthouse CI + bundle size gate | section 14 budgets | required from Phase 2 |
| Security | CSP report-only check in preview (manual), `npm audit --omit=dev` in CI (non-blocking warning), header assertions in E2E | headers present | required for headers |

Test data: scenarios from 08 8.2 plus `golden.json`; E2E never calls a real API until Phase 5.

---

## 20. Lint, format, type-check

- **TypeScript 6.0.x pinned**; `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` (try; drop if it fights
  generated types), `noImplicitOverride`, `verbatimModuleSyntax`, path alias `@/*`. Optional non-blocking CI step runs TS 7 `tsc`
  (02 1.1).
- **ESLint 10 flat config:** `typescript-eslint` (type-aware), `eslint-plugin-react-hooks` (recommended + React Compiler
  rules), `eslint-plugin-jsx-a11y` (strict), Next's ESLint plugin config, import boundaries (section 3), `no-restricted-syntax`
  banning `dangerouslySetInnerHTML` outside `lib/seo/json-ld.tsx` and `features/job/DescriptionBlock.tsx`, ban of `localStorage`
  outside `components/patterns/ThemeToggle` and `public/init.js`, ban of `fetch` outside `src/api` and the three client
  hooks.
- **Format:** Prettier-free option: Biome 2 for formatting only (02 D12) or Prettier; default **Biome format-only** to keep
  one fast tool, ESLint for lint. `npm run format:check` in CI.
- Scripts (names are the contract used in 10): `dev`, `build`, `start`, `lint`, `typecheck`, `format:check`, `test`
  (unit+component), `test:contract`, `test:e2e`, `test:a11y`, `test:visual`, `lhci`, `size`, `contract:types`,
  `fixtures:check`, `verify` (= lint + typecheck + test + test:contract + build).
- Pre-commit hooks are optional and not required (CI is the gate).

---

## 21. CI/CD

- **GitHub Actions** (repo root, path-filtered to `web/**` and `contracts/**`), Node 24, `npm ci`, npm cache, concurrency
  cancel-in-progress, minimal `permissions: contents: read`, third-party actions pinned to full SHAs:
  1. `web-ci.yml` jobs: `static` (lint, typecheck, format:check, contract:types freshness) -> `unit` (test, test:contract) ->
     `build` (with `API_MODE=mock`, bundle gate `size`) -> `e2e` (Playwright, cached browsers, `test:e2e` + `test:a11y`,
     uploads report on failure) -> `lighthouse` (`lhci` against `next start`, filesystem upload).
  2. `web-nightly.yml` (optional): webkit + visual + live-API contract smoke once Phase 5 is on.
  3. Root-repo guard: a job that runs the repo-root `npx tsc --noEmit -p .`, `npm run lint`, `npm test` when `web/` changes
     (AGENTS.md rule), to catch accidental coupling.
- **Deploys:** native Git integration of the host (Vercel primary): production from `main`, a preview per PR (Hobby
  deployment-protection default may require login to view previews, so Lighthouse CI runs against the CI build, not the
  preview URL). Previews run `API_MODE=mock` until Phase 5, send `noindex`, and show a banner-free UI (no visible "preview" chrome in
  production code paths).
- **Release gates:** all CI jobs green; budgets met; checklist in 10 section 8 for launch.
- **Scraper hook (owner decision):** after `npm run scrape:parallel`, a post-run step does
  `curl -X POST $WEB_URL/api/revalidate -H "x-revalidate-secret: ..."`; secret stored as a repo/CI secret, never in code.

---

## 22. Environment variables

| Name | Scope | Required | Default | Meaning |
|---|---|---|---|---|
| `API_MODE` | server | yes | `mock` | `mock` (in-process fixtures) or `live` |
| `API_ADAPTER` | server | no | `proposal` | `proposal` or `owner` (only when `live`) |
| `API_BASE_URL` | server | live only | - | Base URL of the read-only API (no trailing slash) |
| `API_TIMEOUT_MS` | server | no | `4000` | per-request timeout |
| `MOCK_SCENARIO` | server | no | `normal` | `normal, empty, slow, flaky, ratelimited, allNulls, huge` (mock only) |
| `MOCK_NOW` | server | tests | - | ISO instant to freeze "now" in mock mode |
| `NEXT_PUBLIC_SITE_URL` | public | yes | `http://localhost:3000` in dev | canonical origin, sitemap, OG |
| `SITE_ENV` | server | yes | `development` | `production` / `preview` / `development`; drives robots + `X-Robots-Tag` |
| `REVALIDATE_SECRET` | server secret | prod | - | auth for `/api/revalidate` |
| `NEXT_TELEMETRY_DISABLED` | build | no | `1` in CI | disable Next telemetry |

Not created: `NEXT_PUBLIC_API_BASE_URL` (02 5.2 proposed it; unnecessary with the BFF, D-04) and `NEXT_PUBLIC_ANALYTICS_ID`
(D-21). `.env.example` lists names only. Validation in `lib/env.ts` fails the build/boot on missing required values for the
selected mode.

---

## 23. Deployment configuration

### 23.1 Primary: Vercel Hobby (non-commercial only; 02 4.1)
Root Directory `web`; preset Next.js; install `npm ci`; build `npm run build`; Node 24.x; environment variables per
environment (Production: `API_MODE`, `API_BASE_URL`, `NEXT_PUBLIC_SITE_URL`, `SITE_ENV=production`, `REVALIDATE_SECRET`; Preview:
`SITE_ENV=preview`, `API_MODE=mock` until Phase 5); function region set to the API/database region (owner answer, Q-06) via
`vercel.json` `regions` or project setting; optional Ignored Build Step; custom domain with automatic HTTPS. Do not use
Edge Config, KV, or Vercel-specific middleware APIs. `images.unoptimized: true`.

### 23.2 Fallback: Netlify Free
`netlify.toml` (repo root or `web/`): `[build] base = "web"`, `command = "npm run build"`, `publish = ".next"`,
`[build.environment] NODE_VERSION = "24"`; per-context env via `[context.production.environment]` and
`[context.deploy-preview.environment]` (no secrets in the file); headers and redirects stay in `next.config.ts`. Budget is much
tighter (about 15 GB equivalent, about 20 production deploys/month, 02 4.7): batch releases, keep `revalidate` generous.
Confirm Next 16 runtime support, `proxy.ts` support, and ISR/tag revalidation parity in spike S1 before relying on it.

### 23.3 If monetisation or paid work appears
Move to Vercel Pro or Netlify (re-read terms). No code changes expected (D-03 portability guardrails).

---

## 24. Risk register

| ID | Risk | Likelihood | Impact | Mitigation | Trigger / owner |
|---|---|---|---|---|---|
| R-01 | Backend API does not exist or arrives late/different | High | High | Mock-first, capability flags, adapter seam (6.4), contract tests | Owner supplies endpoints (Q-01) |
| R-02 | API slow or down at request time | Med | High | Data Cache, ISR keep-last-good, uncached 500 with retry (4.4) | Monitor API p95 |
| R-03 | Vercel Hobby non-commercial rule broken by future monetisation or paid authorship | Low-Med | High | Recorded constraint; Netlify fallback viable; confirm intent (Q-02) | Owner |
| R-04 | Free-tier invocations / ISR writes exhausted by crawlers (34 k job URLs) | Med | High | robots Disallow on filters, noindex pages 2+, job TTL 3,600 s, measure on preview, option to static-ise clean variants via `proxy.ts` rewrite, raise TTLs | Spike S2, weekly check |
| R-05 | Real 404 status for unknown/closed jobs not achievable in Next 16.4 under chosen caching mode (soft 404) | Med | Med | Spike S1; classic caching default; fallback 200+noindex+not in sitemap | S1 result |
| R-06 | TypeScript 6/7 and ecosystem drift; Next/React minor changes | Med | Low-Med | Exact pins, lockfile, re-verify at P0-06, optional TS 7 CI check | Quarterly |
| R-07 | No descriptions in data => no valid JSON-LD, thin job pages, little Google-for-Jobs value | High | Med | Gate in D-15; manage SEO expectations; probe 08 6.7 before building DescriptionBlock polish | Owner Q-05 |
| R-08 | Legal/ToS of republishing scraped listings; takedown | Med | High | About/Privacy attribution, "source: Ashby", takedown contact, `Company.hidden` (08 Q10) | Owner Q-07 |
| R-09 | CSP needs `'unsafe-inline'`; XSS blast radius | Low | Med | No third-party/user HTML, server-side sanitiser, JSON-LD escaping, report-only first | Revisit if pages go fully dynamic |
| R-10 | Hot-linked logos leak visitor IP to company hosts; mixed/broken URLs | Med | Low-Med | `referrerpolicy=no-referrer`, https-only, disclosure, later proxy/cache decision | Owner (08 Q8) |
| R-11 | Single-DOM filter panel is harder to make fully accessible than a dialog | Med | Med | Spike S5 with NVDA/VoiceOver; fallback to client Dialog with duplicated facets | Phase 2 gate |
| R-12 | Search quality without full-text/trigram on the backend | Med | Med | Depends on gap G2; UI uses `q` min 2 chars and client-side `<mark>`; capability flags | Backend |
| R-13 | Closed jobs appear open for up to the TTL | Med | Low-Med | TTL 3,600 s, trust copy "last checked", webhook revalidation after scrape, 410 handling | Tune |
| R-14 | 06/07 not final or tokens misaligned | Med | Low | Token indirection (8.3, 9); only `tokens.css`/`theme.css` change | Phase 1 check |
| R-15 | React Compiler changes effect timing | Low | Med | Exact pin, hooks lint, E2E coverage | CI |
| R-16 | Netlify parity gaps (ISR/tags/proxy) | Med | Med | Spike S1 on both hosts, keep portability rules | Phase 0 |
| R-17 | Location free text creates noisy facet | High | Low | Top-N + facet search, `locationGroup` later (R04-12) | v2 |
| R-18 | Deep pagination invites crawlers/scrapers | Med | Low | `maxResultWindow` cap, robots, API rate limits | API |
| R-19 | AGENTS.md repo rules (docs sync, commit per change) conflict with a large new subfolder | Med | Low | P0-05 documents web/ rules; root checks unaffected; commit per phase | Implementer |

---

## 25. Open questions for the owner (carry to 11)

Q-01 API timeline, owner of the backend, and whether the API will live in this repo. Q-02 Confirm non-commercial intent
(Vercel Hobby) and whether a paid party is involved. Q-03 Site name, domain, contact address (About/Privacy placeholders).
Q-04 Will the scraper post-run step call `/api/revalidate`, and how often does `scrape:parallel` run? Q-05 Are descriptions
available and allowed to be displayed (08 Q1)? Q-06 API/DB region (function region choice). Q-07 Legal review and takedown
process. Q-08 Approve the 08 additions A-01..A-12. Q-09 Confirm indexing policy D-01 and the revisit trigger. Q-10 Source
code link in the footer (04 Q6). Q-11 `/companies` directory kept? (04 Q4). Q-12 Retention window for closed jobs (propose
90 days).
