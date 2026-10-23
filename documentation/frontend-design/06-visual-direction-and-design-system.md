# 06 · Visual Direction & Design System

> **Status:** DESIGN ONLY. Nothing here is implemented. This file is the visual contract for the implementing agent
> (tokens, components, states) and the source for the Figma file described in [07](./07-figma-build-spec.md).
> Structure, copy, routes and states come from [04](./04-information-architecture-and-flows.md) and
> [05](./05-screens-and-states.md); where this file changes or adds to 05, section 6 lists it.
> _Authored 2026-10-22. Every contrast ratio below was computed (WCAG 2.x relative luminance) in this session by script,
> not estimated._

---

## 0. Method and reproducibility record

**Skills used as the method.** Impeccable (`.claude/skills/impeccable`, v4.7.0): `shape.md` (brief taken from 00-05 instead of
re-interviewing), `new-work.md` (committed world), `operate.md`, `layout.md`, `typeset.md`, `colorize.md`, and
`craft-floor.md` (its quality floor and bans apply to everything below). design-taste-frontend
(`.agents/skills/design-taste-frontend`): the **app-screens** run (`references/app-screens.md`), because this is a list-plus-filters
screen. `impeccable init` was deliberately not run and no `PRODUCT.md` / `DESIGN.md` was created; the product context is 00-05.

**Surface mode:** **Operate** for Browse, Company page and Companies directory; **light Read** for Job detail, About and
Privacy (calm hierarchy, 68ch measure, with an Operate-style Apply action).

**Direction draw (reproducible).**

| Step | Command (run from repo root) | Result |
|---|---|---|
| List kinds | `node .agents/skills/design-taste-frontend/scripts/draw.mjs --app --list kinds` | 13 kinds; **closest = `support`** ("support inboxes, queues, helpdesks": a list to work through with filters). No kind is a public job board; `commerce` and `analytics` were considered and rejected as money- or chart-led. |
| Deal options | `draw.mjs --app --kind support --brief "public read-only job board: search, faceted filters, dense scannable results list, numbered pagination, job detail with outbound Apply" --screens list,detail --theme light --options 3 --out <scratchpad>/app` | Only **two** styles suit `support` + light, so two were dealt (not three): `framed-sheet` and `achromatic-ledger`. |
| Choose + full sheet | same arguments without `--options`, plus `--style achromatic-ledger` | **Style `achromatic-ledger`, seed `152492174`** (sheet saved in the session scratchpad as `app/direction.json`). |
| Redraw attempt | same, plus `--redraw type` (seed `2004344184`) | The style fixes its typeface in app mode, so the redraw returned the same face (Geist). It was **not** used; the first sheet (seed 152492174) is the record. |

**Why `achromatic-ledger` over `framed-sheet`.** `framed-sheet` is built around an app shell (a tinted L-shaped frame holding a
sidebar and a 48px top bar, the page as an inset sheet). A public site visited from a search result has neither a workspace
nor a sidebar of destinations; that frame would be borrowed furniture. `achromatic-ledger` is the move this product needs:
no colour in the chrome, a **near-black primary action** (the only filled button on a screen is Apply, or Search), ink for
counts and money, **one hue reserved for the main data element** (here: the salary figure), tabular figures in columns,
rules instead of boxes. It also matches the audience: quick, impatient, trust-sensitive, many comparisons per minute.

**What was kept from the sheet and what was changed.**

