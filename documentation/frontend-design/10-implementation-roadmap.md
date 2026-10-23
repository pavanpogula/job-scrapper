# 10 · Implementation Roadmap

> **Status:** DESIGN ONLY hand-off for the implementing agent. Nothing described here exists yet. _Authored 2026-10-22._
> Architecture and decisions: [09](./09-frontend-architecture.md) (decisions **D-xx**, risks **R-xx**, questions **Q-xx**).
> API reconciliation and the additions **A-xx / C-xx**: [08 section 10](./08-api-contract-proposal.md). Requirements and use
> cases: [03](./03-personas-and-use-cases.md) (UC-*), [04](./04-information-architecture-and-flows.md),
> [05](./05-screens-and-states.md). Visual tokens and Figma spec: 06 and 07 (reserved plug-in points: `src/styles/tokens.css`,
> `src/styles/theme.css`, component skins in `components/ui` and `components/patterns`).
> Sizes: **S** about half a day or less, **M** about 1-2 days, **L** about 3-5 days (single agent, focused).

## 0. Ground rules for the implementer

1. Work only inside `web/`, `contracts/` (under `web/`), `.github/workflows/web-*.yml`, and the small root edits listed in
   P0-05. Do not change the scraper (`src/`, `prisma/`, `tests/`).
2. Follow the repo-root `AGENTS.md`: read `documentation/README.md` first; on **every** change sync docs, run
   `npm run docs:generate`, run the root checks (`npx tsc --noEmit -p . && npm run lint && npm test`), and **commit with a
   Conventional Commit subject and a detailed bulleted body**. Never print, stage or commit `.env`, `output/`, `apikeys/`.
   Commit at the end of each task group or phase, not in one giant commit.
3. Before using any version from 02, re-run `npm view <pkg> version`; pin exact versions; keep TypeScript on 6.0.x (D-22).
4. Do not trust anything marked **[UNVERIFIED]** in 02/09: verify in the Phase 0 spikes and record the outcome by editing the
   affected Decision row in 09.
5. Every user-visible string comes from 05 (copy tables). Do not invent copy; if a string is missing, add it to 05's table in the
   same commit and flag it for the owner.
6. Build against the **mock** until Phase 5. Do not call any real API, and do not read the root `.env`.

---

## Phase 0 · Prerequisites and decisions (owner + implementer)

Goal: nothing in Phase 1 is blocked by an unanswered question or an unverified platform assumption.

| ID | Task | Inputs | Acceptance criteria | Size | Deps |
|---|---|---|---|---|---|
| P0-01 | Collect owner decisions Q-01..Q-12 (API timeline, non-commercial intent, site name/domain/contact, scrape cadence and revalidate hook, descriptions allowed, API region, legal/takedown, approve 08 additions, indexing policy D-01, footer source link, keep `/companies`, closed-job retention) | 09 section 25; 08 section 9; 02 section 6 | Each question has an answer or an explicit default written in 09 section 1 / a decision log; unanswered ones are listed as "assumed" | S | none |
| P0-02 | Contract freeze: 08 owner merges A-01..A-12 (or records which are declined and the UI fallback from D-19); extract 08 section 7 plus additions to `web/contracts/openapi.yaml` | 08 sections 7 and 10 | `openapi.yaml` validates with an OpenAPI 3.1 linter; contains the 3 new paths and new fields from 08 10.5; changes log in 08 | M | P0-01 |
| P0-03 | Confirm 06/07 are delivered; extract the token list; if missing, adopt a neutral placeholder token set with the exact names in 09 8.3 | 06, 07, 09 8.3 | `tokens.css` source values known (light, dark, forced-colors) or placeholder explicitly marked | S | none |
| P0-04 | Spike **S1 + S4** on an empty Next 16.4 app deployed to Vercel Hobby **and** Netlify Free: Node 24 offered; TS 6.0.x + `next build` type-check; React Compiler; ISR page with `generateStaticParams -> []` returns a real **404** for an unknown id (classic mode) and with `cacheComponents` on; `proxy.ts` works; `revalidateTag` via a Route Handler; custom `headers()` incl. `X-Robots-Tag` on preview; shadcn init default (Radix vs Base UI) | 02 section 6; 09 D-06, D-08, R-05, R-16 | Written results updating D-06/D-08 (chosen caching mode, 404/410 mechanism or fallback) and 02 6; both hosts deploy; throwaway apps deleted | M | P0-01 |
| P0-05 | Root repo prep (the only edits outside `web/`): add `web` (and `.next`) to `EXCLUDED_DIRS` in `scripts/GenerateDocs.ts`; add `.gitignore` entries (09 2.1); add a short `web/` section to `AGENTS.md` and `documentation/README.md`; confirm root `tsc`, `lint`, `jest` and `docs:generate` are unaffected | 09 2.1 | `npm run docs:generate` output has no `web/` files; root `npx tsc --noEmit -p . && npm run lint && npm test` pass; committed | S | none |
| P0-06 | Re-verify every version in 02 section 8 with `npm view`; produce the exact pin list | 02 sections 1, 8 | A table of pins in the `web/package.json` plan; no `^`/`~` | S | none |

**Definition of done (P0):** answers/defaults recorded; `openapi.yaml` present; spike outcomes recorded in 09; root repo
prepared; pins list ready.
**Tests required:** none (documents, spikes). **Verification:** root checks from P0-05.

