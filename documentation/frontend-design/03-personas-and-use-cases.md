# 03 · Personas, Jobs-to-be-Done & Use Cases

> **Status:** DESIGN ONLY. Terminology follows [00](./00-brief-and-index.md): **Browse** (home), **job card**, **facet**
> (a filter group), **filter chip**, **Job detail**, **Company page**, **Apply**. Mode: **Operate** (scan, judge, act);
> Job detail is a light **Read** surface. API needs are listed in section 7 as "requirements for 08".
> _Authored 2026-10-22. Reconciled with the final decisions D-01..D-24 in [09](./09-frontend-architecture.md) section 1, with
> [08](./08-api-contract-proposal.md) (including A-01..A-12) and with 06 section 6.1 on 2026-10-22 (review round 1)._

## 1. What the data lets us promise (and not promise)

Personas below are constrained by what the scraped data really holds (see 00 §4, `prisma/schema.prisma`):

- Roughly 34,000 active jobs across roughly 1,750 companies. Salary is present for about 40 % of jobs. Posted date is
  absent for boards fetched through the GraphQL fallback. Company name is often just the slug; logo is often null.
- Location is free text ("Remote", "London, UK", "San Francisco, CA; New York, NY"). There is no country or city field.
- Remote and employment type live in `metadata`, not in columns.
- We do not own the jobs. Apply always leaves our site for the company's Ashby page.

Consequence for every persona: the interface must be honest about what is unknown (no invented dates, no guessed
salaries) and must make the outbound step obvious and safe.

## 2. Personas

### P1. Maya Okafor, the targeted searcher (primary)
- **Context:** 27, mid-level frontend engineer, employed, searching quietly on a work laptop at lunch and on her home
  laptop in the evening. Has a clear target: "React, remote, posted recently, salary shown".
- **Device:** 1440 px laptop, Chrome, trackpad; occasionally continues on phone.
- **Intent:** produce a short list of 5 to 10 strong roles to apply to this week. Opens many tabs.
- **Behaviours:** types a keyword, applies Remote + Salary-present + Posted within 7 days, scans cards, opens promising
  jobs in new tabs (middle-click), uses the back button heavily.
- **Anxieties:** wasted clicks on jobs that turn out to be closed; "who is this company?"; hidden salary; losing her
  filter setup when going back; being tracked by a site her employer might see in logs.
- **What she needs from us:** fast filtering with counts, middle-click-able cards (real links), shareable URL she
  can paste into her own notes, no login wall.

### P2. Daniel Reyes, the commuter browser (primary)
- **Context:** 41, moving from retail operations into logistics or supply-chain operations. Browses on his phone on a
  train; sessions are 5 to 10 minutes and interrupted. Not sure of exact job titles.
- **Device:** mid-range Android phone (about 390 px wide), patchy 4G, one thumb.
- **Intent:** discover what exists: "operations", near Austin or remote.
- **Behaviours:** broad search, picks Department and Location from lists rather than typing, scrolls a lot, opens a job,
  reads the top, decides, goes back.
- **Anxieties:** jargon; tiny tap targets; the page jumping while he reads; mistaking an aggregator for the employer;
  data usage; losing his place after an interruption (phone locks, tab reloads).
- **What he needs:** thumb-reachable filters (full-screen filter panel with a clear "Show N jobs" button; "Show results" if the count endpoint is unavailable, 09 D-19), obvious
  "you will leave this site" language near Apply, state that survives a tab discard (everything in the URL).

### P3. Priya Nair, the link follower (secondary)
- **Context:** 22, new graduate. A friend messaged her a URL to a filtered list ("junior roles at fintechs") or to one
  company's page. Has never heard of the site.
- **Device:** iPhone Safari (390 px) arriving from a messaging app's in-app browser; sometimes a laptop later.
- **Intent:** see exactly what the friend saw, then explore that company's other roles.
- **Anxieties:** "is this legit?"; a link that opens to an unexplained, filtered state; being asked to sign up.
- **What she needs:** the filtered state clearly visible as chips and the results summary line, one-tap "Clear all", a Company page,
  plain-language About text one tap away, and zero sign-up prompts.

