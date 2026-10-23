# 05 · Screens, States & Components

> **Status:** DESIGN ONLY. Wireframes are structural (hierarchy, order, what appears), not visual design; look, tokens
> and type belong to 06. Routes, params and pagination rules are defined in
> [04](./04-information-architecture-and-flows.md); personas and UCs in [03](./03-personas-and-use-cases.md).
> No emojis anywhere in proposed UI copy. No login, no fake urgency (no "3 people viewing", no countdowns, no
> "hiring fast" badges).
> _Authored 2026-10-22._

## 0. Ground rules

**Mode:** Browse and Company page are **Operate** (task loads immediately; no hero, no marketing block; density
welcome; familiar patterns). Job detail is a light **Read** (65-75ch description measure, calm hierarchy) with an
Operate-style Apply bar. About and Privacy are plain Read.

**Breakpoints** (structural, not fluid type): `mobile` under 640 (wireframed at 390), `tablet` 640-1023 (wireframed at
768), `desktop` 1024+ (wireframed at 1280; content max width 1200, centred). Filters are a persistent left sidebar only
at `desktop`; below that they are a full-screen dialog opened by a "Filters" button.

**Wireframe legend:** `[ ]` button/input, `( )` radio, `[x]` checked box, `v` select caret, `~~~` skeleton,
`#` image/logo, `...` truncated text, `|` region edge. Everything else is text.

**Copy voice:** plain, specific, neutral. Say what happened and what to do. Never "Oops", never blame, never exclaim.

## 1. Shared definitions

### 1.1 Job card anatomy (used on Browse, Company page)

One card = one `<li>` containing an `<article>`. The whole card is clickable via a stretched title link (a single tab
stop); nothing else inside is focusable, so there are no nested interactive elements.

```
Desktop/tablet                                                          Mobile
+--------------------------------------------------------------+       +------------------------------------+
| [#] Senior Frontend Engineer, Design Systems          $140k-$180k |   | [#] Senior Frontend Engineer, Des...|
|     Deel                                              Posted 3 days ago | Deel                               |
|     Remote (Europe)  *  Remote  *  Engineering  *  Full-time    |       | Remote (Europe)  *  Remote         |
+--------------------------------------------------------------+       | $140k-$180k  *  Posted 3 days ago  |
                                                                         +------------------------------------+
```

Content, in priority order:

| # | Element | Source | Rule |
|---|---|---|---|
| 1 | **Title** (the link, `h3`) | `title` | Up to 2 lines on mobile and desktop (CSS line clamp), then ellipsis. The full title is on Job detail. Never truncated by JS character counts. Highlight `<mark>` for search terms. Hyphenation off; `overflow-wrap:anywhere` for unbroken strings. |
| 2 | **Company** | `company.name` else prettified slug | 1 line, ellipsis. Plain text (not a second link). If name equals the slug, prettify (see 04 §10). |
| 3 | **Salary** | `salary` | Shown only if min or max present. Right-aligned on tablet/desktop, own meta segment on mobile. Tabular numerals. Format below (1.2). |
| 4 | **Location** | `location.name` | 1 line, ellipsis, full text on detail. Omitted if null. Never replaced with "Unknown". |
| 5 | **Remote** | `remote === true` | Text badge "Remote" (not colour alone, not an icon alone). If location text already reads exactly "Remote", suppress the separate badge to avoid "Remote * Remote". |
| 6 | **Posted** | `postedAt` | "Posted 3 days ago" (see 1.3). Omitted when `postedAt` is null. We do **not** substitute first-seen date on the card. |
| 7 | **Department** | `department.name` | tablet/desktop only; omitted if null. |
| 8 | **Employment type** | `employmentType` | tablet/desktop always when known; on mobile only if not Full-time. Display names: Full-time, Part-time, Contract, Internship, Temporary. |
| - | **Logo** | `company.logoUrl` | 40 px square (36 on mobile), `alt=""` (decorative; the company name is adjacent text). On error or null: monogram tile (first letter of display name on a neutral tile; colour from a fixed 6-step neutral-tinted set chosen by hashing the slug, always meeting 4.5:1 for the letter). Reserve the square always, so no layout shift. |

**Omission principle:** missing data is dropped without placeholders, and the rows collapse; the card never shows
"N/A", "Unknown", dashes, or empty separators. Separators (`*`, rendered as a thin vertical divider or middot) are
generated between present segments only.

**Minimum card** (title + company only): two lines, still the same height rhythm via `min-height`.
**Maximum card** (everything, long title): title 2 lines, company, one meta row (wraps to 2 lines on mobile). Card
height range 88-148 px; skeleton uses the median 112 px; layout shift is avoided by `content-visibility:auto` with
`contain-intrinsic-size` equal to the median.

**States:** default; hover (surface tint + title underline); focus-visible (2 px ring, 3:1, inset so it is never
clipped); active; visited (title link colour slightly dimmed, not hue-changed, so repeated scanning shows what the user
already opened); "returned-to" (focus ring after Back, see 04 §5.5). No selected state (no multi-select).

**Accessible name:** the link text is the title; an `aria-describedby` points to a visually hidden summary that
reads "{Company}, {Location}, {Remote}, {Salary}, {Posted}". Result: a list navigates as "link, Senior Frontend Engineer,
Deel, Remote Europe, $140,000 to $180,000, Posted 3 days ago". No repeated generic "Read more" or "Apply" links.

### 1.2 Salary formatting rules

Source: `salaryMin`, `salaryMax` (Float?), `salaryCurrency` (string?); shown exactly as published, never converted,
never estimated.

| Case | Display | Notes |
|---|---|---|
| min and max, both 1,000+ | `$120k-$160k` | en dash between; `k` = thousands; whole numbers drop decimals; non-round values keep one decimal: `$92.5k-$110k` |
| min = max | `$120k` | |
| only min | `From $120k` | |
| only max | `Up to $160k` | |
| values 1,000,000+ | `$1.2M` | one decimal max |
| values under 1,000 | `$45-$60` plus the word "per hour" **only if the API says interval hourly**; otherwise show raw `$45-$60` and leave interval off | do not guess period (R05-1) |
| min > max (bad data) | swap so the lower value is shown first | defensive |
| both zero or both null | omit salary entirely | `0` is treated as missing |
| currency known | symbol where unambiguous: USD `$`, EUR `€`, GBP `£`, INR `₹`, JPY `¥`; ambiguous dollars use code-prefixed `CA$`, `A$`, `NZ$`, `S$`; others use ISO code prefix with a thin space: `CHF 120k-150k`, `SEK 600k-720k` | |
| currency null | assume nothing: show number with no symbol and no `$`, e.g. `120k-160k`; flagged Q2 | |
| Screen reader | `aria-label` spelled out, e.g. "120,000 to 160,000 US dollars"; add "a year" only when the interval is known to be annual | |

