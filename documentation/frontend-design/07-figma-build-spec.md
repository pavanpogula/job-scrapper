# 07 · Figma Build Spec

> **Status:** DESIGN ONLY. No Figma tool was available when this was written, so **no Figma file exists yet**. This document is written so that a
> designer, or an agent with Figma write access, can build the file exactly, and so a developer can inspect it in Dev Mode and find every
> value in [06](./06-visual-direction-and-design-system.md). Where this file and 06 disagree, **06 wins** (tokens) and **05 wins** (screens, copy, states).
> _Authored 2026-10-22. All colour values are the computed ones from 06; contrast was verified there._

**How to read this file.** Sections 1-5 define the file's skeleton and every variable/style. Section 6 defines every component set. Section 7-8 define frames and mock content.
Section 9 the prototype. Sections 10-15: annotations, handoff, QA, plugins, a paste-ready prompt and open questions. Naming is exact: do not paraphrase layer, variable or property names, because
the developer mapping (section 11) depends on them.

---

## 1. File structure

One Figma Design file named **`{Site} – Job board – Design System & Screens v1`**. Pages (in this order; the number prefix keeps the order stable):

| Page | Contents | Notes |
|---|---|---|
| `00 Cover` | Cover frame 1440x900, title, version, date, status, link list to other pages, legend of annotation colours, contributor line | Cover uses the product's own tokens (ground, ink, one hue). No illustration. |
| `10 Foundations` | Colour (Light and Dark boards, contrast matrix), type specimens, spacing, radius, elevation, grids, icon sheet (Lucide subset), logo tile + monogram sheet, motion table | Boards are built *from variables*; no hard-coded fills. |
| `20 Components` | One section per component set (section 6), each with a state matrix board and a "Do/Don't" strip | Components live only here. |
| `30 Patterns` | Composed patterns: Search + Filters, Results toolbar + chips, Pagination (all windows), Apply block, Empty/Error blocks, Dialog/drawer assemblies | Instances only. |
| `40 Screens – Mobile 390` | All screens/states at 390x844 (plus 320 reflow set) | Light frames in columns; Dark frames in a separate row below. |
| `41 Screens – Tablet 768` | All screens/states at 768x1024 | |
| `42 Screens – Desktop 1280` | All screens/states at 1280 (plus 1024 and 1440 variants listed in 7) | |
| `50 Prototype` | Flow maps (section 9): frames re-used by reference via "Prototype flow starting points", plus the external "Ashby (external)" stub frame | Flows named `P1`-`P9`. |
| `90 Handoff & Changelog` | Dev-ready status board, naming map to code, open questions, changelog table | |
| `99 Archive` | Superseded frames | Never delete; move here. |

Section dividers inside pages use plain text frames named `── Section name ──` (not decorative). Each page has a **frame "Page index"** at top-left listing its sections with links.

---

## 2. Naming conventions

- **Slash names** everywhere. Pattern: `Group/Name/Variant`. Case: Title Case for pages and component sets; lowercase kebab for variables and styles.
- **Components:** `Component/Button`, `Component/JobCard`, `Component/Facet/Option`, `Component/Pagination/Slot`. Sub-components that are not meant for direct use are prefixed with `_` (e.g. `_Component/JobCard/MetaSegment`) and are not published.
- **Variant properties:** `Property=Value` pairs in Title Case with no spaces in values where possible (`State=Focus`, `Kind=Primary`, `Size=M`). Boolean properties start with a verb or `Show`/`Has` (`Show source line`). Text properties use the content role (`Title`, `Company`, `Salary`). Instance-swap properties end with `(swap)` in the UI label (`Logo (swap)`).
- **Frames (screens):** `{Screen}/{BP}/{ID} {State}` with `{BP}` = `M390`, `T768`, `D1280` (also `D1024`, `D1440`, `M320`), e.g. `Browse/D1280/B03 Results – filters active`. Dark frames add the suffix ` ~dark` (e.g. `Browse/D1280/B03 Results – filters active ~dark`). Use an en dash `–` between ID-state parts only as shown; keep IDs stable (they are referenced by prototypes and QA).
- **Layers inside components:** semantic, no "Frame 123". Examples: `Title`, `Company`, `SourceLine`, `Meta`, `Aside`, `Salary`, `Posted`, `Logo`. Icons: `Icon/search`, `Icon/arrow-up-right` (the Lucide name).
- **Variables:** `group/subgroup/name` (section 3). **Styles:** `type/…`, `effect/…`, `grid/…`.
- **Annotations:** layers in a group named `_ann` per frame, at the top of the layer stack, locked, prefixed `A11Y:`, `SPEC:`, `NOTE:` (section 10).
- **Versioning:** the file name carries `v1`; releases are named versions in Version History: `v1.0 Foundations`, `v1.1 Components`, … matching the Changelog board.

---

## 3. Variables

Create five **local variable collections**. Use *aliases* (Semantic → Primitives) rather than copying hex so a palette change touches one place. All colour values come from 06 section 2.1 (hex is authoritative).

### 3.1 Collection `Primitives` (1 mode: `Value`)

Colour variables, type `Color`, hidden from publishing except where noted. Scope: none (primitives must not be applied directly to layers; set "Hide from publishing" and no scopes).

| Variable | Hex | OKLCH |
|---|---|---|
| `color/neutral/0` | `#ffffff` | `oklch(1.000 0.000 0)` |
| `color/neutral/25` | `#f7f9fb` | `oklch(0.981 0.003 0)` |
| `color/neutral/50` | `#f3f5f8` | `oklch(0.969 0.005 0)` |
| `color/neutral/100` | `#ebeef3` | `oklch(0.948 0.007 261)` |
| `color/neutral/150` | `#e4e8ee` | `oklch(0.930 0.009 258)` |
| `color/neutral/200` | `#dde2ea` | `oklch(0.911 0.012 260)` |
| `color/neutral/300` | `#b9c0cc` | `oklch(0.806 0.019 261)` |
| `color/neutral/350` | `#8a919d` | `oklch(0.655 0.020 261)` |
| `color/neutral/400` | `#7d8696` | `oklch(0.618 0.026 262)` |
| `color/neutral/500` | `#596170` | `oklch(0.491 0.026 263)` |
| `color/neutral/600` | `#434a55` | `oklch(0.407 0.021 259)` |
| `color/neutral/700` | `#2a2f38` | `oklch(0.304 0.018 262)` |
| `color/neutral/800` | `#14171c` | `oklch(0.204 0.011 261)` |
| `color/neutral/900` | `#0f1217` | `oklch(0.181 0.011 261)` |
| `color/neutral/1000` | `#000000` | `oklch(0.000 0.000 0)` |
| `color/neutral-dark/50` | `#f1f2f4` | `oklch(0.961 0.003 0)` |
| `color/neutral-dark/150` | `#d9dce1` | `oklch(0.894 0.008 261)` |
| `color/neutral-dark/200` | `#c3c7ce` | `oklch(0.829 0.011 262)` |
| `color/neutral-dark/300` | `#b9bec6` | `oklch(0.800 0.013 260)` |
| `color/neutral-dark/400` | `#9aa0ab` | `oklch(0.704 0.017 263)` |
| `color/neutral-dark/500` | `#757c89` | `oklch(0.585 0.022 263)` |
| `color/neutral-dark/550` | `#6b717c` | `oklch(0.547 0.019 263)` |
| `color/neutral-dark/600` | `#3b3e45` | `oklch(0.364 0.013 267)` |
| `color/neutral-dark/650` | `#2b2e33` | `oklch(0.300 0.010 261)` |
| `color/neutral-dark/700` | `#25282d` | `oklch(0.276 0.010 261)` |
| `color/neutral-dark/750` | `#212328` | `oklch(0.256 0.010 268)` |
| `color/neutral-dark/800` | `#1f2125` | `oklch(0.247 0.008 264)` |
| `color/neutral-dark/850` | `#1b1c20` | `oklch(0.227 0.008 275)` |
| `color/neutral-dark/900` | `#16171a` | `oklch(0.205 0.006 271)` |
| `color/neutral-dark/950` | `#0e0f11` | `oklch(0.168 0.004 0)` |
| `color/hue/100` | `#e6eefb` | `oklch(0.947 0.020 260)` |
| `color/hue/150` | `#cddffa` | `oklch(0.899 0.042 258)` |
| `color/hue/200` | `#c6d7f3` | `oklch(0.875 0.043 260)` |
| `color/hue/500` | `#1d5fbf` | `oklch(0.501 0.165 259)` |
| `color/hue/600` | `#174f9f` | `oklch(0.440 0.142 258)` |
| `color/hue/700` | `#123f80` | `oklch(0.378 0.120 258)` |
| `color/hue/800` | `#174a96` | `oklch(0.422 0.136 259)` |
| `color/hue-dark/200` | `#b8d3f8` | `oklch(0.859 0.059 256)` |
| `color/hue-dark/300` | `#9dc0f5` | `oklch(0.801 0.085 259)` |
| `color/hue-dark/350` | `#94b9f3` | `oklch(0.780 0.093 259)` |
| `color/hue-dark/400` | `#7ea9f0` | `oklch(0.732 0.114 260)` |
| `color/hue-dark/600` | `#2d4a78` | `oklch(0.410 0.085 259)` |
| `color/hue-dark/650` | `#2a4a82` | `oklch(0.415 0.101 261)` |
| `color/hue-dark/900` | `#172338` | `oklch(0.256 0.043 261)` |
| `color/green/100` | `#e2f4e9` | `oklch(0.951 0.024 159)` |
| `color/green/700` | `#1b6b3d` | `oklch(0.468 0.106 153)` |
| `color/green-dark/400` | `#63d18d` | `oklch(0.778 0.141 154)` |
| `color/green-dark/900` | `#15291d` | `oklch(0.260 0.035 157)` |
| `color/amber/100` | `#fcf1d8` | `oklch(0.960 0.035 87)` |
| `color/amber/700` | `#7c4306` | `oklch(0.444 0.102 59)` |
| `color/amber-dark/400` | `#e9b45e` | `oklch(0.801 0.120 78)` |
| `color/amber-dark/900` | `#2c2212` | `oklch(0.259 0.031 78)` |
| `color/red/100` | `#fdebe9` | `oklch(0.954 0.020 25)` |
| `color/red/700` | `#a8201a` | `oklch(0.476 0.172 28)` |
| `color/red-dark/400` | `#ff8f86` | `oklch(0.768 0.137 26)` |
| `color/red-dark/900` | `#341b1a` | `oklch(0.256 0.040 23)` |
| `color/mark/100` | `#fdf0b8` | `oklch(0.952 0.073 97)` |
| `color/mark/700` | `#8f6700` | `oklch(0.541 0.111 82)` |
| `color/mark-dark/400` | `#e4bc3f` | `oklch(0.809 0.144 91)` |
| `color/mark-dark/900` | `#4a3f0e` | `oklch(0.369 0.067 96)` |
| `color/monogram/clay/tile-light` | `#f8e2dd` | n/a |
| `color/monogram/clay/letter-light` | `#59352c` | n/a |
| `color/monogram/clay/tile-dark` | `#3f2b25` | n/a |
| `color/monogram/clay/letter-dark` | `#fad0c5` | n/a |
| `color/monogram/sand/tile-light` | `#f0e7d6` | n/a |
| `color/monogram/sand/letter-light` | `#4d3d1b` | n/a |
| `color/monogram/sand/tile-dark` | `#382f1d` | n/a |
| `color/monogram/sand/letter-dark` | `#ead9b6` | n/a |
| `color/monogram/sage/tile-light` | `#ddeddf` | n/a |
| `color/monogram/sage/letter-light` | `#294830` | n/a |
| `color/monogram/sage/tile-dark` | `#253528` | n/a |
| `color/monogram/sage/letter-dark` | `#c4e5ca` | n/a |
| `color/monogram/teal/tile-light` | `#d6edee` | n/a |
| `color/monogram/teal/letter-light` | `#12484b` | n/a |
| `color/monogram/teal/tile-dark` | `#1b3537` | n/a |
| `color/monogram/teal/letter-dark` | `#b5e5e8` | n/a |
| `color/monogram/slate/tile-light` | `#dbeaf8` | n/a |
| `color/monogram/slate/letter-light` | `#25435b` | n/a |
| `color/monogram/slate/tile-dark` | `#223240` | n/a |
| `color/monogram/slate/letter-dark` | `#c0dffa` | n/a |
| `color/monogram/rose/tile-light` | `#f7e1e9` | n/a |
| `color/monogram/rose/letter-light` | `#573341` | n/a |
| `color/monogram/rose/tile-dark` | `#3e2a31` | n/a |
| `color/monogram/rose/letter-dark` | `#f7cedc` | n/a |