---

## Phase 1 · Foundation (project, tokens, theming, CI, mock API)

Goal: an empty-but-real app with the data layer, mock API, URL codec, CI and a preview deploy; zero product screens beyond shell
and static pages.

| ID | Task | Inputs | Acceptance criteria | Size | Deps |
|---|---|---|---|---|---|
| P1-01 | Scaffold `web/` (manual, no generators that add telemetry): `package.json` with exact pins and the script names in 09 20, `.nvmrc` 24, `next.config.ts` (React Compiler, `images.unoptimized`, `poweredByHeader:false`, headers, redirects), `tsconfig.json` (strict + `noUncheckedIndexedAccess`), `.env.example`, folder tree from 09 section 3 (empty folders with a README-less `.gitkeep` only where needed) | 09 2, 3, 20, 22; 02 5.1 | `npm ci && npm run dev` serves a blank shell; `npm run build` passes; `node -v` 24 enforced by `engines` | M | P0-04, P0-06 |
| P1-02 | Tooling: ESLint flat config (typescript-eslint, react-hooks incl. compiler rules, jsx-a11y strict, Next plugin, import boundaries, the `no-restricted-syntax` bans), Biome format-only, Vitest config (unit + component projects), Playwright config (projects `desktop-chromium`, `mobile-chromium`, `webkit-mobile`, `nojs`), `verify` script | 09 20 | `npm run lint`, `typecheck`, `format:check`, `test` (with one smoke test), `test:e2e` (one smoke) all pass and fail correctly when a rule is violated (add one deliberate-violation test fixture then remove it) | M | P1-01 |
| P1-03 | Token layer and theming: `tokens.css` (06 or placeholder), `theme.css` (Tailwind `@theme`), `base.css`, `print.css`, `public/init.js` (theme + `js` class, no inline script), fonts via `next/font`, `ThemeToggle`, reduced-motion global rule, `scroll-padding` from `--sticky-offset` | 09 8.3, 9, D-23; 05 1.6, 13 | Light/dark/forced-colors values exist for every colour role; no flash on reload (E2E check with `prefers-color-scheme`); `localStorage` failure path renders; no hex literals in components (lint rule or grep test) | M | P1-01, P0-03 |
| P1-04 | Primitives in `components/ui`: Button, Badge, Skeleton, Checkbox, Switch, Radio, NativeSelect, ExternalLink (rel + hidden "(opens in a new tab)"), VisuallyHidden; shadcn used only as a copy source and restyled to tokens | 05 11; 09 8.1, 9.8 | Each has a component test with axe zero violations in every state listed in 05 11; ExternalLink asserts `target="_blank" rel="noopener nofollow"` | M | P1-02, P1-03 |
| P1-05 | Shell: root layout (landmarks, `lang`, SkipLinks, SiteHeader, Footer with soft-failing meta, `LiveRegion`, `init.js`), `not-found.tsx`, `error.tsx`, `global-error.tsx`, About and Privacy pages with the 05 draft copy (placeholders flagged for owner: contact, host name) | 05 6, 7, 8, 9, 2.6; 04 2, 11 | All four static screens render at 390/768/1280 with one `h1`; tab order starts with skip link; 404 returns status 404 and `noindex`; error page `role="alert"`; axe clean | M | P1-04 |
| P1-06 | `lib/env.ts` (Zod, fail-fast), `lib/cache.ts` (TTL constants and tag names), `lib/logger.ts` (no query strings), security headers incl. CSP **report-only**, `robots.ts` (non-prod = `Disallow: /`), preview `X-Robots-Tag` | 09 13.3, 16.1, 18, 22 | Booting with `API_MODE=live` and no `API_BASE_URL` fails with a clear message; header assertions pass in an E2E smoke; robots output matches `SITE_ENV` | S | P1-01 |
| P1-07 | API layer: `Transport` (live + mock), `client.ts` (timeout, one retry, Problem parsing), `errors.ts`, `schemas.ts` as `z.ZodType<generated>`, `generated/types.ts` via `npm run contract:types`, `endpoints.ts` for every 08 endpoint incl. A-03/A-04/A-10 | 09 6.1-6.5; 08 sections 3, 4, 7, 10 | Unit tests for success and each error mapping row in 09 6.3 (including `Retry-After`, 410 with `extensions.job`); no `fetch` outside `src/api`; no React/Next imports in `src/api` | L | P0-02, P1-02 |
| P1-08 | Mock layer: `mocks/db.ts` (filter, disjunctive facets, sort with id tiebreak, offset + cursor, count/relax, facet-values, suggest, meta, 404/410/429/5xx), `handlers.ts`, `scenarios.ts` (7 presets), `generator/` (seeded, 5,000 rows, distributions from 08 8.2), `golden.json` (about 60 edge rows), `msw.ts` wrappers | 09 6.6; 08 8.2 | Same seed => identical data; `MOCK_NOW` respected; all scenarios behave as 08 8.2 describes; 40 % salary / 20-25 % null `postedAt` / 60 % un-enriched companies verified by a distribution test with tolerances | L | P1-07 |
| P1-09 | Contract harness: Ajv 2020-12 validation of every mock endpoint x scenario against `openapi.yaml`; fixtures/golden validation; "generated types are fresh" check; compile-time Zod-to-type linkage | 09 6.6, 19 | `npm run test:contract` green; deliberately breaking a mock field makes it red (verify once) | M | P1-08 |
| P1-10 | `domain/` formatters and view-models with unit tests lifted row by row from 05 1.2 (salary), 1.3 (posted), 1.4 (company name), 1.5 (counts/plurals), card omission rules (1.1), page-window (04 5.3), title slug, location label | 05 1; 04 5.3, 10; 09 6.4 | Every table row in those sections has a test; worst-case rows from 08 8.2 produce valid view-models; no `NaN`/`undefined` strings possible (property test on random DTOs) | M | P1-07 |
| P1-11 | `url-state/` codec: schema, parse (total, notices), serialize, canonical, `api-query` mapping (09 5.4), `indexability()` + `robots-rules.ts` | 04 3; 09 5; 01 2.11; D-01, D-10 | Round-trip and idempotence properties; garbage inputs never throw; 04 3.2 table fully covered; `indexability` matrix equals 04 3.6 (+D-01) and the generated robots.txt rules | M | P1-02 |
| P1-12 | CI: `web-ci.yml` (static -> unit -> build -> e2e -> lighthouse), root-guard job, path filters, caching, pinned action SHAs, Lighthouse CI config with provisional budgets, `size` gate; run spikes **S2** (CDN HTML caching vs inline errors, invocation counting on a preview) and **S3** (empty-app bundle baseline) and update 09 14 budgets | 09 14, 21 | CI green on a PR touching `web/`; skipped on a PR touching only `src/`; budgets file committed with measured baseline; S2/S3 results written into 09 (D-05, section 14) | M | P1-02, P1-13 |
| P1-13 | Deploy skeleton: Vercel project (Root Directory `web`, Node 24, env per environment, previews on `API_MODE=mock`, `SITE_ENV=preview`), Netlify branch deploy using `netlify.toml` | 09 23; 02 5.3, 5.4 | Preview URL serves the shell, About, Privacy, 404; response headers include the security set and `X-Robots-Tag: noindex`; Netlify branch also deploys | S | P1-05, P1-06 |