Detail page also shows the raw compensation summary text from the company when the API provides it
(`metadata.compensation` summary) under the figure, labelled "As published by {Company}". A short note: "Pay ranges
come from the company's own listing. Actual offers vary."

### 1.3 Posted-date formatting

| Age | Display |
|---|---|
| less than 1 hour / today | `Posted today` |
| 1 day | `Posted yesterday` |
| 2-30 days | `Posted N days ago` |
| 31-364 days | `Posted Mar 12` (no year if current year) |
| 365+ days | `Posted Mar 12, 2025` |
| future (clock skew) | `Posted today` |
| absent | nothing |

Rendered in `<time datetime="2026-10-19">`; the absolute date is the `title`/visible tooltip text on hover and appears in
Job detail's meta list as "Posted October 19, 2026". Relative text is computed on the client against the user's clock
at render; server first paint uses day-granularity to avoid hydration mismatch (compute using UTC date at build/request
time, re-evaluate on mount only if the label would change).

### 1.4 Company name and logo

`displayName = name && name !== slug ? name : prettify(slug)`; `prettify` replaces hyphens with spaces and capitalises
words ("deel" becomes "Deel", "acme-labs" becomes "Acme Labs"). It is imperfect for names like "1password"; accepted.
Never show the raw slug in the UI except inside URLs.

### 1.5 Number and text rules
- Counts: locale separators ("34,035"). Pluralisation handled ("1 job", "2 jobs").
- Truncation is CSS-only (line-clamp / text-overflow) so copy/paste and screen readers get full strings.
- Strings must tolerate 40 percent expansion (future i18n) and RTL mirroring where logical properties are used.

### 1.6 Global state patterns (referenced by every screen)

| Pattern | Rule |
|---|---|
| Skeleton | Matches final geometry (card count = page size on Browse; fixed 112 px height). Shows only if loading exceeds 100 ms. Static grey at `prefers-reduced-motion`, otherwise a slow opacity pulse (no shimmer sweep). `aria-busy="true"` on the results container; skeleton elements `aria-hidden`. |
| Slow network | After 5 s of loading a quiet text line under the skeleton: "Still loading. This is taking longer than usual." Not an error. |
| Partial-data degradation | See 1.1 omission principle; applies on every screen. |
| Inline error (recoverable) | Replaces only the affected region (results list or detail body); rest of page stays interactive. `role="alert"` once. Contains plain message, "Try again" button, and (for 5xx) a link to About. |
| Full-page error | Only when the shell itself fails (router crash) or a route-level 5xx on first paint of detail. Same copy; keeps header/footer. |
| Notice | Non-blocking `role="status"` text bar with dismiss button (invalid params, clamped page). |
| Live region | One global `role="status"` `aria-live="polite"` (visually hidden) that outputs a single announcement per settled change; never on first load. |
| Reduced motion | No shimmer, no slide/scale; sheet and chips fade at most 120 ms; smooth scroll replaced with instant. |
| Print | Header, footer, filters, pagination and Apply bar hidden; Job detail prints as a clean document (see 3). Browse prints the current page's cards as a plain list, with URLs not appended. |
| JS-disabled | See 1.7. |

### 1.7 JS-disabled fallback (conditional on the stack in 02/09)
Design goal: the **read path works without JS if the chosen host renders HTML on the server/edge**: Browse and Company
page render results; search is a `<form method="get">`; facets are inside the same GET form with a visible "Apply
filters" submit button (hidden when JS is active); pagination, cards and Apply are plain links; the sort `<select>`
sits in the form with its own "Update" button. If the stack is a pure client SPA, show the `<noscript>` message: "This
site needs JavaScript to load jobs. You can also browse companies' boards directly at jobs.ashbyhq.com." Decision is
for 09 (requirement R05-6).

## 2. Screen: Home / Browse (`/`)

**Purpose:** let a visitor go from "I want something like X" to the right 1-3 jobs with the fewest steps (UC-01 to
UC-07, UC-10, UC-11, UC-13, UC-15, UC-18, UC-19).

**Content blocks, priority order**
1. Page heading + dataset line: `h1` "Jobs"; subline "34,035 open jobs at 1,747 companies. Updated Oct 22." (Subline
   is hidden once filters are active; the results summary takes over.)
2. Search field (combobox) with submit button "Search".
3. Active filter chips + "Clear all" (when any).
4. Results toolbar: summary ("Showing 1-25 of 34,035 jobs"), Sort select, "Copy link" button, and on small screens the
   "Filters" button with active-count badge ("Filters (3)").
5. Job card list (the core).
6. Pagination (bottom; top has summary + compact Previous/Next only on desktop).
7. Facets (sidebar on desktop; dialog below).
8. Footer.

**Components:** SiteHeader, SkipLinks, SearchCombobox, FilterSidebar / FilterDialog, FacetGroup, ToggleSwitch,
RadioGroup, FilterChip(+Clear all), ResultsToolbar, SortSelect, CopyLinkButton, JobCard, JobCardSkeleton, Pagination,
PageSizeSelect, Notice, EmptyState, InlineError, LiveRegion, Footer.

### 2.1 Wireframe: mobile 390

```
+--------------------------------------+
| Site name           Companies  About |   header (sticky? no: scrolls away)
+--------------------------------------+
| [Skip to results] (visible on focus) |
| Jobs                                 |   h1
| 34,035 open jobs at 1,747 companies. |
| Updated Oct 22.                      |
|                                      |
| Search jobs                          |   visible label
| [ Title, company, or keyword  ] [Go] |
|                                      |
| [ Filters (3) ]      Sort: [Newest v]|   sticky toolbar when scrolled (see 5)
| (Remote only x) (Engineering x)      |   chips wrap
| (Posted: 7 days x)     Clear all     |
|                                      |
| Showing 1-25 of 1,204 jobs           |
| +----------------------------------+ |
| |[#] Senior Frontend Engineer, Des.| |
| |    Deel                          | |
| |    Remote (Europe) * Remote      | |
| |    $140k-$180k * Posted 3d ago   | |
| +----------------------------------+ |
| | ... 24 more cards ...            | |
| +----------------------------------+ |
|  < Prev    Page [ 1 ] of 49    Next >|
|  Jobs per page [25 v]                |
+--------------------------------------+
| About  Privacy   Data: Ashby boards  |
+--------------------------------------+

Filters dialog (full screen):
+--------------------------------------+
| [x Close]  Filters        Clear all  |
|--------------------------------------|
| Remote only (6,812)           [ o  ] |
| Salary listed (13,890)        [ o  ] |
| Department                       v   |
|   [Search departments...        ]    |
|   [x] Engineering (4,210)            |
|   [ ] Sales (3,001) ...  Show more   |
| Location / Company / Type / Posted   |
|--------------------------------------|
| [      Show 1,204 jobs            ]  |   sticky bottom, primary
+--------------------------------------+
```

