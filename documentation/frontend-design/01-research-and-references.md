# 01 · Research & References

> **Status:** design research only. Nothing here is implemented. Author: research pass of **2026-10-22** (every "checked" date below is that day).
> **Evidence labels used throughout**
> - **[OBSERVED]**: fetched and read in this session (WebFetch of the live page, 2026-10-22). Pages are fetched as text, so visual details (colour, spacing) are not captured.
> - **[SOURCE]**: stated by a primary source (Google Search Central, NN/g, W3C, etc.) that was fetched or surfaced in this session.
> - **[PRACTITIONER]**: third-party blog / practitioner opinion; useful but not research.
> - **[UNVERIFIED]**: could not be fetched or confirmed in this session (login wall, 403, JS-only page, or a search that did not return the primary source). Written from general product knowledge; the implementing agent must not treat it as fact.
>
> **Fact-check round 1 (2026-10-22):** NN/g, Google JobPosting / pagination / faceted-navigation, Baymard applied-filters and W3C APG combobox/pattern-index were re-fetched; corrections are marked **[FC1]** inline. Where `09-frontend-architecture.md` section 1 (decisions D-01..D-24) overrides a recommendation below, the text carries a **Superseded by 09 D-xx** note.

---

## 1. Survey of real job boards (14)

Method note: WebFetch returns page text, not screenshots. Where a site blocked the fetch (HTTP 403, JS-only shell, login wall) the row is marked **[UNVERIFIED]** and described from general knowledge only.

### 1.1 Hosted ATS boards (our closest relatives)

#### 1. Greenhouse-hosted board (e.g. `job-boards.greenhouse.io/anthropic`) **[OBSERVED]**
- **Layout:** single page. Header with company logo, "Open Roles" heading, a "Create a Job Alert" banner (their account feature, we will not have it), then a **Search** text box, then two dropdown filters (**Department**, **Office**), then a result count ("683 jobs"), then the list grouped under department headings. Each job is its own page (separate-page model, no split pane).
- **Row anatomy:** title (sometimes with bracket prefix like "[Expression of Interest]" or a "New" tag) + location(s) joined by `,` `;` or `|`. **No salary, no date, no team, no snippet in the row.**
- **Pagination:** numbered page links at the bottom (1, 2, 3, 4 ... 14) with ellipsis; ~50 roles per page.
- **Apply:** on the job's own page; "Powered by Greenhouse" in footer.
- **Good:** honest, fast, scannable; the count; real pagination; grouping by department.
- **Bad:** rows carry too little to judge a job (no salary/recency); free-text location cells with mixed separators get ragged; filters are only two dropdowns.

#### 2. Lever-hosted board (e.g. `jobs.lever.co/palantir`) **[OBSERVED]**
- **Layout:** one long page. Four filter groups at the top rendered as **plain link lists**, each starting with "All": Location type (On-site/Hybrid/Remote), Location (~27 options), Team (~22), Work type (Full-time/Internship/...). Each filter is a **query parameter** (`?workplaceType=`, `?location=`, `?team=`, `?commitment=`), so every filtered view is a shareable URL.
- **Grouping:** jobs grouped under bold team headings (Engineering, Finance...).
- **Row anatomy:** bold title; meta line "Hybrid — Full-time"; location line beneath. Team comes from the group heading. A separate "Apply" link per row plus a clickable card; both go to the Lever-hosted posting.
- **Pagination:** none observed (everything on one page) - fine for hundreds of jobs, impossible for 34,000.
- **Good:** URL-param filters, zero JS dependence, very low visual noise, workplace type is a first-class filter.
- **Bad:** link-list filters are long and get unwieldy on mobile; no search box; no salary.

#### 3. Ashby-hosted board (e.g. `jobs.ashbyhq.com/<company>`) **[UNVERIFIED]**
- The fetch returned only the page title (the board is a JS-rendered app). From general knowledge: a minimal list grouped by department with title, location and employment type, a department/location/type filter row, and a separate posting page with an "Apply" button and an embedded application form. This is the source of our data, so the real postings are the ground truth for what fields exist (see `00-brief` section 4).
- **Take-away for us:** our Apply link goes to this page; the visitor should be told that in advance (trust cue, section 2.8).

### 1.2 Aggregators & marketplaces

#### 4. Himalayas (`himalayas.app/jobs`) **[OBSERVED]**
- **Layout:** one continuous results list; controls at top: "Clear" and "Search", an "Edit filters" control, tabs **Jobs / Matches / Saved** (the last two are sign-up gated). Browse shortcuts: experience-level links (Entry-level ... Executive) and "Related searches" chips (Python, .NET, ...).
- **Sort (exact labels):** Most relevant (default), Most recent, Salary (low - high), Salary (high - low). Salary sort is a strong, rare feature.
- **Card anatomy:** company logo + name (links to company page); **location restriction** (e.g. "United States only", "AL, AD + 71 more"); title; **relative time** ("2 mins ago", "6 days ago"); employee-count band ("51-200"); links to company salaries/benefits; type + category tags (Contractor, UI UX Designer); a **"View job"** button; **"Sign up to save this job"** link; **salary range** in two formats ("$55K - $70K per year", "$60.00 - $120.00 per hour").
- **Pagination:** the text capture showed a single list with no page controls; whether it is infinite scroll or paged could not be determined.
- **Apply:** "View job" opens Himalayas' own job page first (an extra hop).
- **Good:** rich cards, relative time, salary sort, location-restriction chips, company links.
- **Bad:** repeated "Sign up / Sign up with Google" prompts, sponsored promo blocks interleaved with job rows (looks like jobs), salary shown in mixed units, odd data like "$175.00 - $175.00 per hour".