Notes: the neutral ramp is shared by both themes only where the hex coincides; otherwise Light uses `neutral/*` and Dark uses `neutral-dark/*`. `hue/*` is the single hue family (`hue/500` = `#1d5fbf`); there is no second brand hue.

### 3.2 Collection `Semantic` (2 modes: `Light`, `Dark`)

Every variable is a **Color** aliasing a primitive per mode. Apply these (never primitives) to layers. The collection's *default mode* is `Light`. Frames and boards pick the theme by setting this collection's mode on the frame (`Light` / `Dark`).

| Semantic variable (Figma) | CSS variable | Light mode alias | Dark mode alias | Scope (Figma variable scopes) |
|---|---|---|---|---|
| `color/bg/ground` | `--color-ground` | `neutral/50` (`#f3f5f8`) | `neutral-dark/950` (`#0e0f11`) | Frame fill, Shape fill |
| `color/bg/surface-1` | `--color-surface-1` | `neutral/0` (`#ffffff`) | `neutral-dark/900` (`#16171a`) | Frame fill, Shape fill |
| `color/bg/surface-2` | `--color-surface-2` | `neutral/100` (`#ebeef3`) | `neutral-dark/800` (`#1f2125`) | Frame fill, Shape fill |
| `color/bg/surface-3` | `--color-surface-3` | `neutral/200` (`#dde2ea`) | `neutral-dark/650` (`#2b2e33`) | Frame fill, Shape fill |
| `color/bg/row-hover` | `--color-row-hover` | `neutral/25` (`#f7f9fb`) | `neutral-dark/850` (`#1b1c20`) | Frame fill, Shape fill |
| `color/text/ink-1` | `--color-ink-1` | `neutral/900` (`#0f1217`) | `neutral-dark/50` (`#f1f2f4`) | Text fill |
| `color/text/ink-2` | `--color-ink-2` | `neutral/600` (`#434a55`) | `neutral-dark/300` (`#b9bec6`) | Text fill |
| `color/text/ink-3` | `--color-ink-3` | `neutral/500` (`#596170`) | `neutral-dark/400` (`#9aa0ab`) | Text fill |
| `color/text/disabled` | `--color-ink-disabled` | `neutral/350` (`#8a919d`) | `neutral-dark/550` (`#6b717c`) | Text fill |
| `color/text/inverse` | `--color-ink-inverse` | `neutral/0` (`#ffffff`) | `neutral-dark/950` (`#0e0f11`) | Text fill |
| `color/hue/default` | `--color-hue` | `hue/500` (`#1d5fbf`) | `hue-dark/400` (`#7ea9f0`) | Text fill, Stroke |
| `color/hue/hover` | `--color-hue-hover` | `hue/600` (`#174f9f`) | `hue-dark/300` (`#9dc0f5`) | Text fill, Stroke |
| `color/hue/pressed` | `--color-hue-pressed` | `hue/700` (`#123f80`) | `hue-dark/200` (`#b8d3f8`) | Text fill, Stroke |
| `color/focus` | `--color-focus` | `hue/500` (`#1d5fbf`) | `hue-dark/400` (`#7ea9f0`) | Stroke |
| `color/border/default` | `--color-border` | `neutral/200` (`#dde2ea`) | `neutral-dark/650` (`#2b2e33`) | Stroke |
| `color/border/strong` | `--color-border-strong` | `neutral/300` (`#b9c0cc`) | `neutral-dark/600` (`#3b3e45`) | Stroke |
| `color/border/rule` | `--color-rule` | `neutral/100` (`#ebeef3`) | `neutral-dark/750` (`#212328`) | Stroke |
| `color/border/control` | `--color-control` | `neutral/400` (`#7d8696`) | `neutral-dark/500` (`#757c89`) | Stroke |
| `color/action/primary` | `--color-primary` | `neutral/800` (`#14171c`) | `neutral-dark/50` (`#f1f2f4`) | Frame fill, Shape fill |
| `color/action/primary-hover` | `--color-primary-hover` | `neutral/700` (`#2a2f38`) | `neutral-dark/150` (`#d9dce1`) | Frame fill, Shape fill |
| `color/action/primary-pressed` | `--color-primary-pressed` | `neutral/1000` (`#000000`) | `neutral-dark/200` (`#c3c7ce`) | Frame fill, Shape fill |
| `color/status/success-ink` | `--color-success-ink` | `green/700` (`#1b6b3d`) | `green-dark/400` (`#63d18d`) | Text fill, Shape fill (icons) |
| `color/status/success-bg` | `--color-success-bg` | `green/100` (`#e2f4e9`) | `green-dark/900` (`#15291d`) | Frame fill, Shape fill |
| `color/status/warning-ink` | `--color-warning-ink` | `amber/700` (`#7c4306`) | `amber-dark/400` (`#e9b45e`) | Text fill, Shape fill (icons) |
| `color/status/warning-bg` | `--color-warning-bg` | `amber/100` (`#fcf1d8`) | `amber-dark/900` (`#2c2212`) | Frame fill, Shape fill |
| `color/status/danger-ink` | `--color-danger-ink` | `red/700` (`#a8201a`) | `red-dark/400` (`#ff8f86`) | Text fill, Shape fill (icons) |
| `color/status/danger-bg` | `--color-danger-bg` | `red/100` (`#fdebe9`) | `red-dark/900` (`#341b1a`) | Frame fill, Shape fill |
| `color/status/info-ink` | `--color-info-ink` | `hue/800` (`#174a96`) | `hue-dark/350` (`#94b9f3`) | Text fill, Shape fill (icons) |
| `color/status/info-bg` | `--color-info-bg` | `hue/100` (`#e6eefb`) | `hue-dark/900` (`#172338`) | Frame fill, Shape fill |
| `color/status/info-border` | `--color-info-border` | `hue/200` (`#c6d7f3`) | `hue-dark/600` (`#2d4a78`) | Frame fill, Shape fill |
| `color/state/skeleton` | `--color-skeleton` | `neutral/150` (`#e4e8ee`) | `neutral-dark/700` (`#25282d`) | Frame fill, Shape fill |
| `color/state/selection` | `--color-selection-bg` | `hue/150` (`#cddffa`) | `hue-dark/650` (`#2a4a82`) | Frame fill, Shape fill |
| `color/state/mark-bg` | `--color-mark-bg` | `mark/100` (`#fdf0b8`) | `mark-dark/900` (`#4a3f0e`) | Frame fill, Shape fill |
| `color/state/mark-line` | `--color-mark-line` | `mark/700` (`#8f6700`) | `mark-dark/400` (`#e4bc3f`) | Stroke, Shape fill |
| `color/state/logo-tile` | `--color-logo-tile` | `neutral/0` (`#ffffff`) | `neutral-dark/50` (`#f1f2f4`) | Frame fill, Shape fill |
| `color/state/scrim` | `--color-scrim` | `#0f1115` at 45% (rgba) | `#000000` at 60% | Frame fill |

**Monogram variables (Semantic, 24 more):** for each tone `clay, sand, sage, teal, slate, rose` create `color/monogram/{tone}/tile` and `color/monogram/{tone}/letter`, where **Light** aliases `color/monogram/{tone}/tile-light` / `…/letter-light` and **Dark** aliases `…/tile-dark` / `…/letter-dark` (12 semantic variables total). The tone index of a company is `fnv1a32(lowercase slug) mod 6` in the order clay, sand, sage, teal, slate, rose (06 section 2.1.2); the mock data in section 7 lists each sample company's tone.

### 3.3 Collection `Spacing` (Number, 1 mode)

| Variable | Value | Variable | Value |
|---|---|---|---|
| `space/0-5` | 2 | `space/6` | 24 |
| `space/1` | 4 | `space/8` | 32 |
| `space/2` | 8 | `space/10` | 40 |
| `space/3` | 12 | `space/12` | 48 |
| `space/4` | 16 | `space/16` | 64 |
| `space/5` | 20 | `space/22` | 88 (sticky bar clearance) |