### 2.2 Wireframe: tablet 768

```
+----------------------------------------------------------------------+
| Site name        Browse   Companies   About                  [theme] |
+----------------------------------------------------------------------+
| Jobs                                                                  |
| 34,035 open jobs at 1,747 companies. Updated Oct 22.                  |
| Search jobs                                                           |
| [ Title, company, or keyword                              ] [Search]  |
| [ Filters (3) ]                                   Sort by [Newest v]  |
| (Remote only x) (Engineering x) (Posted: 7 days x)      Clear all     |
| Showing 1-25 of 1,204 jobs                           [Copy link]      |
| +------------------------------------------------------------------+ |
| |[#] Senior Frontend Engineer, Design Systems         $140k-$180k  | |
| |    Deel                                           Posted 3 days ago| |
| |    Remote (Europe)  *  Remote  *  Engineering  *  Full-time       | |
| +------------------------------------------------------------------+ |
| | ... cards ...                                                      | |
| +------------------------------------------------------------------+ |
| < Previous  1 2 3 4 5 ... 49  Next >   Go to page [__][Go]  Per page [25 v]|
+----------------------------------------------------------------------+
Filters open as a full-height dialog sliding from the left, 360 px wide over a dimmed page
(same contents and "Show N jobs" button as mobile).
```

### 2.3 Wireframe: desktop 1280+

```
+------------------------------------------------------------------------------------------------------+
| Site name                         Browse   Companies   About                                 [theme]  |
+------------------------------------------------------------------------------------------------------+
| Jobs                                                                                                  |
| 34,035 open jobs at 1,747 companies. Updated Oct 22.                                                  |
| Search jobs                                                                                           |
| [ Title, company, or keyword                                                         ] [Search]       |
+--------------------------+---------------------------------------------------------------------------+
| Filters           Clear  | (Remote only x) (Engineering x) (Posted: 7 days x)          Clear all     |
|--------------------------| Showing 1-25 of 1,204 jobs        [Copy link]   Sort by [Newest v]        |
| Remote only (6,812) [ o ]| +-----------------------------------------------------------------------+ |
| Salary listed (13,890)[o]| |[#] Senior Frontend Engineer, Design Systems              $140k-$180k  | |
| Posted                   | |    Deel                                                Posted 3 days ago| |
|  (o) Any time            | |    Remote (Europe) * Remote * Engineering * Full-time                  | |
|  ( ) Last 24 hours       | +-----------------------------------------------------------------------+ |
|  ( ) Last 7 days         | | next card ...                                                           | |
|  ( ) Last 30 days        | +-----------------------------------------------------------------------+ |
| Department               | ... 25 cards ...                                                           |
|  [Search departments..]  |                                                                            |
|  [x] Engineering (4,210) | < Previous 1 ... 11 12 [13] 14 15 ... 49 Next >                            |
|  [ ] Sales (3,001)       | Go to page [__][Go]                                 Jobs per page [25 v]  |
|  Show more               |                                                                            |
| Location (same pattern)  |                                                                            |
| Company  (same pattern)  |                                                                            |
| Employment type          |                                                                            |
+--------------------------+---------------------------------------------------------------------------+
| About   Privacy   Data comes from companies' public Ashby boards.                                     |
+------------------------------------------------------------------------------------------------------+
Sidebar: 280 px, sticky below header, independent scroll (max-height viewport minus header). Results column
fluid to 880 px max. Sticky toolbar not needed on desktop.
```

### 2.4 Copy (Browse)

| Element | Copy |
|---|---|
| Page title | `Jobs | {Site}`; filtered `Remote Engineering jobs, 1,204 results | {Site}` |
| h1 | `Jobs` |
| Dataset line | `34,035 open jobs at 1,747 companies. Updated Oct 22.` |
| Search label / placeholder / button | `Search jobs` / `Title, company, or keyword` / `Search` |
| Search clear | `Clear search` (accessible name) |
| Suggestion groups | `Companies`, `Departments`, `Locations`; last row `Search for "data engineer"` |
| Filters button | `Filters` (with `(3)` when active) |
| Filters dialog title / close / clear / apply | `Filters` / `Close filters` / `Clear all` / `Show 1,204 jobs` (zero: `No jobs match` and the button is disabled with that label) |
| Facet helper | `Choosing more than one option in a group shows jobs that match any of them.` |
| Salary helper | `Only jobs where the company published a pay range.` |
| Posted helper | `Jobs without a posted date are included if we first saw them in this period.` |
| Facet search placeholders | `Search companies`, `Search departments`, `Search locations` |
| Facet empty | `No companies match "xyz".` |
| Show more / less | `Show more` / `Show fewer` |
| Chip accessible name | `Department: Engineering. Remove filter.` |
| Summary | `Showing 1-25 of 34,035 jobs` |
| Sort label | `Sort by` ; options `Relevance`, `Newest`, `Highest salary`, `Company A-Z` |
| Copy link | `Copy link` -> status `Link copied` (fades after 3 s; also in live region) |
| Results heading (sr-visible on focus) | `Results, page 3 of 49` |
| Pagination | see 04 §5.3 |
| Notices | `Some filters in this link were not recognised and were ignored.` ; `Page 9999 does not exist. Showing page 49, the last page.` |
| Zero results heading | `No jobs match your search` |
| Zero results body (with q) | `We found nothing for "rust embedded" with these filters. Try fewer words or remove a filter.` |
| Zero-results suggestions | `Remove "Remote only" to see 312 jobs` (button per filter, best gain first); `Clear all filters` |
| Zero results, no filters, empty db | heading `No jobs to show right now`; body `The job list is empty at the moment. Please check back later.` (should not occur in production) |
| Max window note | `You can browse the first 10,000 results. Narrow your search to see the rest.` |
| Loading text (sr) | `Loading jobs` |
| Slow | `Still loading. This is taking longer than usual.` |
| Network error | heading `Could not load jobs`; body `Check your connection and try again.` ; button `Try again` |
| 5xx | heading `Could not load jobs`; body `Something went wrong on our side. Try again in a moment.` ; `Try again` |
| 429 | heading `Too many requests`; body `Please wait a few seconds, then try again.` (when Retry-After known: `Please wait 8 seconds, then try again.`); `Try again` |
| Load-more/page-change error | inline `Could not load page 4.` + `Try again`; the previous page remains displayed |

### 2.5 State matrix (Browse)

