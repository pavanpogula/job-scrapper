# ADR-0020: B.O.O.L.E.A.N Rebrand, LinkedIn-Style Job Browsing, and Company Directory Pages

- Status: Accepted
- Date: 2026-10-27
- Deciders: owner, frontend agent
- Related: ADR-0018, ADR-0019

## Context
The Ashby Job Scraper frontend was initially a prototype interface with several usability and presentation shortcomings identified during visual reviews:
1. The Jobs page presented a single full-width column where the right ~60% of each row was empty on desktop viewports.
2. Every job row rendered a bulky "Apply Direct" button and monospace destination URL, doubling mobile card height and creating repetitive visual noise.
3. Raw database enums were rendered directly (`FullTime`, `OnSite`, etc.) without human formatting, and company logos were missing from list cards.
4. On the Companies directory page, wordmark logos in 40px square avatars were cropped awkwardly (e.g. 1Password rendered as "ass").
5. The branding was generic ("Ashby Index") and lacked a distinct product identity. The product identity was determined to be **B.O.O.L.E.A.N** (never expanding the acronym).
6. Job detail views lacked context regarding other open roles at the employer and lacked company-specific landing pages.

## Options Considered
1. **Multi-page navigation with modal previews**: Keep the full-width list on desktop and open postings in modal dialogs. Rejected because modals disrupt navigation flow, break standard browser back/forward ergonomics, and feel cramped on desktop viewports.
2. **Infinite scroll feed with inline expanders**: Expand role descriptions inline within the list. Rejected because inline expansion causes dramatic layout shifts (CLS), loses user scroll position in long lists, and makes keyboard navigation cumbersome.
3. **LinkedIn-style Two-Pane Master/Detail with Dedicated Company Pages**: Adopt desktop two-pane layout (scrollable left list with sticky right detail panel), URL-synced selection (`?jobId=`), humanized labels via `labels.ts`, uncropped `CompanyAvatar` tiles, compact filter pills, and dedicated company profile pages (`/companies/:slug` with Overview and Jobs tabs). On mobile (< md), retain single-column list with direct route navigation to `/jobs/:id` and a bottom-sheet drawer for filters.

## Decision
Adopt Option 3:
1. **User-Facing Rebrand**: Wordmark `B.O.O.L.E.A.N` (`BrandMark.tsx`) placed in `Header` and `Footer`, title updated to `"B.O.O.L.E.A.N · Direct jobs from company career boards"`, favicon updated to a high-contrast "B" mark, and copy updated in `AboutPage.tsx`. No repo, package, API, or infrastructure renames.
2. **Master/Detail Ergonomics (`BrowsePage.tsx`)**:
   - Desktop (>= md): Two-pane split. Left column (`JobList`, `JobCard`) displays 48px `CompanyAvatar` (uncropped, neutral tile, initials fallback), job title, company link, location line (`City · Workplace`), tabular salary badge, and relative freshness `<time>` tag. No apply buttons or destination URLs on list cards.
   - Right column: Sticky `JobDetailPanel` displaying primary "Apply Direct", secondary "View original posting", sanitized HTML description, compensation overview, and "About <company>" profile summary card.
   - URL Synchronization: Selected job synced via `?jobId=`, first job auto-selected on desktop if unspecified, prefetching enabled on card hover/focus (`usePrefetch('getJobById')`), and focus automatically transferred to the detail heading on selection.
   - Mobile (< md): Single column list with card taps navigating to `/jobs/:id`. Filters accessible via bottom-sheet drawer.
3. **Filter Pills & Deep Links (`JobFiltersBar.tsx`)**:
   - Compact top search (retaining BF-020 full-text search semantics and accessibility attributes) with country selector.
   - Row of interactive filter pills: Date posted (`postedWithin=1d|7d|30d`), Workplace, Employment, Has salary, Remote only, and Sort.
   - Supports `?company=<slug>` deep-linking from company pages.
4. **Company Profile & Directory Pages (`CompanyPage.tsx`, `CompaniesPage.tsx`)**:
   - `CompaniesPage`: Grid of `CompanyCard`s with uncropped logo tiles, search, and a "Most hiring / A–Z" sort toggle (`sort=jobs|name`).
   - `CompanyPage`: Dynamic hero banner with 80px avatar, metadata, external Ashby board link, sticky tab navigation, `Overview` tab (hiring metrics, top departments, workplace mix, location breakdown), and `Jobs` tab (recent 10 carousel, department accordions, in-company search, two-pane selection, and "See all in search" link).
   - Unknown company slugs render a friendly 404 state.
5. **Labels & Presentation (`lib/labels.ts`)**:
   - Maps raw ATS enums to human-readable strings (`Full-time`, `Part-time`, `On-site`, `Hybrid`, `Remote`, `Internship`, `Temporary`) and formatted salary ranges (`$140k – $180k/yr`).

## Consequences
- Fixes all visual layout issues observed on live site in light and dark modes.
- Greatly increases job scanning speed on desktop while preserving full mobile ergonomics.
- Eliminates logo cropping for wordmark logos across all screens.
- Zero extra backend changes required (PR A backend API fully reused).
- Zero `any` additions; any-ratchet lowered to 1 file.