| Sheet item | Decision |
|---|---|
| Move: no brand colour in chrome; near-black primary; one hue on the main data element; zero/missing in grey | **Kept whole.** |
| Colour budget: under 1% coloured pixels | **Kept** (the hue appears only on salary, text links, focus ring, text selection mark). |
| Tokens: radius 8 card / 6 control, 1px borders, no resting shadow, row 44 | **Kept** (card radius 8, control 6, chip/tag 4). Gap 12 kept as list gap. |
| Face option "a ground from the product's world: a blue-grey for a ledger (#f2f4f7)" | **Taken, adjusted** to `#f3f5f8` (see 2.1). |
| Face option "the one chart hue `#1d5fbf` on the screen's main data element" | **Taken exactly:** `#1d5fbf` is the `hue`, on the salary figure. |
| Face option "every figure in Geist Mono" | **Not taken.** Figures are Geist with tabular numerals. Geist Mono is used only for the **source line** (an address), per the sheet's own "IDs and keys only" rule. |
| Type: Geist 400/500/700, 700 for money figures only | **Kept** (and 600 added for titles; 700 stays money-only). |
| Shell "Open plane" (labelled sidebar of destinations, no top bar) | **Replaced** by a 56px top header (3 destinations, per 04 §2.1). The *filter* sidebar on desktop follows the open-plane idea: it sits on the page ground with no box. |
| Screen patterns "count cards that filter", "tabbed object detail in a sheet" | **Not used** (neither answers this product's question); the list screen is 05 §2, the detail screen is 05 §3. Recorded here so nobody expects them. |
| Page title 24 / section 16 / KPI 30 / body 14 / small 12 | Kept as the Operate scale; reading roles (16/26 description) added for Job detail. |

---

## 1. Visual world and the one idea

### 1.1 The world

A **printed index of real postings**: the quiet authority of a ledger or a library catalogue card, set on cool paper in ink. Every
row says where the job lives. Nothing is selling anything. The page is mostly white sheet and black text; colour is a rarity, and
when it appears it is on the one figure a job seeker is hunting for (the pay).

**Tone words:** plain, exact, quiet, receipt-like, trustworthy, fast.

**It must not feel like:** a recruiting-marketing site (hero banners, stock people, "find your dream job"); a LinkedIn or
Indeed clone (blue chrome, social proof, sign-in nags); a startup SaaS template (gradient, glow, glass, icon-topped feature cards,
eyebrow labels, violet/indigo); a feed that manufactures urgency ("hiring fast", "12 people viewing"); a middleman (anything
that suggests we are the employer or that we handle the application).

### 1.2 The one idea (with the competitor test)

> On this site, **the posting's own address on the company's Ashby board** becomes **a quiet monospace source line, printed in
> every listing row and as the literal destination line under every Apply button.**

- **Where it appears:** (1) each Job card on tablet/desktop, after the company name: `Deel   jobs.ashbyhq.com/deel` (Geist Mono 12px,
  `ink-3`); (2) on Job detail directly under the Apply button: `jobs.ashbyhq.com/deel/7fe8abc1…` (Geist Mono 13px, `ink-2`)
  followed by the trust sentence; (3) the Company page's "View all on Ashby" link carries the same address; (4) the footer line
  "Apply links go straight to the company's own Ashby page." (copy owned by 05; see 6.3 for the one addition).
- **Why it is true to the subject:** the product's only distinguishing fact (00 section 2) is that Apply links go to the real source with no
  middleman, no account and no tracking. Showing the address *is* that fact, shown rather than claimed.
- **Competitor test:** put Himalayas or Built In in the sentence ("their posting's own address becomes the source line"): it fails,
  because their "View job" opens their own page first (01 section 1.2). Put a Greenhouse-hosted board in: it fails too, because on a
  hosted board the address is the board itself. The idea only holds for an index that links straight out. Passed.
- **Supporting moves (ledger, not decoration):** (a) **columns of figures**: salary and posted age are right-aligned on one edge with
  tabular numerals so a scan down the page reads like a ledger; (b) **the dataset sentence as a ledger total**:
  "**34,035** open jobs at **1,747** companies. Updated Oct 22." with figures in 600 weight; (c) **rules, not boxes**: one white
  sheet with row rules instead of a stack of bordered cards.

### 1.3 Reference moves borrowed from the north stars in 01

| North star (01 section 4) | Move borrowed | Move deliberately not borrowed |
|---|---|---|
| Greenhouse-hosted board | Result count above the list; numbered pagination at the foot; single calm column; white page, black titles | Sparse rows (we carry salary, remote, posted age) |
| Lever-hosted board | Filters as real URL state; text-led rows with almost no borders; workplace type as a first-class filter | Long link-list filters on mobile (we use a dialog) |
| Himalayas | Compact meta strip; relative time with the absolute date available; salary compactly formatted; company name as a clean line; sort including salary | Sign-up nags, sponsored rows, mixed salary units |
| Built In | The scannable card (age + arrangement + location + salary on few lines); the explicit "Show N jobs" filter panel; numbered pages | Summaries and skill chips on the card; account promos between results |
| Wellfound | The one-line, separator-joined meta strip; explicit omission rules; directory-style footer links | Unverifiable badges ("responds in a few days") |
| Linear / Vercel careers (text-first) | Confident type scale, restrained palette, narrow readable column on Job detail, plain tone | No search or filters (impossible at 34k jobs) |

---

## 2. Design tokens

All values are final. Names are semantic (what the thing is for), never positional or hue-based. The implementing agent maps them to CSS
custom properties exactly as listed in section 5. Light is the reference theme; dark is composed separately (section 4.3), not inverted.

### 2.1 Colour roles: light and dark

Rules this palette obeys: neutrals are cool and low-chroma (OKLCH chroma up to 0.026 at hue 258-268); the single hue is `#1d5fbf`
(blue, hue 259, **not** violet or indigo); status colours are pale-fill/dark-ink pairs; no gradients anywhere; no colour is used
for a state without a second cue (text, weight, icon or position). Hex is the source of truth; OKLCH is for adjusting ramps.
(OKLCH hue is shown as 0 for near-neutral colours whose hue is undefined.)

| Token (`--color-*`) | Role | Light hex | Light OKLCH | Dark hex | Dark OKLCH |
|---|---|---|---|---|---|
| `ground` | Page background behind everything; sidebar and header sit on it | `#f3f5f8` | `oklch(0.969 0.005 0)` | `#0e0f11` | `oklch(0.168 0.004 0)` |
| `surface-1` | The sheet: job-list sheet, detail sheet, inputs, dialogs, popovers | `#ffffff` | `oklch(1.000 0.000 0)` | `#16171a` | `oklch(0.205 0.006 271)` |
| `surface-2` | Hover fill on controls, neutral badge, pressed row, skeleton track base, prose callout | `#ebeef3` | `oklch(0.948 0.007 261)` | `#1f2125` | `oklch(0.247 0.008 264)` |
| `surface-3` | Strongest neutral fill: pressed secondary, tag on surface-2; also the hairline `border` value | `#dde2ea` | `oklch(0.911 0.012 260)` | `#2b2e33` | `oklch(0.300 0.010 261)` |
| `row-hover` | Job card / list row hover tint (between surface-1 and ground) | `#f7f9fb` | `oklch(0.981 0.003 0)` | `#1b1c20` | `oklch(0.227 0.008 275)` |
| `ink-1` | Primary text: titles, values, active nav | `#0f1217` | `oklch(0.181 0.011 261)` | `#f1f2f4` | `oklch(0.961 0.003 0)` |
| `ink-2` | Secondary text: company, meta line, helper text, inactive nav | `#434a55` | `oklch(0.407 0.021 259)` | `#b9bec6` | `oklch(0.800 0.013 260)` |
| `ink-3` | Tertiary text: counts, placeholder, source line, timestamps, group captions | `#596170` | `oklch(0.491 0.026 263)` | `#9aa0ab` | `oklch(0.704 0.017 263)` |
| `ink-disabled` | Disabled text only (exempt from contrast, see 2.1.1) | `#8a919d` | `oklch(0.655 0.020 261)` | `#6b717c` | `oklch(0.547 0.019 263)` |
| `ink-inverse` | Text on `primary` fill | `#ffffff` | `oklch(1.000 0.000 0)` | `#0e0f11` | `oklch(0.168 0.004 0)` |
| `hue` | The one hue: salary figure, text links, focus ring, selection marks | `#1d5fbf` | `oklch(0.501 0.165 259)` | `#7ea9f0` | `oklch(0.732 0.114 260)` |
| `hue-hover` | Link / hue hover | `#174f9f` | `oklch(0.440 0.142 258)` | `#9dc0f5` | `oklch(0.801 0.085 259)` |
| `hue-pressed` | Link / hue pressed | `#123f80` | `oklch(0.378 0.120 258)` | `#b8d3f8` | `oklch(0.859 0.059 256)` |
| `focus` | Focus ring (alias of hue) | `#1d5fbf` | `oklch(0.501 0.165 259)` | `#7ea9f0` | `oklch(0.732 0.114 260)` |
| `border` | Card and sheet edge, header and footer rule (decorative) | `#dde2ea` | `oklch(0.911 0.012 260)` | `#2b2e33` | `oklch(0.300 0.010 261)` |
| `border-strong` | Secondary button, chip, divider between meta segments, dialog edge (decorative) | `#b9c0cc` | `oklch(0.806 0.019 261)` | `#3b3e45` | `oklch(0.364 0.013 267)` |
| `rule` | Row rule between job cards and facet groups (decorative) | `#ebeef3` | `oklch(0.948 0.007 261)` | `#212328` | `oklch(0.256 0.010 268)` |
| `control` | Boundary of inputs, selects, checkboxes, radios, switch track (must reach 3:1) | `#7d8696` | `oklch(0.618 0.026 262)` | `#757c89` | `oklch(0.585 0.022 263)` |
| `primary` | Fill of the primary button, current page, checked box, switch on | `#14171c` | `oklch(0.204 0.011 261)` | `#f1f2f4` | `oklch(0.961 0.003 0)` |
| `primary-hover` | Primary hover | `#2a2f38` | `oklch(0.304 0.018 262)` | `#d9dce1` | `oklch(0.894 0.008 261)` |
| `primary-pressed` | Primary pressed | `#000000` | `oklch(0.000 0.000 0)` | `#c3c7ce` | `oklch(0.829 0.011 262)` |
| `success-ink` | Success text/icon (Link copied) | `#1b6b3d` | `oklch(0.468 0.106 153)` | `#63d18d` | `oklch(0.778 0.141 154)` |
| `success-bg` | Success pair background | `#e2f4e9` | `oklch(0.951 0.024 159)` | `#15291d` | `oklch(0.260 0.035 157)` |
| `warning-ink` | Warning text/icon (offline, stale) | `#7c4306` | `oklch(0.444 0.102 59)` | `#e9b45e` | `oklch(0.801 0.120 78)` |
| `warning-bg` | Warning pair background | `#fcf1d8` | `oklch(0.960 0.035 87)` | `#2c2212` | `oklch(0.259 0.031 78)` |
| `danger-ink` | Error text/icon, invalid input border | `#a8201a` | `oklch(0.476 0.172 28)` | `#ff8f86` | `oklch(0.768 0.137 26)` |
| `danger-bg` | Error pair background (inline pill only) | `#fdebe9` | `oklch(0.954 0.020 25)` | `#341b1a` | `oklch(0.256 0.040 23)` |
| `info-ink` | Info text/icon (Notice) | `#174a96` | `oklch(0.422 0.136 259)` | `#94b9f3` | `oklch(0.780 0.093 259)` |
| `info-bg` | Notice background | `#e6eefb` | `oklch(0.947 0.020 260)` | `#172338` | `oklch(0.256 0.043 261)` |
| `info-border` | Notice 1px edge (decorative) | `#c6d7f3` | `oklch(0.875 0.043 260)` | `#2d4a78` | `oklch(0.410 0.085 259)` |
| `skeleton` | Skeleton bars and blocks | `#e4e8ee` | `oklch(0.930 0.009 258)` | `#25282d` | `oklch(0.276 0.010 261)` |
| `selection-bg` | Text selection (`::selection`), ink-1 text on it | `#cddffa` | `oklch(0.899 0.042 258)` | `#2a4a82` | `oklch(0.415 0.101 261)` |
| `mark-bg` | Search-term highlight fill (`<mark>`) | `#fdf0b8` | `oklch(0.952 0.073 97)` | `#4a3f0e` | `oklch(0.369 0.067 96)` |
| `mark-line` | Search-term highlight underline (2px) | `#8f6700` | `oklch(0.541 0.111 82)` | `#e4bc3f` | `oklch(0.809 0.144 91)` |
| `logo-tile` | Tile behind every company logo image | `#ffffff` | `oklch(1.000 0.000 0)` | `#f1f2f4` | `oklch(0.961 0.003 0)` |
| `scrim` | Dim layer behind the filter drawer/dialog | `rgb(15 17 21 / 0.45)` | n/a | `rgb(0 0 0 / 0.60)` | n/a |

**Notes on specific tokens**

- `ground` is `#f3f5f8` (a blue-grey for a ledger, the sheet's first "face" option; chroma 0.005, well under the cream check). It is
  one step off white; cards and the list sheet are `surface-1` on it.
- `border` = `surface-3` and `rule` = `surface-2` as *values*, kept as separate tokens so they can diverge later without a refactor.
- `primary` is near-black in light and near-white in dark (inverted), per the sheet. It is **never** the `hue`.
- `hue` carries: the salary figure (`color-salary` alias), text links, the focus ring (`focus`), the current-sort mark where one is needed,
  and nothing else. It is not used for buttons, tabs, chips, nav or backgrounds.
- `mark-bg` + `mark-line`: a search-term highlight is a pale fill **plus a 2px underline**, so it is not colour alone (see 3.34 DescriptionBlock / 3.18 JobCard).
- `logo-tile` keeps company logos legible in dark mode (many logos are dark ink on transparent).

### 2.1.1 Measured contrast (WCAG 2.2 AA)

Targets: **4.5:1** for text and for icons that carry meaning on their own, **3:1** for UI component boundaries, focus indicators and
state graphics (1.4.11), large text 3:1 (not relied on). Every row below was computed from the hex values above. **No row fails.**

| Foreground | Background | Use | Target | Light | Dark |
|---|---|---|---|---|---|
| `ink-1` | `ground` | Text | 4.5:1 | 17.18:1 pass | 17.12:1 pass |
| `ink-1` | `surface-1` | Text | 4.5:1 | 18.76:1 pass | 16.00:1 pass |
| `ink-1` | `surface-2` | Text | 4.5:1 | 16.13:1 pass | 14.39:1 pass |
| `ink-1` | `surface-3` | Text | 4.5:1 | 14.42:1 pass | 12.16:1 pass |
| `ink-1` | `row-hover` | Text | 4.5:1 | 17.78:1 pass | 15.20:1 pass |
| `ink-2` | `ground` | Text | 4.5:1 | 8.18:1 pass | 10.27:1 pass |
| `ink-2` | `surface-1` | Text | 4.5:1 | 8.94:1 pass | 9.60:1 pass |
| `ink-2` | `surface-2` | Text | 4.5:1 | 7.69:1 pass | 8.63:1 pass |
| `ink-2` | `surface-3` | Text | 4.5:1 | 6.87:1 pass | 7.29:1 pass |
| `ink-2` | `row-hover` | Text | 4.5:1 | 8.47:1 pass | 9.11:1 pass |
| `ink-3` | `ground` | Text (placeholder, counts, source line) | 4.5:1 | 5.71:1 pass | 7.30:1 pass |
| `ink-3` | `surface-1` | Text | 4.5:1 | 6.23:1 pass | 6.82:1 pass |
| `ink-3` | `surface-2` | Text | 4.5:1 | 5.36:1 pass | 6.13:1 pass |
| `ink-3` | `surface-3` | Text | 4.5:1 | 4.79:1 pass | 5.18:1 pass |
| `ink-3` | `row-hover` | Text | 4.5:1 | 5.91:1 pass | 6.48:1 pass |
| `hue` | `surface-1` | Text (salary, links) | 4.5:1 | 6.10:1 pass | 7.53:1 pass |
| `hue` | `ground` | Text | 4.5:1 | 5.59:1 pass | 8.05:1 pass |
| `hue` | `surface-2` | Text | 4.5:1 | 5.25:1 pass | 6.77:1 pass |
| `hue` | `surface-3` | Text | 4.5:1 | 4.69:1 pass | 5.72:1 pass |
| `hue` | `row-hover` | Text (salary on hovered card) | 4.5:1 | 5.78:1 pass | 7.15:1 pass |
| `hue` | `info-bg` | Text | 4.5:1 | 5.23:1 pass | 6.61:1 pass |
| `hue-hover` | `surface-1` | Text (link hover) | 4.5:1 | 7.91:1 pass | 9.64:1 pass |
| `hue-pressed` | `surface-1` | Text (link pressed) | 4.5:1 | 10.25:1 pass | 11.70:1 pass |
| `ink-inverse` | `primary` | Text (primary button label) | 4.5:1 | 17.96:1 pass | 17.12:1 pass |
| `ink-inverse` | `primary-hover` | Text | 4.5:1 | 13.44:1 pass | 13.95:1 pass |
| `ink-inverse` | `primary-pressed` | Text | 4.5:1 | 21.00:1 pass | 11.31:1 pass |
| `primary` | `surface-1` | UI (button edge, checked box, current page) | 3:1 | 17.96:1 pass | 16.00:1 pass |
| `primary` | `ground` | UI | 3:1 | 16.45:1 pass | 17.12:1 pass |
| `focus` | `surface-1` | UI (focus ring) | 3:1 | 6.10:1 pass | 7.53:1 pass |
| `focus` | `ground` | UI (focus ring) | 3:1 | 5.59:1 pass | 8.05:1 pass |
| `focus` | `surface-2` | UI (focus ring) | 3:1 | 5.25:1 pass | 6.77:1 pass |
| `focus` | `row-hover` | UI (focus ring inside card) | 3:1 | 5.78:1 pass | 7.15:1 pass |
| `control` | `surface-1` | UI (input / checkbox / switch boundary) | 3:1 | 3.67:1 pass | 4.27:1 pass |
| `control` | `ground` | UI | 3:1 | 3.36:1 pass | 4.57:1 pass |
| `control` | `surface-2` | UI | 3:1 | 3.16:1 pass | 3.84:1 pass |
| `danger-ink` | `surface-1` | UI (invalid input border) and text | 4.5:1 | 7.28:1 pass | 8.13:1 pass |
| `danger-ink` | `danger-bg` | Text | 4.5:1 | 6.32:1 pass | 7.23:1 pass |
| `success-ink` | `success-bg` | Text | 4.5:1 | 5.70:1 pass | 8.07:1 pass |
| `success-ink` | `surface-1` | Text / icon | 4.5:1 | 6.53:1 pass | 9.42:1 pass |
| `warning-ink` | `warning-bg` | Text | 4.5:1 | 7.03:1 pass | 8.30:1 pass |
| `warning-ink` | `surface-1` | Text / icon | 4.5:1 | 7.89:1 pass | 9.52:1 pass |
| `info-ink` | `info-bg` | Text | 4.5:1 | 7.32:1 pass | 7.87:1 pass |
| `ink-1` | `selection-bg` | Selected text | 4.5:1 | 13.88:1 pass | 7.81:1 pass |
| `ink-1` | `mark-bg` | Highlighted term text | 4.5:1 | 16.38:1 pass | 9.33:1 pass |
| `mark-line` | `surface-1` | UI (highlight underline, the non-colour cue) | 3:1 | 5.11:1 pass | 9.87:1 pass |

**Decorative or exempt values (stated, not claimed as passing):** these carry no information alone; the information is always also
in text, weight, shape or position.

| Token | vs surface-1 (light) | vs surface-1 (dark) | vs ground (light) | vs ground (dark) |
|---|---|---|---|---|
| `border` | 1.30:1 | 1.32:1 | 1.19:1 | 1.41:1 |
| `border-strong` | 1.83:1 | 1.67:1 | 1.68:1 | 1.79:1 |
| `rule` | 1.16:1 | 1.14:1 | 1.06:1 | 1.22:1 |
| `skeleton` | 1.23:1 | 1.21:1 | 1.13:1 | 1.30:1 |
| `info-border` | 1.46:1 | 2.02:1 | 1.33:1 | 2.16:1 |
| `ink-disabled` (text, exempt) on `surface-2` | 2.73:1 | 3.28:1 | n/a | n/a |

- **Disabled text is exempt** under WCAG 1.4.3 ("inactive user interface components"); `ink-disabled` is therefore under 4.5:1 on purpose. Disabled controls
  also change fill and cursor, and the reason is stated in adjacent text where it matters ("No jobs match").
- **Separators and skeletons are decorative.** Skeleton blocks are `aria-hidden`.
- **Forced colors:** every border/boundary maps to `CanvasText`/`ButtonBorder`, focus to `Highlight`; `primary` fills keep a 1px `ButtonText` border; chips, switches and checkboxes keep their glyph (check, knob position, "On"/"Off" text) so state survives `forced-colors: active`.

### 2.1.2 Company monogram palette (deterministic, from slug)

When a company has no logo, or the image fails: a square tile with the first character of the display name (uppercase, Geist 600, centred).
Colour is chosen by **hashing the slug** (not the display name, which can change): `index = fnv1a32(slug) mod 6` (FNV-1a, 32-bit: offset basis
`0x811c9dc5`, prime `0x01000193`, over the UTF-8 bytes of the lowercase slug). The same company always gets the same tile in
every list. Hues are kept away from violet/indigo; chroma is low so the tiles stay neutral-tinted rather than candy.

| Index | Name | Light tile | Light letter | Letter contrast | Dark tile | Dark letter | Letter contrast |
|---|---|---|---|---|---|---|---|
| 0 | clay (hue 35) | `#f8e2dd` | `#59352c` | 8.58:1 | `#3f2b25` | `#fad0c5` | 9.40:1 |
| 1 | sand (hue 85) | `#f0e7d6` | `#4d3d1b` | 8.56:1 | `#382f1d` | `#ead9b6` | 9.48:1 |
| 2 | sage (hue 150) | `#ddeddf` | `#294830` | 8.36:1 | `#253528` | `#c4e5ca` | 9.52:1 |
| 3 | teal (hue 200) | `#d6edee` | `#12484b` | 8.38:1 | `#1b3537` | `#b5e5e8` | 9.52:1 |
| 4 | slate (hue 245) | `#dbeaf8` | `#25435b` | 8.43:1 | `#223240` | `#c0dffa` | 9.50:1 |
| 5 | rose (hue 355) | `#f7e1e9` | `#573341` | 8.64:1 | `#3e2a31` | `#f7cedc` | 9.38:1 |

**Test vectors** (so the implementation can be checked): `fnv1a32("deel")` = 2380888459 → index 1 (sand); `fnv1a32("1password")` = 3187316589 → index 3 (teal); `fnv1a32("brightwater-health")` = 3193156721 → index 5 (rose); `fnv1a32("3rd-shift-labs")` = 4009932280 → index 4 (slate).

Tile sizes and letter sizes: 36 → 15px, 40 → 16px, 48 → 18px, 64 → 24px (weight 600). Names that start with a digit show the digit
("1password" → `1`). Names starting with a non-letter symbol use the next alphanumeric. Tile radius 6 (36/40/48) and 8 (64); no border (the tile is
already a fill). Letters are 8.4-9.5:1, far above the 4.5:1 floor. The monogram is `aria-hidden` (the company name is adjacent text).

### 2.2 Typography

**Families (both free and open: SIL Open Font License 1.1; verify the licence file when installing).**

| Role | Family | Source names | Fallback stack |
|---|---|---|---|
| UI, headings, body, figures | **Geist** (variable, weight axis 100-900; used 400/500/600/700) | Google Fonts: `Geist`; Fontsource: `@fontsource-variable/geist`; Next.js: `next/font/google` `Geist` | `Geist, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif` |
| Source line, URLs, code in descriptions | **Geist Mono** (variable; used 400/500) | Google Fonts: `Geist Mono`; Fontsource: `@fontsource-variable/geist-mono`; `next/font/google` `Geist_Mono` | `"Geist Mono", ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace` |

Geist is the dealt face of the sheet and the Operate guidance (one well-tuned sans for everything). To keep it from reading as the stock
kit (impeccable/tasteskill both warn about "stock Geist on #f8f8f8"), the identity is carried by the ground, the single hue on pay, the
source line and the ledger columns, not by the font alone.

**Loading strategy (privacy-compatible, no third-party request at runtime).** Self-host through the build: `next/font/google` downloads
and serves the files from our own origin at build time (no request to Google by the visitor, which keeps the Privacy page's "no
third-party trackers" claim true) and generates a metric-matched fallback so the swap does not shift layout. Equivalent: Fontsource
npm packages. `font-display: swap`; subsets `latin` and `latin-ext`; preload **Geist only** (above-the-fold text); Geist Mono preloaded
on routes that render job cards or the Apply block (all of them except About/Privacy/404), 400 weight only. Do not load italic
(none is used) or unused weights. Because the axis is variable, one file per family serves all weights.

**Tabular numerals.** Geist provides tabular figures through `font-variant-numeric: tabular-nums` (OpenType `tnum`). The implementing agent
must **verify once in the browser that digit widths change** (craft-floor rule); if they do not, use Geist Mono for the affected figures (salary, counts) rather than ship proportional digits in a column. Tabular numerals are required on: salary (card and detail), result
summary, dataset line, facet counts, pagination numbers and the page-jump input, "Posted" dates, "Listing last checked" dates.

**Type scale** (fixed rem values, root 16px; Operate surfaces use a fixed scale, steps 1.125-1.25 apart: 12, 14, 16, 18, 20, 24, 30). Line-height is in px for the
reference size. Tracking is `em`; the floor is -0.02em on anything here.

| Role token | Size / line-height | Weight | Tracking | Used for |
|---|---|---|---|---|
| `page-title` | 24 / 32 | 600 | -0.01em | h1 on Browse, Company, Directory, 404, Error |
| `read-title` | **fluid**: `clamp(1.5rem, 1.3rem + 0.8vw, 1.875rem)` / 1.25 (24 at 390, 26.9 at 768, 29 at 1024, 30 from ~1160) | 600 | -0.015em | h1 on Job detail, About, Privacy (Read surfaces only; the only fluid step) |
| `section-title` | 18 / 26 | 600 | 0 | h2 ("About the role", "More jobs at Deel", empty/error headings, "The short version") |
| `card-title` | 16 / 22 | 600 | 0 | Job card title (h3), company row name |
| `body-read` | 16 / 26 (dark: 16 / 27) | 400 | 0 (dark: +0.005em) | Job description, About, Privacy (68ch / 65ch) |
| `body` | 16 / 24 | 400 | 0 | Empty/error body, form input text (16px prevents iOS zoom), Notice body on mobile |
| `ui` | 14 / 20 | 400 | 0 | Meta line, company line, facet option, helper text, footer |
| `ui-strong` | 14 / 20 | 500 | 0 | Buttons (S, M), nav links, field labels, chip text value, select value |
| `ui-emph` | 14 / 20 | 600 | 0 | Facet group legend, figures in the dataset line and result summary |
| `button-lg` | 16 / 24 | 600 | 0 | Apply button, "Show N jobs" button, Search button |
| `salary-card` | 14 / 20 | 700, tabular | 0 | Salary on Job card (the only 700 on the card) |
| `salary-detail` | 20 / 28 | 700, tabular | -0.005em | Salary on Job detail |
| `caption` | 12 / 16 | 400 (500 for group labels) | 0 | Helper text under fields, "Listing last checked", suggestion group labels, slow-load line |
| `mono-source` | Geist Mono 12 / 16 | 400 | 0 | Source line on Job card |
| `mono-dest` | Geist Mono 13 / 18 | 400 | 0 | Destination line under Apply button; code in descriptions use 14 / 20 |

Rules: sentence case everywhere, no tracked uppercase labels, no eyebrow above headings. `text-wrap: balance` on `page-title`, `read-title`,
`section-title` and empty/error headings; `text-wrap: pretty` on `body-read` and `body`; titles on cards are not balanced (clamped). `hyphens: manual`;
`overflow-wrap: anywhere` on titles and on `mono-*` (unbroken addresses). Truncation is CSS only (05 section 1.5). Dark-mode
light-on-dark compensation: `body-read` line-height +1px and tracking +0.005em; no other role changes.

### 2.3 Spacing, sizing and radius

**Spacing scale (4px base).** Matches Tailwind's default `--spacing: 0.25rem`, so utility `p-4` = 16px.

| Token | px | Typical use |
|---|---|---|
| `space-0.5` | 2 | Hairline nudges only (logo optical alignment) |
| `space-1` | 4 | Gap between lines inside a card; icon-to-text inside tight chips |
| `space-2` | 8 | Gap between chips, buttons in a group, label-to-field |
| `space-3` | 12 | Logo-to-text; gap between list sheet and toolbar; segment padding |
| `space-4` | 16 | Card vertical padding; mobile page gutter; section padding inside sheets |
| `space-5` | 20 | Card horizontal padding (tablet+); sheet padding on Apply panel |
| `space-6` | 24 | Tablet gutter; gap between blocks; page top padding (tablet+) |
| `space-8` | 32 | Desktop gutter; section gap; sheet padding on Job detail desktop; footer padding |
| `space-10` | 40 | Sidebar-to-results gap at 1280+ |
| `space-12` | 48 | Detail main-to-aside gap |
| `space-16` | 64 | Page bottom padding; large separations |

Rhythm: tight inside groups (4), generous between groups (24-32); more space above a heading than below (section-title: 32 above, 8 below; page-title: 24 above, 4 below the dataset line).

**Size tokens.**

| Token | Value | Notes |
|---|---|---|
| `control-sm` | 32 | Pointer devices only; chips, small buttons; touch hit area extended to 44 |
| `control-md` | 40 pointer / **44** when viewport < 640 or `pointer: coarse` | Buttons M, selects, page slots, facet rows (36 pointer) |
| `control-lg` | 48 | Search field, Search button, Apply, "Show N jobs" |
| `row-min` | 88 | Job card `min-height` |
| `row-skeleton` | 112 | Skeleton card height; `contain-intrinsic-size` for `content-visibility:auto` |
| `icon-sm / md / lg` | 16 / 20 / 24 | Inline / buttons and nav / empty-state (rare) |
| `logo-xs / sm / md / lg` | 24 / 36 / 40 / 64 (+48 in Job detail header) | 24 in suggestion rows, 36 mobile card, 40 card and directory row, 48 detail header, 64 company header |
| `checkbox` | 18 box, 44 row hit | Radio 18, same |
| `switch` | 40 x 24 track, 18 knob | Row 44 |
| `sidebar` | 280 | Desktop filter column |
| `aside` | 320 | Job detail Apply column |
| `container` | 1200 | Max content width |

**Radius.** Bimodal tight set: `radius-chip` **4** (chips, tags, skeleton bars, checkbox), `radius-control` **6** (buttons, inputs, selects, page slots, logo tiles up to 48), `radius-card` **8**
(list sheet, detail sheet, Apply panel, popovers, empty/error blocks, 64px logo tile), `radius-pill` 999 (switch track and knob only). Nested radii step down (8 sheet, 6 inside, 4 inside that). Full-screen mobile dialog has radius 0.

### 2.4 Elevation, borders

- **Resting surfaces never have a shadow.** Separation is a 1px `border` or a tone step (a border **or** a shadow, never both).
- **Floating layers only:** `shadow-pop` (suggestions list, popovers) and `shadow-sheet` (drawer, sticky Apply bar).

| Token | Light | Dark |
|---|---|---|
| `shadow-pop` | `0 4px 16px rgb(15 17 21 / 0.10), 0 1px 2px rgb(15 17 21 / 0.06)` | `0 8px 24px rgb(0 0 0 / 0.50)` + 1px `border-strong` |
| `shadow-sheet` | `0 8px 32px rgb(15 17 21 / 0.16)` (drawer); `0 -4px 16px rgb(15 17 21 / 0.08)` (sticky bar) | `0 8px 32px rgb(0 0 0 / 0.60)`; sticky bar relies on its 1px top `border` |

- **Border widths:** 1px everywhere; 2px only for focus rings and the current-page underline in the header nav. No coloured border-left/right above 1px anywhere.
- **Z-index layers:** header 10, sticky toolbar 20, sidebar 5, sticky Apply bar 30, popover/suggestions 40, scrim 50, dialog/drawer 51, skip link 100.

### 2.5 Grid and breakpoints

Mobile-first. Structural breakpoints follow 05: `mobile` < 640, `tablet` 640-1023, `desktop` 1024+. Tailwind names in brackets.

| Breakpoint | Reference frame | Behaviour |
|---|---|---|
| **< 640** (base; design at **390**, tested down to **320**) | 390 x 844 | One column. Page gutter **16**. Header: mark + name, Companies, About, theme (no hamburger). Job list is an **edge-to-edge sheet** (no side margins or side borders, row rules only, text inset 16). Cards stack meta in up to four lines, salary + posted on their own line. Filters = full-screen dialog; **sticky toolbar** (Filters, Sort) while scrolling. Pagination compact. Apply = full-width 48 button plus sticky bottom bar. Logos 36. Control height 44. |
| **640** (`sm`) | 640-767 | Tablet layout begins: gutter **24**; the list sheet gets side margins and radius 8; card gets the right-aligned salary/posted column and logo 40; numbered pagination appears; Directory goes two columns; header shows "Browse". |
| **768** (`md`) | 768 x 1024 | Reference tablet. Container = 768 - 48 = 720. Filters = 360 drawer from the left over a scrim. Job detail single column, Apply block under the facts. |
| **1024** (`lg`) | 1024 x 768 | Desktop begins: gutter **32**; container 960; persistent filter sidebar **280** + gap **32** + results 648; sticky toolbar off; control height 40 (pointer). Job detail becomes two columns (main fluid, aside 320, gap 40). |
| **1280** (`xl`) | 1280 x 800 | Reference desktop. Container reaches **1200**; sidebar 280 + gap **40** + results **880**; Job detail main 832 + aside 320 + gap 48. |
| **1440** (`2xl`) | 1440 x 900 | Content stays **1200**, centred; 120 side margins; header content aligns to the container; ground colour continues edge to edge. Nothing scales further. |

**Layout grids (Figma, see 07):** mobile 4 columns / margin 16 / gutter 12; tablet 8 / 24 / 16; desktop 12 columns inside the 1200 container / gutter 24. The sidebar-plus-results split is a fixed-width layout (280 + gap + fluid) that deliberately ignores the 12-col snap; the grid is for the Job detail and static pages.

**Measure:** description 68ch; About/Privacy 65ch; empty/error blocks 560px; trust note 44ch.

### 2.6 Iconography

- **Set:** **Lucide** (ISC licence; open, `lucide-react`, ships with shadcn/ui; Figma community library "Lucide Icons"). One set, one stroke, never mixed.
- **Stroke 1.5px** at 24px grid, scaled with the glyph (set `strokeWidth={1.5}` on 16/20 px sizes; `absoluteStrokeWidth` off). Round caps/joins. Colour = `currentColor`; default `ink-2`, never saturated, never inside a coloured container.
- **Sizes:** 16 (inline with 14px text, chips, facet disclosure), 20 (buttons L, nav theme toggle), 24 (rare: empty-state alert).
- **Glyphs used (the whole inventory):** `search`, `x`, `chevron-down`, `chevron-up`, `chevron-left`, `chevron-right`, `arrow-left`, `arrow-up-right` (external/Apply), `link` (copy link), `check`, `sliders-horizontal` (Filters), `sun`, `moon`, `monitor` (theme), `circle-alert` (error), `info` (notice), `loader-circle` (busy), `wifi-off` (offline). No other icons, no brand icons, no emoji, no Unicode symbols standing in for icons.
- **Accessibility:** icons are `aria-hidden` unless they are the only content of a control, in which case the control has an accessible name. External-link icon always paired with the sr text "(opens in a new tab)".
- **The mark** (header): a 22 x 22 `primary` rounded square (radius 5) holding a 1.75px `ink-inverse` `arrow-up-right` drawn to Lucide geometry. It is the idea in one glyph (links straight out), not decoration. Wordmark = site name in `card-title`-sized Geist 600 18px/24, `ink-1`, 8px right of the mark. The product name is an open question (Q-D1); designs use the placeholder "Openings" and `{Site}` in copy.

### 2.7 Imagery

- **Only company logos.** No photos, stock images, illustrations, hero art, patterns or decorative shapes anywhere. Empty/error states are type only.
- **Logo tile:** square (36/40/48/64), radius 6 (8 at 64), background `logo-tile`, 1px `border` ring, image inset 4px with `object-fit: contain`, centred, `alt=""`. The tile is always rendered at full size (reserved) so there is no layout shift; image `width`/`height` attributes set; `loading="lazy"` for rows below the fold; `referrerpolicy="no-referrer"` (logos come from Ashby's CDN); if the image errors or `logoUrl` is null, swap to the monogram (2.1.2) without resizing.
- No logo may be recoloured, cropped to a circle, or placed on a coloured tile.

### 2.8 Motion

Motion conveys state only. No page-load choreography, no entrance animations, no scroll effects, no parallax, no auto-playing anything.

| Token | Value | Used for |
|---|---|---|
| `dur-instant` | 80ms | Press (active) colour change |
| `dur-fast` | 120ms | Hover/focus colour and fill, chip add/remove fade, copy-status fade |
| `dur-base` | 200ms | Drawer/dialog open, sticky Apply bar slide, popover open, previous-list opacity dip |
| `dur-exit` | 150ms | Close of the above |
| `dur-pulse` | 1600ms | Skeleton opacity pulse (alternate, 1 to 0.55) |
| `ease-out` | `cubic-bezier(0.25, 1, 0.5, 1)` (ease-out-quart) | All enters and hovers |
| `ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | Skeleton pulse |

- **What animates:** background/colour/border-colour on hover and press; opacity + 8px translate (drawer: translateX from -24px) on open; opacity on chip add/remove; the previous result list dips to 60% opacity for at most 100ms before the skeleton replaces it (05 section 2.5); skeleton pulse; busy spinner (0.9s linear).
- **What never animates:** layout (height/width) of the list, card reorder, scroll position (instant, see below), focus ring appearance (it appears with no transition), text content.
- **Reduced motion (`prefers-reduced-motion: reduce`):** pulse off (static `skeleton`), spinner replaced by static "…" glyph, drawer/dialog/sticky bar appear with a **120ms opacity fade only** (no translate), smooth scroll replaced by instant jump, chip fade kept at 120ms or removed. Nothing is hidden or delayed because of it.

### 2.9 Density

Single density, **comfortable-dense**: 3 to 4 lines per card and 25 cards per page. No user density toggle in v1 (out of scope; would need a URL/pref
decision). The system does switch two things by input method, not by user choice: control height 44 vs 40 (`pointer: coarse` or width < 640) and the facet row 44 vs 36. If a toggle is added later: "compact" = card padding 12/16, card-title 15/20, meta line removed of department/type, row-min 72. Do not ship it speculatively.

---

## 3. Component specs

Covers **every** item of the 05 section 11 inventory (names kept identical) plus the additions listed in 3.43-3.46. Token names are the semantic names of
2.1 (`--color-*`), 2.2 (type roles), 2.3 (sizes/radius), 2.4 (elevation), 2.8 (motion). "Pointer" = fine pointer and width ≥ 640; "touch" = coarse pointer or width < 640.

### 3.0 Shared recipes (every component inherits these; components only note differences)

| Concern | Recipe |
|---|---|
| **Focus-visible** | `outline: 2px solid var(--color-focus); outline-offset: 2px;` appears with no transition. **Inset** (`outline-offset: -2px`) for anything inside a clipping container: Job card rows, Company rows, facet rows, Company strip, select/input fields inside dialogs. Never removed, never `outline: none` without a replacement. Focus ring vs `surface-1` 6.10:1 (light) / 7.53:1 (dark). Forced-colors: `outline-color: Highlight`. Programmatically focused headings (`tabindex=-1`: h1 on route entry, results heading) show the same ring with `outline-offset: 4px` and `border-radius: 4px`. |
| **Hover** | Only inside `@media (hover: hover)`. Colour/fill changes only (`dur-fast`, `ease-out`), never movement or scale. |
| **Active (pressed)** | One fill step darker (`dur-instant`); no transform. |
| **Disabled** | Prefer `aria-disabled="true"` plus a visible reason when the user could wonder why (stays in tab order, announced). Native `disabled` when the control is inert in context. Style: fill `surface-2`, text/icon `ink-disabled`, border none (secondary keeps `border`), `cursor: not-allowed`. Disabled text is exempt from contrast (2.1.1). |
| **Busy / loading** | `aria-busy="true"`; label unchanged; width unchanged; a 16px `loader-circle` (0.9s linear spin) replaces the leading icon or is appended if none; `pointer-events: none`. Reduced motion: the spinner becomes a static `…` glyph. |
| **Error (inputs)** | 1px `danger-ink` border (7.28:1 / 8.13:1 on `surface-1`) **plus** a message under the field: `circle-alert` 16 `danger-ink` + `caption` text in `danger-ink`, linked with `aria-describedby`, `aria-invalid="true"`. The message text carries the meaning; colour never alone. |
| **Selected / checked** | `primary` fill with `ink-inverse` glyph (checkbox, radio dot, switch, current page) **and** a weight step to 500 on the label where there is a label. Never a hue fill. |
| **Targets** | AA minimum 24x24 everywhere; **44x44 preferred on touch**. Components smaller than 44 on touch get a transparent `::after` hit area extended to 44 that never overlaps a neighbour's (gaps ≥ 8, otherwise the extension is trimmed). Inline text links inside sentences are exempt. |
| **Text on controls** | Never below 14px; input text 16px (prevents iOS zoom). Labels are always visible text (no placeholder-as-label). |
| **Icons in controls** | `aria-hidden`; control has a text label or an accessible name (3.0 + per component). |
| **Link semantics** | Navigation is an `<a>`; actions are `<button>`. Apply is an `<a>` styled as a button: Enter activates, Space does not (05 section 3.7). |

### 3.1 SiteHeader

- **Anatomy:** banner > [mark + wordmark link] + `nav aria-label="Primary"` (links) + ThemeToggle. Not sticky (it scrolls away; the sidebar and toolbar use the freed space).
- **Dimensions:** height **56** (52 below 400px); bottom 1px `border`; background `ground`; inner width = page container, horizontal padding = page gutter (16/24/32). Mark 22 + 8 gap + wordmark. Nav links: height 40 (44 touch), padding 0 12 (0 8 below 400), gap 4, `ui-strong`, text `ink-2`.
- **Variants:** compact (mobile: links Companies, About) / full (≥640: Browse, Companies, About).
- **States (link):** default `ink-2`; hover `ink-1` + `surface-2` fill (radius 6); focus-visible ring; active `surface-3`; **current** `ink-1` + 2px `ink-1` underline offset 6px below the text + `aria-current="page"` (not colour alone). Wordmark link: hover underline 1px.
- **Responsive:** at 320 the wordmark text hides below 340px (mark stays, link keeps `aria-label="{Site}, home"`); otherwise the name truncates with ellipsis before the nav shrinks.
- **A11y:** `banner` landmark; nav label "Primary"; wordmark link accessible name "{Site}, home".
- **Tokens:** `ground`, `border`, `ink-1/2`, `surface-2/3`, `primary` (mark), `ink-inverse`.

### 3.2 SkipLinks

- **Anatomy:** two anchors, first focusable elements in the DOM: "Skip to results", "Skip to filters" (Browse/Company; on Job detail: "Skip to main content" only). On <1024 "Skip to filters" targets the Filters button.
- **Visual:** visually hidden until focus; on focus: `position: fixed; top: 16; left: 16;` z 100; `surface-1`, 1px `border-strong`, radius 6, padding 12 16, `ui-strong` `ink-1`, `shadow-pop`, focus ring on top. Two links sit 8 apart.
- **States:** hidden, focus-visible. Activating moves focus to the target heading (`tabindex=-1`, shows heading ring per 3.0).

### 3.3 Footer

- **Anatomy:** `contentinfo` > link row (About, Privacy, source link if the owner adds it) + data line + "Last updated {date}".
- **Dimensions:** top 1px `border`; padding 32 gutter 48 (+ `env(safe-area-inset-bottom)`); on mobile the sticky Apply bar adds 88px bottom padding on Job detail only. Margin-top 64 from content.
- **Type/colour:** links `ui-strong` `ink-1`, no underline at rest, underline on hover/focus (nav-like group); data line `ui` `ink-2` max 64ch; date `ui` `ink-3` tabular. Row gap 12.
- **Responsive:** ≥640: links left, data line left under them, date right (baseline-aligned); <640 stacked.
- **Copy:** "Data comes from companies' public Ashby job boards. Apply links go straight to the company's own page." (second sentence is an addition, 6.3.)

### 3.4 ThemeToggle

- **Anatomy:** one icon button, 40x40 (44 touch), radius 6; icon 20 shows the *current setting*: `monitor` (system), `sun` (light), `moon` (dark).
- **Behaviour:** click cycles system → light → dark → system. Accessible name updates: "Theme: system. Change theme" / "Theme: light. Change theme" / "Theme: dark. Change theme". Also `title` with the same text (only secondary hint).
- **States:** default icon `ink-2`; hover `surface-2` fill + `ink-1`; focus-visible ring; pressed `surface-3`; no disabled.
- **No flash:** an inline script in `<head>` sets `data-theme` and `color-scheme` before first paint from `localStorage` (only if the user chose light/dark) else `prefers-color-scheme`. `<meta name="theme-color">` per scheme (`#f3f5f8` / `#0e0f11`).

### 3.5 Button

| Kind | Fill | Label | Border | Hover | Active | Used for |
|---|---|---|---|---|---|---|
| **primary** | `primary` | `ink-inverse` | none (forced-colors: 1px ButtonText) | `primary-hover` | `primary-pressed` | Apply, Search, "Show N jobs", Try again on full-page error. **One per view** (Search on Browse; Apply on Job detail). |
| **secondary** | `surface-1` | `ink-1` | 1px `border-strong` | fill `surface-2` | fill `surface-3` | Filters, Previous/Next, Go, Try again (inline), Clear/remove suggestions |
| **quiet** | transparent | `ink-2` | none | fill `surface-2`, label `ink-1` | fill `surface-3` | Clear all, Show more, Copy link, Back to results, Close |

| Size | Height | Padding-x | Type | Icon | Radius |
|---|---|---|---|---|---|
| S | 32 pointer only (44 hit on touch) | 10 | `ui-strong` | 16 | 6 |
| M | 40 pointer / 44 touch | 14 | `ui-strong` | 16 | 6 |
| L | 48 | 24 | `button-lg` | 20 | 6 |

States: default, hover, focus-visible, active, disabled, busy (all per 3.0). Label gap to icon 8. Minimum width of icon-less M/L: 88. Labels are verbs naming the action
("Search", "Show 1,204 jobs", "Try again"), sentence case, no trailing punctuation, never "Click here". Label truncation: single line, ellipsis, full text in `aria-label`
when truncated (Apply only, see 3.32). Icon-only buttons (close, prev/next on mobile, theme toggle) are exactly 44x44 on touch and carry an accessible name.

### 3.6 ExternalLink

- **Inline variant:** text `hue`, underline 1px (offset 3px, always present), followed by a 14px `arrow-up-right` (`aria-hidden`, `hue`) 2px after; visually hidden " (opens in a new tab)". Hover: `hue-hover`, underline 2px. Pressed: `hue-pressed`. Visited: unchanged. Contrast: `hue` on `surface-1` 6.10:1, on `ground` 5.59:1 (dark 7.53 / 8.05).
- **Button-styled variant:** a Button (3.5) whose root is `<a target="_blank" rel="noopener nofollow">` with `arrow-up-right` as trailing icon (Apply, "View all on Ashby" uses quiet).
- **Always:** `target="_blank"`, `rel="noopener nofollow"` (description links add `ugc`), host text where space allows.

### 3.7 SearchCombobox

- **Anatomy (top to bottom):** visible label "Search jobs" (`ui-strong` `ink-1`, 8 above) → row [field | Search button, gap 8] → (popup, when open).
- **Field:** height **48**, radius 6, bg `surface-1`, 1px `control` border (3.67:1 on `surface-1`), text `body` 16/24 `ink-1`, placeholder `ink-3` ("Title, company, or keyword", 6.23:1). Left `search` icon 20 `ink-3` at 14px; text padding-left 44; right clear button (`x`, 32 hit, 44 touch, `ink-3` → `ink-1`, name "Clear search") shown only when text exists; a 16px `loader-circle` precedes it while suggestions load (reserved, no layout shift).
- **Search button:** primary L, min-width 96, label "Search"; submit on Enter too.
- **States:** idle; hover (border `ink-3`); focus (border `ink-1` + focus ring offset 2); typing (debounced 200-300ms, tune); suggestions open; active option; loading suggestions; suggestion failure = silent (list simply absent); disabled not used; invalid not used (minimum 2 characters: shorter input shows no list and no error).
- **Popup (suggestions):** below the field, 4px gap, same width as the field, `surface-1`, 1px `border-strong`, radius 8, `shadow-pop`, padding 4, max-height `min(360px, 60dvh)` scrolling. Groups: label `caption` 500 `ink-3` (padding 8 12 4): "Companies", "Departments", "Locations". Options: height 40 (44 touch), padding 0 12, radius 6, `ui` `ink-1`, matched substring weight 600 (no `<mark>` here), optional count right `ink-3` tabular; Companies rows show a 24px logo/monogram. **Active option:** `surface-2` fill + inset 2px focus ring (non-colour cue). Last row, after a 1px `rule` divider: `search` icon 16 + `Search for "data engineer"`.
- **Responsive:** same at all sizes; on <640 the popup is full container width and never taller than 50dvh so the keyboard does not hide it. The "without suggestions" variant is a plain `<input type="search">` and button (recommended for v1, 01 section 2.4).
- **A11y:** ARIA 1.2 combobox: input `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`, `aria-autocomplete="list"`; popup `role="listbox"`, groups `role="group" aria-labelledby`; options `role="option"`; all inside a `search` landmark "Job search". Keys per 05 section 2.6 (`/` focuses; Down/Up/Home/End; Esc closes then clears; Enter picks or searches). Options are not tab stops.
- **Tokens:** `surface-1`, `control`, `ink-1/3`, `border-strong`, `surface-2`, `focus`, `shadow-pop`, `radius-control`, `radius-card`.

### 3.8 FilterSidebar (≥1024)

- **Anatomy:** `h2` "Filters" + "Clear" quiet S button (right; hidden when no filters) → helper `caption` `ink-3` ("Choosing more than one option in a group shows jobs that match any of them.") → FacetGroups. Sits inside the `search` landmark with the search field.
- **Dimensions:** width 280, no box (open plane on `ground`), sticky `top: 16px`, `max-height: calc(100dvh - 32px)`, own scroll (`overflow-y: auto`, `scrollbar-width: thin`, `scrollbar-color: var(--color-border-strong) transparent`), padding-right 8 so the scrollbar does not touch options. Groups separated by 1px `rule` and padding 16 0. Heading `card-title`.
- **States:** loading (each group shows a heading bar and 3 option-row skeletons: 18px square + bar), ready, error (compact InlineError in place of the groups: one line + "Try again"; the toolbar and results stay usable).
- **Behaviour:** applies immediately (150ms debounce, 04 section 6). Order of groups: Remote only, Salary listed, Posted, Department, Location, Company, Employment type (Company omitted on the Company page).

### 3.9 FilterDialog (< 1024)

- **Mobile (<640): full-screen dialog.** `surface-1`, 100dvw x 100dvh, radius 0. Header 56 with 1px bottom `border`: close button (`x`, 44x44, name "Close filters") left, title `section-title` "Filters", quiet "Clear all" right (hidden if nothing selected). Body: scrolls, padding 16, FacetGroups as in 3.8 (rules between). Footer: sticky, padding 12 16 + `env(safe-area-inset-bottom)`, 1px top `border`, primary L full width "Show 1,204 jobs". Zero matches: the button is `aria-disabled` with label "No jobs match". Applying: busy.
- **Tablet (640-1023): drawer from the left,** width **360**, full height, flush left edge, `shadow-sheet`, scrim `scrim` over the page. Same header/body/footer.
- **Motion:** open: opacity 0→1 and `translateX(-24px→0)` over `dur-base`, scrim fades over `dur-base`; close `dur-exit`. Reduced motion: 120ms opacity only.
- **Behaviour:** changes accumulate locally; the live count updates the button label silently and a dialog-local polite region announces "1,204 jobs match." once per settled change; Esc or Close discards unapplied changes with no prompt and returns focus to the "Filters" button; page behind is `inert`, body scroll locked (`overflow: hidden` with `scrollbar-gutter: stable`).
- **A11y:** `role="dialog" aria-modal="true" aria-labelledby` the title; focus moves to the close button on open and is trapped (Tab/Shift+Tab loop); focus returns to the opener on close.
- **Tokens:** `surface-1`, `border`, `scrim`, `shadow-sheet`, `dur-base`, `dur-exit`, `ease-out`.

### 3.10 FacetGroup

- **Anatomy:** `fieldset` > `legend` row [legend `ui-emph` `ink-1` + active-count tag (min 20x20, `caption` 600 `ink-1` on `surface-3`, radius 4, only when ≥1 selected) + disclosure chevron-down/up 16 `ink-2` (button, `aria-expanded`)] → (facet search field) → option list → "Show more".
- **Variants:** checkbox list, radio list (Posted), single switch (Remote only, Salary listed; no legend, see 3.12).
- **States:** collapsed, open, loading (skeleton rows), searching (typing filters the visible list client-side or via the facet-values call), empty-search (`No companies match "xyz".` `ui` `ink-2`, padding 8), error (inline retry).
- **Rules:** groups with an active selection are always open (chevron hidden). Default open (desktop): Remote, Salary, Department, Location; collapsed on first visit unless active: Company, Employment type, Posted (04 section 6). Long lists: first 8 options by count, then a quiet S "Show more" (chevron-down, left aligned, 8 above) that expands to 30 and moves focus to the first new option; becomes "Show fewer". Facet search field: height 36 (44 touch), `ui` 14px (16px <640), search icon 16, same border as 3.7, placeholder "Search departments".
- **A11y:** legend is the group name; the disclosure button is named "{Group}, show/hide options".

### 3.11 FacetOption

- **Anatomy:** a `<label>` row: [checkbox or radio 18] 12 [label text, flex 1] 12 [count, tabular, `ink-3`].
- **Dimensions:** row height **36 pointer / 44 touch**, padding 0 8, margin 0 -8 (so the box aligns with the legend), radius 6. Label `ui` `ink-1`, wraps to a second line when needed (row grows); count `ui` `ink-3` right-aligned, thousands separators.
- **Checkbox:** 18x18, radius 4, 1px `control` border (3.67:1) on `surface-1`; checked: `primary` fill, border `primary`, `check` 14 stroke 2 in `ink-inverse`; label weight 500 when checked. **Radio:** 18 circle, same border; checked: border `primary`, inner 8px `primary` dot; label weight 500.
- **States:** default; hover (row `surface-2`); focus-visible (ring on the box, offset 2); checked; **zero** (label and count `ink-3`, count "0", box inert: unchecked zero options are disabled or hidden after the first 8, checked ones stay selectable); disabled (box border `border-strong`, label `ink-disabled`).
- **A11y:** accessible text "Engineering, 4,210 jobs" (the count is inside the label with visually hidden " jobs"). Space toggles. Native `input[type=checkbox|radio]` is used and visually replaced, never `div` role-checkbox.

### 3.12 ToggleSwitch

- **Anatomy:** row [label "Remote only (6,812)" `ui` `ink-1`, flex 1] [switch]; optional helper `caption` `ink-3` below ("Only jobs where the company published a pay range.").
- **Switch:** track 40x24 radius 999; knob 18; knob inset 3. **Off:** track `surface-1`, 1px `control` border, knob `ink-3` (6.23:1). **On:** track `primary`, border `primary`, knob `ink-inverse`, plus a 12px `check` glyph in `ink-inverse` on the empty side of the track (state not by colour alone; in forced-colors the knob uses `Highlight`/`ButtonText`). Knob moves over `dur-fast`.
- **Row:** min-height 44; label is the hit area.
- **States:** off, on, hover (off: border `ink-3`; on: `primary-hover`), focus-visible (ring around the track), disabled (track `surface-2`, knob `ink-disabled`), busy not used.
- **A11y:** `role="switch"` (or checkbox) with `aria-checked`; name includes the count; helper linked by `aria-describedby`. Space toggles.

### 3.13 FilterChip and ChipBar

- **Chip:** a `<button>` (removes the filter). Height 32 pointer / 36 touch (+4px hit extension above and below = 44, no overlap because the row gap is 8). Padding 0 6 0 12, radius 6, bg `surface-1`, 1px `border-strong`. Content: facet name `ui` `ink-3` + ": " + value `ui-strong` `ink-1`; boolean facets show only the value ("Remote only"); search chip "Search: data engineer". Trailing `x` icon 16 `ink-2` inside a 24px zone. Max width 100% of the row; the *value* truncates with ellipsis beyond 240px, X always visible.
- **States:** default; hover (`surface-2`, X `ink-1`); focus-visible ring; active (`surface-3`); removing (opacity 1→0 over `dur-fast`, then removed); none disabled.
- **ChipBar:** `ul` > `li` > chip; `flex-wrap`, gap 8, margin 12 0. Order = facet order. After 6 chips, extras collapse into a quiet chip-shaped button "+3 more" (1px dashed `border-strong`, `aria-expanded`) that expands in place; then "Show fewer". "Clear all" is a quiet S button after the chips (right edge on ≥1024, inline otherwise), shown when **2 or more** chips are present (04 section 6; 05 says "when any": this file follows 04 so a single chip is not duplicated by a Clear all). Empty ChipBar renders nothing (no reserved space).
- **A11y:** chip name "Department: Engineering. Remove filter."; after removal focus goes to the next chip, else previous, else the results heading; the LiveRegion announces "Department: Engineering removed. 3,412 jobs found."

### 3.14 ResultsToolbar

- **Desktop (≥1024):** one row, height 40: SummaryLine left; right cluster [CopyLinkButton] [SortSelect with visible label] [compact Previous/Next icon buttons 40, secondary, names "Previous page"/"Next page"]. No border, margin-bottom 12; it sits on `ground` above the list sheet.
- **Tablet:** row 1 [Filters button] ... [SortSelect]; ChipBar; row 2 SummaryLine left, CopyLinkButton right.
- **Mobile (<640):** row [Filters (3)] [Sort by ▾] is a **sticky toolbar**: `position: sticky; top: 0`, height 56, padding 6 16, `ground` bg that becomes `surface-1` with a 1px bottom `border` once stuck (opaque, no blur), z 20; `scroll-padding-top: 64px` so focused items are not obscured (WCAG 2.4.11). Below it (not sticky): ChipBar, then SummaryLine and Copy link.
- **Filters button:** secondary M with `sliders-horizontal` 16 + `Filters` and ` (3)` (tabular) when filters are active; accessible name "Filters, 3 active".
- **Zero results:** Sort is disabled, summary is replaced by the empty state heading; Filters and Copy link remain.

### 3.15 SummaryLine

- `ui` `ink-2`, figures (`1–25`, `34,035`) in `ui-emph` `ink-1`, tabular. En dash between range numbers; a visually hidden "to" for screen readers.
- Variants (exact copy in 04 section 5.3): exact "Showing 1–25 of 34,035 jobs"; approximate "Showing 1–25 of about 34,000 jobs"; all "Showing all 7 jobs"; single "Showing 1 job"; loading "Loading jobs…" (no figures). Plain text, not a live region.
- The Browse dataset line "**34,035** open jobs at **1,747** companies. Updated Oct 22." uses the same figure style; it is hidden once filters are active.

### 3.16 SortSelect and PageSizeSelect

- **Anatomy:** visible `<label>` ("Sort by" / "Jobs per page", `ui` `ink-2`, 8 to the left; stacked above the control below 400) + native `<select>`.
- **Select:** height 40 (44 touch), padding 0 36 0 12, radius 6, bg `surface-1`, 1px `control` border, text `ui-strong` `ink-1` (16px below 640 to avoid iOS zoom), `appearance: none`, `chevron-down` 16 `ink-2` positioned right 12, `pointer-events: none`. `color-scheme` set so the OS popup matches the theme. Page-size select width 80.
- **States:** default; hover (border `ink-3`); focus-visible ring; open (OS popup); disabled (zero results: `surface-2`, `ink-disabled`).
- **Options:** Sort: Relevance (only with a query), Newest, Highest salary, Company A-Z. Page size: 25, 50, 100.
- **A11y:** native control. A change is announced once ("Sorted by Highest salary. 1,204 jobs found.").

### 3.17 CopyLinkButton

- Quiet M (S on desktop toolbar) with `link` 16 + "Copy link".
- **States:** idle; **copied**: label becomes "Link copied", icon `check` `success-ink` (6.53:1), label `ink-1`; reverts after 3s with a 120ms fade; the button keeps the width of the longer label (no shift); **failed**: a `caption` status next to or below it, `circle-alert` + "Could not copy. Copy the address from your browser." in `danger-ink` (stays until the next click or 8s); reduced motion: no fade.
- **A11y:** the status text is also written to the LiveRegion ("Link copied."). Not a toast.

### 3.18 JobCard (the core component)

**Anatomy.** One `<li>` containing one `<article>`. The title is the only focusable element; its `::after` covers the whole card (stretched link), so the entire card is one tab stop and one click target with no nested interactive elements.

```
>=640   | [logo 40] 12 | Title (card-title, 2-line clamp)                         16 |  $140k–$180k   (salary-card, hue, right) |
        |              | Company (ui ink-2)    jobs.ashbyhq.com/deel (mono-source)  |  Posted 3 days ago (ui ink-3, right)     |
        |              | Remote (Europe) | [Remote] | Engineering | Full-time        |                                          |
<640    | [logo 36] 12 | Title (2-line clamp)
        |              | Company
        |              | Remote (Europe) | [Remote]  (1 line; wraps below 360px)
        |              | $140k–$180k | Posted 3 days ago
```

**Dimensions.** Padding **16 vertical / 20 horizontal** (≥640), **16 / 16** (<640). Gap between lines 4. Column gaps: logo-to-text 12, text-to-aside 16. Aside width: content-sized between 120 and 200, right-aligned, top-aligned with the title's first line. `min-height: 88`. Computed heights (Geist, line-heights from 2.2): title 1 line + company + meta = 16+22+4+20+4+20+16 = **102**; title 2 lines = **124**; title+company only = 16+22+4+20+16 = 78 → **88** (min-height); mobile worst case at ≥360px (2-line title, company, one-line location/remote, salary line) = 16+44+4+20+4+20+4+20+16 = **148**. Range 88-148 matches 05. Skeleton uses 112. `content-visibility: auto; contain-intrinsic-size: auto 112px`.

**List sheet (the container).** `ul` bg `surface-1`, 1px `border`, radius 8, `overflow: hidden`; rows separated by `border-top: 1px solid var(--color-rule)` from the second row on. Below 640 the sheet is edge-to-edge: no side borders, no radius, top and bottom borders only. Rows never have their own border or shadow.

**Content (priority order, omission rules from 05 section 1.1).**

| Element | Style | Rules |
|---|---|---|
| Title (`h3` > `a`) | `card-title` `ink-1` | 2-line clamp (`-webkit-line-clamp: 2`), `overflow-wrap: anywhere`, no JS truncation; `<mark>` highlight for search terms. |
| Company | `ui` `ink-2` | 1 line, ellipsis, plain text (not a second link); display name via the prettify rule (05 section 1.4). |
| **Source line (the idea)** | `mono-source` (Geist Mono 12/16) `ink-3`, ≥640 only | `host/first-path-segment` of `applyUrl` with `www.` removed, e.g. `jobs.ashbyhq.com/deel`; sits in the company line after a 12px gap; never shrinks before the company name does except to a max of 55% of the line (then ends with an ellipsis); `translate="no"`; not a link; omitted when `applyUrl` is missing; **hidden on the Company page card variant**. |
| Location | `ui` `ink-2` | 1 line, ellipsis, shrinks first (ellipsis); wraps only below 360px or under text-spacing/zoom; omitted when null. |
| Remote | Badge (3.21) "Remote" | Suppressed when the location text is exactly "Remote". |
| Department | `ui` `ink-2`, ≥640 | max ~18ch, ellipsis; omitted when null. |
| Employment type | `ui` `ink-2` | ≥640 always when known; <640 only when not Full-time. |
| Salary | SalaryText compact (3.22) | Aside (≥640) / own meta line (<640); omitted if absent. |
| Posted | PostedAge (3.23) | `ui` `ink-3`; omitted when absent. |
| Logo | CompanyLogo (3.20) | 40 (≥640) / 36; top-aligned; always reserved. |

**Segment separators.** Meta segments are separated by a 1x12px vertical rule in `border-strong` (aria-hidden) with 8px either side. To avoid a dangling separator when the line wraps (mobile), build it the classic way: the meta `ul` has `overflow: hidden`, each `li` has `padding-inline-start: 8px; margin-inline-start: -1px; border-inline-start: 1px solid var(--color-border-strong)`; the first item on every wrapped line has its border clipped outside the container. A segment is `white-space: nowrap` except location (which may shrink with ellipsis on ≥640 and wrap on <640). If the whole meta line is empty it is not rendered.

**States.**

| State | Treatment |
|---|---|
| Default | bg `surface-1`. |
| Hover (pointer) | bg `row-hover`; title underlined (1px, offset 3px); cursor pointer. `dur-fast`. |
| Focus-visible | Inset 2px `focus` ring around the whole row (drawn via `li:has(a:focus-visible)`; fallback is the link's own inset outline). 6.10:1 on `surface-1`; 5.78:1 on hovered `row-hover` background. |
| Active | bg `surface-2`. |
| Visited | Title colour `ink-2` (8.94:1) instead of `ink-1`; nothing else changes (not hue-changed, so repeated scanning shows what you have opened). |
| Returned-to | After Back, the opened card is focused programmatically and shows the focus ring until blur; scrolled with `block: nearest`. |
| Loading | Replaced by JobCardSkeleton. |
| Selected / disabled / error | None (no multi-select, no bulk actions). |

**Variants.** *full* (Browse, search results): all fields, with logo and company. *compact-company* (Company page, 05 section 4): no logo column, no company line, no source line; the text column starts at the card padding; everything else identical.

**Highlight.** `<mark>`: bg `mark-bg`, `box-shadow: inset 0 -2px 0 var(--color-mark-line)`, text `ink-1` (16.38:1 on `mark-bg`), padding 0, radius 2. The underline (`mark-line` vs `surface-1` 5.11:1 light / 9.87:1 dark) is the non-colour cue. Marks are removed from the accessible name (the link's text content is plain).

**A11y.** Link text is the title only; `aria-describedby` points to a visually hidden summary "{Company}, {Location}, Remote, {Salary spelled out}, {Posted}". A list is navigated as "link, Senior Frontend Engineer, Design Systems, Deel, Remote Europe, 140,000 to 180,000 US dollars, Posted 3 days ago". No repeated "Apply" or "Read more". Heading level 3 inside the list under the h2 "Results, page N of M".
**Tokens:** `surface-1`, `row-hover`, `surface-2`, `rule`, `border`, `border-strong`, `ink-1/2/3`, `hue`, `focus`, `mark-*`, `radius-card`, `card-title`, `ui`, `mono-source`, `salary-card`.

### 3.19 JobCardSkeleton and Skeleton primitives

- **Card skeleton:** height fixed **112**, same padding and columns as 3.18. Logo block 40 (`skeleton`, radius 6); text bars: title line 1 (height 14, width 62%), title line 2 (14, 38%, gap 6), company (12, 26%, gap 8), meta (12, 46%, gap 8); aside bars on ≥640 (88x14 and 104x12, right-aligned). Row rules identical to real rows, so nothing shifts when data lands.
- **Primitives:** *Bar* (height = text size minus 2: 12 for 14px text, 14 for 16px, 20 for 24px; radius 4; width in %), *Block* (rect, radius 6), *Circle* (unused in v1, kept for parity). All `aria-hidden`, fill `skeleton`.
- **Behaviour:** appears only if loading exceeds **100ms**; count = `min(pageSize, 25)` (a deliberate cap, 6.2); static `skeleton` at reduced motion, otherwise opacity pulse 1→0.55 over `dur-pulse` `ease-in-out` (no shimmer sweep, no gradient). The results container carries `aria-busy="true"`; text "Loading jobs…" in the SummaryLine; after 5s a `caption` `ink-3` line under the skeleton: "Still loading. This is taking longer than usual."
- Other skeletons: sidebar groups (heading bar + 3 rows), Job detail (title 2 bars of 24px height, facts 3 short bars, Apply block as a disabled 48px block, description 6 lines of 14px bars at 100/96/100/88/100/60%), Company header (64 block + 2 bars), Directory rows.

### 3.20 CompanyLogo

- **Sizes:** 24 (suggestions), 36 (mobile card), 40 (card, directory), 48 (Job detail), 64 (Company header). Radius 6 (8 at 64). Tile = `logo-tile` bg + 1px `border` ring; image inset 4px, `object-fit: contain`, `alt=""`.
- **States:** image (loaded); loading (`skeleton` fill, no pulse), monogram (null `logoUrl` or `onerror`: hash tile of 2.1.2, same size, no shift).
- **Rules:** never recolour, round to a circle, or add a coloured tile; the tile is always the same size whether or not an image exists.

### 3.21 Badge

- **Neutral (v1):** height 20, padding 0 6, radius 4, bg `surface-2`, text `caption` 500 `ink-2` (7.69:1), inline-flex, `white-space: nowrap`, `flex: none` (never squeezed). Text only ("Remote"); never uppercase, no icon, never colour alone.
- **Info:** bg `info-bg`, text `info-ink` (7.32:1). Defined for completeness; no v1 usage.
- Static, not interactive. One status mark per row: a tag and a badge never say the same thing.

### 3.22 SalaryText

- **Compact (card):** `salary-card` (14/20, 700, tabular) in `hue` (6.10:1 on `surface-1`, 5.78:1 on hover). Range with a true en dash and no spaces: `$140k–$180k`. Currency/formatting exactly per 05 section 1.2. **Symbol rule (resolving a gap in 05):** a currency *symbol* repeats on both numbers (`$120k–$160k`, `€85k–€105k`, `£28–£35`, `¥8M–¥12M`, `₹4.5M–₹6M`); a *letter prefix* (`CA$`, `A$`, `NZ$`, `S$` and ISO codes) appears **once** with a thin space for ISO codes (`CA$160k–210k`, `CHF 120k–150k`). Only-min: `From $120k`; only-max: `Up to $160k`. The interval suffix is shown only for hourly ("per hour", `ui` 400 `ink-2` after the figure; the unit is a smaller grey suffix, per the ledger rule); year/month are never added to the card.
- **Full (detail):** `salary-detail` (20/28, 700, tabular) in `hue`, then optional suffix (`ui` `ink-2`), then below: `caption` `ink-3` "As published by {Company}. Actual offers vary." and, when the API provides it, the company's own summary text in `ui` `ink-2`.
- **Wrapping:** the range never breaks internally (`white-space: nowrap`); on mobile it sits alone on its line.
- **A11y:** the visible string is `aria-hidden` and replaced by a visually hidden spelled-out label ("140,000 to 180,000 US dollars", "a year" only when interval is known). Absent → renders nothing (no "Salary not listed").

### 3.23 PostedAge

- `ui` `ink-3` (5.71:1 on `ground`, 6.23:1 on `surface-1`), tabular. `<time datetime="2026-10-19">` with text per the 05 section 1.3 table ("Posted today", "Posted yesterday", "Posted 3 days ago", "Posted Mar 12", "Posted Mar 12, 2025"). `title` carries the absolute date on hover (non-essential, repeated on Job detail). **Absolute variant** (detail FactList): "October 19, 2026".
- Absent → nothing. Never substitute first-seen or updated dates here; "Listing last checked" is a separate line on Job detail.

### 3.24 Pagination (desktop/tablet numbered; mobile compact)

**Placement.** Below the list; summary above. Two rows on ≥640: row 1 = the numbered control; row 2 = [Go to page field + Go] left, [Jobs per page select] right (`space-between`, margin-top 16). Top of the list (desktop only) carries only the compact Previous/Next icon buttons in the toolbar (3.14).

**Numbered control (≥640): 7 fixed slots.**

- `nav aria-label="Pagination"` > `ul` flex, gap 4, wrapping disabled. Items: **Previous** (secondary M with `chevron-left` + "Previous"), 7 slots, **Next** (secondary M, "Next" + `chevron-right`).
- **Slot:** height 40 (44 touch), radius 6, `ui-strong` tabular `ink-1`. Width: `min-width: max(40px, calc(var(--slot-chars) * 1ch + 24px))` where `--slot-chars` is the character count of the last page label (e.g. "1,362" = 5), so all 7 slots share one width and the control does not change width from page to page.
- **Window rules** are exactly 04 section 5.3 (at most 7 total: show all; current ≤4: `1 2 3 4 5 … last`; current ≥ last-3: `1 … last-4 … last`; otherwise `1 … c-1 c c+1 … last`; never two adjacent ellipses; an ellipsis hiding exactly one page becomes that page). Ellipsis slot: `…` in `ink-3`, non-interactive, `aria-hidden`.
- **Note on 05:** the 05 example line `1 … 11 12 [13] 14 15 … 1,362` shows nine items; the rule (`1 … c-1 c c+1 … last`) is seven. This spec follows the rule.
- **Slot states:** default; hover `surface-2`; focus-visible ring; active `surface-3`; **current:** `primary` fill, `ink-inverse` text (17.96:1), `aria-current="page"`, still a link to itself; loading: unchanged (old list dims); disabled n/a. Previous/Next at the ends: `aria-disabled="true"` span (not a link), fill `surface-2`, text `ink-disabled`, removed from tab order.
- **Go to page:** `<label>Go to page</label>` (`ui` `ink-2`) + `input[type=number]` (width 72, height 40/44, tabular, `control` border) + secondary M "Go". Invalid: `caption` hint **above** the field "Enter a number from 1 to 1,362", `danger-ink` border, no navigation.
- **Max window note:** `caption` `ink-3` under the control: "You can browse the first 10,000 results. Narrow your search to see the rest."

**Compact control (<640).** One centred row: [Previous] "Page" [numeric input] "of 1,362" [Next]. Previous/Next are 44x44 secondary icon-only buttons below 480 (names "Previous page"/"Next page") and icon + text from 480-639. Input: width 64, height 44, centred, tabular, `inputmode="numeric"` `pattern="[0-9]*"`, name "Page number"; changing and pressing Enter or blurring with a changed valid value navigates; out of range clamps and shows the inline hint below. "Page" and "of 1,362" are `ui` `ink-2`. Page-size select sits on its own row below, left-aligned.

**A11y.** Real `<a href="?page=13…">` links (modifier-click works). Names: "Page 13", current "Page 13, current page", "Previous page", "Next page". After a change focus moves to the results heading and the LiveRegion announces "Page 13 of 49. Showing 301–325 of 1,204 jobs." once.

### 3.25 LiveRegion

- One instance at the app root: `<div role="status" aria-live="polite" aria-atomic="true">`, visually hidden with the standard clip pattern (not `display:none`). Receives one settled message per change, never on first load, never duplicated; messages exactly as 05 section 2.6. Errors use `role="alert"` on their own containers instead. No visual spec.

### 3.26 Notice

- **Anatomy:** row [`info` 16 icon, `info-ink`] [message `ui` `info-ink`, flex 1] [dismiss `x` quiet icon button, 32 pointer / 44 touch, name "Dismiss"]. bg `info-bg`, 1px `info-border`, radius 8, padding 12 16. Sits above the toolbar, width of the results column.
- **Variants:** info (invalid params, clamped page); warning (offline: `warning-bg` / `warning-ink` 7.03:1, `wifi-off` 16); NoscriptNotice uses info.
- **States:** shown, dismissed (removed; focus goes to the heading). `role="status"`. Copy per 05 section 2.4.

### 3.27 EmptyState

- **Frame:** an empty section keeps its frame: 1px **dashed** `border-strong`, radius 8, transparent on `ground`, padding 32 (24 on mobile), content max-width 560, left-aligned (not centred, no illustration, no icon).
- **Content:** `h2` `section-title` (replaces the "Results, page N of M" heading) → `body` `ink-2` → actions. Filtered variant lists, as stacked secondary M buttons (full width, max 420, left-aligned text, gap 8), the best-gain removals first: `Remove "Remote only" to see 312 jobs`, then a quiet M "Clear all filters". Unfiltered variant: heading + body only. Company-empty variant: "{Company} has no open jobs right now." + secondary M "Browse all jobs".
- **A11y:** announces via LiveRegion "No jobs found."; focus unchanged; actions are buttons.

### 3.28 InlineError

- **Anatomy:** sheet `surface-1`, 1px `border`, radius 8, padding 20; row [`circle-alert` 20 `danger-ink`] [title `card-title`; body `ui` `ink-2` max 56ch; actions: secondary M "Try again", for 5xx also a text link to About].
- **Kinds:** network ("Could not load jobs" / "Check your connection and try again."), server, rate-limited (adds the wait copy). Negative colour appears only on the icon; the error is never a full-width red banner.
- **States:** default; retrying (button busy). Replaces only the affected region; on non-first loads the previous results stay above it. `role="alert"` announced once; focus is not stolen; on success focus goes to the results heading. In the sidebar a compact one-line version is used.

### 3.29 FullPageError and NotFound

- **Layout:** one left-aligned column, max-width 560, padding-top 64 (40 on mobile), header and footer remain. `h1` `page-title`; body `body` `ink-2`; actions row: primary M "Try again" + quiet M "Go to all jobs" (404: SearchCombobox plain variant + secondary links "Browse all jobs", "Browse companies"); optional reference line `mono-source` `ink-3` "Reference: abc123".
- **Variants:** 404, error, offline ("You appear to be offline" / "Reconnect, then try again."), repeated failure (adds "If this keeps happening, please check back later."). No decoration. `role="alert"` on mount for error; focus to `h1`.

### 3.30 Breadcrumb and BackLink

- **Breadcrumb (≥640):** `nav aria-label="Breadcrumb"` > `ol`: `Jobs` › `{Company}` › `{Title}`; `ui` `ink-2`; separators `chevron-right` 16 `ink-3` (aria-hidden); links hover `ink-1` + underline; current item `ink-1`, `aria-current="page"`, one line, ellipsis at 48ch. Item height 32 with 44 hit on touch.
- **BackLink:** quiet M, `arrow-left` 16 + "Back to results" (arrived from our list in this tab; `history.back()`) or "All jobs at {Company}" (otherwise) plus a second quiet link "Browse all jobs". On ≥1024 it sits at the right end of the breadcrumb row; below 640 it replaces the breadcrumb (left, 44 high).

### 3.31 JobHeader and FactList

- **Sheet:** `surface-1`, 1px `border`, radius 8, padding 32 (≥1024) / 24 (640-1023); below 640 edge-to-edge, padding 16, top and bottom borders only.
- **Order:** [CompanyLogo 48 + company name link (`card-title`, hover underline, goes to the Company page)] → **h1** `read-title` (margin-top 12, `text-wrap: balance`, no clamp, `overflow-wrap: anywhere`) → salary (SalaryText full, margin-top 16) → FactList (margin-top 16) → rule (1px `rule`, margin 24 0) → DescriptionBlock.
- **FactList:** `dl`. ≥640: CSS grid `repeat(auto-fit, minmax(160px, 1fr))`, gap 16 24; each item: `dt` `caption` 500 `ink-3` (Location, Work type, Employment, Team, Posted) above `dd` `body` `ink-1`. <640: stacked lines, gap 4, `dt` visually hidden, `dd` `body`; the Remote value renders as a Badge. Absent facts are omitted (no empty cells). "Pay" is the SalaryText above, not a fact cell.

### 3.32 ApplyBlock (ApplyButton + destination line + TrustNote)

- **Container:** ≥1024 the **aside**: `surface-1`, 1px `border`, radius 8, padding 20, width 320, `position: sticky; top: 16px`. <1024: inline block under the FactList, no sheet, margin-top 24, separated by `rule`.
- **ApplyButton:** primary **L** (48), `<a href={applyUrl} target="_blank" rel="noopener nofollow">`, label "Apply on {Company}" + `arrow-up-right` 20 trailing; width 100% (aside and mobile), content-width min 280 on tablet. Accessible name "Apply on {Company} (opens in a new tab)". Company longer than 22 characters is ellipsised in the visible label only; `aria-label` keeps the full name. States: default, hover (`primary-hover`), focus-visible, active, (skeleton while loading: disabled block, not clickable). Contrast `ink-inverse` on `primary` 17.96:1 (light) / 17.12:1 (dark).
- **Destination line (the one idea):** directly under the button (margin-top 12), `mono-dest` (Geist Mono 13/18) `ink-2`: `jobs.ashbyhq.com/deel/7fe8abc1…` = host + first path segment + "/" + first 8 characters of the next segment + "…" (the part after is omitted); `overflow-wrap: anywhere`, up to 2 lines; `user-select: all`; `translate="no"`; full URL in `title`. If the host is not `ashbyhq.com` the real host is shown. Not a link (the button is the link).
- **TrustNote:** `ui` `ink-2`, max 44ch, margin-top 8: "You will apply on Deel's own Ashby page, in a new tab. We do not collect applications or see what you submit." Linked from the button with `aria-describedby`.
- **Freshness:** `caption` `ink-3`, margin-top 8, tabular: "Listing last checked Oct 22, 2026."
- **Fallbacks:** invalid/missing `applyUrl` → secondary L "View on Ashby" using the derived URL (and destination line from it); if nothing derivable → `ui` `ink-3` "Application link unavailable" and no button. Inactive job → no ApplyBlock at all (3.36).

### 3.33 StickyApplyBar

- **When:** viewport < 640 on Job detail, only after the main Apply button leaves the viewport (IntersectionObserver). Hidden state is `aria-hidden="true"` and `inert` (so the page has one Apply at a time for assistive tech).
- **Visual:** fixed bottom, full width, `surface-1`, 1px top `border`, `shadow-sheet`, padding 12 16 + `env(safe-area-inset-bottom)`; contains the same primary L button (label "Apply on {Company}", no destination line). Total height 72 + inset. The page adds `padding-bottom: 88px` and `scroll-padding-bottom: 88px` so focused elements are never covered (WCAG 2.4.11).
- **Motion:** slide up 8px + fade over `dur-base`; reduced motion appears instantly (05 section 3.6).
- **Order:** last tab stop before the footer; the main Apply stays first.

### 3.34 DescriptionBlock

- **Heading:** `h2` "About the role" (`section-title`). **Prose:** `body-read` (16/26, dark 16/27), max-width **68ch**, left-aligned, never justified.
- **Elements (sanitised allowlist: p, br, ul, ol, li, strong, em, a, h1-h4, blockquote, code):** paragraphs spaced 16; source h1/h2 become h3 (18/26 600, 32 above, 8 below), source h3/h4 become h4 (16/24 600, 24 above, 4 below); lists indent 24, items spaced 6, nested lists indent 20; links `hue` underlined (offset 3px, 1px, hover 2px and `hue-hover`) with the external glyph and sr text; `blockquote` 1px `border-strong` left rule, padding-left 16, `ink-2`, no italics; `code` Geist Mono 14/20 on `surface-2`, padding 0 4, radius 4. Images, tables, iframes, inline styles, scripts are stripped. No "read more" truncation; long descriptions flow.
- **States:** present; **missing** (`body` `ink-2`: "{Company} has not shared the full description with us. You can read it on their application page." with no second Apply button); loading (6 skeleton bars).
- **Print:** see 4.4.

### 3.35 CompanyStrip

- A single link row in the aside (≥1024, below the ApplyBlock, 1px `rule` above, padding-top 16) or a full-width row (<1024, 1px top and bottom `rule`): `card-title` "More jobs at Deel (27)" (count tabular) + `chevron-right` 20 `ink-2` right. Height 56, hover `row-hover`, focus inset ring, whole row is the link.

### 3.36 ExpiredState and NotFound (job)

- **Known but inactive:** same JobHeader (logo, company, title as `h1`), no salary, no facts, **no ApplyBlock**; below a rule: `h2` `section-title` "This job is no longer listed", `body` `ink-2` ("The company may have filled or removed this role. We refresh listings regularly (last update Oct 22, 2026)."), actions: secondary M "More jobs at Deel", quiet M "Browse all jobs".
- **Unknown id:** 3.29 NotFound layout with "We could not find this job".

### 3.37 CompanyHeader

- **Layout:** ≥640 one row: [CompanyLogo 64] 16 [text block] and, on ≥1024, "View all on Ashby" at the right end of the row; <640 stacked (logo + name row, then count, then link). Text block: `h1` `page-title`; "27 open jobs" `ui` `ink-2` tabular (1 → "1 open job"); the board address in `mono-source` `ink-3` (`jobs.ashbyhq.com/deel`) — the source line again. "View all on Ashby" is a quiet M ExternalLink-button.
- **States:** skeleton (64 block + two bars), ready, no jobs (header stays; EmptyState below, count reads "No open jobs"), name unknown (prettified slug).

### 3.38 CompanyRow

- `li` in the Directory sheet (same sheet rules as 3.18). Padding 12 16 (12 20 ≥640), min-height 64. Grid [CompanyLogo 40] 12 [name `card-title`, 1 line, ellipsis, flex 1] 12 [count `ui` `ink-2` tabular right: "27 open jobs"]. The whole row is one link (stretched). ≥640 the sheet is two columns of rows with a 1px `rule` between columns and under each row; <640 one column.
- **States:** default; hover `row-hover`; focus-visible inset ring; active `surface-2`. Accessible name "{Company}, 27 open jobs".

### 3.39 Prose page (About, Privacy) and ShortVersion block

- **Layout:** left-aligned single column, max-width 65ch, no sheet, on `ground`; `h1` `read-title`; `h2` `section-title` (32 above, 8 below); paragraphs `body-read` spaced 16; lists and links as 3.34; `h3` not used. Tablet/desktop add no in-page contents list in v1.
- **ShortVersion (Privacy):** `surface-2` bg, 1px `border`, radius 8, padding 20, margin-bottom 32; `h2` "The short version" `section-title`; body `body-read`. No icon, no colour accent. Contact line is a placeholder until the owner supplies it (Q5).

### 3.40 Toast — not used

No toasts. Feedback is inline: the Copy-link status (3.17), Notice (3.26), InlineError (3.28). A toast would need its own timing, focus and duplicate-announcement policy for a single use. If one is ever added: bottom-left, `surface-1`, 1px `border-strong`, `shadow-pop`, ≥6s, dismissible, pauses on hover and focus.

### 3.41 Tooltip — not used

The absolute posted date uses the native `title` on `<time>` (non-essential; repeated on Job detail). Icon-only controls (theme toggle, close, prev/next) have accessible names and, where visible text is absent, a native `title`. No custom tooltip component, so nothing hover-only carries information.

### 3.42 Dialog scrim (primitive)

- `position: fixed; inset: 0; background: var(--color-scrim)` z 50; click closes the drawer (tablet); on the full-screen mobile dialog there is no visible scrim. Part of 3.9.

### 3.43 SourceLine (added)

- Text component used by JobCard, ApplyBlock and CompanyHeader. Format helper: `formatSource(url, { mode: 'host-slug' | 'destination' })`. Geist Mono, `ink-3` (card, 12px) or `ink-2` (destination, 13px); `translate="no"`; `direction: ltr`; never a link; ellipsis (card) or `overflow-wrap: anywhere` (destination). Strip scheme and `www.`; lowercase host; if the path is empty, show host only.

### 3.44 DatasetLine (added; was text in 05)

- Browse only, under the h1: "**34,035** open jobs at **1,747** companies. Updated Oct 22." `ui` `ink-2`, figures `ui-emph` `ink-1` tabular; max 60ch; wraps to two lines on mobile. Hidden when filters are active. Date text "Oct 22" is `Meta.lastUpdated`.

### 3.45 ResultsHeading (added; was text in 05)

- `h2` "Results, page 13 of 49" is the focus target after page change and from the skip link. Visually hidden until focused; when focused it appears as a static block above the list: `ui-strong` `ink-1`, padding 8 0, with the focus ring (offset 4). Empty state replaces its text. `tabindex="-1"`.

### 3.46 NoscriptNotice (added)

- Info Notice (3.26) at the top of `main`, no dismiss: "This site needs JavaScript to load jobs. You can also browse companies' boards directly at jobs.ashbyhq.com." Used only if the stack is a client SPA (05 section 1.7).

### 3.47 Component coverage check (against 05 section 11)

SiteHeader 3.1 · SkipLinks 3.2 · Footer 3.3 · ThemeToggle 3.4 · Button 3.5 · ExternalLink 3.6 · SearchCombobox 3.7 · FilterSidebar 3.8 · FilterDialog 3.9 · FacetGroup 3.10 · FacetOption 3.11 · ToggleSwitch 3.12 · FilterChip 3.13 · ChipBar 3.13 · ResultsToolbar 3.14 · SortSelect 3.16 · CopyLinkButton 3.17 · JobCard 3.18 · JobCardSkeleton 3.19 · CompanyLogo 3.20 · Badge 3.21 · SalaryText 3.22 · PostedAge 3.23 · Pagination 3.24 · PageSizeSelect 3.16 · SummaryLine 3.15 · LiveRegion 3.25 · Notice 3.26 · EmptyState 3.27 · InlineError 3.28 · FullPageError / NotFound 3.29 · Breadcrumb 3.30 · BackLink 3.30 · JobHeader 3.31 · FactList 3.31 · ApplyButton 3.32 · TrustNote 3.32 · StickyApplyBar 3.33 · DescriptionBlock 3.34 · CompanyHeader 3.37 · CompanyRow 3.38 · Skeleton primitives 3.19. Also covered from 05 section 2 components lists: RadioGroup (FacetGroup radio, 3.10-3.11), CompanyStrip 3.35, ExpiredState 3.36. All inventory items present.

---

## 4. Page-level rules, signature details, dark mode, print, do and don't

### 4.1 Page layout rules

Shared: page background `ground`; header 56; content container max **1200**, centred, side padding = gutter (16 / 24 / 32); first content block starts 24 below the header (16 on mobile); 64 above the footer. Sheets (`surface-1`, 1px `border`, radius 8) hold *data* (the job list, the directory, a job record, the Apply panel); reading pages (About, Privacy) and the filter sidebar sit directly on `ground`. No block is centred as a "hero"; headings are left-aligned.

| Screen | Order and rhythm (top to bottom) | Key measurements |
|---|---|---|
| **Browse `/`** | h1 `page-title` (24 above, 0 below) → DatasetLine (4 below h1) → 16 → SearchCombobox (label, field, Search button) → 16 → *(<1024)* sticky toolbar → ChipBar (12 above/below, only if chips) → *(≥1024)* two-column zone: sidebar 280 and results column; results: ResultsToolbar → list sheet → pagination (24 above) → page-size row (16 above) | ≥1024: sidebar 280, gap 32 (≥1280: 40), results 648 (≥1280: 880). Search field spans the full container. The first card must start in the top 60% of a 390x844 phone (≈ 506px) when no chips are active. |
| **Job detail `/jobs/…`** | Breadcrumb/BackLink row (height 44) → 16 → *(≥1024)* two columns: main sheet (JobHeader + DescriptionBlock) 832, gap 48, aside 320 (ApplyBlock + CompanyStrip, sticky 16 from the top). *(<1024)* single column: JobHeader sheet → ApplyBlock (inline, rule above) → DescriptionBlock → CompanyStrip. | Description 68ch inside the sheet (sheet padding 32; the measure is capped, the sheet is not centred). Mobile: sticky Apply bar adds 88 bottom padding. |
| **Company `/companies/{slug}`** | Breadcrumb → CompanyHeader → SearchCombobox ("Search jobs at {Company}") → same zone as Browse minus the Company facet. | JobCard compact-company variant; logo 64 in header. |
| **Directory `/companies`** | h1 → line "1,747 companies with open jobs." → search → summary row (right: "Sort: A-Z (fixed)" as `ui` `ink-3` text, not a control) → sheet of CompanyRows (2 columns ≥640) → Pagination (sizes 25/50/100, default 50). | Row min-height 64. |
| **About / Privacy** | h1 `read-title` → sections (h2 32 above, 8 below) → footer. | 65ch left-aligned column; whitespace on the right is intentional. |
| **404 / Error** | h1 → sentence → search or actions. | Column 560, padding-top 64. |

**Density summary:** the unit of the page is the 88-148px card; 25 per page; a scan down the list is one title (600) per ≈ 112px with figures aligned on the right edge. Information is never hidden to look cleaner; it is omitted only when absent.

### 4.2 Signature details (what makes it this product)

1. **The source line.** Monospace, quiet, always visible: `jobs.ashbyhq.com/deel` on rows, `jobs.ashbyhq.com/deel/7fe8abc1…` under Apply. (The one idea, 1.2.)
2. **Pay is the only colour.** The salary figure is the one place the `hue` appears in a list; scanning for pay means scanning for blue. Everything else is ink.
3. **Ledger columns.** On tablet/desktop salary over posted-age is right-aligned on one edge in tabular figures; the result summary, facet counts, pagination numbers and dates are tabular too.
4. **Rules, not boxes.** One white sheet with 1px row rules instead of a stack of cards; the filter sidebar is not a box at all.
5. **The dataset sentence as a total** with 600-weight figures, hidden once filters are active so the results summary takes over.
6. **A near-black Apply button and nothing else filled.** There is never a second filled button competing with it on Job detail.
7. **Visited titles dim, not recolour,** so a long scan shows what you have opened.
8. **Deterministic monograms** from the slug: the same company always has the same tile.
9. **Honest omission.** Missing data disappears; no "N/A", no "Unknown", no placeholder dashes; separators exist only between present segments.
10. **The mark:** a near-black square with an up-right arrow, the whole product in one glyph.

### 4.3 Dark mode rules

Dark is composed, not inverted (impeccable colorize / app-screens 9.3).

- **Neutrals stay neutral:** true-neutral darks with chroma ≤ 0.02 (OKLCH). No navy, no slate, no blue-tinted blacks. Ground `#0e0f11`, then three lightness steps (`surface-1` `#16171a`, `surface-2` `#1f2125`, `surface-3` `#2b2e33`). **Elevation is lightness**, not shadow: floating layers (popover, drawer) use `surface-1` with a 1px `border-strong` plus the heavy `shadow-pop`/`shadow-sheet`; the sticky Apply bar relies on its 1px top border.
- **Text:** `ink-1` is `#f1f2f4` (not pure white, 16.00:1 on `surface-1`) to limit halation; two greys far enough apart to read as two (`ink-2` `#b9bec6`, `ink-3` `#9aa0ab`). Nothing below 4.5:1 carries words. `body-read` gets +1px line-height and +0.005em tracking.
- **The hue lifts:** `#7ea9f0` for salary, links and focus (7.53:1 on `surface-1`, 8.05:1 on `ground`). Same single-hue budget. Selection `#2a4a82` with `ink-1` text (7.81:1).
- **Primary inverts:** near-white fill `#f1f2f4` with `#0e0f11` label; the current page, checked box and switch-on invert the same way.
- **Status:** pale-on-dark pairs (ink lifted for 4.5:1: `success-ink` `#63d18d` on `#15291d` 8.07:1, `danger-ink` `#ff8f86` on `#341b1a` 7.23:1). A green hue that matched the primary does not exist here, so no clash.
- **Logos:** always on a light `logo-tile` (`#f1f2f4`) so dark-ink logos stay legible; monograms use their dark tile set (2.1.2).
- **Highlights:** `mark-bg` `#4a3f0e` with a `#e4bc3f` underline.
- **No flash:** theme resolved in an inline head script before paint (3.4); `color-scheme: light dark` on `:root` so native controls, scrollbars and the select popup follow; `<meta name="theme-color">` per scheme.
- **Images:** nothing to dim (logos only).

### 4.4 Browser surfaces (themed, not left to defaults)

| Surface | Rule |
|---|---|
| Text selection | `::selection { background: var(--color-selection-bg); color: var(--color-ink-1); }` |
| Caret | `caret-color: var(--color-ink-1)` in inputs |
| Placeholders | `ink-3` (6.23:1) at full opacity |
| Autofill (search field) | override the browser fill with `surface-1` and `ink-1` |
| Scrollbars | `scrollbar-width: thin; scrollbar-color: var(--color-border-strong) transparent` on the sidebar, popup and dialog body; page scrollbar left native; `scrollbar-gutter: stable` while a dialog locks scroll |
| Links in prose | underline offset 3px, thickness 1px (2px on hover), `text-decoration-skip-ink: auto` |
| Numerals | `font-variant-numeric: tabular-nums` on `.tnum` roles (2.2) |
| Focus | 2px ring (3.0); no browser default outline |
| `prefers-contrast: more` | `border` and `rule` promote to the `control` value; `border-strong` to `ink-3`; focus ring 3px |
| `forced-colors: active` | borders on chips, buttons, switches, checkboxes and the current page slot are retained; no information carried by background alone |
| `prefers-reduced-motion` | 2.8 |
| Tap highlight | `-webkit-tap-highlight-color: transparent` (hover/active fills replace it) |

### 4.5 Print stylesheet

- Hide: header, footer, SkipLinks, filter sidebar/dialog, ChipBar, toolbar, pagination, StickyApplyBar, ThemeToggle, CopyLink. Background white, text black, **no colour required** (salary prints in bold black; the `hue` is dropped). `@page { margin: 18mm }`.
- **Job detail** prints as a clean document: logo (monogram if no logo), company, h1, salary, facts list (labels visible), description at 11pt/1.5 in Geist (or system fallback), `orphans: 3; widows: 3`, headings `break-after: avoid`. The Apply button is replaced by a printed line **"Apply at: {full applyUrl}"** in Geist Mono 10pt, `overflow-wrap: anywhere`, followed by the trust sentence and "Listing last checked Oct 22, 2026."
- **Browse** prints the current page's cards as a plain list: each card `break-inside: avoid`, row rules kept as 0.5pt black, logos and source lines hidden, no URLs appended to links. Directory and 404/error are not print targets.

### 4.6 Do and don't gallery (in words)

| Do | Don't |
|---|---|
| Put pay in the blue and everything else in ink; let the eye find the figure. | Colour the Apply button blue, tint chips blue, or underline everything in blue. |
| Show the host and slug of the real posting in mono, small and grey, on every row and above the Apply button. | Hide where Apply leads, route it through our domain, or add tracking parameters. |
| Use one white sheet with hairline rules between jobs. | Wrap every job in its own bordered, shadowed, rounded card. |
| Drop missing segments and let the row close up. | Print "N/A", "Unknown", "Salary not listed" or a lone dash. |
| Keep the filter column open on the page ground with rules between groups. | Put the filters in a bordered box, a tinted panel or a dark sidebar. |
| Keep titles at 16px 600 and let two lines wrap with an ellipsis. | Truncate by character count in JS or shrink the font to fit. |
| Say what happened and what to do ("Could not load jobs. Check your connection and try again."). | Say "Oops", add an illustration, or use red banners. |
| Use text for every state ("Remote", "On", "Current page", "Link copied"). | Rely on colour, a dot or an icon alone. |
| Dim visited titles by one ink step. | Turn visited titles purple or underline them. |
| Show real, small numbers at their real size ("1 open job"). | Show vanity totals, "hiring fast", "12 people viewing", countdowns, "Easy Apply". |
| Use a focus ring that is 2px and impossible to miss. | Remove outlines, or rely on a background change as the only focus cue. |
| Use Lucide 1.5px outline icons at 16/20 in `ink-2`. | Use emoji, filled icons, icons in tinted squares, or icon-topped feature cards. |
| Design dark mode as its own surface ladder with the same single hue. | Invert the light theme, add glows, or lift a coloured accent onto surfaces. |

### 4.7 Self-check against the house bans (impeccable craft-floor + design-taste)

| Ban / floor | Where it is honoured |
|---|---|
| No gradients, glows, glass | Flat fills only; skeleton is a flat pulse; shadows have offset + blur and exist only on floating layers |
| No icon-topped feature-card grids | The product has no feature cards; icons are single 16/20 glyphs inside controls |
| No eyebrow labels / section numbers | None; headings carry their own weight; pagination numbers are data |
| No violet/indigo default | One blue (OKLCH hue 259, `#1d5fbf`), used on <1% of pixels; neutrals are cool grey |
| No decorative shapes, no emoji, no stock "AI" tells | Logos only; no hero, no illustration |
| Coloured border-left/right above 1px | None; only 1px borders |
| Hard offset shadows | None |
| Monospace as a costume | Mono only for addresses and code (data) |
| Unicode glyphs as icons | None; Lucide set; the "…" in pagination is punctuation, the en dash is typography |
| Body ≥ 4.5:1, UI ≥ 3:1 | 2.1.1 (no failures) |
| Body measure 65-75ch, tracking floor | 68ch / 65ch; tracking -0.015em at most |
| Display max 6rem | Largest type is 30px |
| Motion: state only, ease-out exponential, reduced-motion | 2.8 |
| States: hover, disabled, loading, error, empty + real content + focus | 3.0 and per component |
| Browser surfaces themed | 4.4 |
| Light/dark picked from the use scene | Light reference (daytime job seeking on phone/laptop); dark as a first-class user choice, no default by category |

---

## 5. Tailwind token mapping (paste into the theme; tables only)

Tailwind v4 (`tailwindcss` 4.x per 02). Method in one line: define every colour variable as a plain CSS custom property on `:root` (light) and override it under
`[data-theme="dark"]`, then expose it to Tailwind with `@theme inline` so utilities read the live variable. The **Light** and **Dark** columns are the values
to assign; the first column is the variable name; the second is the theme key that generates utilities.

### 5.1 Colour

| CSS variable (set on `:root`, overridden under `[data-theme="dark"]`) | Tailwind theme key (`@theme inline`) | Utilities it produces | Light | Dark | Role |
|---|---|---|---|---|---|
| `--color-ground` | `--color-ground` | `bg-ground` | `#f3f5f8` | `#0e0f11` | Page background behind everything; sidebar and header sit on it |
| `--color-surface-1` | `--color-surface-1` | `bg-surface-1` | `#ffffff` | `#16171a` | The sheet: job-list sheet, detail sheet, inputs, dialogs, popovers |
| `--color-surface-2` | `--color-surface-2` | `bg-surface-2` | `#ebeef3` | `#1f2125` | Hover fill on controls, neutral badge, pressed row, skeleton track base, prose callout |
| `--color-surface-3` | `--color-surface-3` | `bg-surface-3` | `#dde2ea` | `#2b2e33` | Strongest neutral fill: pressed secondary, tag on surface-2; also the hairline `border` value |
| `--color-row-hover` | `--color-row-hover` | `bg-row-hover` | `#f7f9fb` | `#1b1c20` | Job card / list row hover tint (between surface-1 and ground) |
| `--color-ink-1` | `--color-ink-1` | `text-ink-1` | `#0f1217` | `#f1f2f4` | Primary text: titles, values, active nav |
| `--color-ink-2` | `--color-ink-2` | `text-ink-2` | `#434a55` | `#b9bec6` | Secondary text: company, meta line, helper text, inactive nav |
| `--color-ink-3` | `--color-ink-3` | `text-ink-3` | `#596170` | `#9aa0ab` | Tertiary text: counts, placeholder, source line, timestamps, group captions |
| `--color-ink-disabled` | `--color-ink-disabled` | `text-ink-disabled` | `#8a919d` | `#6b717c` | Disabled text only (exempt from contrast, see 2.1.1) |
| `--color-ink-inverse` | `--color-ink-inverse` | `text-ink-inverse` | `#ffffff` | `#0e0f11` | Text on `primary` fill |
| `--color-hue` | `--color-hue` | `text-hue`, `decoration-hue` | `#1d5fbf` | `#7ea9f0` | The one hue: salary figure, text links, focus ring, selection marks |
| `--color-hue-hover` | `--color-hue-hover` | `text-hue-hover`, `decoration-hue-hover` | `#174f9f` | `#9dc0f5` | Link / hue hover |
| `--color-hue-pressed` | `--color-hue-pressed` | `text-hue-pressed`, `decoration-hue-pressed` | `#123f80` | `#b8d3f8` | Link / hue pressed |
| `--color-focus` | `--color-focus` | `outline-focus`, `ring-focus` | `#1d5fbf` | `#7ea9f0` | Focus ring (alias of hue) |
| `--color-border` | `--color-border` | `border-border`, `divide-border` | `#dde2ea` | `#2b2e33` | Card and sheet edge, header and footer rule (decorative) |
| `--color-border-strong` | `--color-border-strong` | `border-border-strong`, `divide-border-strong` | `#b9c0cc` | `#3b3e45` | Secondary button, chip, divider between meta segments, dialog edge (decorative) |
| `--color-rule` | `--color-rule` | `border-rule`, `divide-rule` | `#ebeef3` | `#212328` | Row rule between job cards and facet groups (decorative) |
| `--color-control` | `--color-control` | `border-control`, `divide-control` | `#7d8696` | `#757c89` | Boundary of inputs, selects, checkboxes, radios, switch track (must reach 3:1) |
| `--color-primary` | `--color-primary` | `bg-primary` | `#14171c` | `#f1f2f4` | Fill of the primary button, current page, checked box, switch on |
| `--color-primary-hover` | `--color-primary-hover` | `bg-primary-hover` | `#2a2f38` | `#d9dce1` | Primary hover |
| `--color-primary-pressed` | `--color-primary-pressed` | `bg-primary-pressed` | `#000000` | `#c3c7ce` | Primary pressed |
| `--color-success-ink` | `--color-success-ink` | `text-success-ink` | `#1b6b3d` | `#63d18d` | Success text/icon (Link copied) |
| `--color-success-bg` | `--color-success-bg` | `bg-success-bg` | `#e2f4e9` | `#15291d` | Success pair background |
| `--color-warning-ink` | `--color-warning-ink` | `text-warning-ink` | `#7c4306` | `#e9b45e` | Warning text/icon (offline, stale) |
| `--color-warning-bg` | `--color-warning-bg` | `bg-warning-bg` | `#fcf1d8` | `#2c2212` | Warning pair background |
| `--color-danger-ink` | `--color-danger-ink` | `text-danger-ink` | `#a8201a` | `#ff8f86` | Error text/icon, invalid input border |
| `--color-danger-bg` | `--color-danger-bg` | `bg-danger-bg` | `#fdebe9` | `#341b1a` | Error pair background (inline pill only) |
| `--color-info-ink` | `--color-info-ink` | `text-info-ink` | `#174a96` | `#94b9f3` | Info text/icon (Notice) |
| `--color-info-bg` | `--color-info-bg` | `bg-info-bg` | `#e6eefb` | `#172338` | Notice background |
| `--color-info-border` | `--color-info-border` | `border-info-border` | `#c6d7f3` | `#2d4a78` | Notice 1px edge (decorative) |
| `--color-skeleton` | `--color-skeleton` | `bg-skeleton` | `#e4e8ee` | `#25282d` | Skeleton bars and blocks |
| `--color-selection-bg` | `--color-selection-bg` | `bg-selection-bg` | `#cddffa` | `#2a4a82` | Text selection (`::selection`), ink-1 text on it |
| `--color-mark-bg` | `--color-mark-bg` | `bg-mark-bg` | `#fdf0b8` | `#4a3f0e` | Search-term highlight fill (`<mark>`) |
| `--color-mark-line` | `--color-mark-line` | `shadow-mark` (inset 2px), `decoration-mark-line` | `#8f6700` | `#e4bc3f` | Search-term highlight underline (2px) |
| `--color-logo-tile` | `--color-logo-tile` | `bg-logo-tile` | `#ffffff` | `#f1f2f4` | Tile behind every company logo image |
| `--color-salary` | `--color-salary` | `text-salary` | `var(--color-hue)` | `var(--color-hue)` | Alias: the salary figure (the data element) |
| `--color-scrim` | `--color-scrim` | `bg-scrim` | `rgb(15 17 21 / 0.45)` | `rgb(0 0 0 / 0.60)` | Dim layer behind drawer/dialog |

### 5.2 Typography (`@theme`)

| CSS variable | Value | Utilities | Role |
|---|---|---|---|
| `--font-sans` | `"Geist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif` (the first name is the `next/font` CSS variable) | `font-sans` | All UI and prose |
| `--font-mono` | `"Geist Mono", ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace` | `font-mono` | Source line, destination, code |
| `--text-page-title` + `--text-page-title--line-height: 2rem` + `--text-page-title--letter-spacing: -0.01em` + `--text-page-title--font-weight: 600` | `1.5rem` | `text-page-title` | h1 (operate) |
| `--text-read-title` + `--text-read-title--line-height: 1.25` + `--text-read-title--letter-spacing: -0.015em` + `--text-read-title--font-weight: 600` | `clamp(1.5rem, 1.3rem + 0.8vw, 1.875rem)` | `text-read-title` | h1 (read) |
| `--text-section-title` + `--text-section-title--line-height: 1.625rem` + `--text-section-title--font-weight: 600` | `1.125rem` | `text-section-title` | h2 |
| `--text-card-title` + `--text-card-title--line-height: 1.375rem` + `--text-card-title--font-weight: 600` | `1rem` | `text-card-title` | Job card title |
| `--text-body-read` + `--text-body-read--line-height: 1.625rem` | `1rem` | `text-body-read` | Prose (dark: line-height `1.6875rem`, tracking `0.005em`) |
| `--text-body` + `--text-body--line-height: 1.5rem` | `1rem` | `text-body` | Inputs, empty/error body |
| `--text-ui` + `--text-ui--line-height: 1.25rem` | `0.875rem` | `text-ui` (+ `font-medium` / `font-semibold` for `ui-strong` / `ui-emph`) | Default UI text |
| `--text-button-lg` + `--text-button-lg--line-height: 1.5rem` + `--text-button-lg--font-weight: 600` | `1rem` | `text-button-lg` | L buttons |
| `--text-salary-detail` + `--text-salary-detail--line-height: 1.75rem` + `--text-salary-detail--font-weight: 700` | `1.25rem` | `text-salary-detail` | Detail salary (add `tabular-nums`) |
| `--text-caption` + `--text-caption--line-height: 1rem` | `0.75rem` | `text-caption` | Helper text |
| `--text-mono-source` + `--text-mono-source--line-height: 1rem` | `0.75rem` | `text-mono-source font-mono` | Card source line |
| `--text-mono-dest` + `--text-mono-dest--line-height: 1.125rem` | `0.8125rem` | `text-mono-dest font-mono` | Apply destination |

`salary-card` is `text-ui font-bold tabular-nums text-salary`. Utility `tabular-nums` is Tailwind's `font-variant-numeric: tabular-nums`.

### 5.3 Spacing, size, radius, elevation, motion, breakpoints

| CSS variable | Value | Utilities / use | Role |
|---|---|---|---|
| `--spacing` | `0.25rem` (4px) | `p-4` = 16px etc. | Spacing scale 2.3 |
| `--radius-chip` | `4px` | `rounded-chip` | Badges, chips (inner), checkbox |
| `--radius-control` | `6px` | `rounded-control` | Buttons, inputs, selects, logo tile ≤48 |
| `--radius-card` | `8px` | `rounded-card` | Sheets, popovers, empty/error |
| `--shadow-pop` | `0 4px 16px rgb(15 17 21 / 0.10), 0 1px 2px rgb(15 17 21 / 0.06)` (dark: `0 8px 24px rgb(0 0 0 / 0.50)`) | `shadow-pop` | Suggestions list, popovers |
| `--shadow-sheet` | `0 8px 32px rgb(15 17 21 / 0.16)` (dark: `0 8px 32px rgb(0 0 0 / 0.60)`) | `shadow-sheet` | Drawer, sticky bar |
| `--ease-out-quart` | `cubic-bezier(0.25, 1, 0.5, 1)` | `ease-out-quart` | Enters, hovers |
| `--ease-soft` | `cubic-bezier(0.65, 0, 0.35, 1)` | `ease-soft` | Skeleton pulse |
| `--animate-skeleton` | `skeleton-pulse 1.6s var(--ease-soft) infinite alternate` (keyframes: opacity 1 → 0.55) | `animate-skeleton` (disabled under reduced motion) | Skeleton |
| `--dur-instant / --dur-fast / --dur-base / --dur-exit` | `80ms / 120ms / 200ms / 150ms` | `duration-[var(--dur-fast)]` (plain variables, no Tailwind namespace) | Motion 2.8 |
| `--breakpoint-sm` | `40rem` (640) | `sm:` | Tablet layout starts |
| `--breakpoint-md` | `48rem` (768) | `md:` | Reference tablet |
| `--breakpoint-lg` | `64rem` (1024) | `lg:` | Persistent filter sidebar |
| `--breakpoint-xl` | `80rem` (1280) | `xl:` | Reference desktop, 40 gap |
| `--breakpoint-2xl` | `90rem` (1440) | `2xl:` | Content stops growing |
| `--container-page` | `75rem` (1200) | `max-w-page` | Page container |
| `--container-sidebar` | `17.5rem` (280) | `w-sidebar` | Filter sidebar |
| `--container-aside` | `20rem` (320) | `w-aside` | Apply column |
| `--container-prose` | `68ch` | `max-w-prose` (override) | Description measure (About/Privacy use `65ch`) |
| size aliases | control-sm `h-8`, control-md `h-10` (`max-sm:h-11`, `pointer-coarse:h-11`), control-lg `h-12`, card `min-h-22` (88px), logo `size-9 / size-10 / size-12 / size-16` | arbitrary where needed | 2.3 |

### 5.4 Alias map for shadcn/ui (so generated components inherit the system)

shadcn expects its own variable names. Map them to this system rather than editing component code. **Note the collision:** shadcn's `--accent` means "hover surface", not a hue;
here the hue is `--color-hue`.

| shadcn variable | Maps to |
|---|---|
| `--background` | `--color-ground` |
| `--foreground` | `--color-ink-1` |
| `--card`, `--popover` | `--color-surface-1` |
| `--card-foreground`, `--popover-foreground` | `--color-ink-1` |
| `--primary` | `--color-primary` |
| `--primary-foreground` | `--color-ink-inverse` |
| `--secondary`, `--muted`, `--accent` | `--color-surface-2` |
| `--secondary-foreground`, `--accent-foreground` | `--color-ink-1` |
| `--muted-foreground` | `--color-ink-3` |
| `--destructive` | `--color-danger-ink` |
| `--border` | `--color-border` |
| `--input` | `--color-control` (input boundary must stay ≥ 3:1) |
| `--ring` | `--color-focus` |
| `--radius` | `0.5rem` (then `--radius-card` = 8, controls use `--radius-control`) |

---

## 6. Deviations, additions, open questions, self-check

### 6.1 Deviations from 05 (and why)

| # | 05 says | This file does | Why |
|---|---|---|---|
| D1 | Sidebar "sticky below header" | The header is **not** sticky; the sidebar sticks at `top: 16px` with `max-height: calc(100dvh - 32px)` | A 56px sticky header plus a sticky toolbar costs 100+ px of a laptop viewport; with the header static, the sidebar gets the full height and nothing is obscured (2.4.11). |
| D2 | `<mark>` "3:1 against background and 4.5:1 text on it" | `<mark>` is a pale fill (text on it 16.38:1) **plus a 2px underline** at 5.11:1 (light) / 9.87:1 (dark) | A fill that is 3:1 against white is dark enough to look like a selection and fights the title; the non-text cue that must reach 3:1 is the underline, which does. |
| D3 | "Clear all" shown "when any" (05 section 2.4 flow) vs "when 2+ chips" (04 section 6) | Shown at **2 or more** chips | Documents conflict; with one chip a "Clear all" duplicates it. Reversible by one prop. |
| D4 | Skeleton card count = page size | `min(pageSize, 25)` skeleton cards | 100 pulsing blocks cost render time on a mid-range phone and add no information. |
| D5 | Desktop pagination example line shows nine items | Seven fixed slots, as 04's rule states | The rule and the example in 05/04 disagree; the rule is the testable one. |
| D6 | Filters count "badge" (component inventory) vs copy `Filters (3)` | Copy `Filters (3)` in the button label with tabular figures; no separate badge | Fewer parts, matches the copy table; accessible name "Filters, 3 active". |
| D7 | Currency formats `CA$` and ISO codes without a rule for repetition | Symbols repeat (`$140k–$180k`); letter prefixes appear once (`CA$160k–210k`, `CHF 120k–150k`) | Closes a gap so designers and developers render ranges identically. |
| D8 | Mobile card meta shows items on "up to 2 lines" implicitly | Meta stays **one line** at ≥360px (location ellipsis); wraps only below 360px or under text-spacing/zoom overrides | Keeps the 148px maximum card height true. |

### 6.2 Additions that are not in 05 (owner may veto)

- A1 **Source line** on cards, in the Apply block and in the Company header (the one idea). Adds ≈16px of width on ≥640 and no height.
- A2 One extra footer sentence: "Apply links go straight to the company's own page." (copy for approval).
- A3 Brand mark (3.1/2.6) and the working site name placeholder.
- A4 Components 3.43-3.46 (SourceLine, DatasetLine, ResultsHeading, NoscriptNotice) were implicit in 05 text; they are named here so they exist in code and Figma.

### 6.3 Open questions (for the owner or the implementer)

- **Q-D1 Site name and mark.** "Openings" is a placeholder; a name change affects the wordmark width only.
- **Q-D2 Tabular figures in Geist.** Verify `font-variant-numeric: tabular-nums` changes digit widths in the shipped build (craft-floor rule). Fallback: Geist Mono for figures in columns.
- **Q-D3 Source line truncation for odd hosts.** If `applyUrl` is not on `ashbyhq.com`, the real host is shown; confirm whether that is acceptable or whether such links need extra trust copy.
- **Q-D4 Indian rupee grouping.** `₹4.5M–₹6M` follows the k/M rule from 05; many Indian users expect lakh/crore. Needs an owner decision (only matters for INR).
- **Q-D5 Dark default.** System preference is followed; no per-site default. Confirm.
- **Q-D6 Header sticky or not (D1).** Reversible, but changes the sidebar offset and `scroll-padding-top`.

### 6.4 Self-check result

- Colour pairs: every text/UI pair in 2.1.1 meets its stated target in light **and** dark (no FAIL rows); the exceptions are disabled text (exempt) and decorative separators/skeletons (stated).
- Inventory: every component named in 05 section 11 has an entry in section 3 (3.47 lists the mapping).
- Banned patterns: none present (4.7).
- Not yet verified (needs a build): the rendered `tnum` behaviour (Q-D2), actual Geist metrics against the computed card heights in 3.18 (heights assume 22/20/16px line-heights as specified), and screen-reader pronunciation of the spelled-out salary labels.