### P4. Alex Chen, keyboard and screen-reader user (secondary, drives the accessibility bar)
- **Context:** 35, data analyst, blind, uses NVDA on Windows with Firefox/Chrome and VoiceOver on iPhone. Navigates by
  landmarks, headings and form controls; types a lot.
- **Device:** desktop with NVDA; also iPhone VoiceOver.
- **Intent:** same as P1, without a mouse.
- **Anxieties:** unlabeled controls; result counts that change silently; focus lost to the top of the page after
  pagination; carousels and auto-updating regions; ambiguous "Apply" links repeated 25 times; a "new tab" opening
  without warning.
- **What they need:** correct landmarks and headings, a single polite live region for result changes, focus moved to
  the results heading after paging, link text that includes job and company, "(opens in a new tab)" on Apply.

_Anti-persona:_ the recruiter or employer who wants to post jobs, and the data reseller. We design nothing for them.

## 3. Jobs-to-be-done

| ID | When I... | I want to... | So I can... | Persona |
|---|---|---|---|---|
| JTBD-1 | have a role in mind and a few hard requirements | combine keyword + filters and see how many jobs match | decide whether to tighten or loosen my criteria | P1 |
| JTBD-2 | scan a long list | compare title, company, location, remote, salary and age in one glance per row | discard bad fits in under 2 seconds each | P1, P2 |
| JTBD-3 | am not sure what I am looking for | explore by department, location or company | discover roles and companies I would not have searched for | P2, P3 |
| JTBD-4 | find a promising job | confirm it is real, current and worth the effort | click Apply without fear of a dead listing or a data trap | all |
| JTBD-5 | want to continue later or on another device | copy a link that reproduces my exact results | pick up where I left off, or hand it to a friend | P1, P3 |
| JTBD-6 | go back from a job to the list | find the list as I left it (filters, page, scroll) | keep a rhythm of open, judge, return | P1, P2 |
| JTBD-7 | like one company | see all its open roles | apply to several, or check later | P3 |
| JTBD-8 | hit a dead end (zero results, expired job, error) | be told what happened and the quickest way forward | not lose the session | all |
| JTBD-9 | cannot use a mouse or see the screen | operate every control and perceive every change | complete the same task in similar time | P4 |

## 4. Prioritised use cases

Priority: **P0** = launch blocker, **P1** = launch-quality, **P2** = polish. Acceptance criteria use Given/When/Then.
"Results" means the job card list; "the URL" means the query string defined in 04 §3.