**Definition of done (P1):** `cd web && npm run verify` green; CI green; preview deployed on both hosts with mock mode; token
layer and theming work; `api/`, `mocks/`, `domain/`, `url-state/` complete and tested; contract tests prove mock validity; the
root repo checks still pass; docs synced and committed.
**Tests required:** unit (domain, url-state, api), component (primitives), contract (mock conformance), e2e smoke (shell, 404,
headers, no cookies, theme persistence).
**Verification commands (from `web/` unless noted):** `npm run lint`; `npm run typecheck`; `npm run format:check`; `npm test`;
`npm run test:contract`; `npm run build`; `npm run test:e2e -- --project=desktop-chromium` (smoke); `npm run test:a11y` (shell
pages); `npm run lhci` (static pages) and `npm run size`; **from repo root:** `npx tsc --noEmit -p . && npm run lint && npm test`;
`npm run docs:generate`.

---

## Phase 2 · Browse (search, filters, pagination, URL state)

Goal: the full Browse screen on mock data, fully working with and without JS, keyboard and screen-reader complete.

| ID | Task | Inputs | Acceptance criteria | Size | Deps |
|---|---|---|---|---|---|
| P2-01 | `JobCard`, `JobCardSkeleton`, `CompanyLogo` (monogram under image), `SalaryText`, `PostedAge`, `<mark>` highlighting | 05 1.1-1.4, 11; 04 4; D-12, D-20 | Matches 05 anatomy at 390/768/1280; omission rules; one tab stop; accessible name via `aria-describedby`; no nested interactive; heights within 88-148 px; skeleton 112 px; failing logo shows monogram with no JS | M | P1-10, P1-04 |
| P2-02 | Browse route `/`: loader (`getJobs` awaited, `getFacets`/`getMeta` in `Suspense`), results region with heading and `aria-busy`, dataset subline, summary line, toolbar, streaming and TTL tags from `lib/cache.ts`, `generateMetadata` titles | 04 1, 11; 05 2; 09 4.1, 4.3 | `/` renders 25 cards from mock; first flush contains cards; facets stream separately; titles per 04 11; HTTP 200 | M | P2-01, P1-11 |
| P2-03 | `Pagination` (+`PageSizeSelect`, `PaginationJump`): window rules, mobile compact variant, `aria-current`, disabled ends, `maxResultWindow` note, `permanentRedirect` for non-canonical page forms | 04 5; 05 2; 09 11; A-02 | All 04 5.3 rules; links are real anchors that work with JS off; unit tests for windows (7 pages, current 1/4/mid/last-3/last, 1,362 pages, window cap); size change resets page | M | P2-02 |
| P2-04 | Facets as a server-rendered GET form: `FacetGroup`/`FacetOption`/`ToggleSwitch`/`RadioGroup`, counts in accessible names, disclosure defaults (04 6), `ChipBar` of links with "+N more", "Clear all", visible "Apply filters"/"Update" buttons hidden under `html.js`; `Notice` | 04 6; 05 2.4, 2.6, 11; 09 4.2 | With JS disabled, selecting facets and submitting updates results and URL; chips remove via links; AND across / OR within facets verified against mock; zero-count selected values still shown (A-05 fallback) | L | P2-02 |
| P2-05 | `SearchInput` (visible label, clear button, 300 ms debounce, min 2 chars, 100-char truncate, push-first/replace-after history policy, Enter), Sort select (relevance only with `q`), `CopyLinkButton` with status message | 04 3.5, 4, 7; 03 UC-02, UC-06, UC-10; 05 2.4 | One history entry per search "session" (E2E asserts `history.length` deltas); page resets to 1; sort default stripped; copy-link announces "Link copied." and handles failure copy | M | P2-02, P1-11 |
| P2-06 | `FilterPanelController`: desktop immediate apply (150 ms debounce), below-desktop overlay mode (`role=dialog`, `aria-modal`, `inert` siblings, focus trap, Esc discard, focus return), draft state + live **"Show N jobs"** via `/api/count` BFF (capability fallback "Show results"), single-DOM design; spike **S5** with NVDA and VoiceOver notes | 09 8.4, D-03, D-19; 04 6; 05 2.1, 2.5 | Passes keyboard script UC-17; unapplied draft discarded on close; zero-match disables button with "No jobs match"; S5 outcome recorded (keep single DOM or switch to client Dialog) | L | P2-04, P2-05 |
| P2-07 | Result-change UX: `ResultsAnnouncer` (focus to results heading after paging, instant scroll with `scroll-margin-top`, exactly one live announcement per settled change, none on first load), pending dim at 100 ms then skeleton, Back/Forward focus return to the opened card, chip-removal focus rules | 04 5.4, 5.5; 05 2.5, 2.6; 03 UC-07, UC-11, UC-18; 09 11 | E2E: announcements text exactly as 05 2.6; focus lands as specified; Back restores page, filters and scroll within 300 ms when cached; no CLS on revalidation | M | P2-03, P2-06 |
| P2-08 | Zero-results `EmptyState` (chips, "Remove X to see N jobs" from `/api/count?relax=`, "Clear all"), `InlineError` kinds (network/5xx/429 with seconds), `error.tsx` for Browse with retry, slow-load line at 5 s, 20 s hard failure, offline variant | 05 2.4, 2.5; 03 UC-13, UC-15; 09 4.4, 17 | Each scenario (`empty`, `flaky`, `ratelimited`, `slow`) reproduces the 05 state; error HTTP status is 500 and uncached; filters stay usable | M | P2-02 |
| P2-09 | Invalid/stale params: 308 for ordering/default differences, notices for dropped values and clamped page, `replaceState` cleanup, nonexistent company chip yields zero-results recovery, `type=Banana`, `page=9999` | 04 3.3, 3.5; 03 UC-19; 09 5.3 | E2E for each UC-19 example; canonical `<link>` correct; no redirect loops (test) | M | P2-03, P1-11 |
| P2-10 | Facet search and "Show more": client filter over loaded options, `/api/facet-values` BFF with prefix/limit when `supports.facetValues`, focus moves to first new option, "No companies match" copy | 04 6; 05 2.4; A-04 | Behaves identically with mock endpoint present or absent (capability flag test); keyboard: Show more moves focus | M | P2-04, P1-08 |
| P2-11 | Browse SEO: metadata, robots meta from `indexability()`, `robots.txt`, canonical, preview noindex check | 09 13; D-01 | Unit/E2E matrix: clean `/` index; `/?page=2` noindex,follow with self canonical; each filter param noindex and Disallow in robots; sitemap not yet | S | P1-11 |
| P2-12 | Browse test suite: E2E UC-01..07, 10, 11, 13, 15, 17, 18, 19 on `desktop-chromium` and `mobile-chromium`; `nojs` project covering search, filter submit, paginate, open card; keyboard-only script; axe on every state in 05 2.5; Lighthouse CI on `/` and `/?page=3` with the 09 14 budgets | 03 section 4; 05 2.5, 13; 09 19 | All green; zero serious/critical axe; budgets met or documented exception with owner sign-off | L | P2-01..P2-11 |