#### 5. RemoteOK (`remoteok.com`) **[OBSERVED, partial]**
- **Layout:** left nav of link groups (General, Top jobs, Companies, Feeds...), filter panel with a **minimum-salary slider** ("Minimum $0k/year"), long tag lists (Benefits, Regions, an alphabetical list of ~all countries with flag emoji), sort bar: **Latest jobs, Highest paid, Most viewed, Most applied, Hottest, Most benefits**. A "Clear" control with a "Clear N results" counter.
- **Interruptions:** on load, a **modal** ("Unlock your remote career potential with Remote OK Premium", "Get instant access"); a "Post a Job" banner; "Log in" in the header. Job rows themselves were not in the text capture, so row anatomy is [UNVERIFIED]; from general knowledge, dense rows with logo, title, company, tag chips, salary and age.
- **Good:** minimum-salary filter and "Highest paid" sort; extreme density for power users.
- **Bad:** popup on first view, text-dense filter dump, promotional upsell competes with the task. A clear example of what to avoid (section 5).

#### 6. We Work Remotely (`weworkremotely.com`) **[UNVERIFIED]**
- Fetch returned HTTP 403. From general knowledge: category-grouped lists (Programming, Design, ...) of compact rows (logo, company, title, region, tags, "New"), a prominent "Post a job" button, search box on top, and a "View all" link per category; pagination is limited because it is category-capped. Treat as a reference for **text-first density** only.

#### 7. Built In (`builtin.com/jobs`) **[OBSERVED]**
- **Layout:** top search bar (title/company/keyword) + a **work-arrangement dropdown** ("Remote / Hybrid"); quick filter chips/dropdowns for **New Jobs, Job Category, Industry**, each with a Clear; an **"All Filters" panel** (job type, experience, company, size, ...) with **Reset** and **View Results** buttons (an explicit apply step); "Save Job Alert" button.
- **Card anatomy:** company logo + name (linked to profile); title; **posting age** ("8 Minutes Ago", "Reposted Yesterday"); **work arrangement** (Remote / In-Office / Hybrid) with location or "N locations"; sometimes an "Easy Apply" tag; **salary range** ("109K-251K Annually") and **experience level**; industry tags; a **short role summary**; a "Top Skills" list. Salary is repeated in two places on many cards; some cards omit it; ranges are sometimes very wide.
- **Pagination:** **numbered pages** (1-5, ellipsis, a jump to page 1000, next arrow).
- **Sign-up pressure:** resume-upload panel, "Free Application Tracker", "Create Free Account" footer panel, repeated Join/Log in; save/track actions redirect to login.
- **Good:** the richest scan-able card in the set (age + arrangement + salary + experience on one glance); real pagination; explicit filter panel with Reset/View Results.
- **Bad:** cards are heavy (summary + skills + tags) which lengthens scroll; promo panels between results; account pressure everywhere.

#### 8. Wellfound (`wellfound.com/jobs`) **[OBSERVED, landing page only]**
- **Layout:** hero with a "Job title" + "Location" search and Search button, "Trending startups hiring now" company cards, "Trending startup jobs" list, then category sections (Engineering, Product, Design ...) each with "View all" to a pre-filtered category page, then big link directories (jobs by role, by location, by role+location). The directory-of-links footer is a deliberate **SEO landing-page structure**.
- **Card meta line (bullet-separated):** work arrangement ("Remote only", "Onsite or remote") + location (+N more) + **salary** (currency varies, e.g. "₹5L - ₹10L") + **equity** ("No equity" when none) + **posting age** ("today", "3 days ago"); Save and Apply buttons. Company cards show size band, tagline, response-time badge ("Responds within a few days"), open-positions count.
- **Login:** listings visible; sign-up prompts on every block; profile implied for apply. Filter controls beyond title/location were not visible on the landing page.
- **Good:** one-line meta strip is the model for our card; explicit "No equity"/"No salary" states rather than blank; category and location landing pages.
- **Bad:** account gravity; "responds within..." badges are unverifiable claims (do not copy).

#### 9. Welcome to the Jungle (`welcometothejungle.com/en/jobs`) **[OBSERVED, landing + FAQ]**
- **Layout:** search hero "What job are you looking for?". Per its own FAQ the filters (contract type, location, remote, salary) sit in a **left panel on desktop and at the bottom of the screen on mobile**. Brand-led, editorial, company-culture oriented; job result cards and pagination were not in the capture ([UNVERIFIED]).
- **Good (per FAQ):** documented bottom placement of filters on mobile; editorial company storytelling.
- **Bad/irrelevant for us:** culture marketing and "Match me to jobs" account funnel.

#### 10. Y Combinator Work at a Startup (`workatastartup.com/jobs`) **[UNVERIFIED]**
- Fetch returned only a page title (JS app). From general knowledge: filter-heavy search (role, location, company stage, visa), company-grouped job cards, and applications through a YC account (login required). Borrow only the idea that company context (batch, size) can sit next to the job; do not borrow the account gate.