| State | What the user sees | Notes / a11y |
|---|---|---|
| Initial load (cold, no cache) | Header and filters shell, search field enabled; results area shows page-size skeleton cards; facet groups show 3 skeleton rows each; summary reads `Loading jobs...` | `aria-busy`, no live announcement; keyboard focus on page top; search usable immediately (typing queues the first request) |
| Initial load with server-rendered first page | cards present, facets hydrate | no skeleton |
| Results | Summary, cards, pagination, facet counts | live region: nothing on first load; after changes see below |
| Filter/search/sort change (revalidating) | previous list stays at 60 % opacity for up to 100 ms, then skeleton; chips and URL update instantly (optimistic) | request cancelled if superseded |
| Page change | as above; focus to results heading after render (04 §5.4) | announcement once |
| Loading more | n/a (no infinite scroll); "Loading page 4" is the page-change state | |
| Zero results | Heading, body, removal suggestions, Clear all; facets remain (all other counts shown) | live: "No jobs found." focus unchanged |
| Partial data | Cards drop missing segments (1.1); company shows prettified slug; monogram instead of logo | no placeholder text |
| Long titles | 2-line clamp, ellipsis; very long single tokens wrap | |
| Many chips | wrap; after 6 chips, collapse extras into "+N more" button that expands | |
| Error: network / 5xx / 429 | inline error in the results region (copy 2.4); previous results hidden only on first load, otherwise kept above the error; filters usable | `role="alert"` once; focus is not stolen; Try again returns focus to the results heading on success |
| Suggest endpoint failure | no suggestion list; search works | silent |
| Invalid params | notice bar above the toolbar | dismiss button, `role="status"` |
| Stale job (clicked card whose job closed) | handled on detail (3.5) | |
| Slow network | skeleton persists, then "Still loading" line; no timeouts shorter than 20 s; at 20 s the network-error state | |
| Offline | same as network error; if the browser reports offline: `You appear to be offline.` | |
| JS disabled | see 1.7 | |
| Reduced motion | no pulse, instant scroll, chips/dialog fade only | |
| Print | cards only | |
| Dark mode | tokens per 06 | |
| Filter dialog open | page behind inert; focus trapped; Esc closes and returns focus to "Filters" | `aria-modal`, dialog labelled "Filters" |

### 2.6 Accessibility (Browse)

- **Landmarks:** `banner`, `navigation` "Primary", `search` "Job search" (search field + filters), `main`, `navigation`
  "Pagination", `contentinfo`.
- **Headings:** h1 Jobs; h2 "Filters"; h2 "Results, page N of M" (focus target); h3 per card title; h3 inside empty state
  is not used (empty state uses h2 replacement of the results heading).
- **Focus order:** skip links -> site name -> primary nav -> theme toggle -> search input -> (suggestions are inside the
  combobox, not tab stops) -> Search button -> Filters button (below desktop) -> filter groups (desktop sidebar; before
  results in DOM order) -> chips -> Clear all -> Copy link -> Sort -> cards (one stop each) -> pagination -> page-size
  select -> footer.
- **Keyboard map:**

| Context | Keys | Behaviour |
|---|---|---|
| Anywhere | `/` | focus search field (when focus not in a text input) |
| Search combobox | Down/Up | move through suggestions; wraps; Home/End |
| | Enter | choose active suggestion, else run keyword search |
| | Esc | close list; second Esc clears text |
| Facet checkboxes / switches | Space | toggle |
| Radio group | Arrow keys | move and select |
| "Show more" | Enter/Space | reveal; focus moves to first new option |
| Chips | Enter/Space on the remove button | remove; focus moves to next chip, else previous, else results heading |
| Filter dialog | Esc | close, discard unapplied; Tab/Shift+Tab loop within |
| Card | Enter on focused title link | open detail |
| Pagination | Tab between links; Enter | follow; page jump field Enter submits |
| Skip link | Enter | focus the results heading |

- **Live announcements** (single polite region, debounced to the settled state, never duplicated):
  - search/filter/sort change: `1,204 jobs found.` / `No jobs found.`
  - page change: `Page 13 of 49. Showing 301-325 of 1,204 jobs.`
  - sort change: `Sorted by Highest salary. 1,204 jobs found.`
  - chip removed: `Department: Engineering removed. 3,412 jobs found.`
  - link copied: `Link copied.`
  - errors use `role="alert"` on the error container, not the live region.
- **Targets and contrast:** all controls at least 24 px with 44 px on touch; text 4.5:1; component borders and focus 3:1;
  no information in colour alone (Remote and Salary are words); `<mark>` contrast 3:1 against background and 4.5:1 text
  on it.
- **WCAG 2.2 specifics:** 2.4.11 Focus Not Obscured (sticky toolbar uses `scroll-padding-top`); 2.5.8 Target Size;
  3.2.6 Consistent Help (About link in the same place); 3.3.7 Redundant Entry (nothing re-asked); 2.5.7 Dragging
  (none used); 3.3.8 Accessible Authentication (n/a, no auth).
- **Zoom/reflow:** 320 px and 400 percent zoom works without horizontal scroll (cards stack, toolbar wraps).

## 3. Screen: Job detail (`/jobs/{id}/{slug}`)

**Purpose:** let the visitor confirm fit and trust, then Apply (UC-08, 09, 14, 20). Light Read mode: calm, narrow
measure, but the Apply action is always one tap away.

**Content blocks, priority order**
1. Breadcrumb / Back link.
2. Job header: logo, **title** (`h1`), company (link to Company page), key facts row (location, Remote, employment type,
   department, posted, salary).
3. **Apply** block: button + trust copy + last checked.
4. Description (if available) with readable measure.
5. Company strip: "More jobs at {Company}" link + count.
6. Footer.

**Salary prominence:** when present, salary sits in the key facts as the first item after location, larger weight; when
absent nothing is shown (no "Salary not listed" line; the facets and filters already explain salary is optional). In the
facts list we omit absent items.

**Components:** Breadcrumb/BackLink, CompanyLogo, JobHeader, FactList, Badge, ApplyButton, TrustNote, StickyApplyBar
(mobile), DescriptionBlock, CompanyStrip, InlineError, ExpiredState.

### 3.1 Wireframe: mobile 390

```
+--------------------------------------+
| Site name           Companies  About |
+--------------------------------------+
| < Back to results                    |
| [#]  Deel                            |   company is a link
| Senior Frontend Engineer, Design     |   h1, wraps freely (no clamp)
| Systems                              |
|                                      |
| $140k-$180k                          |
| Remote (Europe)  *  Remote           |
| Full-time  *  Engineering            |
| Posted October 19, 2026              |
|                                      |
| [ Apply on Deel  (new tab) ]         |   full-width, 48 px
| You will apply on Deel's own Ashby   |
| page, in a new tab. We do not collect|
| applications or see what you submit. |
| Listing last checked Oct 22, 2026.   |
|--------------------------------------|
| About the role                       |   h2
| (description, 65ch max, sanitized)   |
| ...                                  |
|--------------------------------------|
| More jobs at Deel (27)  >            |
+--------------------------------------+
| [ Apply on Deel ]  (sticky bottom)   |   appears after the main button scrolls out
+--------------------------------------+
```