**Definition of done (P2):** Browse meets UC-01..07, 10, 11, 13, 15, 17, 18, 19 on mock data at 320-1440 px with JS on and
off; Lighthouse and bundle budgets met for `/`; a11y suite green; S5 resolved; docs updated; committed.
**Tests required:** unit (page-window, notices, count labels), component (JobCard, Pagination, FacetGroup, ChipBar,
FilterPanelController, InlineError, EmptyState), contract (BFF handlers use the codec, reject unknown params), e2e + a11y +
keyboard + nojs + mobile, Lighthouse.
**Verification commands:** `npm run lint`; `npm run typecheck`; `npm test`; `npm run test:contract`; `npm run build`;
`npm run test:e2e` (all projects); `npm run test:a11y`; `npm run lhci`; `npm run size`; root `npx tsc --noEmit -p . && npm run lint
&& npm test`; `npm run docs:generate`.

---

## Phase 3 · Job detail, company pages and the Apply flow

| ID | Task | Inputs | Acceptance criteria | Size | Deps |
|---|---|---|---|---|---|
| P3-01 | Job route `/jobs/[id]/[[...slug]]` (ISR, awaits data before flush): loader, `permanentRedirect` to canonical slug, `JobHeader`, `FactList` (absent facts omitted), "More jobs at {Company}" strip, metadata | 05 3; 04 3.1; D-08, D-09; 09 4.1 | Renders from mock at 3 breakpoints; wrong/missing slug 308s; unknown id returns real **404**; no `loading.tsx` on the segment; `h1` focus on route entry | L | P2-02 |
| P3-02 | Apply: `ApplyButton` (link, full-width 48 px on mobile, name includes company), `TrustNote` (copy, host, "Listing last checked {date}" from `lastCheckedAt`/`dataUpdatedAt`), `StickyApplyBar` (hides while main button visible, never obscures focus) | 05 3, 3.7; 04 8; 03 UC-09; D-14 | `<a target="_blank" rel="noopener nofollow">`, no redirect through our domain, no extra params (E2E asserts href equals `applyUrl`); sticky bar `aria-hidden` rules; invalid `applyUrl` shows "Application link unavailable" per 04 8 | M | P3-01 |
| P3-03 | `DescriptionBlock`: server-side `sanitize-html` allowlist, heading shift, link rel, 100 KB cap, missing-description copy | 05 3.4, 3.6; 09 16.3; 08 2.3 | Sanitiser tests for script, iframe, `javascript:`, `data:`, inline style, images, oversized input; missing description shows the 05 copy and Apply remains | M | P3-01 |
| P3-04 | Expired and not-found variants (title + company, no Apply, "More jobs at", "Browse all jobs"), HTTP status per spike S1, `noindex`, excluded from sitemap | 05 3.5; 03 UC-14; D-08; A-08 | Mock 410 id renders `ExpiredState`; unknown id renders generic variant; status codes recorded; fallback (200 + noindex) only if S1 required it | M | P3-01 |
| P3-05 | `Breadcrumb` and `BackLink` (history back only for in-app arrival; otherwise "All jobs at {Company}" + "Browse all jobs"), focus restoration contract with Browse | 04 2.3, 2.4; 03 UC-11 | E2E: from list -> detail -> Back restores state; direct-load detail shows the alternate link | S | P3-01, P2-07 |
| P3-06 | Company route `/companies/[slug]`: `CompanyHeader`, reuse of Browse list/facets/pagination minus the Company facet, "View all on Ashby", zero-jobs state, unknown slug 404, robots rules | 05 4; 04 3.1, 3.6; 03 UC-12 | All 05 4.3 states; clean URL indexable, any param noindex + Disallow; fixed `company` filter cannot be removed | M | P2-12 |
| P3-07 | Companies directory `/companies` (search, pagination, default size 50, two-column tablet) | 05 5; 04 1; A-11 | Zero state "No companies match"; page>=2 noindex; accessible name includes count | M | P3-06 |
| P3-08 | Metadata + gated `JobPosting` JSON-LD + company/job canonical and OG tags | 09 13; D-15; 01 2.11 | Tests: JSON-LD absent when no description / no `postedAt` / inactive; present and valid JSON with `<` escaped otherwise; manual Rich Results Test on a hand-built example | S | P3-01 |
| P3-09 | Print styles for job detail and Browse (Apply URL printed in full) | 05 1.6, 3.6; 03 UC-20 | Print emulation E2E shows only job content | S | P3-02 |
| P3-10 | Test suite: E2E UC-08, 09, 12, 14, 16 (SR landmark/heading assertions), 20; axe on all detail/company/directory states; mobile 390 sticky bar; `nojs` open job and Apply link; Lighthouse CI on job and company | 03 section 4; 05 3.6, 4.3 | Green; budgets met | M | P3-01..P3-09 |