#### 11. Indeed **[UNVERIFIED]**
- Not fetched (heavy bot protection). From general knowledge: the reference for **list + detail split pane on desktop** (results on the left, full job on the right, URL carries `vjk=`), and a separate full page on mobile. Heavy on "Easily apply", sponsored results and sign-in prompts. We deliberately do **not** adopt the split pane: it complicates SEO/shareable URLs and keyboard/focus handling for little gain with ~34k jobs that mostly lack descriptions.

#### 12. LinkedIn Jobs **[UNVERIFIED]**
- Not fetched (login wall for most content). From general knowledge: split pane, chips row for Date posted / Experience / Remote, "Easy Apply" vs external apply, sign-in modal after a few results (the canonical **login-wall dark pattern**, section 5).

### 1.3 Careers pages & text-first front-ends

#### 13. Linear / Vercel-style company careers pages **[UNVERIFIED]**
- Not fetched. From general knowledge: very quiet, typographically led pages: a short pitch, a plain list of roles grouped by team with location and a single arrow, no filters. Reference for **tone and typography**, not for functionality at 34k scale.

#### 14. Hacker News "Who is hiring?" front-ends (e.g. community search UIs) **[UNVERIFIED]**
- Not fetched. From general knowledge: each posting is a free-text paragraph; front-ends add keyword search, "remote" toggles and date filters over that text. Reference for **extreme text density and zero decoration**, and for the audience's expectation that search should be instant and fuzzy.

### 1.4 Cross-site pattern summary (what the 8 observed sites actually do)

| Question | What was seen |
|---|---|
| Detail model | Separate page per job on every observed site (Greenhouse, Lever, Himalayas, Built In, Wellfound). Split pane only on Indeed/LinkedIn (UNVERIFIED). |
| Pagination | Greenhouse numbered; Built In numbered with ellipsis; Lever none (small); Himalayas undetermined. No observed board uses pure infinite scroll for large result sets (limited evidence). |
| Filters | Greenhouse: 2 dropdowns; Lever: URL-param link lists; Built In: quick filters + "All Filters" panel with Reset / View Results; WTTJ: left panel on desktop, bottom on mobile (per FAQ). |
| Card fields (richest) | logo, company, title, age, arrangement, location, salary, level, tags (Built In). Minimal: title + location (Greenhouse). |
| Sort | Himalayas (4 incl. salary), RemoteOK (6 incl. highest paid). |
| Account pressure | High on Himalayas, Built In, Wellfound; low on ATS-hosted boards. |
| Interruptions | RemoteOK modal; sponsored blocks on Himalayas. |

---

## 2. Evidence-based guidance on the key decisions

### 2.1 Pagination vs infinite scroll vs "Load more"