### 3.2 Wireframe: tablet 768

```
+----------------------------------------------------------------------+
| Site name        Browse   Companies   About                  [theme] |
+----------------------------------------------------------------------+
| Jobs > Deel > Senior Frontend Engineer, Design Systems     < Back      |
|                                                                        |
| [#]  Deel                                                              |
| Senior Frontend Engineer, Design Systems                               |
| $140k-$180k * Remote (Europe) * Remote * Full-time * Engineering       |
| Posted October 19, 2026                                                |
|                                                                        |
| [ Apply on Deel  (opens in a new tab) ]                                |
| You will apply on Deel's own Ashby page ... Listing last checked ...   |
| ---------------------------------------------------------------------- |
| About the role                                                         |
| (description, max 68ch, left aligned)                                  |
| ---------------------------------------------------------------------- |
| More jobs at Deel (27) >                                               |
+----------------------------------------------------------------------+
```

### 3.3 Wireframe: desktop 1280+

```
+------------------------------------------------------------------------------------------------------+
| Site name                         Browse   Companies   About                                 [theme]  |
+------------------------------------------------------------------------------------------------------+
| Jobs > Deel > Senior Frontend Engineer, Design Systems                       < Back to results        |
|                                                                                                      |
| +--------------------------------------------------------+  +------------------------------------+   |
| | [#] Deel                                               |  | [ Apply on Deel (opens in new tab) ]|   |
| | Senior Frontend Engineer, Design Systems     (h1)      |  | You will apply on Deel's own Ashby  |   |
| | $140k-$180k                                            |  | page, in a new tab. We do not       |   |
| | Remote (Europe) * Remote * Full-time * Engineering     |  | collect applications or see what    |   |
| | Posted October 19, 2026                                |  | you submit.                         |   |
| |--------------------------------------------------------|  | Listing last checked Oct 22, 2026.  |   |
| | About the role                                         |  |                                      |   |
| | (description, 68ch)                                    |  | More jobs at Deel (27) >            |   |
| +--------------------------------------------------------+  +------------------------------------+   |
|                                                              (right column sticky, 320 px)           |
+------------------------------------------------------------------------------------------------------+
```

### 3.4 Copy (Job detail)

| Element | Copy |
|---|---|
| Title tag | `Senior Frontend Engineer at Deel | {Site}` |
| Back | `Back to results` (arrived from list) / `All jobs at Deel` (otherwise) |
| Apply button | `Apply on Deel` + visually hidden ` (opens in a new tab)`; external-link glyph `aria-hidden` |
| Trust note | `You will apply on Deel's own Ashby page, in a new tab. We do not collect applications or see what you submit.` |
| Freshness | `Listing last checked Oct 22, 2026.` |
| Host line (small) | `jobs.ashbyhq.com` |
| Salary note | `As published by Deel. Actual offers vary.` |
| Description heading | `About the role` |
| Description missing | `Deel has not shared the full description with us. You can read it on their application page.` (no Apply duplicate; the main Apply button is already there) |
| Company strip | `More jobs at Deel (27)` |
| Facts labels (sr + visible in tablet+ as a definition list) | `Location`, `Work type` (value `Remote` or omitted), `Employment`, `Team`, `Posted`, `Pay` |

### 3.5 Expired / not found variants

```
Expired (known job)                         Not found (unknown id)
+---------------------------------+         +---------------------------------+
| [#] Deel                        |         | We could not find this job      |
| Senior Frontend Engineer, ...   |         | The link may be wrong, or the   |
| This job is no longer listed    |         | listing was removed a while ago.|
| The company may have filled or  |         | [ Browse all jobs ]             |
| removed it. Listings are        |         +---------------------------------+
| refreshed regularly.            |
| [ More jobs at Deel ]           |
| [ Browse all jobs ]             |
+---------------------------------+
```

Copy: `This job is no longer listed` / `The company may have filled or removed this role. We refresh listings regularly
(last update Oct 22, 2026).` / `More jobs at Deel` / `Browse all jobs`. No Apply button is rendered for an inactive job.
Not found: `We could not find this job` / `The link may be wrong, or the listing was removed a while ago.`

### 3.6 State matrix (Job detail)

| State | What the user sees | Notes |
|---|---|---|
| Initial load | Header shell; skeleton for title (2 lines), facts (3 short bars), Apply button (disabled skeleton), description (6 lines) | `aria-busy`; Apply is not clickable until loaded |
| Loaded | Full layout | focus to h1 on route entry |
| Partial: no salary | pay row absent; layout closes up | |
| Partial: no posted date | `Posted` row absent | |
| Partial: no company name/logo | prettified slug; monogram | |
| Partial: no location | facts row omits it | |
| Partial: no description | "Deel has not shared the full description..." | the job is still valid; Apply visible |
| Long title | wraps fully at all sizes; no clamp on h1 | `overflow-wrap:anywhere` |
| Long description | normal flow; description allows headings (map any source h1/h2 to h3/h4 to preserve outline), lists, links (external links: `rel="noopener nofollow ugc"`, new tab) | sanitised again client-side; images stripped; no inline styles |
| Expired / not found | 3.5 | `noindex`, status 404/410 |
| Error network / 5xx / 429 | inline error in place of the body (Back link and header remain): `Could not load this job.` + `Try again` | role=alert |
| Slow network | skeleton then "Still loading" line | |
| JS disabled | content server-rendered (if stack permits); Apply is a plain link | |
| Reduced motion | no transitions on the sticky bar (appears instantly) | |
| Print | title, company, facts, description; Apply replaced by `Apply at: https://jobs.ashbyhq.com/...` printed in full; no colours required | |

### 3.7 Accessibility (Job detail)
- Landmarks: banner, nav, main (contains article), contentinfo. Breadcrumb is `nav aria-label="Breadcrumb"` with
  `aria-current="page"` on the last item.
- Heading order: h1 title, h2 About the role, h2 More at company; description headings demoted below h2.
- Facts as a `<dl>`; Apply is a link styled as a button (`role` stays link; Space does not activate, Enter does; this
  matches the semantics of navigating away).
- The mobile sticky bar must not cover focused elements (2.4.11): `scroll-padding-bottom` equals the bar height; the bar
  has `aria-hidden` while the main Apply button is on screen to avoid duplicate announcement; when visible it is the
  last item in tab order before the footer, and the main one remains first.