**Definition of done (P3):** UC-08, 09, 12, 14, 16, 20 pass; a visitor can go landing -> filter -> job -> Apply in 3
interactions on mock; 404/410 behaviour decided and tested; docs updated; committed.
**Tests required:** unit (sanitiser, JSON-LD, slug), component (ApplyButton, StickyApplyBar, DescriptionBlock, ExpiredState),
e2e/a11y/nojs/mobile, Lighthouse.
**Verification commands:** same set as Phase 2, plus `npm run test:e2e -- --project=nojs` and the print-emulation spec.

---

## Phase 4 · Polish (a11y audit, performance, SEO, dark mode, error states)

| ID | Task | Inputs | Acceptance criteria | Size | Deps |
|---|---|---|---|---|---|
| P4-01 | `SearchCombobox` (React Aria Components, lazily imported): ARIA 1.2 pattern, groups Companies/Departments/Locations (3 each), "Search for ..." row, Esc behaviour, silent failure, `supports.suggest` gating, debounce and abort | 04 4; 05 2.6; 01 2.10; D-13 | Keyboard map from 05 2.6; choosing a suggestion applies a facet and clears the text; chunk loaded only on first focus; endpoint failure/slow (>500 ms) shows nothing | L | P2-12 |
| P4-02 | Accessibility audit: axe over every route/state in the matrices (including dark and forced-colors emulation), 320 px and 400 % zoom reflow, target sizes, focus-not-obscured, contrast checks of rendered tokens; manual NVDA/Firefox, JAWS/Chrome (if available), VoiceOver/Safari iOS scripts for UC-16/17; fix findings | 05 13; 03 UC-16, UC-17, section 5 | Report with zero open serious/critical issues; manual scripts executed and results written to the repo (not into 05) | L | P3-10 |
| P4-03 | Performance pass: meet 09 14 budgets on all routes (bundle analyser, route splitting, font loading, `content-visibility`, prefetch rules, streaming order, LCP element check), INP trace of filter click and page change | 09 14, 11; 03 section 5 | Lighthouse CI assertions pass on 5 URLs; INP lab <= 200 ms; CLS <= 0.05; any budget exception signed by the owner | M | P3-10 |
| P4-04 | SEO pass: sitemap index + children + companies, robots verification, `lastmod`, canonical audit crawl of the mock site, static OG image, structured-data tests, preview noindex confirmation | 09 13; 04 3.6, 3.7; A-10 | A crawl script lists every URL class and compares meta robots + robots.txt + sitemap membership to `indexability()`; zero mismatches; sitemap files <= 10,000 URLs | M | P3-08 |
| P4-05 | Dark mode, reduced motion, forced colors and print complete pass; token audit against 06 | 06, 05 1.6; 03 UC-21 | Visual and axe checks in both themes; pulse disabled under reduced motion; no flash | M | P3-10 |
| P4-06 | Error/empty/offline copy review against 05; repeated-failure line; reference code display | 05 2.4, 9 | Every string in 05 copy tables exists and is used; no unused strings | S | P3-10 |
| P4-07 | Visual regression (optional): Playwright screenshots on golden scenario, Linux CI only | 09 19 | Baselines committed; threshold 0.1 %; CI job non-blocking at first | M | P4-05 |
| P4-08 | Flip CSP from report-only to enforce after a preview soak with no violations | 09 16.1, R-09 | No console CSP violations across the E2E suite; header is `Content-Security-Policy` | S | P4-02 |
| P4-09 | Usability round 1 with the prototype (5 participants per persona type, tasks from 03 section 5) and fix list | 03 section 5 | Metrics recorded; critical findings fixed or logged for the owner | M | P4-05 |

