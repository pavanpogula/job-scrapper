# PR B — B.O.O.L.E.A.N UI: rebrand, LinkedIn-style jobs, company pages (Antigravity prompt)

> Owner: only after PR A is merged AND the backend is deployed, paste
> "Read docs/plans/boolean-ui/PR-B-boolean-ui.md and implement it exactly." into a fresh Antigravity session.
> Full background and screenshot-based research: `docs/plans/boolean-ui/00-PLAN.md`.

You are working in the Ashby Job Scraper monorepo. Implement ONE PR: the B.O.O.L.E.A.N UI — rebrand + LinkedIn-style
job browsing + company pages. Squash-merge. Frontend only. Follow AGENTS.md, CLAUDE.md, docs/agents/context.md, every
rule in docs/agents/rules/ (frontend-invariants, frontend-design, api-contract-sync), and 00-PLAN.md.

## HARD RULES
- Never read/print/commit `.env*`, `apikeys/`, `output/`, `.vercel/`; never push main, never merge/force-push/delete
  branches, never raw `git push` or `gh`; publish only with `scripts/agents/push-branch.sh`.
- No backend changes (PR A already shipped the API). No deploys/scrapes. No new `any`. MUI 9 only — no Tailwind.
- PRECONDITION: origin/main contains PR A (backend/src/api/types.ts has CompanyProfileDTO) AND the live API answers
  https://job-scrapper-api-eight.vercel.app/v1/companies/openai with 200. Otherwise STOP and tell the owner.
- Branch: `feat/boolean-ui`

## USE THESE SKILLS (in order) — they are in .agents/skills/
1. **impeccable**: run its `context` script, then `init` -> PRODUCT.md (users: job seekers browsing direct company
   postings; surface mode: Operate; brand: B.O.O.L.E.A.N). Then `shape` the four screens below, then new-work.
   Read reference/craft-floor.md before every UI edit.
2. **design-taste-frontend**: its app-screens run + inspector for the dense list/detail screens.
3. **emil-design-eng**: motion/polish (hover, selection, panel transitions; honour prefers-reduced-motion).
4. Finish: impeccable `document` (writes DESIGN.md from the shipped code), then `critique`, `audit`, `polish`.
   Commit PRODUCT.md and DESIGN.md where the skill places them.

## RENAME (user-facing only)
- Wordmark "B.O.O.L.E.A.N" (new components/brand/BrandMark.tsx) in Header + Footer, replacing "Ashby Index".
- frontend/index.html `<title>` "B.O.O.L.E.A.N · Direct jobs from company career boards" + meta description; new
  frontend/public/favicon.svg ("B" mark); About page copy. Do NOT invent an expansion of the acronym.
- Do NOT rename repo, package names, Vercel projects/URLs, API paths, Redis keys, or the scraper User-Agent.

## PROBLEMS TO FIX (seen in Chrome on the live site, light AND dark — all must be gone)
- Jobs page is one full-width column; right ~60% of each row empty.
- Heavy "Apply Direct" button on EVERY row (doubles card height on mobile).
- Monospace "jobs.ashbyhq.com/<slug>" line on every card; no company logos on cards.
- Raw enums "FullTime", "OnSite" etc. -> human labels via new lib/labels.ts (Full-time, Part-time, On-site, Hybrid,
  Remote, Contract, Internship, Temporary) and salary like "$140K–$180K/yr".
- Six outlined selects for filters; generic heading "Verified Ashby Job Postings"; mobile search placeholder truncated.
- Companies page crops wordmark logos in 40px squares ("ass" for 1Password); monospace slug; main action leaves the site.
- Job detail: raw enum chips, long monospace "Destination URL" block, company card links to "all companies".

## SCREENS (layout patterns from LinkedIn/Ashby/YC — never LinkedIn branding, colours or copy)
1. **Jobs "/"**
   - Compact top bar: keyword search (keep BF-020 placeholder semantics + aria-label "Search jobs by title, company or
     location") + country field + Search; under it a row of filter PILLS: Date posted (Past 24h/week/month ->
     postedWithin), Workplace, Employment, Salary (has salary), Remote, Sort, "Clear".
   - Coloured results header: "<query> in <country> · N results" (polite live region).
   - Desktop >= md: TWO PANES.
     - Left: scrollable JobList of JobCards — logo 48px (object-fit contain, padding, neutral tile, initials fallback),
       title in link colour, company (links to /companies/:slug), "City · On-site", salary, freshness
       ("Posted/Updated …" from lib/formatJobFreshness). NO apply button, NO url line. Selected card: tint + 3px left
       accent; aria-current. Numbered pagination at bottom.
     - Right: sticky JobDetailPanel — small logo + company link, big title, meta line "Location · Posted 2d ago",
       outlined chips, primary "Apply ↗" (external), secondary "View original posting", sanitized description
       (lib/sanitize.ts), "About <company>" card -> /companies/:slug.
     - Selection in URL `?jobId=` (shareable, Back works); first job auto-selected on desktop; prefetch detail on card
       hover/focus (RTK Query usePrefetch); focus moves to detail heading on select.
   - Mobile: list only; tap opens /jobs/:id; filters in bottom-sheet drawer (reuse existing drawer logic).
   - Support `?company=<slug>` in useJobFilters so "See all in search" can deep-link.