- Return focus: Back returns to Browse and focus is restored on the opened card (04 §5.5).
- Contrast and target sizes as 2.6.

## 4. Screen: Company page (`/companies/{slug}`)

**Purpose:** all open jobs at one company with the same scan-and-filter tools (UC-12).

**Content blocks:** (1) breadcrumb; (2) company header: logo/monogram, display name (`h1`), "27 open jobs", link
"View all on Ashby" (external, `https://jobs.ashbyhq.com/{slug}`, new tab, same rel); (3) search within company
(same SearchCombobox, placeholder `Search jobs at Deel`); (4) chips + toolbar; (5) list; (6) pagination; (7) filters
(same, minus Company; Department, Location, Remote, Salary, Type, Posted).

**Components:** Breadcrumb, CompanyHeader, SearchCombobox, FilterSidebar/Dialog, FilterChip, ResultsToolbar, JobCard
(company line omitted because it is redundant; the logo is also omitted from cards here), Pagination.

### 4.1 Wireframes

```
Mobile 390                              Tablet 768                              Desktop 1280+
+----------------------------+          +------------------------------+        +--------------------------------------------+
| Site name   Companies About|          | Site  Browse Companies About |        | Site   Browse  Companies  About            |
| Jobs > Deel                |          | Jobs > Deel                  |        | Jobs > Deel                                |
| [#] Deel                   |          | [#] Deel                     |        | [#] Deel   27 open jobs   View all on Ashby |
| 27 open jobs               |          | 27 open jobs  View all on... |        +-----------+--------------------------------+
| View all on Ashby (new tab)|          | [ Search jobs at Deel  ][Go] |        | Filters   | [ Search jobs at Deel    ][Search]|
| [ Search jobs at Deel ][Go]|          | [Filters] Sort [Newest v]    |        | (sidebar  | chips ... Sort [Newest v]         |
| [Filters]  Sort [Newest v] |          | Showing 1-25 of 27 jobs      |        | no Company| Showing 1-25 of 27 jobs           |
| Showing 1-25 of 27 jobs    |          | cards (no logo, no company)  |        | facet)    | cards (no logo, no company)       |
| cards (no logo/company)    |          | < 1 2 >  Go to  Per page     |        |           | < 1 2 >  Go to page  Per page      |
| < Prev  Page 1 of 2  Next >|          +------------------------------+        +-----------+--------------------------------+
+----------------------------+
```

### 4.2 Copy
Title tag `Jobs at Deel | {Site}`; h1 company display name; `27 open jobs`; `1 open job`; link `View all on Ashby`; search
placeholder `Search jobs at Deel`; zero jobs overall (company deactivated): `Deel has no open jobs right now.` +
`Browse all jobs`; unknown slug: 404 variant `We could not find this company` / `Check the link, or browse all
companies.` / `Browse companies`.

### 4.3 State matrix (Company)
Same as Browse (2.5) with these differences: header skeleton (logo square, name bar, count bar); **company not found**
shows the 404 variant with noindex; **company known but zero active jobs** shows the empty message above (not the
filter-recovery pattern); **name unknown** uses prettified slug and the note under the header `Company name taken from
its job board address.` is not shown (avoid noise); **missing logo** monogram at 64 px; **filtered zero results** use
the standard recovery pattern. Accessibility: h1 = company name; breadcrumb; same keyboard map as Browse.

## 5. Screen: Companies directory (`/companies`)

**Purpose:** find a company by name; supports link-followers and crawlers (UC-12).

**Content:** h1 `Companies`; subline `1,747 companies with open jobs.`; text search `Search companies`; list of rows
(logo/monogram, name, `27 open jobs`, link to Company page); pagination (same component, sizes 25/50/100; default 50
here).

Wireframe (desktop; mobile = single column, tablet = two columns):

```
+------------------------------------------------------------------------+
| Companies                                                              |
| 1,747 companies with open jobs.                                        |
| [ Search companies                                          ] [Search] |
| Showing 1-50 of 1,747 companies              Sort: A-Z (fixed)         |
| [#] Acme Labs      12 open jobs    | [#] Deel        27 open jobs       |
| ...                                                                    |
| < Previous 1 2 3 ... 35 Next >                                        |
+------------------------------------------------------------------------+
```

Copy: zero results `No companies match "xyz"` + `Clear search`. States: skeleton rows, results, zero, error (same
patterns), partial (monogram, prettified name). A11y: rows are links with name + count in the accessible name.

## 6. Screen: About / How it works (`/about`)

**Purpose:** build trust and set expectations in one short read (supports P3). Read mode, max 65ch.

**Content blocks:** (1) h1 `About this site`; (2) one-paragraph what/why; (3) `Where the jobs come from`; (4) `How
often it updates`; (5) `What we do not do`; (6) `Know the limits` (data quirks); (7) `Contact` (placeholder; Q5).

Draft copy (final text for the owner to approve):

> **About this site**
> A free, searchable list of open jobs collected from companies' public job boards on Ashby.
>
> **Where the jobs come from**
> We read the job boards that companies publish on Ashby. When you press Apply you go straight to the company's own
> application page. We are not the employer, not a recruiter, and not in the middle.
>
> **How often it updates**
> The list is refreshed regularly. Each job shows when we last checked it. A job can close before our next check, so
> you may occasionally find one that is no longer open.
>
> **What we do not do**
> No accounts, no sign-up, no saved jobs, no tracking of what you click, no ads. We do not receive your application.
>
> **Know the limits**
> Pay is shown only when the company published it. Some listings have no posting date. Locations are written by
> companies, so the same place can appear in different forms. Descriptions may be shortened or missing.

Wireframes (all breakpoints share one column; tablet/desktop add a right-hand in-page contents list only if the page
exceeds 5 sections; v1 has none):

```
Mobile 390            Tablet 768                    Desktop 1280+
| header |            | header                |     | header                                  |
| h1     |            | h1                    |     |   +-----------------------------+       |
| text   |            | text (65ch, left)     |     |   | h1, text column 65ch        |       |
| h2 ... |            | h2 ...                |     |   | h2 ... (left aligned, not   |       |
| footer |            | footer                |     |   | centred; whitespace right)  |       |
```

States: static; no loading or error states; print = plain text. Accessibility: single h1, h2 per section, link text
descriptive, reading order = visual order.

## 7. Screen: Privacy / Data note (`/privacy`)

**Purpose:** say plainly what happens to data. Read mode.

**Blocks:** (1) h1 `Privacy`; (2) summary box `The short version`; (3) `What we collect`; (4) `Search terms and filters`;
(5) `Links to other sites`; (6) `Where the data comes from`; (7) `Hosting`; (8) `Changes`.