**Definition of done (P4):** audits clean; budgets met; SEO matrix has no mismatches; dark mode and print finished; CSP
enforced; combobox shipped (or consciously skipped with the owner's note); docs and known issues synced; committed.
**Tests required:** all earlier suites plus the SEO crawl test, combobox component/E2E tests, optional visual tests.
**Verification commands:** `npm run lint`; `npm run typecheck`; `npm run format:check`; `npm test`; `npm run test:contract`;
`npm run build`; `npm run test:e2e`; `npm run test:a11y`; `npm run test:visual` (if enabled); `npm run lhci`; `npm run size`;
root checks; `npm run docs:generate`.

---

## Phase 5 · Real API, deploy, launch

| ID | Task | Inputs | Acceptance criteria | Size | Deps |
|---|---|---|---|---|---|
| P5-01 | Switch to the real backend: `API_MODE=live`; use the `proposal` adapter if the API follows 08 (with A-xx), otherwise write `adapters/owner/` mapping to proposal types and set `capabilities` | 08 8.4, 10; 09 6.4 | App works on a staging API; unsupported features hidden (not broken) via capability flags | M-L | P0-02, owner API |
| P5-02 | Live contract smoke suite (sampled real URLs: list, detail, facets, count, suggest, 404, 410 if reproducible, sitemap feed) reusing the Ajv validators; scheduled workflow | 09 6.6, 19; 08 8.3 | Deviations name the exact field; suite green or deviations ticketed in 08 | M | P5-01 |
| P5-03 | Production configuration: domain + HTTPS, env vars (`SITE_ENV=production`, `NEXT_PUBLIC_SITE_URL`, `API_BASE_URL`, `REVALIDATE_SECRET`), function region near the API, Vercel Ignored Build Step, final Privacy/About copy and contact, HSTS | 09 22, 23; Q-03, Q-06 | Production deploy from `main`; previews still `noindex`; secrets only in host/CI stores | M | P5-01 |
| P5-04 | Cache and quota validation on preview/production-like traffic: count invocations and ISR writes during a crawl simulation of the sitemap, tune TTLs in `lib/cache.ts`, wire and test the scraper-side revalidation hook | 09 D-05, R-04, 21; 08 C-13 | Measured numbers written to 09 (replacing assumptions in 02 4.3); projected monthly usage within free tier or a documented upgrade decision | M | P5-03 |
| P5-05 | Launch checklist execution (section 8) | section 8 | Every box checked and evidence linked | M | P5-02..P5-04 |
| P5-06 | Post-launch: Search Console sitemap submission, watch indexed vs submitted, runbook for API outage, quota alarms (host emails), schedule optional nightly smoke | 09 18, R-04 | Runbook committed; first-week review noted | S | P5-05 |

**Definition of done (P5):** production live on the primary host; fallback host deploy verified; live contract suite green;
launch checklist complete; known issues documented.
**Tests required:** live contract smoke, full E2E against a staging-backed build (read-only), Lighthouse on production URLs,
manual launch checks.
**Verification commands:** full Phase 4 set, plus `npm run test:contract -- --live` (or the named live workflow), and the manual
items in section 8.

---

## 6. Traceability matrix: use cases to tasks and screens

| UC | Title (03) | Screen(s) | Tasks that satisfy it | Verified by |
|---|---|---|---|---|
| UC-01 | Browse newest | Browse | P2-01, P2-02, P2-03, P1-05 | P2-12 |
| UC-02 | Keyword search | Browse, Company, 404 | P2-05, P2-01 (highlight), P4-01 (suggestions) | P2-12, P4-01 |
| UC-03 | Filter by company/department/location | Browse | P2-04, P2-06, P2-10 | P2-12 |
| UC-04 | Remote and salary filters | Browse | P2-04, P2-06 | P2-12 |
| UC-05 | Employment type and posted date | Browse | P2-04, P1-11 | P2-12 |
| UC-06 | Sort | Browse, Company | P2-05, P2-07 | P2-12 |
| UC-07 | Paginate | Browse, Company, Directory | P2-03, P2-07 | P2-12 |
| UC-08 | Open job detail | Browse -> Job detail | P2-01, P3-01 | P3-10 |
| UC-09 | Apply | Job detail | P3-02 | P3-10 |
| UC-10 | Share a filtered URL | Browse | P1-11, P2-05 (Copy link), P2-09 | P2-12 |
| UC-11 | Back/forward keeps state | Browse <-> Job detail | P2-07, P3-05 | P2-12, P3-10 |
| UC-12 | Browse a company | Company, Directory | P3-06, P3-07 | P3-10 |
| UC-13 | Recover from zero results | Browse, Company | P2-08 | P2-12 |
| UC-14 | Handle an expired job | Job detail (expired), 404 | P3-04, P3-01 | P3-10 |
| UC-15 | Offline and slow network | Browse, Job detail, Error | P2-08, P2-02 (skeleton), P4-06 | P2-12, P4-06 |
| UC-16 | Screen-reader use | all | P1-05 (landmarks, live region), P2-07, P3-10, P4-02 | P4-02 |
| UC-17 | Keyboard-only use | all | P2-06, P2-12, P4-01, P4-02 | P2-12, P4-02 |
| UC-18 | Clear and edit filters | Browse, Company | P2-04 (ChipBar), P2-07 (focus rules) | P2-12 |
| UC-19 | Invalid or stale parameters | Browse, Company | P2-09, P1-11 | P2-12 |
| UC-20 | Print or save a job | Job detail | P3-09 | P3-10 |
| UC-21 | Theme and motion preferences | all | P1-03, P4-05 | P4-05 |

Success metrics in 03 section 5 map to: LCP/INP/CLS/JS -> P1-12, P4-03; back-button and share-link fidelity -> P2-12;
accessibility -> P4-02; time-to-Apply and honesty questions -> P4-09 (human sessions).

---

## 7. What NOT to build (anti-scope, from 00 section 5, 01 section 5, 03 section 6)

- Accounts, login, signup, saved jobs, alerts, email capture, profiles, application tracking, "recently viewed", any
  personalisation (the optional `localStorage` idea in 00 is **not** in v1).
- Analytics, cookies, third-party scripts or fonts, session recording, A/B testing, click tracking, redirect-through-our-domain
  Apply links, UTM parameters on outbound links.
- Infinite scroll or "Load more"; list + detail split pane; interstitial "you are leaving" pages or modals; any popup, cookie
  wall, newsletter prompt, push prompt.
- Ads, sponsored or promoted rows, employer posting tools, admin/dashboard of the scraper, AI chat, resume matching,
  salary estimation or currency conversion, fake urgency, "hot/most viewed" badges, "Easy Apply" wording.
- A client-side global store, TanStack Query (v1), a service worker or PWA, i18n framework, per-job dynamic OG images (deferred),
  geocoded location facet (v2), description full-text search, an in-app application form.
- Backend code, DB migrations or any change to the scraper in this workstream (the API is a separate deliverable).
- Hand-written `README`/docs files beyond what the repo's `AGENTS.md` requires (update existing docs; the design docs in this
  folder are updated in place).