**Evidence**
- NN/g: infinite scroll suits homogeneous content browsing with no specific goal (feeds, entertainment). **Avoid it when users need to find something specific, compare items across a long list, or review top results; avoid for accessibility-sensitive or low-bandwidth users.** Pure infinite scroll can make the footer unreachable; returning via Back often drops users at the top of the list; users can believe they reached the end. "Load more" is the compromise (footer reachable, signals more content) at the price of an extra click. Integrated pagination is "unproven" (no user-testing data). The article states no option is universally best. [SOURCE: nngroup.com/articles/infinite-scrolling-tips/ (Tim Neusesser, published 2022-09-04), re-fetched 2026-10-22 **[FC1]**: the claims above were confirmed; "Back lands at the top" is the article's wording for infinite lists generally]
- NN/g video summary: infinite scroll lowers interaction cost for long lists of homogeneous items but is less suited to finding a particular item; alternatives named: load-more button, pagination in a long scroll, traditional pages. [SOURCE: nngroup.com/videos/infinite-scrolling-when/ via search snippet]
- Smashing (2016, e-commerce study): "Load more" made users browse more items than pagination, and the load-more click makes users read items more closely. Newer Smashing piece leans toward pagination or Load more as safer defaults, citing a clear beginning and end. [PRACTITIONER via search snippets; full text not read]
- Google Search Central: give each paginated page a unique URL (`?page=n`); link pages with `<a href>`; **do not canonicalise every page to page 1** (give each its own canonical); `rel=next/prev` is **no longer used by Google**; use real URLs not `#fragments`; "load more" and infinite scroll are not crawlable because Googlebot does not click buttons, so provide `<a href>` links. [SOURCE: developers.google.com/search/docs/specialty/ecommerce/pagination-and-incremental-page-loading, page "Last updated 2025-12-10 UTC", re-fetched 2026-10-22 **[FC1]**: "Don't use the first page of a paginated sequence as the canonical page"; "Google no longer uses these tags [rel next/prev]"; crawlers do not "click" buttons]
- Baymard: the specific article on external load-more vs pagination vs infinite scroll could not be retrieved (page content was an index). **Baymard claims in this area are UNVERIFIED.**

**Decision for this product (job search is a goal-directed, compare-and-pick task; the list is 34k deep; SEO matters; hard constraint says pagination is required):**
- **Primary: classic numbered pagination with real links** (`<a href="/jobs?page=3&...">`), a visible "Showing 51-75 of 1,214 jobs" summary, 25 results per page (an assumption to tune; no source measured the optimum). On mobile collapse to **Previous | Page 3 of 49 | Next** (no 9-button strips).
- Browser Back/Forward and reload restore exactly the same page because the page number lives in the URL. Scroll-restoration to the clicked card on Back is a build requirement (frameworks restore scroll for history navigation; test it).
- Optional later: a "jump to page" input. Not a v1 requirement.
- Reject infinite scroll as the default; "Load more" only if usability testing contradicts this (then it must still be backed by `?page=` links).

### 2.2 Filter UX on mobile

**Evidence**
- Baymard (free page): mobile filters usually live in a **separate interface** (not permanently visible); common problems include repeated trips between list and filter UI, overlong option lists, and obscured filter state; **28% of sites across Baymard's UX benchmarks "don't display an overview at all"** of applied filters (the article's desktop figure is 72% providing one; it gives **no mobile-specific percentage**) and Baymard recommends an applied-filters overview. [SOURCE: baymard.com/research-articles/how-to-design-applied-filters, published 2020-10-06, updated 2026-05-13, re-fetched 2026-10-22 **[FC1]**; the mcommerce benchmark page was seen via search snippet only]
- Whether a bottom sheet beats a full-screen page: **no primary research found**. Practitioner sources split: apply-button + full-screen overlay (Medium article) vs partial overlays that keep the list visible (Kodeco notes full screen "takes the user out of the browsing context"). [PRACTITIONER]
- WTTJ documents filters at the bottom of the screen on mobile; Built In uses an "All Filters" panel with Reset/View Results. [OBSERVED]

**Decision:** one **"Filters" button** (with an active-count badge) opening a **full-height bottom sheet** (a modal dialog): the facets in a scrollable body, a **sticky footer with "Show N jobs" (live count) and "Clear all"**. Apply-on-confirm inside the sheet (avoids reloading the list on every tap and avoids the repeated-trips problem); on desktop the same facets sit in a left rail and apply immediately. Active filters are always visible as **removable chips above the results** regardless of device. Keep the search box and the sort control outside the sheet.

### 2.3 Faceted filters with counts

- Counts beside options and disabling/greying options that lead to zero results prevent dead ends. [PRACTITIONER: Tweakwise docs claim to draw on Baymard/NN/g; attribution not verified.] No NN/g or Baymard primary page on this was retrieved.
- Google guidance for faceted URLs: use `&` as parameter separator (commas, semicolons, brackets are hard for crawlers); fragments do not help; **return a real 404 for filter combinations that yield nothing** ("Return an HTTP 404 status code when a filter combination doesn't return results"); use robots.txt to disallow crawling of faceted URLs (the page lists it first and says canonical/nofollow are generally less effective long-term; **it does not literally say "most effective"** - earlier wording corrected **[FC1]**). [SOURCE: developers.google.com/search/docs/crawling-indexing/crawling-managing-faceted-navigation, page "Last updated 2025-12-18 UTC", re-fetched 2026-10-22]
- **Decision:** show counts for low-cardinality facets (workplace type, employment type, "has salary") and for the top N companies/departments; counts must come from the API for the *current* filter state (backend requirement for 08). Facets with huge cardinality (location, company) use a **searchable combobox**, not a checkbox wall. Because locations are free text and not normalised in the data, do not promise a country/city facet in v1; use "Remote" and a text location search.

### 2.4 Search-as-you-type

- Debounce typing (a common 200-300 ms; **not** sourced to research, tune by measurement) and **commit to the URL** (`?q=`) so the result is shareable; cancel stale requests so out-of-order responses never overwrite newer ones.
- Do not fire a full results fetch on each keystroke if the backend lacks a full-text index (00-brief notes there is none yet); either show suggestions from a lightweight endpoint or commit on Enter + short idle timeout.
- If suggestions are shown in a popup, it is an **ARIA combobox** (section 2.9). If not needed, a plain `<input type="search">` with a submit is simpler and fully accessible. **Recommendation: v1 uses a plain search input with debounced commit, no popup.**

### 2.5 Chips for active filters, and sort

- Active filters as removable chips + a "Clear all" (Baymard applied-filter evidence above; Built In, Himalayas, RemoteOK all expose a Clear).
- Sort options observed: Most relevant, Most recent, Salary high-low/low-high (Himalayas, [OBSERVED]); Latest, Highest paid (RemoteOK). **Decision:** Most recent (default when no query), Best match (default when `q` present), Salary high-low (only meaningful on the ~40% that have salary; define null-handling: nulls last), Company A-Z optional. Sort is a URL param.

### 2.6 Job card information hierarchy

No NN/g job-listing eye-tracking study was found (search returned resume-scanning and a 2013 TheLadders study; [UNVERIFIED] relevance). The hierarchy below is derived from what the observed boards actually show and the brief's decision fields.

| Level | Content | Treatment |
|---|---|---|
| 1 | **Job title** | largest text, link, 2-line clamp with full title in tooltip/`title` and on detail page |
| 2 | **Company** (logo or monogram + name) | beside/above title; links to company page |
| 3 | **Meta strip**: workplace (Remote/Hybrid/On-site) · location · employment type | one line, bullet-separated, truncation with "+N more" for multi-location |
| 4 | **Salary** when present | prominent, tabular numerals; currency + period as published |
| 5 | **Recency** ("Posted 3d ago") when `publishedAt` exists; else fall back to "Updated 3d ago" clearly labelled, or omit | muted, right-aligned or last in the strip |
| 6 | Action | the whole card is the link to detail; a visible "View" affordance. No Apply button in the list (apply happens after the visitor reads the detail), to avoid accidental outbound clicks |

Rules: never reorder fields between cards; keep card height predictable to avoid layout shift; don't show a summary on the list (data is often absent; Built In shows it but its cards are visibly heavier).

### 2.7 Salary display when missing

Evidence: a Jan 2026 survey (Patriot Software, 1,000 US adults; vendor, so treat with caution) found 44% unlikely to apply to a job without a pay range; Aon 2025: 21% of employers publish ranges on all postings, 48% only when required [PRACTITIONER, search snippets]. Only ~40% of our jobs have salary.
- **Decision:** show the range when present; when absent show nothing in the card (or a quiet "Salary not listed" only on the detail page). Do **not** fabricate or estimate salary. Provide a **"Has salary" filter** and the salary sort (nulls last). Normalise display (`$120K-$150K / yr`); for hourly or non-USD show the published currency and period; collapse equal bounds ("$175/hr"). Himalayas' `$175.00 - $175.00 per hour` is the cautionary example [OBSERVED].
- Google: `baseSalary` markup must appear on the page; "Only employers can provide `baseSalary`" [SOURCE, job-posting doc, Last updated 2026-09-08, re-fetched 2026-10-22 **[FC1]**]. Do not emit it if not visible, and treat it as a policy risk for a non-employer site.

### 2.8 Trust cues for the outbound Apply

Our Apply leaves the site for the employer's Ashby page. Evidence is mostly design practice, not research, so [PRACTITIONER]:
- Label the button with the destination: **"Apply on {Company} (Ashby)"** plus an external-link icon, and open in a **new tab** (`target="_blank" rel="noopener noreferrer"`; the `noreferrer` also avoids leaking our URLs). **Superseded by 09 D-14:** the build uses `rel="noopener nofollow"` (deliberately no `noreferrer`) plus site-wide `Referrer-Policy: strict-origin-when-cross-origin`, matching the Privacy page copy in 05.
- A one-line note near the button: "You will apply on the company's own page. We never see your application." (true for this product: no accounts, no tracking).
- Show **last checked / freshness** ("Last seen active 2 days ago", derived from `updatedAt`) and a note that listings can close at any time; if the job becomes inactive between list and detail, show an explicit "This job is no longer listed" page with links to the company's other jobs (HTTP 404/410, see 2.11). **Superseded by 09 D-08:** Next.js pages cannot emit 410; the build returns **404** with the expired-job content (fallback: 200 + `noindex`, accepted soft-404 risk R-05).
- Show the **domain** of the apply URL on hover/under the button.

### 2.9 Empty / zero-results recovery

- Show the active filters as chips with a one-click remove on each, a primary "Clear all filters" button, and suggestions (broaden: drop the location, search "remote"). Never show a bare "No results".
- Keep facet counts so users can see which filter caused zero (Lucidworks note on filters masquerading as zero-result searches is [PRACTITIONER]).
- URLs with no results for a filter combination should return a real 404 to crawlers (Google faceted-nav guidance, section 2.3) while the UI still renders the helpful empty state; for SPA hosting this means the server-side decision is only possible with SSR (see 02).

### 2.10 Accessibility (WAI-ARIA APG and WCAG)

- **Combobox** (if a suggestion popup is built): input has `role="combobox"`, `aria-expanded`, `aria-controls` pointing to the listbox, `aria-activedescendant` for the highlighted option (DOM focus stays in the input), `aria-autocomplete` (`list`), Down Arrow opens/moves into the list, Escape closes, Enter accepts, Tab leaves; popup items are not in the Tab order. [SOURCE: w3.org/WAI/ARIA/apg/patterns/combobox/, re-fetched 2026-10-22 **[FC1]**: all listed attributes/keys confirmed; the page shows no publication date, only "Copyright 2026"]. APG notes a select-only combobox is functionally like a native `<select>`; prefer native controls where they fit.
- **Pagination:** APG has **no dedicated pagination pattern** [SOURCE: w3.org/WAI/ARIA/apg/patterns/ index lists 30 patterns (Accordion ... Window Splitter) and none is pagination, fetched 2026-10-22 **[FC1]**; previously labelled UNVERIFIED]. The markup below is therefore common practice, not an APG-normative pattern. Use a `<nav aria-label="Pagination">` with a list of real links, `aria-current="page"` on the current one, descriptive link text ("Page 3", "Next page"), and disabled Previous/Next rendered as non-link text with `aria-disabled`.
- **Results updates:** announce "N jobs found" in a polite `aria-live` region after filter changes; move focus sensibly after pagination (to the results heading) so keyboard users are not left at the old position. This is standard practice [PRACTITIONER], not tested here.
- **Filter sheet:** modal dialog with focus trap, Escape to close, focus returned to the "Filters" button.
- Target sizes, contrast, reduced-motion and dark-mode contrast are specified in 06; WCAG 2.2 AA is the target (assumption from brief, not re-verified here).
- Infinite scroll is explicitly a poor fit for keyboard/screen-reader users (NN/g, 2.1).

### 2.11 SEO for job listings

**Google for Jobs / `JobPosting` structured data** [SOURCE: developers.google.com/search/docs/appearance/structured-data/job-posting, fetched 2026-10-22]
- **Required:** `datePosted`, `description` (a full job description; cannot equal the title), `hiringOrganization`, `jobLocation` (not required for remote if `applicantLocationRequirements` present), `title`.
- **Recommended:** `applicantLocationRequirements`, `baseSalary`, `directApply`, `employmentType`, `identifier`, `jobLocationType`, `validThrough`.
- **Content policies:** markup only on pages with **a single job**; markup must match the visible page (salary in markup but not on page is a violation); details visible **without login**; the posting must offer a way to apply; **expired postings are not allowed**: remove them or set `validThrough` in the past; if filled, remove; sitemaps list the canonical page per job; give the title "as you received it from the employer".
- **Third-party sites [FC1, doc "Last updated 2026-09-08 UTC", re-fetched 2026-10-22]:** the doc says "You can also integrate with Google by using a third party job site"; a third-party site should "provide the title as you received it from the employer"; the `logo` property "is only eligible to be shown on your job site". **Verbatim: "Only employers can provide `baseSalary`."** (now verified). Listed violations include "Job postings on behalf of an organization or company without authorization" and ads/affiliate content disguised as postings. The page does not define "job aggregator" and gives no aggregator waiver. **Consequence: emitting `JobPosting` markup for scraped postings is at least a policy risk (authorization) and `baseSalary` should not be emitted by a non-employer site; this tightens 09 D-15 (see the contradictions list in the fact-check report). Whether Google surfaces a scraped aggregator page in the Jobs experience is not guaranteed; do not promise it.**
- **Caveat for our data:** `description` is mandatory and our data may lack it (brief section 4: "possibly `metadata.descriptionHtml`, verify"). **Rule: emit `JobPosting` JSON-LD only for active jobs that have a real description, `datePosted` and an organisation name; never fabricate `datePosted` from `createdAt` silently** (decide with the owner; `createdAt` is when *we* scraped it). `directApply` should be `false`/omitted since the visitor is redirected to the employer. Test with the Rich Results Test before launch.
- Expired/inactive job: respond **404/410**, drop from sitemap (**Superseded by 09 D-08:** 404 only in Next.js; and see the streaming caveat in the rendering note below). A site that violates guidelines can lose Jobs-experience eligibility (2018 Google blog, via search snippet).

**Canonical URLs & indexing strategy for filter URLs** [SOURCE: Google pagination + faceted-navigation docs, 2026-10-22]

> **Superseded by 09 D-01 (and D-02).** The table below is the original research recommendation. The adopted policy is: `/` and `/?page=1` index; unfiltered `/?page>=2` is `noindex, follow` with a **self** canonical, not in the sitemap and **not** robots-disallowed; any URL with `q`, `sort`, `size`, `company`, `department`, `location`, `remote`, `salary`, `type`, `posted` is robots-**Disallow** plus `noindex, follow` plus self canonical (not canonical-to-unfiltered). Browse path is `/`, not `/jobs` (D-02; `/jobs` 308-redirects to `/`). Job detail URL is `/jobs/{id}/{slug}` (D-09), not `/jobs/{id}-{slug}`.

| URL class | Example | Index? | Canonical | Crawl control |
|---|---|---|---|---|
| Home / unfiltered listing | `/jobs` | yes | self | open |
| Paginated unfiltered | `/jobs?page=3` | yes | **self** (not page 1) | `<a href>` links, no rel=next needed |
| Job detail | `/jobs/{id}-{slug}` | yes (if active) | self | in sitemap; 404/410 when inactive |
| Company page | `/companies/{slug}` (+ `?page=`) | yes | self | in sitemap |
| Curated landing pages (e.g. `/jobs/remote`) | optional | yes | self | in sitemap (decide in 04) |
| Free-form search `?q=` | | no | to `/jobs` | robots.txt disallow `?q=` (and noindex as backstop) |
| Sort / multi-facet combos | `?sort=salary&remote=1&dept=...` | no | to unfiltered | robots.txt disallow parameter patterns |

Use `&` separators; keep filter state out of `#fragments`. A sitemap index (sitemaps are capped at 50,000 URLs per file by the sitemap protocol; **general knowledge, not fetched**) covering jobs + companies. Open Graph / Twitter card per job and company for shareability.

**Rendering caveat:** Google can render JavaScript, but correct HTTP status codes (404/410), canonical tags, and JSON-LD are most reliable when delivered in the initial HTML. A pure client-rendered SPA cannot return a real 404 for a missing job (it returns 200 + a "not found" screen = soft 404). This drives the architecture recommendation in 02. [analysis; the soft-404 point is standard but not fetched in this session]

**Next.js streaming caveat [FC1]:** the Next.js `not-found.js` docs (lastUpdated 2026-10-06) state: "Before streaming starts, Next.js returns a `404` status code. After streaming starts, the status code remains `200` and the not-found UI renders in the response. Next.js injects a `<meta name="robots" content="noindex" />` tag in both cases." So a real 404 for a missing job requires awaiting the data before the first flush (no `loading.tsx`/deferred Suspense around the lookup). This is the basis of 09 D-06/D-08. Source: https://nextjs.org/docs/app/api-reference/file-conventions/not-found

**Legal / ToS caveat:** the content is scraped from third-party ATS pages. A first-pass check of Ashby's terms, robots.txt, posting-API docs and Google's authorization wording is now in `02` section 10 ("Legal & terms risk (not legal advice)"). It is not a legal opinion; the owner must confirm the items listed there.

---

## 3. Pattern decision table

| Pattern | Verdict | Why |
|---|---|---|
| Numbered pagination with real `<a href>` links | **Adopt** | Goal-directed task, SEO, a11y, Back button, shareable URLs (NN/g, Google) |
| Infinite scroll | **Avoid** | Footer unreachable, position loss, not crawlable, poor for keyboard/AT (NN/g, Google) |
| "Load more" | **Avoid for v1** (adapt later only with `?page=` link fallback) | Compromise pattern; extra click; not crawlable alone |
| Page number in URL (`?page=n`) | **Adopt** | Required for Back/reload/share and crawling |
| List + detail split pane | **Avoid** | Two scroll contexts, focus/URL complexity, descriptions often absent; separate pages match every observed ATS board |
| Separate job detail page | **Adopt** | Indexable, shareable, simple |
| Filters as URL query params (Lever model) | **Adopt** | Shareable, back-button safe, no JS dependence for initial state |
| Mobile: bottom sheet / full-height filter dialog with "Show N jobs" + Clear all | **Adopt** | Keeps list context lighter than a new page; explicit apply avoids reload churn (practitioner basis) |
| Filter apply: instant on desktop, confirm in mobile sheet | **Adapt** | Built In uses explicit View Results; WTTJ left panel |
| Applied-filter chips + Clear all | **Adopt** | Baymard (28% sites lack overview), universal on observed sites |
| Facet counts, zero-result options disabled | **Adopt (needs API)** | Prevents dead ends; requires backend counts (08) |
| Checkbox wall for locations/countries | **Avoid** | RemoteOK-style 200-country list is unusable; use searchable combobox or text search |
| Search-as-you-type with live popup | **Adapt** | v1: debounced commit to URL without popup; popup only if a suggestions endpoint exists (then ARIA combobox) |
| Sort incl. salary high-low | **Adopt** | Himalayas, RemoteOK show demand; nulls last |
| Card: title + company + meta strip + salary + recency | **Adopt** | Built In / Wellfound meta line, minus clutter |
| Role summary + skills chips on card | **Avoid** | Data absent for many jobs; lengthens list |
| Relative time ("3d ago") | **Adopt** (with real date in tooltip / `<time datetime>`) | Fast to scan; only if source date is real |
| Explicit "No salary listed" on cards | **Adapt** | Show nothing on card, state it on detail; filter "Has salary" |
| Apply button on each list card | **Avoid** | Accidental outbound clicks; detail page first |
| Apply label naming destination, new tab, `rel=noopener noreferrer` | **Adopt** (rel value superseded by 09 D-14: `noopener nofollow`) | Trust cue |
| Sign-up prompts, "Save job", "Matches" tabs | **Avoid** | Out of scope by brief; dark-pattern territory |
| Sponsored/promoted rows | **Avoid** | Indistinguishable from jobs (Himalayas); no ads per brief |
| Entry modal / upsell popup | **Avoid** | RemoteOK |
| Grouping by department headings (Greenhouse/Lever) | **Avoid for global list; Adopt on company page** | Global list is cross-company; company page benefits from team grouping |
| Category/location landing pages (Wellfound footer directories) | **Adapt** | Good for SEO; only a small curated set (04) |
| JobPosting JSON-LD | **Adapt** (gate tightened by 09 D-15; authorization risk, see 02 section 10) | Only with real description + date, active only, visible fields |
| 404/410 for closed jobs | **Adopt** (404 only; see 09 D-08) | Google forbids expired postings; needs SSR or edge rule |
| Employee-count bands, response-time badges, culture marketing | **Avoid** | Data not ours / unverifiable claims |
| Split result count "683 jobs" above list | **Adopt** | Greenhouse |
| Dark mode | **Adopt** (06) | Brief scope |

---

## 4. Six "design north stars"

Descriptions are from the text structure observed plus general knowledge; they describe patterns to re-create in our own visual language (see 06). Do **not** copy assets, logos, copy, or exact layouts.

1. **Greenhouse-hosted board: calm clarity and honest scale.** Take: the result count above the list, numbered pagination at the foot, search above two simple filters, department grouping (for our company page). Visual: white page, one column, black text titles, grey location text, generous row padding, no imagery. Tone: neutral and functional. Don't take: the sparse rows (we show more per job).
2. **Lever-hosted board: URL-parameter filters and quiet rows.** Take: every filter is a query param and a real link, workplace type ("On-site / Hybrid / Remote") as a first-class filter, two-line row (bold title, muted meta line then location). Visual: text-led, almost no borders, headings as dividers. Don't take: long link-list filters on mobile.
3. **Himalayas: the card meta strip, sorting and company links.** Take: relative time, location-restriction text, salary range formatted compactly, company name linking to company page, a four-way sort including salary. Visual: soft rounded cards with logo at left and chips; moderate density. Don't take: sign-up nags, sponsored blocks, mixed salary formats.
4. **Built In: scannable-at-a-glance card and the explicit filter panel.** Take: age + arrangement + location + salary + level grouped on a few lines; "All Filters" panel with Reset and "View Results"; numbered pagination. Visual: white cards with thin borders, bold title, grey meta, accent colour only on salary and the primary action. Don't take: summaries, skills lists, account promos between results.
5. **Wellfound: one-line, bullet-separated meta and explicit empty values.** Take: the compact "Remote - Location - Salary - posted today" strip, "No equity"-style explicit nulls (we adapt to "salary not listed" on detail), category/location directory links for SEO. Visual: dense, small type, logo-left rows. Don't take: account gravity, unverifiable "responds quickly" badges.
6. **Linear/Vercel-style careers pages (text-first, typographic) [UNVERIFIED visuals].** Take: confident type scale, restrained palette, generous whitespace on the job detail ("Read" mode), tone that is plain and non-salesy. Visual: large heading, narrow readable column (~65 characters), thin rules, subtle hover states. Don't take: the lack of search/filters (irrelevant at 34k scale).

Fallback if the owner wants a north star for pure text density: Hacker News "Who is hiring" front-ends [UNVERIFIED].

---

## 5. Job-board anti-patterns (explicitly rejected)

| Anti-pattern | Where seen | Why we reject it |
|---|---|---|
| **Login wall after N results** or to see the full description | LinkedIn-style (UNVERIFIED); Google also requires details visible without login for JobPosting | Hard constraint: no accounts; also violates Google policy |
| **"Sign up to save / Matches / Saved" tabs** | Himalayas [OBSERVED] | Implies accounts we do not offer |
| **Entry modal / premium upsell on load** | RemoteOK [OBSERVED] | Interrupts the primary task |
| **Sponsored rows styled like jobs** | Himalayas [OBSERVED] | Deceptive; ads are out of scope |
| **Fake urgency** ("Apply now - 12 people viewing", countdown timers, "closing soon" with no date) | Common on aggregators (general knowledge) | Dishonest; we only show real dates |
| **Fake or inflated freshness** (re-posting old jobs as "today", showing `createdAt` as posted date) | "Reposted yesterday" style labels [OBSERVED on Built In as a label] | Only show `publishedAt` when present; label our own "last seen" separately |
| **Unverifiable social proof** ("Responds within a few days", "Hottest", "Most applied") | Wellfound / RemoteOK [OBSERVED] | We have no such data |
| **Interstitial between list and the real job** (our page, then a countdown, then the employer) | Aggregators (general knowledge) | Apply goes straight to the employer page; one detail page max |
| **Apply button that actually collects the visitor's email/CV** | Some aggregators | Out of scope; never |
| **Salary shown as "$0 - $0" or fabricated estimates** | broken data cases | Hide when missing |
| **Misleading "Easy Apply"** | Built In tag [OBSERVED] | Implies we handle the application |
| **Cookie wall / newsletter pop-up / push-notification prompt** | common | Out of scope per brief; we use no tracking cookies |
| **Infinite scroll with no footer / no URL state** | many feeds | NN/g, Google |
| **Dark-pattern filters** (pre-checked "Include sponsored", hidden Clear) | general | Filters default to unfiltered, Clear always visible |
| **Dead-end empty states** | many | Section 2.9 |
| **Impersonating the employer** (using company branding as if we are them) | scrapers | Brief: never make the visitor think we are the employer; show "Source: Ashby, via {Company}" |

---

## 6. Facts not verified in this research (carry to 11)

- Row anatomy of RemoteOK, and everything about We Work Remotely, Ashby-hosted boards, Work at a Startup, Indeed, LinkedIn, Linear/Vercel careers, HN front-ends (fetch blocked, JS-only, or login wall).
- Baymard's specific recommendation on load-more vs pagination vs infinite scroll; Baymard/NN/g primary guidance on bottom sheet vs full page and on disabling zero-result facets. (Round 1 did not re-check these.)
- Any NN/g or equivalent eye-tracking study on job-card scanning order (hierarchy in 2.6 is derived, not cited).
- Google's treatment of scraped aggregator pages for the Jobs experience (the `baseSalary` rule is now verified verbatim, see 2.11; the aggregator question is not answered by the doc).
- Optimal page size (25 is an assumption) and debounce interval (200-300 ms is a convention).
- Not re-fetched in round 1: Greenhouse/Lever/Himalayas/RemoteOK/Built In/Wellfound/WTTJ page observations (section 1; live sites change), Smashing, Patriot Software and Aon survey figures, the 2018 Google blog on Jobs eligibility.
- Salary-survey figures come from vendor surveys (Patriot Software, Aon) read via search snippets only.
- Ashby / employer terms of service for redisplaying scraped postings: partly researched in `02` section 10; no Ashby text granting or forbidding redisplay was found.

## 7. Sources (all checked 2026-10-22)

- NN/g, Infinite scrolling tips: https://www.nngroup.com/articles/infinite-scrolling-tips/
- NN/g, Infinite scrolling when to use: https://www.nngroup.com/videos/infinite-scrolling-when/ ; alternatives: https://www.nngroup.com/videos/alternatives-to-infinite-scrolling/
- Smashing, Pagination / infinite scroll / load more (2016): https://smashingmagazine.com/2016/03/pagination-infinite-scrolling-load-more-buttons ; Infinite Scroll UX (2022): https://shop.smashingmagazine.com/2022/03/designing-better-infinite-scroll
- Baymard (applied filters; mobile filtering benchmark): https://baymard.com/research-articles/how-to-design-applied-filters , https://baymard.com/mcommerce-usability/benchmark/mobile-page-types/filtering-options
- Google Search Central, JobPosting: https://developers.google.com/search/docs/appearance/structured-data/job-posting
- Google Search Central, Pagination & incremental loading: https://developers.google.com/search/docs/specialty/ecommerce/pagination-and-incremental-page-loading
- Google Search Central, Faceted navigation: https://developers.google.com/search/docs/crawling-indexing/crawling-managing-faceted-navigation
- W3C APG, Combobox: https://www.w3.org/WAI/ARIA/apg/patterns/combobox/
- Live pages fetched: https://job-boards.greenhouse.io/anthropic , https://jobs.lever.co/palantir , https://himalayas.app/jobs , https://remoteok.com/ , https://builtin.com/jobs , https://wellfound.com/jobs , https://www.welcometothejungle.com/en/jobs
- Salary transparency survey: https://www.patriotsoftware.com/blog/payroll/pay-transparency-hiring-survey/