Scope: `Gap`, `Width and height` (padding is "Gap" too in Figma's scope list).

### 3.4 Collection `Radius` (Number, 1 mode)

| Variable | Value | Use |
|---|---|---|
| `radius/none` | 0 | Full-screen dialog, mobile-edge sheets |
| `radius/chip` | 4 | Badge, skeleton bar, checkbox, count tag |
| `radius/control` | 6 | Buttons, inputs, selects, page slots, logo tile ≤ 48 |
| `radius/card` | 8 | Sheets, popovers, empty/error frames, logo 64 |
| `radius/pill` | 999 | Switch track and knob only |

### 3.5 Collection `Size & Layout` (Number, 3 modes: `Mobile`, `Tablet`, `Desktop`)

Mode `Mobile` = width < 640; `Tablet` = 640-1023; `Desktop` = 1024+. Set the mode on each screen frame to match its width. (At D1024 the two gap values below are overridden by hand: `layout/sidebar-gap` 32 instead of 40, `layout/page-gutter` 32.)

| Variable | Mobile | Tablet | Desktop | Notes |
|---|---|---|---|---|
| `layout/page-gutter` | 16 | 24 | 32 | Side padding of the container |
| `layout/page-top` | 16 | 24 | 24 | Space below header |
| `layout/container-max` | 390 (n/a) | 720 | 1200 | Content max width (desktop caps at 1200) |
| `layout/sidebar-width` | 0 | 0 | 280 | Persistent filter sidebar |
| `layout/sidebar-gap` | 0 | 0 | 40 | 32 at 1024 |
| `layout/aside-width` | 0 | 0 | 320 | Job detail Apply column |
| `size/control-md` | 44 | 44 | 40 | Buttons M, selects, page slots |
| `size/control-sm` | 32 | 32 | 32 | Chips/buttons S (touch gets hit-area annotation) |
| `size/control-lg` | 48 | 48 | 48 | Search, Apply, Show N jobs |
| `size/facet-row` | 44 | 44 | 36 | Facet option row height |
| `size/logo-card` | 36 | 40 | 40 | Logo in Job card |
| `size/card-pad-x` | 16 | 20 | 20 | Job card horizontal padding |
| `size/card-pad-y` | 16 | 16 | 16 | Job card vertical padding |
| `size/card-min-h` | 88 | 88 | 88 | |
| `size/skeleton-card-h` | 112 | 112 | 112 | |
| `size/icon-sm / md / lg` | 16 / 20 / 24 | same | same | three variables |
| `size/logo-xs / md-detail / lg` | 24 / 48 / 64 | same | same | three variables |
| `size/header-h` | 52 | 56 | 56 | 52 below 400 |

### 3.6 Collection `Type` (mixed, 2 modes: `Light`, `Dark`)

Variables bound by text styles so one style serves both themes.

| Variable | Type | Light | Dark |
|---|---|---|---|
| `font/sans` | String | `Geist` | `Geist` |
| `font/mono` | String | `Geist Mono` | `Geist Mono` |
| `type/body-read/line-height` | Number | 26 | 27 |
| `type/body-read/tracking` | Number (percent) | 0 | 0.5 |

### 3.7 Motion (documentation only; Figma has no motion variables)

Create a board "Motion" on `10 Foundations` with these as text and use them in prototypes: `dur-instant` 80ms, `dur-fast` 120ms, `dur-base` 200ms, `dur-exit` 150ms, `dur-pulse` 1600ms; `ease-out` = custom bezier `0.25, 1, 0.5, 1`; `ease-in-out` = `0.65, 0, 0.35, 1`. Reduced-motion behaviour (06 section 2.8) is shown as a second column on the same board.

---

## 4. Styles

### 4.1 Text styles (font family = variable `font/sans` unless noted; sizes are px)

| Style | Weight | Size / Line height | Letter spacing | Other |
|---|---|---|---|---|
| `type/page-title` | SemiBold 600 | 24 / 32 | -1% | |
| `type/read-title` | SemiBold 600 | 24 / 30 at 390, 27 / 34 at 768, 29 / 36 at 1024, 30 / 38 at 1280+ → create four styles `type/read-title/390`, `/768`, `/1024`, `/1280` | -1.5% | The only fluid role; the four styles sample `clamp(1.5rem, 1.3rem + 0.8vw, 1.875rem)` at the reference widths |
| `type/section-title` | SemiBold 600 | 18 / 26 | 0 | |
| `type/card-title` | SemiBold 600 | 16 / 22 | 0 | |
| `type/body-read` | Regular 400 | 16 / `type/body-read/line-height` | `type/body-read/tracking` | Paragraph spacing 16 |
| `type/body` | Regular 400 | 16 / 24 | 0 | |
| `type/ui` | Regular 400 | 14 / 20 | 0 | |
| `type/ui-strong` | Medium 500 | 14 / 20 | 0 | |
| `type/ui-emph` | SemiBold 600 | 14 / 20 | 0 | Tabular figures on |
| `type/button-lg` | SemiBold 600 | 16 / 24 | 0 | |
| `type/salary-card` | Bold 700 | 14 / 20 | 0 | Tabular figures on |
| `type/salary-detail` | Bold 700 | 20 / 28 | -0.5% | Tabular figures on |
| `type/caption` | Regular 400 | 12 / 16 | 0 | |
| `type/caption-strong` | Medium 500 | 12 / 16 | 0 | |
| `type/mono-source` | Regular 400, family `font/mono` | 12 / 16 | 0 | |
| `type/mono-dest` | Regular 400, family `font/mono` | 13 / 18 | 0 | |
| `type/code` | Regular 400, family `font/mono` | 14 / 20 | 0 | Inside description |

Enable **Tabular figures** (OpenType `tnum`) in the style's *Typography details* for every style that holds a salary, count, date or page number; in practice enable it on `ui-emph`, `salary-card`, `salary-detail`, and apply a duplicate `type/ui/tnum` and `type/caption/tnum` for dates and counts. If Figma cannot show `tnum` for Geist, note it in Open Questions and check in the browser (06 Q-D2).

### 4.2 Effect styles

| Style | Definition |
|---|---|
| `effect/shadow-pop` | Drop shadow 0,4 blur 16 spread 0 colour `#0f1115` 10%; drop shadow 0,1 blur 2 colour `#0f1115` 6% |
| `effect/shadow-pop-dark` | Drop shadow 0,8 blur 24 colour `#000000` 50% |
| `effect/shadow-sheet-drawer` | Drop shadow 0,8 blur 32 colour `#0f1115` 16% |
| `effect/shadow-sheet-drawer-dark` | Drop shadow 0,8 blur 32 colour `#000000` 60% |
| `effect/shadow-sheet-bar` | Drop shadow 0,-4 blur 16 colour `#0f1115` 8% |
| `effect/focus-ring` | Not an effect: built as an outline *stroke* (below). |

Figma styles cannot switch by mode: apply the `-dark` effect style on Dark frames/instances (the components in section 6 already expose a `Theme` shortcut for the two components that float: `Component/Popover` and `Component/Drawer`). Resting surfaces never get an effect.

### 4.3 Focus ring construction

Focus is drawn as a **2px outside stroke** of variable `color/focus` with a **2px offset**. In Figma: add a rounded-rectangle layer named `FocusRing` inside the component's `State=Focus` variant, size = control size + 8 (4px each side: 2px offset + 2px stroke), corner radius = control radius + 4, fill none, stroke `color/focus` 2px inside, `Layout: ignore auto layout`. For inset rings (Job card, rows) use a rectangle sized exactly to the row with stroke 2px inside. Never rely on the component's own stroke for focus.

### 4.4 Layout grid styles

| Style | Definition |
|---|---|
| `grid/m390` | Columns, count 4, type Stretch, margin 16, gutter 12 |
| `grid/t768` | Columns, count 8, type Stretch, margin 24, gutter 16 |
| `grid/d1024` | Columns, count 12, type Stretch, margin 32, gutter 24 |
| `grid/d1280` | Columns, count 12, type Center, width 78, gutter 24 (= 1200 container) |
| `grid/d1440` | Same as `grid/d1280` |
| `grid/baseline-4` | Grid, size 4, colour 10% red, hidden by default (toggle for spacing QA) |

Browse's sidebar + results split (280 + gap + fluid) is built with explicit widths and Auto Layout; it intentionally does not snap to the 12-col grid. The grid is used for Job detail (main = cols 1-9, aside = cols 10-12 at 1280) and static pages.

---

## 5. Icons

Import the **Lucide** library (community file "Lucide Icons") and copy only these into `20 Components/Icons`, each as a component at 24x24 with stroke **1.5px** (Figma icon components: set stroke weight 1.5, caps/joins round) and variants `Size=16|20|24` (scale the vector; keep stroke 1.5): `search`, `x`, `chevron-down`, `chevron-up`, `chevron-left`, `chevron-right`, `arrow-left`, `arrow-up-right`, `link`, `check`, `sliders-horizontal`, `sun`, `moon`, `monitor`, `circle-alert`, `info`, `loader-circle`, `wifi-off`. Colour: stroke bound to the variable of the parent text (`color/text/ink-2` default). No filled icons, no other glyph sources, no emoji.

The **mark** (`Component/Mark`): 22x22 rounded square (radius 5) filled `color/action/primary`, containing `Icon/arrow-up-right` at 14px with stroke 1.75 in `color/text/inverse`, centred.

---

## 6. Component sets

Every component below is built on page `20 Components`, with all fills/strokes/text bound to **Semantic variables** and **text styles** (no raw hex, no local overrides). Build each set as a
Figma **component set** with the exact variant properties listed. `State` variants exist for the five interaction states plus the extra states named. Orthogonal conditions (checked, current,
has-icon) are **boolean properties**, not extra variants. All components are designed in `Light` mode and verified in `Dark` by switching the Semantic mode on the preview frame.

Auto Layout notation: **H** = horizontal, **V** = vertical, `pad t/r/b/l`, `gap`, `hug` / `fill` / `fixed`, alignment `start|center|end`. Heights reference variables in 3.5.

### 6.0 Shared state variants

Interactive sets use `State=Default | Hover | Focus | Pressed | Disabled` unless noted. `Focus` includes the `FocusRing` layer (4.3). `Busy` appears only on Button. `Pressed` = the "active" state in 06.

### 6.1 Foundations of interaction

| Component set | Variant properties | Boolean | Text | Instance swap | Auto Layout rules |
|---|---|---|---|---|---|
| `Component/Button` | `Kind=Primary / Secondary / Quiet`; `Size=S / M / L`; `State=Default / Hover / Focus / Pressed / Disabled / Busy` | `Icon left`, `Icon right` | `Label` | `Icon left (swap)` default `Icon/sliders-horizontal`; `Icon right (swap)` default `Icon/arrow-up-right` | H, center/center, gap 8, pad `0 / 10,14,24 / 0 / 10,14,24` by Size, height fixed `size/control-sm / md / lg`, width hug with min-width 88 when no icon; radius `radius/control`; fills per 06 3.5; Busy replaces left icon with `Icon/loader-circle` and sets text opacity 100% (label stays) |
| `Component/IconButton` | `Kind=Secondary / Quiet`; `Size=M / L` (40/44, 48); `State=Default / Hover / Focus / Pressed / Disabled` | none | `Accessible name` (hidden text layer, 0% opacity, used by annotation) | `Icon (swap)` default `Icon/x` | H, center, fixed square, radius `radius/control` |
| `Component/Link/Inline` | `State=Default / Hover / Focus / Pressed` | `External icon` | `Label` | none | H hug, gap 2; text `type/ui` colour `color/hue/default` underline 1px offset 3 (Hover: 2px, `color/hue/hover`); optional `Icon/arrow-up-right` 14px |
| `Component/Mark` | none | none | none | none | Fixed 22x22 (see section 5) |

### 6.2 Chrome

| Component set | Variant properties | Boolean | Text | Instance swap | Auto Layout rules |
|---|---|---|---|---|---|
| `Component/NavLink` | `State=Default / Hover / Focus / Pressed / Current` | none | `Label` | none | H, pad `0 12`, height `size/control-md`, radius control; Current has 2px bottom underline bar (rect, `color/text/ink-1`, offset 6 below text) |
| `Component/ThemeToggle` | `Mode=System / Light / Dark`; `State=Default / Hover / Focus / Pressed` | none | `Accessible name` (hidden) | none | Fixed square `size/control-md`, icon 20 centred; icon swapped by Mode (`monitor / sun / moon`) |
| `Component/SiteHeader` | `BP=Mobile / Tablet / Desktop`; `Current=None / Browse / Companies / About` | `Show wordmark text` (off in the 320 variant) | `Site name` (default "Openings") | `Nav item 1..3 (swap)` | V: outer full-width frame (height `size/header-h`, bottom stroke `color/border/default`, fill `color/bg/ground`) > H inner (width fill, max 1200, pad-x `layout/page-gutter`, space-between, center): left H(gap 8: Mark + Site name `type/card-title` 18/24 per 06) ; right H(gap 4: NavLinks + ThemeToggle) |
| `Component/SkipLinks` | `State=Hidden / Focus`; `Focused=First / Second` | none | `Link 1`, `Link 2` | none | Hidden: 1px layer off-canvas; Focus: H gap 8, absolute at (16,16), each link pad `12 16`, fill `color/bg/surface-1`, stroke `color/border/strong`, radius control, effect `effect/shadow-pop`, ring on the focused one |
| `Component/Footer` | `BP=Mobile / Tablet / Desktop` | `Show source link` | `Data line`, `Updated date` | none | V, top stroke `color/border/default`, pad `32 gutter 48`; links row H gap 24; Desktop: H space-between baseline-aligned |

### 6.3 Search

| Component set | Variant properties | Boolean | Text | Instance swap | Auto Layout rules |
|---|---|---|---|---|---|
| `Component/Search/Field` | `State=Idle / Hover / Focus / Typing / Loading / Disabled`; | `Has clear` | `Label` ("Search jobs"), `Value`, `Placeholder` | none | V gap 8: label (`type/ui-strong`) + H field (height `size/control-lg`=48, pad `0 44`, stroke 1px `color/border/control`, fill `color/bg/surface-1`, radius control; leading `Icon/search` 20 absolute left 14; trailing clear `IconButton` absolute right 8) |
| `Component/Search/Option` | `Kind=Company / Department / Location / FreeText`; `State=Default / Active` | `Show count` | `Text`, `Match`, `Count` | `Logo (swap)` (Company only) | H, height 40 (44 touch), pad `0 12`, gap 12, radius control; Active = fill `color/bg/surface-2` + inset 2px focus ring |
| `Component/Search/Popup` | `Variant=Groups / Loading / NoResults` | none | `Free text query` | `Option 1..n (swap)` | V, fill `color/bg/surface-1`, stroke `color/border/strong`, radius card, effect `effect/shadow-pop`, pad 4, max-height 360; group label `type/caption-strong`/`color/text/ink-3` pad `8 12 4`; last row preceded by a 1px `color/border/rule` rule |
| `Component/Search/Bar` | `Suggestions=None / Open`; `BP=Mobile / Desktop` | `Plain (no suggestions)` | as Field | `Button (swap)` default `Component/Button` Primary L "Search" | H gap 8: Field (fill) + Button (hug, min 96); Open variant attaches Popup 4px below, absolute |

### 6.4 Filters

| Component set | Variant properties | Boolean | Text | Instance swap | Auto Layout rules |
|---|---|---|---|---|---|
| `Component/Facet/Option` | `Control=Checkbox / Radio`; `State=Default / Hover / Focus / Zero / Disabled` | `Checked` | `Label`, `Count` | none | H, height `size/facet-row`, pad `0 8` (visually offset -8), gap 12, align center, radius control; box 18x18 (radius chip for checkbox, pill for radio); Checked: fill `color/action/primary`, `Icon/check` 14 `color/text/inverse` (radio: 8px dot); label 500 when Checked; count right, `type/ui`/`color/text/ink-3` tabular; Hover fill `color/bg/surface-2` |
| `Component/Facet/Switch` | `State=Default / Hover / Focus / Disabled` | `On`, `Has helper` | `Label` (include count), `Helper` | none | V: H row (min-height 44, space-between: label fill + track 40x24) + helper `type/caption`; track off = fill surface-1 + stroke control 1px, knob 18 `color/text/ink-3`; on = fill primary, knob inverse, 12px check on empty side |
| `Component/Facet/Group` | `Kind=Checkbox / Radio`; `State=Open / Collapsed / Loading / Searching / EmptySearch / Error` | `Searchable`, `Has active count`, `Show more`, `Expanded list` | `Legend`, `Active count`, `Search placeholder`, `Empty message` | `Option 1..8 (swap)` | V, pad `16 0`, top stroke `color/border/rule`; legend row H space-between (legend `type/ui-emph`; count tag min 20x20 fill surface-3 radius chip; chevron icon 16); options V gap 0; Show more = `Component/Button` Quiet S |
| `Component/Filter/Sidebar` | `State=Ready / Loading / Error` | `Has active filters` | `Heading`, `Helper` | `Group 1..7 (swap)` | V, width fixed `layout/sidebar-width`=280, no fill, gap 0; header H space-between (h2 16/24 600 + `Component/Button` Quiet S "Clear") ; helper caption below |
| `Component/Filter/Dialog` | `Container=FullScreen / Drawer`; `State=Open / ZeroMatch / Applying / Loading` | `Has selection` | `Title`, `Button label` ("Show 1,204 jobs" / "No jobs match") | `Group 1..7 (swap)` | V, fill `color/bg/surface-1`; FullScreen fixed 390x844 radius none; Drawer fixed 360 x full height with `effect/shadow-sheet-drawer`; header H height 56 (IconButton close left, title, Quiet "Clear all" right), 1px bottom stroke; body V (fill height, clip, scroll) pad 16; footer H pad `12 16`, top stroke, Primary L full width |
| `Component/Scrim` | `Theme=Light / Dark` | none | none | none | Rectangle fill `color/state/scrim` |

### 6.5 Active filters and toolbar

| Component set | Variant properties | Boolean | Text | Instance swap | Auto Layout rules |
|---|---|---|---|---|---|
| `Component/Chip` | `Kind=Filter / Search / More`; `State=Default / Hover / Focus / Pressed / Removing` | `Show facet label` | `Facet`, `Value` | none | H, height `size/control-sm`, pad `0 6 0 12`, gap 4, radius control, fill surface-1 + stroke `color/border/strong` (More: dashed); text `Facet:` `ink-3` + `Value` `ink-1` 500; trailing `Icon/x` 16 inside 24px zone; Removing = opacity 0 variant; value truncates at max-width 240 |
| `Component/ChipBar` | `BP=Mobile / Desktop`; `Chips=None / One / Three / Six / Collapsed / Expanded` | `Show Clear all` | none | `Chip 1..n (swap)` | H wrap, gap 8 (row gap 8), width fill; "Clear all" = Quiet S Button at the end (Desktop: pushed to the right end with a spacer) |
| `Component/Results/Summary` | `Kind=Exact / Approximate / All / Single / Loading` | none | `From`, `To`, `Total` | none | H hug; plain `type/ui`/`ink-2`, figures `type/ui-emph`/`ink-1` |
| `Component/Select` | `Role=Sort / PageSize`; `State=Default / Hover / Focus / Open / Disabled` | `Label inline` | `Label`, `Value` | none | H gap 8: label + control (height `size/control-md`, pad `0 36 0 12`, stroke control, radius control, trailing `Icon/chevron-down` 16 at right 12); Open variant shows the native list as a plain `surface-1` panel annotated "OS control" |
| `Component/CopyLink` | `State=Idle / Hover / Focus / Copied / Failed` | none | `Label`, `Status` | none | Quiet S/M Button + for Failed a `caption` status under it in `color/status/danger-ink` with `Icon/circle-alert` 16; Copied: `Icon/check` colour `color/status/success-ink`, label "Link copied" |
| `Component/Results/Toolbar` | `BP=Mobile / Tablet / Desktop`; `State=Default / Zero / Loading` | `Stuck` (Mobile: fill surface-1 + bottom stroke), `Has filters count` | `Filters label` ("Filters (3)") | none | Mobile: H height 56 pad `6 16`, gap 8: Filters Button (Secondary M) + spacer + Select(Sort); Tablet: V gap 12: row1 H(Filters + spacer + Select) then ChipBar then row2 H(Summary + spacer + CopyLink); Desktop: H height 40 space-between: Summary + H gap 8(CopyLink, Select, prev/next IconButtons) |

### 6.6 Results list

| Component set | Variant properties | Boolean | Text | Instance swap | Auto Layout rules |
|---|---|---|---|---|---|
| `Component/Logo` | `Size=24 / 36 / 40 / 48 / 64`; `Kind=Image / Monogram / Loading`; `Tone=Clay / Sand / Sage / Teal / Slate / Rose` (Monogram only) | none | `Letter` | `Image (swap)` default a neutral placeholder bitmap | Fixed square; fill `color/state/logo-tile` + stroke 1px `color/border/default` (Image) or `color/monogram/{tone}/tile` (Monogram, no stroke); radius control (card at 64); Image inset 4; Letter `type/ui-strong`-style at 15/16/18/24px 600 in `color/monogram/{tone}/letter` |
| `Component/Badge` | `Tone=Neutral / Info` | none | `Text` | none | H, height 20, pad `0 6`, radius chip, fill surface-2 / info-bg, text `type/caption-strong` |
| `Component/Salary` | `Style=Card / Detail`; `Suffix=None / PerHour` | `Show note` (Detail) | `Value`, `Suffix`, `Note` | none | Card: H hug baseline, `type/salary-card` `color/hue/default`, suffix `type/ui` `ink-2`; Detail: V gap 4: figure `type/salary-detail` + note `type/caption` `ink-3` |
| `Component/Posted` | `Style=Relative / Absolute` | none | `Text` | none | H hug, `type/ui` `color/text/ink-3` tabular |
| `Component/SourceLine` | `Mode=Row / Destination` | none | `Text` | none | H hug; Row = `type/mono-source` `ink-3`; Destination = `type/mono-dest` `ink-2`, text wraps (fixed width, auto height) |
| `Component/JobCard` | `Layout=Wide / Narrow` (≥640 / <640); `Variant=Full / CompactCompany`; `State=Default / Hover / Focus / Pressed / Visited / ReturnedTo` | `Show source line`, `Show remote badge`, `Show department`, `Show type`, `Show salary`, `Show posted`, `Highlight` | `Title`, `Company`, `Source`, `Location`, `Department`, `Type`, `Salary`, `Posted` | `Logo (swap)` default `Component/Logo` | **Wide:** H, pad `size/card-pad-y / size/card-pad-x`, gap 12, min-height 88, width fill, align top: `Logo` (fixed `size/logo-card`) · `Main` (V, fill, gap 4: `Title` text fill max 2 lines truncate; `CompanyRow` H gap 12 baseline: `Company` fill truncate 1 line + `SourceLine` hug max 55%; `Meta` H gap 0 no-wrap clip: `Location` (fill, truncate) + `Seg/Remote` + `Seg/Dept` + `Seg/Type`, each `_MetaSegment` = H pad-left 8 with 1px left stroke `color/border/strong` clipped for the first) · `Aside` (V, hug, min 120 max 200, gap 4, align end: `Salary`, `Posted`). **Narrow:** same but logo 36, `Aside` absent; `Main` gets a final `SalaryPosted` row (H gap 8 with separator). CompactCompany hides Logo, CompanyRow and SourceLine. Fill per State from `color/bg/*` (Hover `row-hover`, Pressed `surface-2`); Visited sets Title colour `color/text/ink-2`; Focus and ReturnedTo add an inset 2px `FocusRing`; `Highlight` swaps a title substring into a `mark` run (fill `color/state/mark-bg` + 2px bottom bar `color/state/mark-line`) |
| `Component/JobCard/Skeleton` | `Layout=Wide / Narrow` | `Pulse` (shows the 55% opacity variant for annotation) | none | none | Same frame as the card at fixed height `size/skeleton-card-h`=112; bars as rectangles radius chip, fill `color/state/skeleton`: title 62%x14 and 38%x14 (gap 6), company 26%x12 (gap 8), meta 46%x12 (gap 8), aside bars 88x14 and 104x12 (Wide) |
| `Component/ResultList` | `Count=3 / 6 / 25`; `Variant=Real / Skeleton`; `BP=Mobile / Tablet / Desktop` | `Sheet edges` (Mobile off) | none | `Card 1..n (swap)` | V, fill surface-1, stroke `color/border/default` (Mobile: only top/bottom strokes), radius card (Mobile none), clip content; 1px `color/border/rule` strokes between cards (top stroke on cards 2..n) |

### 6.7 Pagination

| Component set | Variant properties | Boolean | Text | Instance swap | Auto Layout rules |
|---|---|---|---|---|---|
| `Component/Pagination/Slot` | `State=Default / Hover / Focus / Pressed / Current / Ellipsis` | none | `Text` | none | Fixed height `size/control-md`, width = max(40, chars*8+24) – set per Window variant, radius control; Current fill `color/action/primary` text `color/text/inverse`; Ellipsis non-interactive `ink-3` |
| `Component/Pagination/Desktop` | `Window=Short / Start / Middle / End`; `Last=49 / 1362` | `Prev disabled`, `Next disabled`, `Show note` | `Current`, `Last label`, `Note` | none | H gap 4, wrap off: Prev (`Component/Button` Secondary M, left chevron) + 7 Slots at equal width + Next; `Last=1362` shows the wider slot width on all 7 slots; Start `1 2 3 4 5 … last`, Middle `1 … c-1 c c+1 … last`, End `1 … last-4 … last`, Short = all pages (≤7) |
| `Component/Pagination/Jump` | `State=Default / Invalid` | none | `Value`, `Hint` | none | H gap 8: label "Go to page" + field 72 + Secondary M "Go"; Invalid adds hint above (V) and danger stroke |
| `Component/Pagination/Compact` | `State=Default / Focus / Invalid / FirstPage / LastPage`; `Width=390 / 480` | none | `Current`, `Last label` | none | H center gap 8: IconButton(prev) + "Page" + input 64x44 + "of 1,362" + IconButton(next); Width=480 swaps IconButtons for Secondary M with text |
| `Component/Pagination/Block` | `BP=Mobile / Tablet / Desktop` | `Show max-window note` | none | `Control (swap)` | V gap 16: row1 numbered control; row2 H space-between: Jump (left) + Select PageSize (right); Mobile: compact control, PageSize on its own row left |

### 6.8 Messages and states

| Component set | Variant properties | Boolean | Text | Instance swap | Auto Layout rules |
|---|---|---|---|---|---|
| `Component/Notice` | `Tone=Info / Warning` | `Dismissible` | `Message` | none | H, pad `12 16`, gap 12, fill `color/status/info-bg / warning-bg`, stroke `color/status/info-border`, radius card, icon 16 + text fill + IconButton Quiet |
| `Component/EmptyState` | `Kind=FilteredWithQuery / FilteredNoQuery / Unfiltered / CompanyEmpty` | none | `Heading`, `Body`, `Suggestion 1..3` | none | V, pad 32 (24 mobile), gap 12, max-width 560, dashed 1px stroke `color/border/strong`, no fill, radius card; suggestions are Secondary M Buttons stacked, gap 8, max-width 420, text left; final Quiet M "Clear all filters" |
| `Component/InlineError` | `Kind=Network / Server / RateLimited`; `State=Default / Retrying` | `Compact`, `Show About link` | `Title`, `Body` | none | H gap 12, pad 20, fill surface-1, stroke `color/border/default`, radius card; `Icon/circle-alert` 20 `color/status/danger-ink`; text V gap 4; actions H gap 12 (Secondary M "Try again") |
| `Component/PageError` | `Kind=NotFound404 / Error / Offline / Repeated` | `Show reference` | `Heading`, `Body`, `Reference` | `Primary action (swap)` | V, width 560, pad-top 64, gap 16 left aligned; actions H gap 12 |
| `Component/Skeleton/Bar` etc. | `Role=Text14 / Text16 / Title24 / Block`; `Width=100 / 62 / 38 / 26` | none | none | none | Rectangle fill `color/state/skeleton`, radius chip/control |
| `Component/LiveRegion` | none | none | `Message` | none | Annotation-only (text with `A11Y:` prefix, 0 visual weight); documents the polite region and messages (section 10) |

### 6.9 Detail, company, static

| Component set | Variant properties | Boolean | Text | Instance swap | Auto Layout rules |
|---|---|---|---|---|---|
| `Component/Breadcrumb` | `BP=Desktop / Mobile` (Mobile = BackLink only) | `Show Back link` | `Item 1`, `Item 2`, `Current`, `Back label` | none | H gap 4 baseline, `type/ui`; separators `Icon/chevron-right` 16 `ink-3`; current truncates max 48ch; Back link = Quiet M with `Icon/arrow-left` |
| `Component/JobHeader` | `BP=Mobile / Tablet / Desktop` | `Show salary`, `Show location`, `Show work type`, `Show employment`, `Show team`, `Show posted` | `Company`, `Title`, `Location`, `Work type`, `Employment`, `Team`, `Posted`, `Salary` | `Logo (swap)` (Size 48) | V in sheet (fill surface-1, stroke default, radius card; Mobile edge-to-edge, pad 16; Tablet pad 24; Desktop pad 32): Company row H (Logo + company link `type/card-title`), Title (`type/read-title/*` per BP), Salary (`Component/Salary` Detail), `FactList` |
| `Component/FactList` | `Layout=Inline / Grid` | one boolean per fact | one text per fact | none | Grid: wrap H, item min 160, column gap 24, row gap 16; each item V gap 2: `dt` `type/caption-strong` `ink-3`, `dd` `type/body`; Inline: V gap 4 `dd` only (Remote renders as `Component/Badge`) |
| `Component/ApplyBlock` | `BP=Mobile / Tablet / Desktop`; `Link=Normal / Fallback / Unavailable`; `State=Default / Hover / Focus / Loading` | `Show freshness` | `Company`, `Destination`, `Trust note`, `Freshness`, `Fallback note` | none | V gap 8; Desktop: sheet (pad 20, width `layout/aside-width`, fill surface-1, stroke default, radius card); Button Primary L (full width) + `SourceLine` Destination (mt 12) + trust note (`type/ui`, `ink-2`, max 44ch) + freshness (`type/caption` `ink-3`). Loading = disabled grey block button. Unavailable = muted text only |
| `Component/StickyApplyBar` | `Visible=Hidden / Visible` | none | `Company` | none | Fixed width 390; H pad `12 16 + 34 (safe area)`, fill surface-1, top stroke default, `effect/shadow-sheet-bar`, Primary L full width |
| `Component/Description` | `State=Present / Missing / Loading` | `Has lists`, `Has links`, `Has subheadings`, `Has quote`, `Has code` | `Heading`, `Missing message` | none | V, max-width 68ch (≈ 570px), paragraphs gap 16; h3 `type/section-title` mt 32 mb 8; h4 `type/card-title` mt 24 mb 4; list pad-left 24 item gap 6; links `color/hue/default` underlined; blockquote left stroke 1px `color/border/strong`; Loading = six bars |
| `Component/CompanyStrip` | `State=Default / Hover / Focus` | none | `Text` ("More jobs at Deel (27)") | none | H space-between, height 56, pad `16`, top stroke `color/border/rule`; trailing `Icon/chevron-right` 20 |
| `Component/ExpiredState` | `Kind=Expired / JobNotFound` | none | `Heading`, `Body` | none | V gap 12, max-width 560; actions H gap 12 (Secondary M, Quiet M) |
| `Component/CompanyHeader` | `BP=Mobile / Tablet / Desktop`; `State=Ready / Skeleton / NoJobs` | `Show source line` | `Name`, `Count`, `Source` | `Logo (swap)` (Size 64) | H gap 16 (Mobile V), name `type/page-title`, count `type/ui`, source `type/mono-source`; link Quiet M "View all on Ashby" with trailing arrow-up-right |
| `Component/CompanyRow` | `State=Default / Hover / Focus / Pressed`; `Layout=OneColumn / TwoColumn` | none | `Name`, `Count` | `Logo (swap)` | H, min-height 64, pad `12 16 / 20`, gap 12; name fill truncate 1 line; count right tabular `ink-2` |
| `Component/Prose` | `Kind=Plain / WithShortVersion` | none | `Title`, `Body` | none | V, width 65ch (≈ 560px), left aligned; h2 mt 32 mb 8; paragraphs gap 16; ShortVersion = V pad 20 fill `color/bg/surface-2` stroke `color/border/default` radius card mb 32 |
| `Component/Popover` | `Theme=Light / Dark` | none | none | `Content (swap)` | Container for the suggestions list and any future menu: fill surface-1, stroke `color/border/strong`, radius card, shadow style per Theme |
| `Component/Drawer` | `Theme=Light / Dark` | none | none | `Content (swap)` | Wraps `Component/Filter/Dialog` Drawer at 360 wide with the Theme-appropriate shadow style |

### 6.10 Inventory coverage (against 05 section 11)

SiteHeader, SkipLinks, Footer, ThemeToggle, Button, ExternalLink (= `Component/Link/Inline` + Button with right icon), SearchCombobox (`Search/Field` + `Search/Popup` + `Search/Bar`), FilterSidebar, FilterDialog, FacetGroup, FacetOption, ToggleSwitch (`Facet/Switch`), FilterChip + ChipBar (`Chip`, `ChipBar`), ResultsToolbar, SortSelect and PageSizeSelect (`Select`), CopyLinkButton (`CopyLink`), JobCard, JobCardSkeleton, CompanyLogo (`Logo`), Badge, SalaryText (`Salary`), PostedAge (`Posted`), Pagination (`Pagination/*`), SummaryLine (`Results/Summary`), LiveRegion (annotation component), Notice, EmptyState, InlineError, FullPageError/NotFound (`PageError`), Breadcrumb, BackLink (inside `Breadcrumb`), JobHeader, FactList, ApplyButton + TrustNote (inside `ApplyBlock`), StickyApplyBar, DescriptionBlock (`Description`), CompanyHeader, CompanyRow, Skeleton primitives (`Skeleton/Bar` etc.). Added by 06: SourceLine, DatasetLine (text pattern inside the Browse header frame), ResultsHeading (annotation + focus frame), NoscriptNotice (a `Notice` instance), CompanyStrip, ExpiredState, Prose, Popover, Drawer, Scrim.

---

## 7. Frames, grids and mock content

### 7.1 Frame sizes and layout grids

| Frame set | Size (W x H) | Grid style | Variable modes to set on the frame | Notes |
|---|---|---|---|---|
| Mobile | 390 x 844 (height: **Hug** with min 844; draw a dashed "fold" line at y=844) | `grid/m390` | `Semantic=Light / Dark`, `Size & Layout=Mobile`, `Type=Light / Dark` | Primary mobile design size; safe area: 47 top status bar placeholder is **not** drawn; bottom safe area 34 shown only on frames with a sticky bar |
| Mobile reflow | 320 x 640 | `grid/m390` margin overridden to 16 | as above | WCAG 1.4.10: only Browse results, Filter dialog, Job detail, Job detail long title |
| Tablet | 768 x 1024 (Hug, min 1024) | `grid/t768` | `Size & Layout=Tablet` | Also build at 640 for the Browse results frame to prove the breakpoint |
| Desktop 1024 | 1024 x 768 (Hug) | `grid/d1024` | `Size & Layout=Desktop` + overrides (gap 32) | Browse results and Job detail only |
| Desktop | 1280 x 800 (Hug, min 800) | `grid/d1280` | `Size & Layout=Desktop` | Reference desktop; container 1200 centred |
| Wide | 1440 x 900 (Hug) | `grid/d1440` | `Size & Layout=Desktop` | Browse results and Job detail only; proves the 1200 container stays centred with 120px margins |
| Print | 794 x 1123 (A4 at 96dpi), margin 68 (18mm) | none | `Semantic=Light` with an overridden "print" frame fill white | Job detail print only |

Every screen frame has: `Auto Layout` vertical, `Fill container` widths, `Clip content` on, `Constraints: Left & Right`, the header and footer as instances. Use `Position: sticky` equivalents: Figma "Fixed (stay in place when scrolling)" for the mobile sticky toolbar and the sticky Apply bar, and "Scroll behaviour: Fixed" on the desktop sidebar during prototype scrolling.

### 7.2 Sample jobs (fictional data; 14 records)

Reference date for relative times: **2026-10-22**. Company names other than **Deel** and **1Password** (taken from 05/08) are invented; resemblance to real companies is accidental. Logo "yes" means use the neutral placeholder bitmap (a simple abstract mark on `logo-tile`), "no" means Monogram. `applyUrl` shapes follow 08 (`https://jobs.ashbyhq.com/{slug}/{uuid}/application`). The **source line** is `host/slug` (06 3.43); the **destination** shows the host, slug and first 8 id characters.

| ID | Company (display / slug) | Logo / tone | Title | Location; Remote? | Dept; Type | Salary (raw) → card text → screen-reader label | Posted → card text | Edge case it exercises |
|---|---|---|---|---|---|---|---|---|
| JOB-01 | Deel / `deel` | yes (sand if monogram) | Senior Frontend Engineer, Design Systems | Remote (Europe); true | Engineering; Full-time | USD 140000-180000 year → `$140k–$180k` → "140,000 to 180,000 US dollars a year" | 2026-10-19 → `Posted 3 days ago` | The canonical hero card (05 wireframes). Source `jobs.ashbyhq.com/deel`; destination `jobs.ashbyhq.com/deel/7fe8abc1…` |
| JOB-02 | 1Password / `1password` | no / teal, letter `1` | Senior Staff Backend Engineer | San Francisco, CA; false (hybrid, no badge) | Engineering; Full-time | USD 180000-240000 year → `$180k–$240k` | 2026-03-15 → `Posted Mar 15` (31-364 days, same year, no year) | Monogram with a digit; no Remote badge |
| JOB-03 | Brightwater Health / `brightwater-health` (name null → prettified) | no / rose, letter `B` | Account Executive, Mid-Market (EMEA) - Strategic Accounts, Existing Customer Expansion | Remote - Europe (CET +/- 3); true | none; none | none | none | Worst-case GraphQL record (08): no salary, no date, no dept, no type; Remote badge shown because the location text is not exactly "Remote"; 2-line title |
| JOB-04 | Kestrel Labs / `kestrel-labs` | yes | Senior Principal Machine Learning Research Engineer, Foundation Model Evaluation, Safety and Alignment (Contract-to-Hire, Hybrid, Toronto or Remote Canada) | Toronto, ON; false | Research; Contract | CAD 160000-210000 year → `CA$160k–210k` → "160,000 to 210,000 Canadian dollars a year" | 2026-10-10 → `Posted 12 days ago` | ~150-character title: 2-line clamp + ellipsis on cards, full wrap on Job detail; letter-prefix currency |
| JOB-05 | Halcyon Freight / `halcyon-freight` | yes | Customer Support Specialist, Nights | London, UK; false | Customer Support; Contract | GBP 28-35 hour → `£28–£35` + suffix ` per hour` → "28 to 35 British pounds per hour" | 2026-10-21 → `Posted yesterday` | Hourly salary; under 1,000 values with interval; "yesterday" |
| JOB-06 | Marlow & Finch / `marlow-finch` | yes | Product Designer | Berlin, Germany; false | Design; Full-time | EUR 85000-105000 year → `€85k–€105k` | 2026-10-22 → `Posted today` | Ampersand in company name; EUR; "today" |
| JOB-07 | Northlake Systems / `northlake-systems` | no / slate, letter `N` | Staff Site Reliability Engineer | Bengaluru, India; false | Engineering; Full-time | INR 4500000-6000000 year → `₹4.5M–₹6M` | 2026-09-14 → `Posted Sep 14` (38 days) | INR with M notation (06 Q-D4) |
| JOB-08 | Orchard & Pine Veterinary Collective of the Pacific Northwest / `orchard-pine-vet-collective` | no / clay, letter `O` | Veterinary Technician | Portland, OR; false | Clinical; Part-time | USD max only 95000 → `Up to $95k` | none | Very long company name (ellipsis on 1 line); only-max salary; no posted date; Part-time shown on mobile (not Full-time) |
| JOB-09 | Quill Ledger / `quill-ledger` (name null → prettified "Quill Ledger") | yes | Technical Writer, Developer Documentation | `Remote` (exactly); true | Documentation; Full-time | USD min only 120000 → `From $120k` | 2025-08-14 → `Posted Aug 14, 2025` (365+ days, year shown) | Location exactly "Remote" so the separate badge is **suppressed**; only-min salary; old date with year |
| JOB-10 | 3rd Shift Labs / `3rd-shift-labs` (prettified) | no / slate, letter `3` | Operations Associate | none (null); true | none; none | USD 45-60, interval unknown → `$45–$60` (no suffix) → "45 to 60 US dollars" | none | Remote but **no location**: Remote badge alone in the meta line; salary without interval; digit monogram |
| JOB-11 | Seaside Robotics / `seaside-robotics` | yes | Intern, Summer 2027 (Software) | none; false | none; Internship | none | none | **Minimum card**: title + company + type only (88px min-height); type shown on mobile because it is not Full-time |
| JOB-12 | Sakura Pay / `sakura-pay` | yes | Software Engineer, Payments Platform | Tokyo, Japan; false (hybrid) | Payments; Full-time | JPY 8000000-12000000 year → `¥8M–¥12M` | 2026-06-03 → `Posted Jun 3` | JPY symbol |
| JOB-13 | Alpenglow Bio / `alpenglow-bio` | no / rose, letter `A` | Research Associate, Protein Engineering | Zurich, Switzerland; false | Research; Full-time | CHF 90000-110000 year → `CHF 90k–110k` (thin space after CHF) → "90,000 to 110,000 Swiss francs a year" | 2026-10-01 → `Posted 21 days ago` | ISO-code prefix, appears once |
| JOB-14 | Cobalt Yard / `cobalt-yard` | yes | Founding Account Executive | Remote (US); true | Sales; Full-time | USD 150000-150000 year → `$150k` (min = max collapses) | 2026-10-22 (earlier today) → `Posted today` | Min equals max; Remote badge with a non-"Remote" location |

**Descriptions for Job detail frames:** use JOB-01 (full: 6 paragraphs, two h3 sub-headings "What you will do" and "What we are looking for", two bulleted lists of 5 items, one link, one `code`-free text) and JOB-04 (long: 12 paragraphs, nested list, a blockquote, a link to an external site). Write neutral invented text; no real company claims. JOB-09 uses the **Missing description** state.

### 7.3 Other mock data

| Item | Value |
|---|---|
| Dataset line | **34,035** open jobs at **1,747** companies. Updated Oct 22. |
| Filtered state | `Remote only`, `Department: Engineering`, `Posted: Last 7 days` → **1,204** jobs, 49 pages of 25 |
| Page-13 summary | Showing 301–325 of 1,204 jobs; pagination window `1 … 12 13 14 … 49` |
| Last page summary | Showing 1,201–1,204 of 1,204 jobs |
| Mega-list pagination | Last = 1,362 pages (34,035 / 25) to test slot width; Max-window note "You can browse the first 10,000 results. Narrow your search to see the rest." |
| Facets (counts) | Remote only 6,812 · Salary listed 13,890 · Posted: Any time / Last 24 hours / Last 7 days / Last 30 days · Department: Engineering 4,210; Sales 3,001; Product 1,044; Customer Support 702; Design 612; Marketing 530; Operations 498; Finance 241 · Location: San Francisco, CA 1,602; New York, NY 1,388; London, UK 1,214; Berlin, Germany 402; Toronto, ON 377; Bengaluru, India 301 · Company: Deel 27; 1Password 42; Marlow & Finch 9; Kestrel Labs 6; Cobalt Yard 4 · Employment type: Full-time 30,112; Contract 1,830; Internship 702; Part-time 640; Temporary 120 |
| Zero-result suggestions | `Remove "Remote only" to see 312 jobs`; `Remove "Department: Engineering" to see 96 jobs`; `Clear all filters` (query "rust embedded") |
| Companies directory | 1,747 companies; page 1 of 35 at 50 per page; rows: Alpenglow Bio 3 · Brightwater Health 11 · Cobalt Yard 4 · Deel 27 · Halcyon Freight 8 · Kestrel Labs 6 · Marlow & Finch 9 · Northlake Systems 14 · Orchard & Pine Veterinary Collective of the Pacific Northwest 5 · Quill Ledger 2 · Sakura Pay 7 · Seaside Robotics 1 (shows "1 open job") |
| Company page (Deel) | 27 open jobs; `jobs.ashbyhq.com/deel`; first page cards use the compact-company variant |
| Error text | per 05 section 2.4 (network, 5xx, 429 with "Please wait 8 seconds, then try again.") |
| Reference line | `Reference: 7c1e4a9b` |

---

## 8. Screen frame list (every state as its own frame)

Legend: **M** = Mobile 390, **T** = Tablet 768, **D** = Desktop 1280; **x** = build light; **x+d** = build light and `~dark`; `-` = not applicable. Unless a note says otherwise, content uses JOB-01…JOB-14 in the order of 7.2. Frame name = `{Screen}/{BP}/{ID} {State}`.

### 8.1 Browse (`/`)

| ID | State | M | T | D | Notes |
|---|---|---|---|---|---|
| B01 | Initial load: header, search enabled, filter shell, skeleton cards (min(25, page size) = 10 drawn), summary "Loading jobs…" | x+d | x | x+d | Skeleton 112px cards; facet groups show 3 skeleton rows |
| B02 | Results, page 1, no filters (dataset line visible, JOB-01…JOB-14 then repeat) | x+d | x+d | x+d | The reference frame for all three breakpoints |
| B03 | Results with 3 active filters (chips + Clear all; dataset line hidden; summary "Showing 1–25 of 1,204 jobs") | x | x | x+d | Sticky toolbar frame on mobile (see B03b) |
| B03b | Mobile sticky toolbar stuck (scrolled 600px; toolbar fill surface-1 + bottom stroke) | x | - | - | |
| B04 | Page 13 of 49 (pagination window, summary "Showing 301–325 …", results heading visible with ring) | x | x | x | Also D variant with last = 1,362 (wide slots) |
| B05 | Last page, partial summary ("Showing 1,201–1,204 of 1,204 jobs"), Next disabled | x | - | x | |
| B06 | Page change loading: old list at 60% opacity (≤100ms state) and then skeleton | x | - | x | Two frames: `B06a dim`, `B06b skeleton` |
| B07 | Zero results with query: "rust embedded", chips, removal suggestions, Clear all | x+d | x | x+d | EmptyState FilteredWithQuery; Sort disabled |
| B08 | Zero results, filters only (no query) | x | - | x | EmptyState FilteredNoQuery |
| B09 | Empty database ("No jobs to show right now") | - | - | x | Unfiltered |
| B10 | Error, first load, network: skeleton gone, InlineError Network, filters usable | x+d | x | x+d | `role=alert` annotation |
| B11 | Error, 5xx on page change: previous results above, InlineError Server below | - | - | x | |
| B12 | Error, 429 with wait copy | x | - | x | |
| B13 | Page-change error inline "Could not load page 4." with Try again | x | - | x | Previous page remains |
| B14 | Invalid parameters Notice above toolbar (dismissible) | x | - | x | "Some filters in this link were not recognised and were ignored." |
| B15 | Many chips: 6 shown + "+3 more" collapsed; B15b expanded | x | - | x | |
| B16 | Search suggestions open: groups Companies/Departments/Locations, last row `Search for "data engineer"`; B16b active option with inset ring | x | x | x+d | Popup 360 max height |
| B17 | Slow network: skeleton + "Still loading. This is taking longer than usual." | x | - | x | |
| B18 | Offline: Notice Warning "You appear to be offline." + InlineError Network | x | - | x | |
| B19a | Filters UI – mobile full-screen dialog: default (no selection) | x+d | - | - | "Show 34,035 jobs" |
| B19b | Filters dialog with selection: Department group open with 2 checked, live count "Show 1,204 jobs" | x | - | - | |
| B19c | Filters dialog zero match: button disabled "No jobs match" | x | - | - | |
| B19d | Filters dialog loading skeleton; B19e facet search active ("data") with empty result message | x | - | - | |
| B19f | Filters – tablet drawer 360 over scrim | - | x+d | - | Same content as B19b |
| B19g | Filters – desktop sidebar: ready (groups open as 06 3.10) | - | - | x+d | |
| B19h | Sidebar: Show more expanded (30 companies), search field, active count tags | - | - | x | |
| B19i | Sidebar loading skeleton | - | - | x | |
| B19j | Sidebar error (compact InlineError) | - | - | x | |
| B20 | Partial-data stress page: JOB-03, 08, 09, 10, 11 together (omission rules, monograms, long company name, suppressed Remote badge, minimum card) | x | x | x | Names the rule beside each card via NOTE annotations |
| B21 | Long titles + max-window note: JOB-04 at the top; pagination limited to 400 pages; note under the control | x | - | x | |
| B22 | Keyboard focus set (annotated, not interactive): `B22a` skip links visible; `B22b` card focus; `B22c` returned-to card after Back; `B22d` chip focus; `B22e` pagination slot focus; `B22f` search focus; `B22g` dialog close focus | x | - | x | Each is a crop-framed copy at 1:1 |
| B23 | JS-disabled variant: form-based facets with visible "Apply filters" button; Notice "This site needs JavaScript…" on a client-only variant | - | - | x | Annotated as conditional (05 section 1.7) |
| B24 | Print preview of the current page (cards as plain list) | - | - | x (print size) | Print frame 794x1123 |

### 8.2 Job detail (`/jobs/{id}/{slug}`)

| ID | State | M | T | D | Notes |
|---|---|---|---|---|---|
| J01 | Loaded, full (JOB-01 with full description) | x+d | x+d | x+d | D: main 832 + aside 320 |
| J01b | Mobile: sticky Apply bar visible (scrolled past the main button); J01c bar hidden (top of page) | x | - | - | |
| J02 | Skeleton (title 2 bars, 3 fact bars, disabled Apply block, 6 description lines) | x | x | x | |
| J03 | Partial: minimum data (JOB-11 with company monogram, no salary, no location, no date) | x | - | x | |
| J04 | Missing description (JOB-09) | x | - | x | "Quill Ledger has not shared the full description…" |
| J05 | Long title + long description with sub-headings, nested list, quote, link (JOB-04) | x | x | x | Title wraps fully, no clamp |
| J06 | Expired job | x+d | - | x+d | No Apply, "More jobs at Deel" + "Browse all jobs" |
| J07 | Not found (unknown id) | x | - | x | |
| J08 | Error inline (Network) and J08b slow ("Still loading") | x | - | x | Back link and header remain |
| J09 | Variants of pay: hourly (JOB-05), CAD (JOB-04), min=max (JOB-14), INR (JOB-07) shown as four small crops on one board | - | - | x | Board, not a screen |
| J10 | Apply link fallback ("View on Ashby") and "Application link unavailable" | x | - | x | |
| J11 | Keyboard focus on the Apply button (ring offset 2) and on Company link; Esc/skip annotations | x | - | x | |
| J12 | Print layout (Apply replaced by "Apply at: https://jobs.ashbyhq.com/deel/7fe8abc1-…/application") | - | - | print | |

### 8.3 Company page (`/companies/{slug}`)

| ID | State | M | T | D | Notes |
|---|---|---|---|---|---|
| C01 | Loaded (Deel, 27 jobs, compact-company cards, filter sidebar without Company group) | x+d | x | x+d | Pagination 1-2 |
| C02 | Skeleton (header + list) | x | - | x | |
| C03 | Company known, zero open jobs ("Deel has no open jobs right now." + Browse all jobs) | x | - | x | |
| C04 | Company not found (404 variant) | x | - | x | |
| C05 | Filtered zero results on a company | - | - | x | Standard recovery pattern |
| C06 | No logo: monogram at 64 (Quill Ledger) | x | - | x | |
| C07 | Error inline | x | - | x | |

### 8.4 Companies directory (`/companies`) and static pages

| ID | State | M | T | D | Notes |
|---|---|---|---|---|---|
| K01 | Results, 50 per page, two columns on T/D | x | x+d | x+d | |
| K02 | Skeleton rows | x | - | x | |
| K03 | Zero results `No companies match "xyz"` + Clear search | x | - | x | |
| K04 | Error inline | - | - | x | |
| S01 | About (65ch column, all sections) | x+d | x | x+d | |
| S02 | Privacy with "The short version" block | x | x | x+d | |
| N01 | 404 `Page not found` with search + links | x | x | x+d | |
| E01 | Error page `Something went wrong`; E02 offline variant; E03 repeated failure; E04 with Reference line | x | - | x+d | |

### 8.5 Component and foundation boards (page `10` and `20`)

Not screens, but required frames: **F01** colour boards (Light and Dark, each token with hex, OKLCH and the contrast matrix of 06 2.1.1), **F02** type specimen (every style, with the tabular-figures demonstration "1,111 / 8,888" aligned), **F03** spacing/radius/elevation sheet, **F04** grids overlay on a blank frame per breakpoint, **F05** icon sheet, **F06** logo + monogram sheet (6 tones x light/dark, sizes 24-64), **F07** motion table, and one **state matrix board per component set** (every variant, all states, light and dark rows).

---

## 9. Prototype interaction maps

Flows live on page `50 Prototype`. Use **frame-level flow starting points** named `P1`…`P9`. Triggers are on layers named exactly as listed. Default transition: **Instant** unless stated. **Smart animate** settings: easing **Custom bezier 0.25, 1, 0.5, 1** (ease-out), duration **200ms** for open (drawer/dialog/sticky bar), **150ms** for close, **120ms** for hover/press variant swaps, **80ms** for pressed. Interactive-component hover uses `While hovering` → variant `State=Hover` (Smart animate 120ms ease-out), `While pressing` → `State=Pressed` (80ms). A Reduced-motion toggle is not prototypable; show the reduced behaviour as a separate annotated frame pair (`P0 reduced-motion note`).

| Flow | Start frame | Trigger (layer) | Action | Destination | Animation |
|---|---|---|---|---|---|
| **P1 First visit to Apply** | `Browse/M390/B02` | On click `Search/Field` | Change to | `Browse/M390/B16 Suggestions open` | Smart animate 120ms |
| | `B16` | On click option "Deel" (or keyboard `Enter` via Key trigger) | Navigate to | `Browse/M390/B03 Results – filters active` (chip "Search: deel" substitution) | Instant |
| | `B03` | On click card `JOB-01` | Navigate to | `Job/M390/J01 Loaded` | Smart animate 200ms ease-out (slide-in from right not used: instant on reduced) |
| | `J01` | On click `ApplyButton` | Navigate to | `Ashby (external)` stub frame (390x844, grey placeholder with the text "External: jobs.ashbyhq.com/deel/7fe8abc1…", no UI) | Instant; annotation "opens in a new tab" |
| **P2 Filter via mobile dialog** | `B02 M` | On click `Filters` button | Open overlay | `B19a` (overlay position: manually 0,0; close when clicking outside = off) | Smart animate 200ms ease-out, move in from left 24px + fade |
| | `B19a` | On click `Department` group header | Change to | `B19b` | Smart animate 120ms |
| | `B19b` | On click "Show 1,204 jobs" | Close overlay then navigate | `B03 M` | 150ms |
| | `B19b` | Key `Escape` | Close overlay | `B02 M` | 150ms |
| **P3 Desktop sidebar and chips** | `Browse/D1280/B02` | On click `Remote only` switch | Change to (variant On) | `B03 D` via Navigate | Smart animate 120ms |
| | `B03 D` | On click chip `Department: Engineering` | Change to (Removing) then Navigate | `B02 D` (chip removed, count 3,412) | Chip fades 120ms |
| **P4 Pagination** | `B04 D` | On click `Next` | Navigate | `B04b` page 14 (duplicate with Current=14) | Instant; focus-ring on results heading annotated |
| | `B04 D` | Key `Enter` in `Go to page` | Navigate | page 40 duplicate | Instant |
| **P5 Zero results recovery** | `B07 D` | On click suggestion "Remove "Remote only" to see 312 jobs" | Navigate | `B03 D` | Instant |
| | `B07 D` | On click "Clear all filters" | Navigate | `B02 D` | Instant |
| **P6 Back to results** | `J01 D` | On click `BackLink` | Navigate back | `B22c` (card with returned-to ring) | Instant |
| **P7 Error → retry** | `B10 M` | On click "Try again" | Change to (Retrying) → After delay 600ms → Navigate | `B02 M` | 120ms |
| **P8 Theme cycle** | any `D` frame | On click `ThemeToggle` | Conditional on a local string variable `theme`: if "system" set `theme` = "light" and **Set variable mode** `Semantic`=Light, `Type`=Light; else if "light" set "dark" and mode Dark; else set "system" and mode Light (system is shown as Light in the prototype) | same frame | Instant |
| **P9 Sticky Apply bar** | `J01c M` (bar hidden) | After delay / On drag (scroll) simulated: On click on the `Scroll` hint area | Navigate (Smart animate) | `J01b M` (bar visible) | 200ms ease-out; reduced-motion note: instant |

Use **Flow starting point** names exactly `P1 First visit to Apply` … `P9 Sticky Apply bar`. Interactive component states (hover, press, focus) are also wired inside each component set so any instance behaves correctly in Present mode, with the exception of `Focus` (not triggerable without a keyboard; use `Key/Gamepad` trigger `Tab` on a hidden hotspot to step through `Focus` variants in the order of section 10).

---

## 10. Annotation conventions and accessibility annotations

### 10.1 Layers and colours (annotations never ship; they are not part of the product palette)

| Layer prefix | Colour | Meaning |
|---|---|---|
| `A11Y:` | `#d6336c` (annotation red-pink) | Landmarks, headings, focus order, names, live-region text, target-size overlays |
| `SPEC:` | `#e8590c` (orange) | Redlines: spacing, sizes, token names |
| `NOTE:` | `#0b7285` (teal) | Behaviour or content rules |
| `DATA:` | `#495057` (grey) | Sample-data provenance notes |

All annotation frames are inside the `_ann` group, locked, with a toggle component `Component/AnnotationToggle` (a single layer visibility switch) so Dev Mode and review can hide them. Use Figma's native **annotations/measurements** in Dev Mode for redlines where possible.

### 10.2 Per-screen accessibility annotations (apply to every `D1280` frame and the mobile frames of Browse, Job detail)

1. **Landmarks overlay:** dashed rectangles labelled `banner`, `navigation "Primary"`, `search "Job search"`, `main`, `navigation "Pagination"`, `contentinfo` (Browse); `banner`, `navigation`, `main` > `article`, `navigation "Breadcrumb"`, `contentinfo` (Job detail). Landmark names exactly as 05 section 2.6 / 3.7.
2. **Heading outline:** small numbered badges `h1`, `h2`, `h3` on each heading; Browse: h1 Jobs; h2 Filters; h2 "Results, page N of M" (focus target); h3 per card. Job detail: h1 title; h2 About the role; h2 More at company; description headings demoted below h2.
3. **Focus order:** numbered circles (`A11Y:` colour) 1…n in this exact Browse order: skip links → site name → primary nav → theme toggle → search input → Search button → (below desktop) Filters button → (desktop) filter groups → chips → Clear all → Copy link → Sort → cards (one stop each) → pagination → page-size select → footer. Job detail order: skip link → site/nav/theme → breadcrumb/back → company link → Apply button → description links → company strip → (mobile) sticky Apply bar → footer. Company page: as Browse minus Company group; plus "View all on Ashby" after the header.
4. **Accessible names:** a tag on each non-obvious control: theme toggle "Theme: system. Change theme"; chips "Department: Engineering. Remove filter."; pagination "Page 13, current page"; Apply "Apply on Deel (opens in a new tab)"; card link text = title with description "Deel, Remote Europe, 140,000 to 180,000 US dollars, Posted 3 days ago".
5. **Live-region text:** one `Component/LiveRegion` annotation per frame whose state changes content, with the exact message (05 section 2.6), e.g. `1,204 jobs found.`, `Page 13 of 49. Showing 301–325 of 1,204 jobs.`, `Sorted by Highest salary. 1,204 jobs found.`, `Department: Engineering removed. 3,412 jobs found.`, `Link copied.`, `No jobs found.`
6. **Target-size overlays** (toggleable): translucent 44x44 squares over every touch control on mobile frames; any control under 44 shows the extended hit area and the 24px AA minimum check.
7. **Contrast badges:** on Foundations only (not on screens): the pairs from 06 2.1.1.
8. **Reading order:** an arrow path on the Job detail desktop frame showing DOM order (main before aside) even though the aside appears visually on the right.
9. **Reduced-motion / forced-colors notes:** one `NOTE:` each on the components that animate or carry state by colour.

---

## 11. Developer handoff (Dev Mode)

- **Statuses:** mark each section "Ready for dev" only after the QA checklist (section 12) passes for it; keep a `90 Handoff & Changelog` board with columns Component · Figma name · Code name · Status · Last changed.
- **Variable/CSS map:** Dev Mode shows variable names; the developer maps `color/bg/ground` → `--color-ground`, etc. (the full table is in 06 section 5 and the Semantic table in 3.2 lists both names side by side). Spacing `space/4` → Tailwind `p-4`. Radius `radius/control` → `rounded-control`. Text styles `type/card-title` → utility `text-card-title`.
- **Component → code names** (from 05 section 11): `Component/Button` → `Button`; `Component/IconButton` → `Button` with `size="icon"`; `Component/SiteHeader` → `SiteHeader`; `Component/Search/*` → `SearchCombobox`; `Component/Facet/Group` → `FacetGroup`; `Component/Facet/Option` → `FacetOption`; `Component/Facet/Switch` → `ToggleSwitch`; `Component/Chip` → `FilterChip`; `Component/ChipBar` → `ChipBar`; `Component/Results/Toolbar` → `ResultsToolbar`; `Component/Select` → `SortSelect` / `PageSizeSelect`; `Component/JobCard` → `JobCard`; `Component/JobCard/Skeleton` → `JobCardSkeleton`; `Component/Logo` → `CompanyLogo`; `Component/Salary` → `SalaryText`; `Component/Posted` → `PostedAge`; `Component/Pagination/*` → `Pagination`; `Component/Notice` → `Notice`; `Component/EmptyState` → `EmptyState`; `Component/InlineError` → `InlineError`; `Component/PageError` → `FullPageError` / `NotFound`; `Component/ApplyBlock` → `ApplyButton` + `TrustNote`; `Component/StickyApplyBar` → `StickyApplyBar`; `Component/Description` → `DescriptionBlock`; `Component/CompanyHeader` → `CompanyHeader`; `Component/CompanyRow` → `CompanyRow`; `Component/SourceLine` → `SourceLine`.
- **Code Connect:** map each published component to its React file once it exists (name only; set up when the implementation lands). Add `Dev Resources` links on the top-level frames: the relevant sections of 04, 05, 06.
- **Redlines the developer must not guess:** all values come from variables and styles. Where a spec is a formula (pagination slot width, card heights, fluid h1) the value is written in the annotation, not left to eyeballing.
- **Exports:** icons via the Lucide package, not exported from Figma. The **Mark** exports as SVG (viewBox 22x22). No raster exports other than the cover. Monogram tiles are generated in code from the hash, not exported.
- **Behaviours Figma cannot show** (documented in `NOTE:` annotations): hover/press timing (`dur-*` tokens), the 100ms skeleton delay, focus management after page change, scroll restoration, `inert` background, `content-visibility`.
- **Fonts:** Geist and Geist Mono (Google Fonts). The developer self-hosts via `next/font` (06 section 2.2); do not link Google Fonts from the product.

---

## 12. QA checklist for the finished file

**Variables and styles**
- [ ] No raw hex, no raw numbers for spacing/radius on any component or screen (select all → "Find unbound values" plugin or Dev Mode check shows none).
- [ ] Every Semantic colour has Light and Dark aliases; flipping a frame to `Dark` produces a coherent screen with no light-theme leftovers (white fills, black text).
- [ ] Text styles: exactly the 17 roles of 4.1 (`read-title` in four sizes, plus tabular-figure duplicates of `ui` and `caption`), no ad-hoc text; tabular figures on salary, counts, dates, page numbers.
- [ ] Effects only on `Popover`, `Drawer`, `StickyApplyBar`; no shadow on any resting surface.

**Components**
- [ ] Every component set in 6 exists with the exact property names/values; booleans work; instance-swap defaults set; no detached instances on screens.
- [ ] Each interactive set has Default, Hover, Focus, Pressed, Disabled (and Busy for Button); Focus shows a 2px ring at 2px offset (inset variant on rows).
- [ ] Auto Layout everywhere; hug/fill/fixed as specified; no manual positioning except annotated absolute layers.
- [ ] JobCard heights measure 88 (min), 102, 124 (desktop) and ≤148 (mobile) with the sample data; skeleton card is exactly 112.
- [ ] Pagination: all four windows (Short, Start, Middle, End) correct; seven slots, equal width; wide-slot variant for "1,362".
- [ ] Salary strings match 7.2 exactly (en dash, symbol rule, thin space after ISO code, `per hour` suffix grey).

**Screens**
- [ ] Every frame in section 8 exists with its stated ID and name; Dark frames only where marked and named `~dark`.
- [ ] Mobile, tablet, desktop frames use the correct layout grid and `Size & Layout` mode; 1280 container is 1200 centred; Browse split is 280 + 40 + 880.
- [ ] No horizontal overflow at 320; no clipped text at 400% (text-spacing sanity: card grows, never clips).
- [ ] The first card on `Browse/M390/B02` starts above y = 506 when no chips are active.
- [ ] The source line is visible on every ≥640 card and in every Apply block; destination line wraps without truncation.
- [ ] Omission rules: no "N/A", dashes, empty separators or empty boxes on any partial-data card (B20).

**Accessibility**
- [ ] All text/UI pairs in the screens equal the verified pairs (use only Semantic variables); run a contrast plugin on every frame; zero fails in Light and Dark.
- [ ] Touch controls are ≥44px (or have the annotated extended hit area); all controls ≥24px.
- [ ] Focus order, landmark and heading annotations present on all Browse and Job detail frames.
- [ ] State is never colour-only (Remote = text; switch has check glyph; current page filled + `aria-current` note; link copied has text).
- [ ] No emoji, no gradients, no glow/glass, no icon-in-coloured-box, no eyebrow labels, no violet/indigo anywhere (search the file for fills outside `Semantic`).

**Prototype**
- [ ] P1-P9 flows play from their starting points; transitions use the stated easing and durations; Back/Escape behave as in 9.
- [ ] Interactive components respond in Present mode (hover/press); the external stub frame is unmistakably non-product.

**Handoff**
- [ ] `90 Handoff & Changelog` complete; version named `v1.0`; all sections "Ready for dev" or flagged with an open question.

---

## 13. Recommended plugins and libraries (names only; confirm availability before relying on them)

- **Lucide Icons** (community library file) for the icon set.
- **Stark** and **A11y – Color Contrast Checker** for contrast; **Able** (colour-blind simulation); **A11y – Focus Orderer** for focus order annotations.
- **Tokens Studio for Figma** (optional round-trip of the token JSON) or **Variables Import/Export** (export the five collections to JSON for the developer).
- **Find and Replace / Find unbound values** style plugins for the raw-value audit; **Batch Styler** for style migration.
- **Content Reel** (or similar) for the sample text; **Autoflow**-style connectors only for flow documentation on page 50.
- **Figma Code Connect** and the **Dev Mode / Figma MCP server** for agent-assisted handoff.
- Library discipline: publish the file as a **team library** only after v1.0; consumers should use the published variables, not copies.

---

## 14. Designer prompt (paste into a Figma-capable agent)

```text
You are building the Figma file for a public, read-only job board ("Openings" placeholder name). Follow these three documents exactly:
documentation/frontend-design/05-screens-and-states.md (screens, states, copy, component inventory),
documentation/frontend-design/06-visual-direction-and-design-system.md (tokens, type, components),
documentation/frontend-design/07-figma-build-spec.md (this file: structure, variables, component sets, frames, prototype, QA).
Design only: no application code.

1. Create one file with pages 00 Cover, 10 Foundations, 20 Components, 30 Patterns, 40 Screens – Mobile 390, 41 Screens – Tablet 768,
   42 Screens – Desktop 1280, 50 Prototype, 90 Handoff & Changelog, 99 Archive.
2. Create variable collections Primitives (1 mode), Semantic (Light, Dark), Spacing, Radius, Size & Layout (Mobile, Tablet, Desktop), Type (Light, Dark)
   with every variable and value from 07 section 3. Colours come from 06 section 2.1 hex values; Semantic aliases Primitives. Create the text,
   effect and grid styles from 07 section 4. Font: Geist (and Geist Mono for source/destination lines). Icons: Lucide, stroke 1.5.
3. Build every component set in 07 section 6 with the exact variant, boolean, text and instance-swap properties, Auto Layout rules and all states
   (Default, Hover, Focus with a 2px ring at 2px offset, Pressed, Disabled; Busy on Button). Bind everything to variables/styles; no raw hex.
4. Build all frames in 07 section 8 at 390x844, 768x1024, 1280x800 (plus 320, 1024, 1440 where listed) using layout grids from 07 section 7.1 and
   the realistic sample data in 07 section 7.2 (14 jobs including long title, no salary, no logo, no posted date, non-USD, Remote variants).
   Each state is its own frame named {Screen}/{BP}/{ID} {State}; dark frames set Semantic=Dark and carry the suffix ~dark.
5. Visual rules (non-negotiable): ink on cool white; near-black primary button; the single blue (#1d5fbf light, #7ea9f0 dark) only on the salary figure, text links and focus ring;
   one white list sheet with 1px row rules (not stacked cards); no gradients, glows, glass, shadows on resting surfaces, emoji, illustrations, eyebrow labels, violet/indigo;
   every job row shows a quiet monospace source line like jobs.ashbyhq.com/deel; Apply shows the destination line under the button.
6. Wire the prototype flows P1-P9 (07 section 9) with Smart animate, ease-out cubic-bezier(0.25,1,0.5,1), 200ms open / 150ms close / 120ms hover.
7. Add accessibility annotations (landmarks, heading outline, focus order, accessible names, live-region messages, 44px target overlays) per 07 section 10.
8. Run the QA checklist in 07 section 12 and report failures instead of hiding them. If a value is missing, use 06 as the source of truth and note the gap in 90 Handoff & Changelog.
```

---

## 15. Open questions for the Figma build

- **Q-F1** Does the Figma workspace have Geist and Geist Mono available (Google Fonts are in Figma by default)? If `tnum` cannot be toggled for Geist in Figma, document the tabular look manually and verify in the browser (06 Q-D2).
- **Q-F2** The product name for the wordmark (06 Q-D1). The spec builds with the placeholder "Openings"; the Cover and Header instances are the only places to change.
- **Q-F3** Whether the owner wants a separate "Compact density" component set in v1 (06 section 2.9 says no).
- **Q-F4** Whether to publish the file as a team library at v1.0 or keep it a single file until the implementation lands.