Draft copy (must be reconciled with the actual stack/host in 02/09 and approved by the owner; do not publish
unverified claims):

> **The short version**
> We do not ask who you are. There are no accounts, no cookies for tracking, and no third-party trackers on this site.
>
> **What we collect**
> Nothing about you on purpose. Like any website, the host (name) may keep standard server logs such as IP address and
> time of request for security and operations; we do not use them to identify or follow you.
>
> **Search terms and filters**
> Your search and filters are sent to our job list service so it can reply with results. We do not store them or link
> them to you. They appear in the page address so you can share it; anyone who has the address will see the same results.
>
> **Local storage**
> Your colour theme choice is saved in your browser only. It is never sent anywhere.
>
> **Links to other sites**
> Apply takes you to the company's own application page on Ashby. Their privacy practices apply there. We send only our
> site name (not the page you were on or your filters) as the referrer.
>
> **Where the data comes from**
> Job information comes from public job boards. Pay, location and dates are as published by the company.

Wireframes: identical structure to About (single column); "The short version" is a bordered, tinted block above the
sections. States: static only. If any analytics is later added (open question Q1) this page is updated first.

## 8. Screen: 404 (any unknown path)

**Purpose:** recover without blame. **Blocks:** (1) h1 `Page not found`; (2) one sentence; (3) search field to jump back
into the task; (4) links `Browse all jobs`, `Browse companies`.

Copy: `Page not found` / `That address does not match anything here. It may have been mistyped or moved.` / search label
`Search jobs` / `Browse all jobs` / `Browse companies`. Title tag `Page not found | {Site}`; `noindex`; HTTP 404.

```
Mobile 390                Tablet 768                       Desktop 1280+
| header          |       | header                  |     | header                                  |
| Page not found  |       | Page not found          |     | Page not found                          |
| sentence        |       | sentence                |     | sentence                                |
| [search...][Go] |       | [search................][Go]| | [search....................][Search]    |
| Browse all jobs |       | Browse all jobs  Browse companies| Browse all jobs   Browse companies     |
| Browse companies|       | footer                  |     | footer                                  |
| footer          |
```

States: static; the search field submits to Browse `/?q=`. A11y: h1 receives focus on route entry; no animation.

## 9. Screen: Error (route-level failure)

**Purpose:** when an unrecoverable error replaces the page body (render crash, first-paint 5xx on a route). Recoverable
data errors use inline errors (1.6), not this screen.

Blocks: h1 `Something went wrong`; sentence; primary `Try again` (reloads the route); secondary `Go to all jobs`; small
muted line with a reference code only if the API supplies one (`Reference: abc123`).

Copy: `Something went wrong` / `We could not show this page. This is on our side, and trying again often works.` /
`Try again` / `Go to all jobs`. Offline variant: `You appear to be offline` / `Reconnect, then try again.`.
Title tag `Error | {Site}`; HTTP 500 where host allows; `noindex`.

```
Mobile 390 / Tablet 768 / Desktop 1280+ share one centred-left column (max 560 px):
| header                           |
| Something went wrong       (h1)  |
| We could not show this page...   |
| [ Try again ]  Go to all jobs    |
| Reference: abc123 (if any)       |
| footer                           |
```

States: default; offline variant; repeated failure (after 3 consecutive "Try again" failures add `If this keeps
happening, please check back later.`). A11y: `role="alert"` on the container at mount; h1 focus.

## 10. Cross-screen state summary

| State | Browse | Job detail | Company | Directory | Static | 404 | Error |
|---|---|---|---|---|---|---|---|
| Initial skeleton | yes | yes | yes | yes | no | no | no |
| Loading more (page change) | yes | n/a | yes | yes | n/a | n/a | n/a |
| Results | yes | n/a | yes | yes | n/a | n/a | n/a |
| Zero results | yes | n/a | yes | yes | n/a | n/a | n/a |
| Partial data | yes | yes | yes | yes | n/a | n/a | n/a |
| Long titles | yes | yes | yes | n/a | n/a | n/a | n/a |
| Network / 5xx / 429 | inline | inline | inline | inline | n/a | n/a | full-page fallback |
| Stale/expired | via detail | yes | zero-jobs company | n/a | n/a | n/a | n/a |
| Slow network | yes | yes | yes | yes | n/a | n/a | n/a |
| JS-disabled | 1.7 | read path ok if SSR | 1.7 | 1.7 | ok | ok | n/a |
| Reduced motion | yes | yes | yes | yes | yes | yes | yes |
| Print | yes | yes | yes | no | yes | no | no |
| Dark | yes (all) | | | | | | |

## 11. Component inventory

Used by 06 (visual design), 07 (Figma spec) and 09 (architecture). "Props" are in prose.