---

## 8. Handoff and launch checklists

### 8.1 Handoff checklist (design -> implementer; verify before starting P1)
- [ ] Docs 00-05, 08, 09, 10 read (06/07 if available); open questions Q-01..Q-12 answered or defaulted (P0-01).
- [ ] 08 additions A-01..A-12 merged or declined with fallbacks noted; `contracts/openapi.yaml` exists (P0-02).
- [ ] 06 tokens and 07 component specs available, or placeholder tokens agreed (P0-03).
- [ ] Spikes S1/S4 done; D-06 and D-08 updated with the decided mechanism (P0-04).
- [ ] Root repo prepared (`GenerateDocs` exclude, `.gitignore`, `AGENTS.md` note) and root checks pass (P0-05).
- [ ] Exact version pins list prepared (P0-06); Node 24 and TypeScript 6.0.x confirmed on both hosts.
- [ ] Vercel and Netlify accounts/projects access confirmed by the owner (personal-account repo for Hobby, 02 4.2).

### 8.2 Launch checklist (P5-05)
- [ ] `API_MODE=live`; live contract smoke green; capability flags match the real API.
- [ ] Lighthouse CI on production URLs meets 09 14; field data not required.
- [ ] axe zero serious/critical on production build; manual NVDA/VoiceOver scripts re-run on the final build.
- [ ] robots.txt, sitemap index and children correct on production; `indexability()` crawl test green; previews `noindex`.
- [ ] Rich Results Test run on a job page **only if** JSON-LD is emitted; otherwise noted as not applicable.
- [ ] Cookies: none (DevTools and E2E); no third-party requests (network audit), logos excepted and disclosed.
- [ ] Privacy and About copy final, host name and contact filled, owner approved; Referrer behaviour matches the Privacy text.
- [ ] Security headers verified with a header scan; CSP enforced.
- [ ] Revalidation hook tested end to end; TTLs tuned; invocation/ISR usage projected within the free tier.
- [ ] Netlify fallback deploy still builds from `main` (smoke).
- [ ] Legal/ToS and takedown contact decision recorded (Q-07).
- [ ] Docs synced (`AGENTS.md`, `README.md`, `documentation/README.md`, known issues, bug-fix log), `npm run docs:generate`
  run, final commit with a detailed message.