### UC-01 Browse the newest jobs (P0)
- **Given** a first-time visitor opens `/`
- **When** the page loads
- **Then** 25 job cards sorted Newest are shown, the dataset line under the `h1` shows the totals ("34,035 open jobs at
  1,747 companies. Updated Oct 22."), the summary reads "Showing 1-25 of 34,035 jobs", and the first card is reachable with
  one activation of the "Skip to results" link (or by tabbing past the search and filter controls, 05 section 2.6 order).
- **And** the first page of results is present in the server-rendered HTML (works with JavaScript disabled, 09 D-03).
- **And** when the page is navigated client-side and the API is slow, skeleton cards (at most 25, the final card height) appear
  after 100 ms and layout does not shift when data arrives. On a cold direct load the server sends finished HTML instead.

### UC-02 Keyword search (P0)
- **Given** the user is on Browse
- **When** they type "data engineer" (2 or more characters, after a 300 ms pause, or press Enter or the Search button; without JavaScript only the button submits)
- **Then** results update in place, `q=data%20engineer` is written to the URL, the page resets to 1, sort switches to
  Relevance unless the user chose a sort, matched terms are highlighted in titles and company names (render-time, no client JS), and the result count is announced
  once in the live region.
- **And** typing 1 character (counted in Unicode characters after trimming) does not trigger a search; clearing the field returns to the unfiltered list. Known limit: a single CJK character is below the 2-character minimum (08 `q` is 2..100).
- **And** the suggestions popup (companies, departments, locations) arrives in a later phase behind a capability flag (09 D-13); the plain input is the shippable v1.

### UC-03 Filter by company, department, location (P0)
- **Given** Browse with facets visible (sidebar on desktop, "Filters" panel on mobile)
- **When** the user selects "Engineering" under Department and "London, UK" under Location
- **Then** the list shows only jobs matching (Department is Engineering) AND (Location is London, UK); an active-filter
  chip appears for each; page resets to 1; facet counts refresh to reflect the other active filters; the URL contains
  `department=Engineering&location=London%2C%20UK`.
- **And** selecting a second value inside one facet widens that facet (OR within a facet, AND across facets).
- **And** a facet with more than 8 values shows 8 plus "Show more" (expands to 30), and each of Company, Department and Location has a search input inside the facet ("Search companies" etc.). Without the facet-values endpoint, facet search filters the loaded top-50 list only (09 D-19).

### UC-04 Remote and salary filters (P0)
- **Given** Browse
- **When** the user turns on "Remote only" and "Salary listed"
- **Then** only jobs flagged remote and having a published salary remain; both appear as chips; counts update; the
  salary toggle's helper text reads "Only jobs where the company published a pay range." (URL: `remote=1&salary=1`; the API param is `hasSalary`, 09 section 5.4.)

### UC-05 Employment type and posted date (P1)
- **Given** Browse
- **When** the user selects "Full-time" and "Posted in the last 7 days"
- **Then** results narrow accordingly and the URL has `type=FullTime&posted=7d`.
- **And** the posted-date control explains: "Jobs without a posted date are included if we first saw them in this
  period." Those jobs show no age on their cards (09 D-12).

### UC-06 Sort (P0)
- **Given** a result set
- **When** the user changes Sort to "Highest salary"
- **Then** results reorder, page resets to 1, `sort=salary` is in the URL, jobs without salary are ordered last (never
  hidden by sort alone), and the live region announces "Sorted by Highest salary. 1,204 jobs found." Focus stays on the Sort control.
- **And** "Relevance" is offered only when a keyword is present.

### UC-07 Paginate (P0)
- **Given** more results than one page
- **When** the user activates "Next", a page number, or types a page number and presses Go
- **Then** the new page loads, URL `page=` updates (pushState), focus moves to the results heading, the viewport
  scrolls so the results heading is at the top, the live region announces "Page 3 of 49. Showing 51 to 75 of 1,204
  jobs." once, and the previous page's skeleton does not flash if the data is cached.
- **And** Previous on page 1 and Next on the last page are non-interactive text with `aria-disabled="true"`, removed from the tab order.
- **And** no page beyond the API result window (`maxResultWindow`, 10,000 results = page 400 at size 25) is offered; a note explains it (04 section 5.3).
- **And** changing page size (25/50/100) returns to page 1 (keeping the first visible job is not guaranteed); focus stays on the page-size select, the page does not scroll, and "Showing 1-50 of 1,204 jobs." is announced.
- **And** every page link is a real `<a href>`; without JavaScript paging still works.

### UC-08 Open job detail (P0)
- **Given** a result list
- **When** the user clicks (or middle-clicks, or presses Enter on) a job card title
- **Then** the Job detail page `/jobs/{id}/{slug}` opens in the same tab (middle-click opens a new tab normally), with
  title, company, location, remote, salary, employment type, posted date (when known) and an Apply button within the first
  ~600 px of a 390 px screen. The URL id is the API job `id` (09 D-09); a wrong or missing slug 308-redirects to the canonical slug.

### UC-09 Apply (P0)
- **Given** the user is on a Job detail page
- **When** they activate "Apply on {Company}"
- **Then** the company's Ashby application URL opens in a new tab with `rel="noopener nofollow"`, our tab stays where it
  was, and no interstitial or sign-up step intervenes.
- **And** the button and the text under it state where it leads: "Opens {Company}'s application page on Ashby in a new
  tab. We never see your application."
- **And** from landing page to Apply takes at most 3 interactions on the happy path (search or filter, open job,
  Apply).

### UC-10 Share a filtered URL (P0)
- **Given** any combination of search, filters, sort, page and size
- **When** the user copies the address bar URL (or uses "Copy link" in the results toolbar) and someone else opens it
- **Then** they see the same query, filters, sort and page, with chips showing every active filter; no state lives
  outside the URL.
- **And** "Copy link" confirms with a polite, non-modal message "Link copied" and never uses the clipboard silently.

### UC-11 Back/forward keeps state (P0)
- **Given** a user at `/?department=Engineering&remote=1&page=4`, scrolled partway, who opens a job
- **When** they press Back (browser or in-page "Back to results")
- **Then** Browse shows page 4 of the same filters at the same scroll position, within 300 ms if cached, with the
  last-opened card's title receiving focus ring-visible focus.
- **And** forward/back through successive filter changes steps through each state exactly once (typing within a single
  search does not create one history entry per keystroke).

### UC-12 Browse a company (P1)
- **Given** a Job detail page (company name is a link) or the Companies directory
- **When** the user activates the company link
- **Then** `/companies/{slug}` shows the company name, logo or monogram, number of open jobs (`1 open job` when one), a link to the company's
  Ashby board ("View all on Ashby"), and the same search/filter/sort/pagination as Browse minus the Company facet. A known company
  with zero open jobs shows "{Company} has no open jobs right now." (not the filter-recovery pattern).

### UC-13 Recover from zero results (P0)
- **Given** a filter combination that matches nothing
- **When** results return empty
- **Then** the page shows "No jobs match your search", repeats the active filters as removable chips, and offers
  one-click "Remove {filter} to see N jobs" suggestions for each filter and for the search text (largest gain first; the count
  comes from the count endpoint with `relax`, 08 A-03; without it the buttons read "Remove {filter}" with no number), plus
  "Clear all filters" when two or more filters are active. Focus stays on the control the user just changed; the live region
  says "No jobs found."
- **And** it never shows a sad-face illustration, never blames the user, and has no error styling.

### UC-14 Handle an expired job (P0)
- **Given** a user opens a job URL (from a bookmark, a shared link or a list that was stale) for a job now inactive
- **When** the detail request reports inactive (API 410 with job title and company) or not found (API 404, or an id that is not a UUID)
- **Then** the page states "This job is no longer listed", shows the title and company if known, gives "More jobs
  at {Company}" and "Browse all jobs", renders no Apply control at all (no dead button), is `noindex`, and is served as a
  gone/expired page with **HTTP 404** status (Next.js cannot emit 410; 09 D-08). A job unknown to the API shows the generic
  not-found variant without a title.
- **And** if Apply is clicked on a job that has since closed at Ashby, that is out of our control; the trust text under
  Apply therefore reads "Last checked {date}", so the user can judge freshness.

### UC-15 Offline and slow network (P1)
- **Given** a throttled connection (Slow 4G) or no connection
- **When** a request is slow (more than 1 s) or fails
- **Then** slow: skeletons remain, then a text note "Still loading..." appears after 5 s; failed: an inline error
  region replaces only the results area ("We could not load jobs. Check your connection and try again."), keeps the
  filters and chips usable, offers "Try again", and recovers without a full reload.
- **And** previously loaded pages stay visible when a later request fails ("loading more" error appears inline).

### UC-16 Screen-reader use (P0)
- **Given** NVDA/JAWS/VoiceOver
- **When** the user navigates by landmarks, headings and controls
- **Then** they can: reach search and filters by landmark; hear the result count after each change exactly once; hear
  each card as one coherent unit (title link, company, location, salary, age) without repeated "Apply" links; hear
  "opens in a new tab" on outbound links; and always know the current page ("Page 3, current page").
- **And** no information is conveyed by colour or icon alone (remote, salary and new badges have text).

### UC-17 Keyboard-only use (P0)
- **Given** no pointing device
- **When** the user tabs through Browse
- **Then** the order is exactly 05 section 2.6: skip links, site name, primary nav, theme toggle, search input, Search button,
  Filters button (below desktop), filter groups (desktop sidebar), chips, Clear all, Copy link, Sort, cards (one tab stop each:
  the title link), pagination, page-size select, footer; every control shows a visible focus indicator with at least 3:1 contrast and is not
  obscured by sticky bars (WCAG 2.2 Focus Not Obscured); no keyboard trap in the filter dialog (Esc closes and discards, focus returns to the "Filters" button; applying moves focus to the
  results heading); toggling a desktop facet keeps focus on that control; target size at least 24 by 24 CSS px (44 on touch).

### UC-18 Clear and edit filters (P0)
- **Given** active filters
- **When** the user activates a chip's remove button or "Clear all"
- **Then** that filter (or, for "Clear all", every filter chip but never the keyword, sort or page size; the keyword has its own
  "Clear search" button) is removed, page resets to 1, and focus moves to the next chip, else the previous chip, else the
  results heading. "Clear all" appears when two or more **filter** chips are active (the Search chip is not counted; 06 D3 wording "2 or more chips" is clarified accordingly).
- **And** chips are links (works without JavaScript, 09 section 4.2) named "Department: Engineering. Remove filter."

### UC-19 Open a link with invalid or stale parameters (P1)
- **Given** a URL with an unknown `type=Banana`, `page=9999`, or `company=does-not-exist`
- **When** it loads
- **Then** invalid enum values are dropped with a dismissible notice "Some filters in this link were not recognised and were
  ignored."; an out-of-range page clamps to the last reachable page (never beyond the result window) with the notice "Page 9999
  does not exist. Showing page 49, the last page."; a well-formed but unknown company slug yields a chip (prettified slug) plus
  zero-results recovery, not a crash. Purely cosmetic differences (key order, `page=1`, unknown keys, duplicate values) 308-redirect
  to the canonical URL silently. The exact rules and worked examples are in 04 section 3.2.1-3.2.3.

### UC-20 Print or save a job (P2)
- **Given** a Job detail
- **When** the user prints
- **Then** only the job content prints (no header, filters or sticky bar), with the full Apply URL spelled out as text
  at the end. Browse prints the current page's cards as a plain list.

### UC-21 Theme and motion preferences (P2)
- **Given** the OS prefers dark mode and/or reduced motion
- **When** the site loads
- **Then** the matching theme applies without a flash, and all non-essential transitions (skeleton shimmer, chip
  animations, sheet slide) are removed or replaced with opacity-only changes.

## 5. Success metrics

Because we deliberately track no visitors (section 6), task metrics are measured in **moderated usability sessions**
(5 participants per persona type per round, 3 rounds: wireframe, prototype, build) and in **lab/synthetic tests**.

| Metric | Target | How measured |
|---|---|---|
| Time from landing to Apply click (P1/P2 tasks: "find a remote engineering job with a listed salary and start applying") | median at most 30 s, 90th percentile at most 60 s | usability sessions with stopwatch |
| Interactions to Apply on the happy path | at most 3 (search or filter, open job, Apply); 2 from a shared Job detail link | task analysis + sessions |
| Task success (correct filtered list produced, job found, Apply reached) | at least 90 % unaided | sessions |
| Back-button state fidelity (filters, page, scroll restored) | 100 % in manual regression + e2e tests | Playwright |
| Zero-result recovery (user reaches a non-empty list in at most 2 interactions) | at least 90 % | sessions |
| Share-link fidelity (open URL in fresh browser yields identical results) | 100 % | e2e test |
| Largest Contentful Paint (Browse, mid-range phone, Slow 4G, lab) | at most 2.5 s (goal 2.0 s) | Lighthouse CI, WebPageTest |
| Interaction to Next Paint (filter click, page change) | at most 200 ms (goal 150 ms) | lab trace, field via browser's own public CrUX data only |
| Cumulative Layout Shift | at most 0.05 (hard limit 0.1) | Lighthouse CI |
| Works without JavaScript (read path: browse, filter via form, paginate, open job, Apply) | 100 % of UC-01, 03-09, 12, 13, 14 | e2e with JS disabled |
| Initial JS on Browse (compressed) | at most 170 KB hard, 150 KB goal (09 section 14, provisional until spike S3) | bundle report |
| Time from filter click to updated results (cached/warm API) | at most 400 ms perceived; skeleton after 100 ms | e2e timing |
| Accessibility | WCAG 2.2 AA with zero axe-core serious/critical violations on every screen and state; manual NVDA + VoiceOver pass on the UC-16/17 scripts; keyboard completion of every UC | axe in CI, manual script |
| Contrast | text at least 4.5:1, large text and UI components at least 3:1, in light and dark | token audit |
| Touch targets | at least 44 by 44 px on mobile for primary controls, never less than 24 by 24 CSS px | design review |
| Perceived honesty | at least 4 of 5 participants can say after the session where Apply leads and that we are not the employer | post-task question |

## 6. What we deliberately will NOT measure or track

- No per-visitor analytics, no cookies, no local identifiers, no fingerprinting, no session recording or heatmaps, no
  third-party scripts or pixels, no A/B tests on individuals.
- No logging of search queries tied to an IP or user. (If the host's request logs exist, they are the host's; our
  Privacy note must say so honestly.)
- No tracking of which jobs a person opens or clicks Apply on. Apply is a plain outbound link with no redirect
  through our servers and no click-tracking parameters.
- No "recently viewed" or personalisation in v1. (If added later it is `localStorage` only, never transmitted; see 00.)
- **v1 ships no analytics of any kind** (09 D-21): no env var, script slot or host analytics switch. Adding any (even a
  cookieless page-view counter) needs a new decision and a Privacy page change first. Allowed: build-time Lighthouse CI, and
  error reporting that carries no personal data.

## 7. Requirements for 08 (API) arising from these use cases

Marked here so they can be reconciled with the API contract.

| Ref | Requirement | Needed for | Status in 08 (section 10.1) |
|---|---|---|---|
| R03-1 | List endpoint returns `total` (exact, or `totalIsApproximate: true`), `page`, `pageSize`, `totalPages` | UC-01, UC-07 | Covered: `page{number,size,total,totalPages,totalExact}`; `totalIsApproximate` = not `totalExact` (C-01) |
| R03-2 | Facet counts that respect the other active filters (disjunctive faceting), returned with the list or via a sibling call | UC-03, UC-04, UC-13 | Covered: `/v1/facets`; selected zero-count values present (A-05) |
| R03-3 | A cheap count-only query for the current filter set (for "Show N jobs" and "Remove X to see N jobs") | UC-13, mobile filter panel | Add: A-03 `/v1/jobs/count` with `relax`; UI degrades without it (09 D-19) |
| R03-4 | Text search over title, company name/slug, department and location, ranked, with `relevance` sort; min 2 chars | UC-02 | Add: A-06 (location in searched fields) |
| R03-5 | Suggest endpoint returning grouped companies, departments, locations for a prefix | UC-02, UC-03 | Covered: `/v1/suggest` flat list, grouped client-side (C-03); UI phase 4 (D-13) |
| R03-6 | Job-by-id returns recently deactivated jobs **as 410 `JOB_CLOSED` with title and company in the body**, retained at least 90 days, then 404 (was: `active: false` 200) | UC-14 | Conflict resolved: 410 + A-08 |
| R03-7 | `salary` object `{min,max,currency}` with nulls honoured, ideally also `interval` when known | UC-04, card | Covered: `Salary` incl. `interval`, `summary` |
| R03-8 | `postedAt` nullable; sort/filter use an effective date (`postedAt` else first-seen) | UC-05, UC-06 | Covered: `sortDate`; UI never shows first-seen as a posting date (D-12) |
| R03-9 | Stable ordering: every sort has a deterministic tiebreaker (job id) | UC-07 | Covered |
| R03-10 | `meta.lastUpdatedAt` (time of last successful scrape) on list and detail | trust copy, UC-14 | Covered for lists (`dataUpdatedAt`, `/v1/meta.lastUpdated`); detail gets `lastCheckedAt` (A-07). `lastUpdatedSource` may say `job_updated_at_proxy`: copy must then not claim "scrape finished" (05 section 2.4) |
| R03-11 | Remote and employment type exposed as top-level fields and filterable | UC-04, UC-05 | Covered (`OTHER` shown as "Other", C-14) |
| R03-12 | Company endpoint: name, logoUrl, open job count, Ashby board URL | UC-12 | Covered: `jobCount` = `openJobCount`, `boardUrl` |
| R03-13 | Stable JSON error shape with `code`, and `Retry-After` on 429 | UC-15 | Add: A-09 top-level `code` |