| Component | Where used | Props (prose) | Variants | States | A11y notes |
|---|---|---|---|---|---|
| SiteHeader | all | site name, nav items, current route | compact (mobile) / full | default, focus | `banner`; nav `aria-label="Primary"`; `aria-current="page"` |
| SkipLinks | all | targets (results, filters, main) | - | hidden, focus-visible | first focusable; moves focus to target heading |
| Footer | all | links, last updated text | - | default | `contentinfo` |
| ThemeToggle | header | current theme (system/light/dark) | icon button | default, focus, pressed | name "Theme: system. Change theme"; no flash on load |
| Button | everywhere | label, kind (primary, secondary, quiet), size, disabled, busy | primary, secondary, quiet; small, medium, large (48) | default, hover, focus, active, disabled, busy | min 24 px, 44 px on touch; busy uses `aria-busy` and keeps label |
| ExternalLink | Apply, View on Ashby, description links | href, label, host text | inline, button-styled | default, hover, focus, visited | always includes sr text "(opens in a new tab)"; `rel="noopener nofollow"` |
| SearchCombobox | Browse, Company, 404, Directory | value, placeholder, suggestion groups, loading, onSubmit | with / without suggestions | idle, focused, typing (debounced), suggestions open, active option, error (silent) | ARIA 1.2 combobox; groups labelled; clear button named "Clear search"; min 2 chars |
| FilterSidebar | Browse, Company (desktop) | facet definitions, selection, counts, loading | - | loading skeleton, ready, error (inline retry) | within `search` landmark; sticky, own scroll |
| FilterDialog | Browse, Company (below desktop) | same facets, draft selection, live count | full-screen (mobile), 360 px drawer (tablet) | closed, open, applying, zero-match (button disabled) | `aria-modal`, focus trap, Esc closes, focus returns to opener |
| FacetGroup | sidebar, dialog | label, options, selected, mode (checkbox/radio/switch), showMore, searchable | checkbox list, radio list, single switch | collapsed, open, loading, searching, empty | `fieldset` + `legend`; count badge for active; "Show more" moves focus to first new option |
| FacetOption | FacetGroup | label, count, checked, disabled-zero | - | default, hover, focus, checked, zero (dimmed, selectable only if checked) | label includes count in accessible text |
| ToggleSwitch | Remote, Salary | label, count, checked | - | off, on, focus, disabled | `role="switch"` or checkbox; state in text for forced-colors |
| FilterChip | active filters | facet label, value label, onRemove | filter, search | default, hover, focus, removing | button named "Department: Engineering. Remove filter."; x icon decorative |
| ChipBar | Browse, Company | chips, collapse threshold | wrap / collapsed "+N more" | empty (renders nothing), with chips | list semantics; "Clear all" is a button at the end |
| ResultsToolbar | Browse, Company, Directory | summary text, sort options/value, copy-link action, filters button count | with/without Filters button | default, copying (status) | `h2` results heading sits above; Sort is native `select` |
| SortSelect | toolbar | options, value | - | default, focus, open | native control, visible label "Sort by" |
| CopyLinkButton | toolbar | url | - | idle, copied (3 s), failed ("Could not copy. Copy the address from your browser.") | status text in live region |
| JobCard | Browse, Company | job summary object, query terms to highlight, showCompany, showLogo | full (list), compact-company (no company/logo) | default, hover, focus, visited, returned-to | one tab stop; accessible description; no nested interactive |
| JobCardSkeleton | loading | count | list | pulse / static | `aria-hidden` |
| CompanyLogo | cards, headers | logoUrl, display name, size | 36, 40, 64 | image, monogram, loading | `alt=""` when name adjacent; monogram letter 4.5:1 |
| Badge | Remote, employment | text, tone (neutral, info) | neutral only in v1 | static | always text; never colour only |
| SalaryText | card, detail | min, max, currency, interval | compact (`$120k-$160k`), full (detail with note) | static | spelled-out `aria-label` |
| PostedAge | card, detail | postedAt | relative, absolute | static | `<time datetime>`; absent renders nothing |
| Pagination | Browse, Company, Directory | page, totalPages, total, pageSize, hrefBuilder, maxWindow | desktop/tablet (numbered), mobile (compact) | default, current, disabled ends, loading, invalid jump | `nav aria-label="Pagination"`, `aria-current`, real anchors, focus + announce after change |
| PageSizeSelect | Pagination | value, options 25/50/100 | - | default | native select, label "Jobs per page" |
| SummaryLine | toolbar, pagination | from, to, total, approximate | exact, approximate, all, single | static | text only |
| LiveRegion | app root | message queue (settled) | - | idle, announcing | single instance, `role="status"` polite, atomic |
| Notice | Browse, Company | message, dismissible | info | shown, dismissed | `role="status"`; dismiss button |
| EmptyState | zero results, empty company | heading, body, actions (remove-filter buttons, clear all) | filtered, unfiltered | static | h2; actions are buttons; no illustration needed |
| InlineError | results, detail | title, body, retry handler, kind (network, server, rate) | three kinds | default, retrying | `role="alert"` once; Try again returns focus appropriately |
| FullPageError / NotFound | error, 404 | title, body, actions | 404, error, offline | default | h1 focus on mount |
| Breadcrumb | Detail, Company | items | desktop full / mobile back link | default | `nav aria-label="Breadcrumb"`; `aria-current` |
| BackLink | Detail | mode (history back / company / browse) | - | default | uses `history.back()` only when same-app arrival |
| JobHeader | Detail | title, company, facts | - | default | h1; facts as `dl` |
| FactList | Detail | label/value pairs (absent pairs omitted) | inline (wrap) / stacked | static | `dl` |
| ApplyButton | Detail | url, company name, host | block (mobile), inline (desktop) | default, hover, focus, active | link semantics; name includes company |
| TrustNote | Detail | company name, last checked | - | static | text near button; associated via `aria-describedby` |
| StickyApplyBar | Detail (mobile) | same as ApplyButton | - | hidden, visible | hides when main button on screen; no focus obscuring |
| DescriptionBlock | Detail | sanitised HTML | - | present, missing, loading | measure 65-75ch; headings demoted; images stripped |
| CompanyHeader | Company | name, logo, job count, board URL | - | skeleton, ready, no jobs | h1; "View all on Ashby" external |
| CompanyRow | Directory | name, logo, count, href | - | default, hover, focus | one link per row |
| Skeleton primitives | all loaders | width, height | bar, block, circle | pulse / static | `aria-hidden` |

## 12. Requirements for 08 (from screens)

| Ref | Requirement |
|---|---|
| R05-1 | `salary` includes `interval` (`year`, `month`, `hour`, null) when derivable from `metadata.compensation`; also a short `salary.summary` string as published |
| R05-2 | Each list item carries: `id`/`ashbyId`, `title`, `company {slug,name?,logoUrl?}`, `location?`, `remote` (boolean), `employmentType?`, `department?`, `postedAt?`, `salary?`, so cards need no second call |
| R05-3 | Detail returns `active`, `updatedAt`, `descriptionHtml?` (already sanitised) and `lastCheckedAt` or equivalent |
| R05-4 | Company endpoint returns `openJobCount` and `boardUrl` |
| R05-5 | Stable machine-readable error codes (`NETWORK` is client-side; server: `RATE_LIMITED` with `retryAfterSeconds`, `NOT_FOUND`, `INTERNAL`) and optional `requestId` for the Reference line |
| R05-6 | Decision (via 02/09) whether pages are server/edge rendered; if yes, list and detail endpoints must be cacheable and fast enough for render-time fetch |
| R05-7 | Count-only response for the filter dialog's "Show N jobs" button |
| R05-8 | Total company and job counts plus `lastUpdatedAt` for the Browse subline (`GET /meta` or included in list response) |

## 13. Accessibility checklist (gate for 09/10)

1. Every screen: one h1, landmarks as listed, skip link, language attribute, descriptive `<title>`, focus moved to h1 on
   route change.
2. Zero axe-core serious/critical on every state in the matrix (including error, zero, skeleton).
3. 4.5:1 text, 3:1 UI and focus indicators in light and dark; forced-colors mode keeps chips, switches and focus rings
   visible (use system colors, borders not just fills).
4. All interactions keyboard-completable; no hover-only information; no focus traps except the dialog (which is
   escapable).
5. Targets at least 24 px (44 px touch); no dragging; no time limits; no auto-playing motion.
6. Live-region announcements exactly as 2.6; verified with NVDA/Firefox, JAWS/Chrome, VoiceOver/Safari iOS.
7. Reflow at 320 px / 400 percent zoom; text spacing overrides do not clip cards (cards grow).
8. External links announce that they open in a new tab.