---

## 9. Implementer prompt (copy-paste)

```text
You are implementing the public job-board frontend for the Ashby Job Scraper repo at
/Users/pavanreddy/Documents/anti-gravity/job-scrapper. The design is finished; your job is to build it, not redesign it.

READ FIRST, IN THIS ORDER (fully):
1. /AGENTS.md and /documentation/README.md (repo rules: docs sync, docs:generate, conventional commits).
2. /documentation/frontend-design/00-brief-and-index.md  (scope, constraints, anti-goals)
3. 09-frontend-architecture.md  (decisions D-xx, folder tree, routes, URL state, data layer, SEO, perf, security, tests, CI)
4. 10-implementation-roadmap.md  (this plan: phases, task IDs, acceptance criteria, verification commands)
5. 08-api-contract-proposal.md  (read section 10 first: reconciliation, additions A-xx, clarifications C-xx; then sections 2-4, 7)
6. 04-information-architecture-and-flows.md, then 05-screens-and-states.md  (URL scheme, behaviours, wireframes, exact copy, states)
7. 03-personas-and-use-cases.md  (UC-* acceptance criteria you must satisfy)
8. 06 and 07 if present (design tokens, Figma spec); otherwise use placeholder tokens with the names in 09 section 8.3.
9. 01 and 02 only for evidence and version/host details.

CONSTRAINTS (non-negotiable):
- Work in web/ (plus the root edits in task P0-05). Do not change src/, prisma/, tests/ of the scraper.
- Never read, print, stage or commit .env, output/, apikeys/. The web app never needs the root .env.
- No accounts, cookies, analytics, third-party scripts, infinite scroll, popups, ads (see roadmap section 7).
- Build against the mock (API_MODE=mock) until Phase 5. Do not call a real API.
- Pin exact versions after re-running `npm view`; TypeScript stays on 6.0.x; Node 24.
- Do not trust [UNVERIFIED] items; run the Phase 0 spikes and record results by editing the Decision rows in 09.
- Use only the copy in 05; add missing strings to 05 in the same commit.
- Server Components first; client islands are small leaves. No TanStack Query, no global store, no nuqs (D-04, D-18).
- Follow AGENTS.md on every change: sync docs, run `npm run docs:generate`, run root checks, then commit with a Conventional
  Commit subject and a detailed bulleted body (end with the attribution lines the harness gives you). Commit per task group.

HOW TO WORK:
- Execute phases in order (P0 -> P5). Within a phase follow the task dependencies. Do not start a phase until the previous
  Definition of Done is met. Tick acceptance criteria explicitly; if one cannot be met, stop and report why.
- After each task: run the verification commands listed for the phase (from web/: npm run lint, npm run typecheck,
  npm run format:check, npm test, npm run test:contract, npm run build, npm run test:e2e, npm run test:a11y, npm run lhci,
  npm run size; from repo root: npx tsc --noEmit -p . && npm run lint && npm test; then npm run docs:generate).
- When you find a conflict between documents, prefer: 09 decisions > 08 section 10 > 04/05 > 03 > 01/02. Record any new conflict
  as a numbered Decision in 09 section 1 and, if it affects the API, in 08 section 10.
- Ask the owner (do not guess) for: Q-01..Q-12 in 09 section 25.

DEFINITION OF DONE for the whole project: every UC-* in 03 passes its E2E (and keyboard/no-JS/mobile) tests, zero serious/critical
axe violations, performance budgets in 09 section 14 met, the SEO matrix test green, the launch checklist in 10 section 8.2 complete.

START NOW with Phase 0: P0-01 (list the open owner questions and propose defaults), P0-05 (root repo prep), P0-06 (version
verification). Report back with the answers you need before P0-04.
```

---

## 10. Phase summary and ordering

| Phase | Outcome | Rough size | Gate to next phase |
|---|---|---|---|
| P0 | Decisions, contract, spikes, repo prep | about 3-5 days incl. owner latency | DoD above |
| P1 | Foundation, mock API, codec, CI, preview deploys | about 2-3 weeks of agent time | `npm run verify` + CI green + contract tests |
| P2 | Browse complete | about 2-3 weeks | UC list green, budgets met, S5 closed |
| P3 | Detail, company, Apply | about 1.5-2 weeks | UC-08/09/12/14/16/20 green |
| P4 | Polish and audits | about 1.5-2 weeks | audits clean, budgets met, CSP enforced |
| P5 | Live API and launch | about 1-2 weeks after the API exists | launch checklist complete |

The critical external dependency is the backend API (R-01): Phases 0-4 do not wait for it; only P5 does.