2. **Job page "/jobs/:id"**: same JobDetailPanel full width + "More jobs at <company>" (company= filter, 5 cards).
3. **Companies "/companies"**: grid of CompanyCards (logo tile not cropped, name, "N open jobs"); search; sort toggle
   "Most hiring / A–Z" (sort=jobs|name); card -> /companies/:slug; Ashby board link is a secondary icon action.
4. **Company page "/companies/:slug"** (+ "/companies/:slug/jobs"), tabs in the URL:
   - Header: banner band, large logo overlapping it, name, "N open jobs · M locations", "View on Ashby ↗".
     Sticky compact header on scroll (logo · name · tabs).
   - Overview tab: from CompanyProfile — top departments, top locations, workplace mix, salary-transparency share,
     latest posting date.
   - Jobs tab: "Recently posted" carousel (newest 10, ‹ ›), then full list grouped by department (collapsible, count
     per group) with in-company search + filters; desktop uses the same two-pane JobList + JobDetailPanel;
     "See all in search" -> /?company=<slug>.
   - Unknown company -> friendly 404 state.

## CODE STRUCTURE (reuse first)
- New: components/brand/BrandMark.tsx; components/common/CompanyAvatar.tsx (extract logo/initial logic from
  CompaniesPage.tsx and JobDetailPage.tsx); components/jobs/{JobCard,JobList,JobDetailPanel,JobFiltersBar}.tsx;
  components/companies/{CompanyCard,CompanyHeader,CompanyOverview,DepartmentGroups}.tsx; pages/CompanyPage.tsx;
  lib/labels.ts; move formatSalary + formatCountryOption out of BrowsePage.tsx into lib/ (update test imports).
- Reuse: useJobFilters (+parseSortParam/parseOrderParam), formatJobFreshness/formatDetailFreshness, sanitizeHtml,
  QueryState, jobsApi (add getCompanyProfile(slug); company/postedWithin params; companies sort).
- App.tsx: lazy routes /companies/:slug and /companies/:slug/jobs. BrowsePage becomes a thin composition.
- Theme tokens in frontend/src/theme/theme.ts, light + dark, AA contrast.

## QUALITY FLOOR
role=list on lists, keyboard Tab/Enter (↑/↓ optional), visible focus, live-region counts, skeletons, empty/error states
via QueryState, no layout shift when switching jobs, lazy chunks kept (note bundle size in PR).

## TESTS (Vitest + MSW; write first)
- JobCard (logo fallback, human labels, salary, freshness, company link, no apply button).
- Two-pane: first job auto-selected; click sets ?jobId=; Back restores; mobile width navigates to /jobs/:id.
- Filter pills send postedWithin / workplaceType / etc.; ?company= deep link sends company=.
- CompanyPage: Overview/Jobs via URL, jobs request has company=slug, department grouping, 404 state.
- Companies sort toggle sends sort=jobs. Brand: document.title + header show B.O.O.L.E.A.N.
- Keep green: searchBox, jobFreshness, countryFacets, sortParams, contract (update selectors only where markup changed).

## DOCS + AGENTS
frontend/docs/frontend-ui.md (routes, layout, components), frontend/docs/testing.md, frontend/README.md, root README.md
title, AGENTS.md + frontend/AGENTS.md product name, docs/agents/context.md product name (BYTE BUDGET 6144) then
`node scripts/agents/sync-shells.mjs` + `--check`, docs/agents/rules/frontend-design.md (point to PRODUCT.md /
DESIGN.md), docs/system-architecture-and-flows.md, ADR-0020 "B.O.O.L.E.A.N brand and LinkedIn-style job browsing"
(+ index), CHANGELOG [Unreleased], `npm --prefix backend run docs:generate`.

## VERIFY
- `scripts/check-all.sh --no-install`
- `node --test 'scripts/repo-tests/**/*.test.mjs'`
- `node scripts/agents/sync-shells.mjs --check`
- Run `npm --prefix frontend run dev` against the live API and capture before/after screenshots at 1440px and 390px,
  light + dark, for: jobs, job detail, companies, company Overview, company Jobs. Put them in the PR body with the list
  of fixed problems.

## COMMIT + PUBLISH
- `feat(ui): B.O.O.L.E.A.N rebrand, LinkedIn-style job browsing and company pages (ADR-0020)`, bulleted body.
- `scripts/agents/push-branch.sh`; give the owner the link.

## ROLLOUT (PR body)
Merge -> Deploy to Vercel `app=frontend` production -> smoke + visual check.
