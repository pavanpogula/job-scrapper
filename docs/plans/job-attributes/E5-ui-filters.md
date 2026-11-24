# E5 — Experience and Security clearance filters in the UI (Antigravity prompt)

> Owner: only after E4 is merged **and the backend is deployed** (which per `00-PLAN.md` happens only after the backfill
> has processed every active job), paste "Read docs/plans/job-attributes/E5-ui-filters.md and implement it exactly."
> into a fresh session. Background: `docs/plans/job-attributes/DESIGN.md` (§6.4, §6.5), `00-PLAN.md` (including
> §"Amendments from plan writing", which supersede DESIGN) and `E4-api-filters.md` (Task 7 = the frontend contract minimum).

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to carry out this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

You are working in the Ashby Job Scraper monorepo (product: B.O.O.L.E.A.N). Implement ONE PR: two new job filters,
**Experience** (multi-select) and **Security clearance** (single-select), plus a `Clearance required` badge and an
`<N>+ yrs` chip on job cards and job detail. Frontend only. Squash-merge. Follow AGENTS.md, CLAUDE.md,
docs/agents/context.md and every rule in docs/agents/rules/ (frontend-invariants, frontend-design, api-contract-sync).
Role: `frontend` (`.claude/agents/frontend.md`).

**Goal:** a user can narrow `/` by required years of experience and by clearance, from the desktop pills and the
mobile drawer, with counts, shareable URLs and a working "Clear all".

**Architecture:** the existing flow is reused end to end. URL search params are the source of truth
(`useJobFilters.ts`), copied into the Redux `filters` slice (`filterSlice.ts`), passed as-is to RTK Query
`getJobs` (`jobsApi.ts`), and rendered by `JobFiltersBar.tsx`. Two fields are added to each of those layers, plus one
small badge component. No new library. The DTO fields, facet types, contract key lists and typed mocks already exist
from E4 Task 7.

**Tech stack:** React 19, TypeScript, Vite, Redux Toolkit / RTK Query, MUI 9, Vitest + React Testing Library + MSW.

**Spec:** `docs/plans/job-attributes/DESIGN.md` §6.5 (UI), §6.4 (API semantics); shared names in `00-PLAN.md`
§"Shared interfaces" → "API (E4)" / "UI (E5)" and §"Amendments" (bucket API value `10plus`, clearance facet
`{ required, exclude }`).

## WHY
The owner asked for "experience and security required" filters. E1–E3 fill `experienceMinYears` / `clearanceRequired`,
E4 exposes them as DTO fields, `/v1/jobs?experience=…&clearance=…` and facet counts. Nothing in the UI uses them yet.

## HARD RULES (non-negotiable)
- Never read, print, stage or commit `.env*`, `apikeys/`, `backend/apikeys/`, `output/`, `backend/output/`, `.vercel/`.
- Agents never push to `main`/`master`, never merge, never force-push, push tags or delete branches, and never run raw
  `git push` or `gh`. Publish only with `scripts/agents/push-branch.sh`. The owner reviews and merges.
- Never connect to production (no API calls, DB or Redis); no scrapes, publishes or deploys. Tests never call the
  network (MSW only).
- **Frontend only.** No change under `backend/`. Do not redeclare what E4 Task 7 added to `frontend/src/types/api.ts`,
  `contract.test.ts` or the typed mocks; if any of it is missing, STOP and tell the owner (E4 is incomplete).
- MUI 9 only (no Tailwind). No new `any` (`frontend/scripts/any-ratchet.mjs` runs in `check`). No existing test
  weakened; existing selectors change only where markup changed, and the PR body says which.
- Copy is fixed by `00-PLAN.md` and must be used **exactly** (note the en dash `–`, U+2013):
  Experience labels `0–2 yrs`, `3–5 yrs`, `6–9 yrs`, `10+ yrs`, `Not specified` ↔ API values `0-2`, `3-5`, `6-9`,
  `10plus`, `unspecified` (ASCII hyphen; `10plus` per 00-PLAN Amendments — the label keeps `10+ yrs`).
  Clearance labels `Any`, `Required`, `Exclude` ↔ none / `required` / `exclude`.
  Badge text `Clearance required`. Chip text `<N>+ yrs`.
- URL params mirror the API names and values: `experience` (comma list, canonical order) and `clearance`.
- Badges render **nothing** when the value is `null` (unprocessed job). `clearanceRequired === false` renders nothing.
- Never stage `.impeccable/`.

## PRECONDITION (check all; otherwise STOP and tell the owner)
1. `origin/main` contains E4: `backend/src/api/types.ts` has `experienceMinYears` and `clearanceRequired` on the job
   DTOs and `experience` / `clearance` on the facets DTO (`git grep -n "clearanceRequired" origin/main -- backend/src/api/types.ts`).
2. E4 Task 7 is present on `origin/main`: `frontend/src/types/api.ts` exports `ExperienceBucket` (union with `10plus`),
   `JobListItem` has `experienceMinYears` / `clearanceRequired`, `FacetsData` has optional `experience?` /
   `clearance?: { required; exclude }`; the contract fixtures (`jobs.default.json`, `job-detail.found.json`,
   `facets.default.json`, `jobs.attributes.json`) contain those keys; `npm --prefix frontend run check` is green on main.
3. **Owner-run check (the agent does not call production):** the owner confirms they ran **Deploy to Vercel**
   `app=backend` with E4 and that the live `GET /v1/facets` returns an `experience` object.
4. The owner confirms the backfill finished (`docs/plans/job-attributes/DESIGN.md` §9 rollout order).
5. Branch from fresh `origin/main`: `feat/ja-5-ui-filters`.

## How filters work today (verified, cite these when you edit)
Line numbers are from before E4; E4 Task 7 adds a few lines to `types/api.ts`, `contract.test.ts` and `mockData.ts`.

| Layer | File:line | Behaviour |
|---|---|---|
| Types | `frontend/src/types/api.ts:10-12` | `JOB_SOURCES` / `FILTER_SOURCES` constants mirror the backend registry; the new bucket constant follows this pattern |
| Types | `frontend/src/types/api.ts:73-101`, `:103-114` | `JobListItem`; `JobDetail` extends it via `Omit`, so the E4 fields reach detail too |
| Types | `frontend/src/types/api.ts:121-128` | `FacetsData` (`sources?` optional; E4 adds optional `experience?`, `clearance?`) |
| Types | `frontend/src/types/api.ts:159-175` | `JobsQueryParams` = Redux filter state = RTK `getJobs` arg |
| Slice | `frontend/src/store/slices/filterSlice.ts:4-20` | `initialState`; `:82-84` `resetFilters` returns it; `:85-87` `syncFromUrl` merges a partial |
| URL → state | `frontend/src/hooks/useJobFilters.ts:37-71` | parses every param, drops invalid values (`source` `:38-41`, `postedWithin` `:47-48`), dispatches `syncFromUrl` |
| State → URL | `frontend/src/hooks/useJobFilters.ts:94-119` | `updateUrl` merges, writes only non-default params, `setSearchParams` |
| Clear all | `frontend/src/hooks/useJobFilters.ts:121-124` | `resetFilters()` + empty search params |
| Request | `frontend/src/store/api/jobsApi.ts:32-45` | `buildJobsQueryParams` sorts keys and appends every value that is not `undefined/null/''/false` via `String(value)`; **an empty array `[]` is not `''`, so it would be sent as `experience=`** — must be guarded |
| Request | `frontend/src/store/api/jobsApi.ts:57-61`, `:69-73` | `getJobs(filters)`; `getFacets()` takes no args (facet counts are global, not narrowed by other filters; E4 D3) |
| Page | `frontend/src/pages/BrowsePage.tsx:30-34`, `:81-86` | wires hook → queries → `JobFiltersBar` |
| Desktop pills | `frontend/src/components/jobs/JobFiltersBar.tsx:200-260` (Date posted pill + `Menu`), `:379-419` (Source pill built from `FILTER_SOURCES` + `SOURCE_LABELS`) | active pill = filled `primary` with `onDelete` (this **is** the active-filter chip; there is no separate chip row) |
| Active count / Clear all | `frontend/src/components/jobs/JobFiltersBar.tsx:80-90`, `:494-508` | "Clear all" shows only when `activeFilterCount > 0`; also drives the mobile badge `:190` |
| Mobile drawer | `frontend/src/components/jobs/JobFiltersBar.tsx:512-677` | bottom-sheet `Drawer`; one `FormControl`+`InputLabel`+`Select` per filter (`:559-579` Source); "Clear All" `:657-667` |
| Facet counts | — | **No existing filter displays a count** (country options `:154-158` show names only). E5 introduces counts; keep them secondary text, tabular numerals |
| Card | `frontend/src/components/jobs/JobCard.tsx:174-205` | meta row: salary, freshness `<time>`, `SourceBadge` |
| Detail | `frontend/src/components/jobs/JobDetailPanel.tsx:221-243` | outlined `Chip size="small"` row (workplace, employment, Active/Closed) |
| Badge pattern | `frontend/src/components/common/SourceBadge.tsx:22-47` | quiet span: `text.secondary`, 4px radius, `divider` border, inline rgba tint (`:37-38`), `0.7rem` small |
| Labels | `frontend/src/lib/labels.ts:11-23` | one label map per enum (`SOURCE_LABELS`) — rule `frontend-invariants.md` #5 |
| Card reuse | `JobList.tsx:9`, `DepartmentGroups.tsx:32`, `JobDetailPage.tsx:18` | all render `JobCard`, so the card badges appear on `/`, company Jobs tab and "More jobs at" without extra work |
| Mocks | `frontend/src/mocks/mockData.ts:325-359` (`MOCK_FACETS`, gets `experience`/`clearance` in E4) | used by `sourceBadge.test.tsx` |
| Tests | `frontend/src/test/twoPaneAndFilters.test.tsx:20-118` | MSW + `capturedRequests` + `LocationRecorder` + `renderBrowseAt(url)` harness to copy |
| Tests | `frontend/src/test/sourceBadge.test.tsx:239-341` | desktop menu / mobile `Select` (matchMedia override for 390px, `:271-315`) harness to copy |
| Tests | `frontend/src/test/contract.test.ts:61-158` | exact key sets (E4 adds the new keys) |
| Tests | `frontend/src/test/defaultQuery.test.ts:6-10` | default query string must stay exactly `page=1&pageSize=25&sortBy=publishedAt&sortOrder=desc` |

## Global constraints (every task)
- JSDoc `@file` / `@summary` / `@tags` on every new file and every new exported function/component.
- One label map per enum in `lib/labels.ts`; components never hard-code bucket labels (`frontend-invariants.md` #5 spirit).
- Accessibility: every control has an accessible name; menus are keyboard-operable (Enter/Space toggles, Esc closes,
  focus returns to the pill — MUI `Menu` default); multi-select items use `role="menuitemcheckbox"` with
  `aria-checked`; counts are part of the accessible name; WCAG AA contrast in light and dark.
- Canonical experience order everywhere (state, URL, request, mobile `Select` value): the order of `EXPERIENCE_BUCKETS`.
- Parsing matches the backend (E4 D4, `lib/attrFilters.ts`): split on `,`, trim, lower-case, keep only known values,
  de-duplicate, canonical order; clearance trimmed and lower-cased.

## Review focus (failure modes most likely to bite; each has a test below)
1. Hand-typed `?experience=10+` (old-style value; `+` decodes to a space) → ignored, same as the API (E4 `parseExperienceParam('10+')` → `[]`) (Task 1 `drops 10+ typed with a literal plus`).
2. Empty selection sends `experience=` and changes the default query/cache key → must not (Task 2 `omits empty experience and empty clearance`).
3. Selecting buckets in a different order creates a different URL/RTK cache entry → canonical order (Task 1 `serializes in canonical order`, Task 3 multi-select test).
4. Unprocessed job (`null`) or `clearanceRequired: false` shows a badge → must show nothing (Task 4).
5. Facets body without the new keys (old cache generation) crashes the filter bar → counts hidden, filters still work (Task 3 `renders without experience facets`).

---

### Task 1: Bucket constant, labels and parse/serialize helpers

**Files:**
- Modify: `frontend/src/types/api.ts` (next to `FILTER_SOURCES`, `:10-12`; E4's `ExperienceBucket` union; `JobsQueryParams` `:159-175`)
- Modify: `frontend/src/lib/labels.ts`
- Create: `frontend/src/test/jobAttributes.test.ts`

**Interfaces — Consumes (present from E4 Task 7, verify, do not redeclare):**
`JobListItem.experienceMinYears: number | null`, `JobListItem.clearanceRequired: boolean | null`,
`FacetsData.experience?: Record<ExperienceBucket, number>`, `FacetsData.clearance?: { required: number; exclude: number }`.

**Interfaces — Produces:**
```ts
// types/api.ts — add the constant and replace E4's literal union IN PLACE (same exported name, same members)
export const EXPERIENCE_BUCKETS = ['0-2', '3-5', '6-9', '10plus', 'unspecified'] as const;
export type ExperienceBucket = (typeof EXPERIENCE_BUCKETS)[number];
export const CLEARANCE_FILTERS = ['required', 'exclude'] as const;
export type ClearanceFilter = (typeof CLEARANCE_FILTERS)[number];
// JobsQueryParams gains: experience?: ExperienceBucket[];  clearance?: ClearanceFilter | '';

// lib/labels.ts
export const EXPERIENCE_LABELS: Record<ExperienceBucket, string>;   // '0-2'→'0–2 yrs' … '10plus'→'10+ yrs', 'unspecified'→'Not specified'
export const CLEARANCE_LABELS: Record<ClearanceFilter | '', string>; // ''→'Any', required→'Required', exclude→'Exclude'
export const CLEARANCE_BADGE_TEXT = 'Clearance required';
export function formatExperienceChip(years: number | null | undefined): string | null; // 5→'5+ yrs', null/undefined/NaN→null
export function parseExperienceParam(raw: string | null): ExperienceBucket[];  // split ',', trim, lower-case, keep known, dedupe, canonical order
export function parseClearanceParam(raw: string | null): ClearanceFilter | '';  // trim + lower-case; unknown → ''
export function serializeExperience(buckets: readonly ExperienceBucket[]): string; // canonical order joined by ','; [] → ''
```

- [ ] **Step 1: Write the failing tests** in `frontend/src/test/jobAttributes.test.ts`:
```ts
it('maps every bucket to its exact label', () => {
  expect(EXPERIENCE_BUCKETS.map((b) => EXPERIENCE_LABELS[b]))
    .toEqual(['0–2 yrs', '3–5 yrs', '6–9 yrs', '10+ yrs', 'Not specified']);
  expect([CLEARANCE_LABELS[''], CLEARANCE_LABELS.required, CLEARANCE_LABELS.exclude]).toEqual(['Any', 'Required', 'Exclude']);
});
it('formats the years chip only for numbers', () => {
  expect(formatExperienceChip(5)).toBe('5+ yrs');
  expect(formatExperienceChip(0)).toBe('0+ yrs');
  expect(formatExperienceChip(null)).toBeNull();
  expect(formatExperienceChip(undefined)).toBeNull();
});
it('parses experience: drops unknown values, dedupes, canonical order', () => {
  expect(parseExperienceParam('10plus,0-2,banana,0-2')).toEqual(['0-2', '10plus']);
  expect(parseExperienceParam(' 10PLUS , Unspecified')).toEqual(['10plus', 'unspecified']);
  expect(parseExperienceParam('')).toEqual([]);
  expect(parseExperienceParam(null)).toEqual([]);
  expect(parseExperienceParam('__proto__,constructor')).toEqual([]);
});
it('drops 10+ typed with a literal plus', () => {
  expect(parseExperienceParam(new URLSearchParams('experience=10+').get('experience'))).toEqual([]);
});
it('parses clearance like the API and ignores anything else', () => {
  expect(parseClearanceParam('required')).toBe('required');
  expect(parseClearanceParam('REQUIRED')).toBe('required');
  expect(parseClearanceParam(' Exclude ')).toBe('exclude');
  expect(parseClearanceParam('maybe')).toBe('');
  expect(parseClearanceParam(null)).toBe('');
});
it('serializes in canonical order', () => {
  expect(serializeExperience(['unspecified', '3-5'])).toBe('3-5,unspecified');
  expect(serializeExperience([])).toBe('');
});
```
- [ ] **Step 2: Run, expect FAIL** — `npm --prefix frontend run test -- jobAttributes` → fails with missing exports.
- [ ] **Step 3: Implement** the Produces block. Replace E4's `type ExperienceBucket = '0-2' | … | 'unspecified'` with
  the constant-derived type (members unchanged, so every E4 use still type-checks). Lookups use
  `Object.prototype.hasOwnProperty.call` like `resolveJobSource` (`labels.ts:20-23`).
- [ ] **Step 4: Run, expect PASS** — `npm --prefix frontend run test -- jobAttributes contract` → all green;
  `npm --prefix frontend run typecheck` → no errors.
- [ ] **Step 5: Commit** — `git add frontend/src/types/api.ts frontend/src/lib/labels.ts frontend/src/test/jobAttributes.test.ts`;
  `git commit -m "feat(ui): experience bucket constant, labels and URL parsers"` (bulleted body).

### Task 2: State, URL sync and request params

**Files:**
- Modify: `frontend/src/store/slices/filterSlice.ts:4-20` (initial state)
- Modify: `frontend/src/hooks/useJobFilters.ts:37-71`, `:94-119`
- Modify: `frontend/src/store/api/jobsApi.ts:32-45`
- Modify: `frontend/src/test/defaultQuery.test.ts`
- Create: `frontend/src/test/attributeFilters.test.tsx` (MSW harness copied from `twoPaneAndFilters.test.tsx:20-118`)

**Interfaces — Consumes:** Task 1 helpers. **Produces:**
```ts
// filterSlice.ts
initialState.experience = [];  initialState.clearance = '';
// No new reducers: the filter bar goes through updateUrl → syncFromUrl, like every existing filter
// (the per-field setX reducers at filterSlice.ts:26-81 are unused by JobFiltersBar).
// useJobFilters: URL 'experience' → parseExperienceParam, 'clearance' → parseClearanceParam (into syncFromUrl);
//                updateUrl writes experience=serializeExperience(...) when non-empty, clearance when set.
// buildJobsQueryParams: arrays → skipped when empty, else serializeExperience(value) under key 'experience'.
```

- [ ] **Step 1: Write the failing tests.**
  `defaultQuery.test.ts` — keep `:6-10` unchanged (it must still pass with the new initial state) and add:
```ts
it('sends experience in canonical order and clearance', () => {
  const qs = buildJobsQueryParams({ experience: ['10plus', '0-2'], clearance: 'exclude', page: 1, pageSize: 25 });
  const p = new URLSearchParams(qs);
  expect(p.get('experience')).toBe('0-2,10plus');
  expect(p.get('clearance')).toBe('exclude');
});
it('omits empty experience and empty clearance', () => {
  expect(buildJobsQueryParams({ experience: [], clearance: '', page: 1, pageSize: 25 })).toBe('page=1&pageSize=25');
});
```
  `attributeFilters.test.tsx` (MSW facets handler returns `experience: {'0-2': 120, '3-5': 340, '6-9': 210, '10plus': 90, unspecified: 400}`, `clearance: {required: 55, exclude: 1105}`):
```ts
it('hydrates experience and clearance from the URL into the request', async () => {
  renderBrowseAt('/?experience=3-5,10plus&clearance=required');
  await waitFor(() => {
    const last = capturedRequests.at(-1);
    expect(last?.get('experience')).toBe('3-5,10plus');
    expect(last?.get('clearance')).toBe('required');
  });
});
it('ignores invalid URL values', async () => {
  renderBrowseAt('/?experience=banana,11-20,10%2B&clearance=maybe');
  await waitFor(() => expect(capturedRequests.length).toBeGreaterThan(0));
  const last = capturedRequests.at(-1)!;
  expect(last.has('experience')).toBe(false);
  expect(last.has('clearance')).toBe(false);
});
```
- [ ] **Step 2: Run, expect FAIL** — `npm --prefix frontend run test -- defaultQuery attributeFilters`.
- [ ] **Step 3: Implement** the Produces block. In `buildJobsQueryParams` add an `Array.isArray(value)` branch before
  the generic append (skip if empty, else `serializeExperience`). In `updateUrl` write the params after `postedWithin`
  (`useJobFilters.ts:105`). Do not change any existing param.
- [ ] **Step 4: Run, expect PASS** — same command; also `npm --prefix frontend run test -- sortParams twoPaneAndFilters searchBox` stays green.
- [ ] **Step 5: Commit** — `feat(ui): URL-synced experience and clearance filter state`.

### Task 3: Filter controls (desktop pills + mobile drawer), counts, Clear all

**Files:**
- Modify: `frontend/src/components/jobs/JobFiltersBar.tsx` (state `:63-67`, count `:80-90`, pills after Employment `:377`, drawer after Employment `:640`)
- Test: `frontend/src/test/attributeFilters.test.tsx`

**Interfaces — Consumes:** `EXPERIENCE_BUCKETS`, `EXPERIENCE_LABELS`, `CLEARANCE_FILTERS`, `CLEARANCE_LABELS`,
`FacetsData.experience/.clearance`, existing `onUpdateFilters(updates)` prop (`JobFiltersBar.tsx:38`).

Behaviour (decided here, implement exactly):
- **Experience pill** (desktop): idle label `Experience`; one selected → `Experience: 3–5 yrs`; several → `Experience: 2 selected`.
  Active = filled `primary` + `onDelete` clearing to `[]` (same props as `:212-217`). Opens a `Menu` named via
  `slotProps={{ list: { 'aria-label': 'Experience' } }}` (MUI 9: an `aria-label` on `<Menu>` itself lands on the Popover
  root, not the `role="menu"` list). Items are `MenuItem role="menuitemcheckbox" aria-checked` with
  `aria-label={`${label}, ${count.toLocaleString()} jobs`}` (just `label` when counts are missing), an MUI `Checkbox`
  with `disableRipple` and `slotProps={{ input: { 'aria-hidden': true, tabIndex: -1 } }}`, the visible label, and the
  count right-aligned (`toLocaleString()`, `color: text.secondary`, `fontVariantNumeric: 'tabular-nums'`). Clicking
  toggles one bucket and **keeps the menu open**; calls `onUpdateFilters({ experience: next, page: 1 })` with `next`
  in canonical order.
- **Security clearance pill**: idle label `Security clearance`; active `Clearance: Required` / `Clearance: Exclude`
  with `onDelete` → `''`. `Menu` named via `slotProps={{ list: { 'aria-label': 'Security clearance' } }}`; items `Any`,
  `Required` (count `clearance.required`), `Exclude` (count `clearance.exclude`), accessible names as above,
  `selected` like `:224-259`; choosing closes the menu.
- Counts hidden (label only) when `facets?.experience` / `facets?.clearance` is missing. `Any` never shows a count.
- **Mobile drawer**: `FormControl`+`InputLabel id="mobile-experience-label"` `Experience` + `Select multiple`
  (`value` = `filters.experience` in canonical order; `onChange` re-sorts to canonical order before
  `onUpdateFilters`; `renderValue` joins labels with `, `; items with `Checkbox` + `ListItemText primary=label
  secondary=count`), and `InputLabel id="mobile-clearance-label"` `Security clearance` + single `Select` with
  `Any`/`Required`/`Exclude`.
- `activeFilterCount` adds `(filters.experience?.length ?? 0) > 0` and `Boolean(filters.clearance)` so "Clear all"
  appears and the mobile badge counts them. "Clear all" / "Clear All" already call `clearAllFilters` (resets slice to
  initial state → `[]` / `''`).

- [ ] **Step 1: Write the failing tests** in `attributeFilters.test.tsx` (each test starts with `const user = userEvent.setup();`):
```ts
it('shows experience options with exact labels and facet counts', async () => {
  const user = userEvent.setup();
  renderBrowseAt('/');
  await user.click(await screen.findByRole('button', { name: 'Experience' }));
  const menu = screen.getByRole('menu', { name: 'Experience' });
  const items = within(menu).getAllByRole('menuitemcheckbox');
  expect(items.map((i) => i.getAttribute('aria-label'))).toEqual([
    '0–2 yrs, 120 jobs', '3–5 yrs, 340 jobs', '6–9 yrs, 210 jobs', '10+ yrs, 90 jobs', 'Not specified, 400 jobs',
  ]);
});
it('multi-select updates URL and request in canonical order', async () => {
  const user = userEvent.setup();
  renderBrowseAt('/');
  await user.click(await screen.findByRole('button', { name: 'Experience' }));
  await user.click(screen.getByRole('menuitemcheckbox', { name: /^10\+ yrs/ }));
  await user.click(screen.getByRole('menuitemcheckbox', { name: /^3–5 yrs/ }));   // menu still open
  await waitFor(() => {
    expect(currentSearch).toContain('experience=3-5%2C10plus');
    expect(capturedRequests.at(-1)?.get('experience')).toBe('3-5,10plus');
  });
  expect(screen.getByRole('menuitemcheckbox', { name: /^3–5 yrs/ })).toHaveAttribute('aria-checked', 'true');
});
it('clearance Exclude updates URL and request; chip shows and deletes', async () => {
  const user = userEvent.setup();
  renderBrowseAt('/');
  await user.click(await screen.findByRole('button', { name: 'Security clearance' }));
  expect(screen.getByRole('menuitem', { name: 'Required, 55 jobs' })).toBeInTheDocument();
  await user.click(screen.getByRole('menuitem', { name: 'Exclude, 1,105 jobs' }));
  await waitFor(() => expect(capturedRequests.at(-1)?.get('clearance')).toBe('exclude'));
  expect(screen.getByText('Clearance: Exclude')).toBeInTheDocument();
});
it('active chips render from the URL', async () => {
  renderBrowseAt('/?experience=6-9&clearance=required');
  expect(await screen.findByText('Experience: 6–9 yrs')).toBeInTheDocument();
  expect(screen.getByText('Clearance: Required')).toBeInTheDocument();
});
it('Clear all resets both filters, the URL and the request', async () => {
  const user = userEvent.setup();
  renderBrowseAt('/?experience=0-2,unspecified&clearance=required');
  await user.click(await screen.findByRole('button', { name: /clear all/i }));
  await waitFor(() => {
    expect(currentSearch).toBe('');
    const last = capturedRequests.at(-1)!;
    expect(last.has('experience')).toBe(false);
    expect(last.has('clearance')).toBe(false);
  });
});
it('renders without experience facets (old facets body)', async () => {
  const user = userEvent.setup();
  server.use(http.get('*/v1/facets', () => HttpResponse.json({ workplaceTypes: [], employmentTypes: [], departments: [], countries: [] })));
  renderBrowseAt('/');
  await user.click(await screen.findByRole('button', { name: 'Experience' }));
  expect(screen.getByRole('menuitemcheckbox', { name: '0–2 yrs' })).toBeInTheDocument();
});
it('mobile drawer (390px) has labelled Experience multi-select and Security clearance select', () => {
  // matchMedia override copied from sourceBadge.test.tsx:271-315; ThemeProvider + JobFiltersBar
  // with filters={{ experience: [], clearance: '' }}, facets={MOCK_FACETS}, onUpdateFilters = vi.fn()
  fireEvent.click(screen.getByRole('button', { name: /open filter options/i }));
  fireEvent.mouseDown(screen.getByLabelText('Experience'));
  const listbox = screen.getByRole('listbox');
  expect(within(listbox).getAllByRole('option').map((o) => o.querySelector('.MuiListItemText-primary')?.textContent))
    .toEqual(['0–2 yrs', '3–5 yrs', '6–9 yrs', '10+ yrs', 'Not specified']);
  fireEvent.click(within(listbox).getAllByRole('option')[3]);
  expect(onUpdateFilters).toHaveBeenCalledWith({ experience: ['10plus'], page: 1 });
  fireEvent.keyDown(listbox, { key: 'Escape' });
  fireEvent.mouseDown(screen.getByLabelText('Security clearance'));
  const clr = screen.getByRole('listbox');
  expect(within(clr).getAllByRole('option').map((o) => o.textContent)).toEqual(['Any', 'Required', 'Exclude']);
  fireEvent.click(within(clr).getByRole('option', { name: 'Required' }));
  expect(onUpdateFilters).toHaveBeenCalledWith({ clearance: 'required', page: 1 });
});
it('keyboard: Enter opens Experience menu, Space toggles, Escape closes and refocuses the pill', async () => {
  const user = userEvent.setup();
  renderBrowseAt('/');
  const pill = await screen.findByRole('button', { name: 'Experience' });
  pill.focus();
  await user.keyboard('{Enter}');
  const first = within(screen.getByRole('menu', { name: 'Experience' })).getAllByRole('menuitemcheckbox')[0];
  await waitFor(() => expect(first).toHaveFocus());
  await user.keyboard(' ');
  await waitFor(() => expect(capturedRequests.at(-1)?.get('experience')).toBe('0-2'));
  await user.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  expect(screen.getByRole('button', { name: /^Experience: 0–2 yrs/ })).toHaveFocus();
});
```
- [ ] **Step 2: Run, expect FAIL** — `npm --prefix frontend run test -- attributeFilters`.
- [ ] **Step 3: Implement** in `JobFiltersBar.tsx` per the behaviour list. Build items by mapping
  `EXPERIENCE_BUCKETS` / `['', ...CLEARANCE_FILTERS]` through the label maps (no per-value `if` chains, like Source `:407-418`).
  Pill `sx` identical to the existing pills (`fontWeight: 600, fontSize: '0.8rem'`). Existing menus are untouched.
- [ ] **Step 4: Run, expect PASS** — `npm --prefix frontend run test -- attributeFilters sourceBadge twoPaneAndFilters countryFacets`.
- [ ] **Step 5: Commit** — `feat(ui): Experience and Security clearance filter pills and drawer controls`.

### Task 4: `Clearance required` badge and `<N>+ yrs` chip on card and detail

**Files:**
- Create: `frontend/src/components/common/JobAttributeBadges.tsx`
- Create: `frontend/src/components/common/quietBadgeSx.ts` (style moved verbatim from `SourceBadge.tsx:28-42`)
- Modify: `frontend/src/components/common/SourceBadge.tsx:22-44` (use `quietBadgeSx`, no visual change)
- Modify: `frontend/src/components/jobs/JobCard.tsx:174-205` (render badges before `SourceBadge`, `:204`)
- Modify: `frontend/src/components/jobs/JobDetailPanel.tsx:221-243` (two outlined `Chip size="small"` after employment)
- Test: `frontend/src/test/jobAttributeBadges.test.tsx`

**Interfaces — Produces:**
```ts
export function quietBadgeSx(size: 'small' | 'medium'): SxProps<Theme>;
export interface JobAttributeBadgesProps { experienceMinYears?: number | null; clearanceRequired?: boolean | null; size?: 'small' | 'medium' }
export const JobAttributeBadges: React.FC<JobAttributeBadgesProps>; // returns null when nothing to show
// spans: data-testid="experience-chip" text formatExperienceChip(n); data-testid="clearance-badge" text CLEARANCE_BADGE_TEXT
```
`quietBadgeSx` keeps SourceBadge's exact values, including the inline rgba tint
(`theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)'`, `SourceBadge.tsx:37-38`);
no visual change, SourceBadge's own `sx` prop still spreads last. Detail uses MUI `Chip` (matching
`JobDetailPanel.tsx:224-236`) with the same label helpers and the same `data-testid`s. Order on both surfaces: years
chip, then clearance badge.

- [ ] **Step 1: Write the failing tests:**
```ts
it.each([
  [5, true, ['5+ yrs', 'Clearance required']],
  [null, true, ['Clearance required']],
  [3, false, ['3+ yrs']],
  [null, false, []],
  [null, null, []],
])('card: years=%s clearance=%s → %j', (years, clr, expected) => {
  renderCard({ ...baseJob, experienceMinYears: years, clearanceRequired: clr });
  expect(screen.queryAllByTestId(/experience-chip|clearance-badge/).map((n) => n.textContent)).toEqual(expected);
});
it('detail panel shows both chips for a known job and none for an unprocessed job', async () => {
  // MSW /v1/jobs/:id: job A { experienceMinYears: 7, clearanceRequired: true }, job B { null, null }
  // render <JobDetailPanel jobId="A"/> → findByTestId('experience-chip') has text '7+ yrs', getByTestId('clearance-badge') 'Clearance required'
  // rerender with jobId="B" → after title shows, queryByTestId('experience-chip') and queryByTestId('clearance-badge') are null
});
it('SourceBadge styles unchanged after the sx extraction', () => {
  render(<SourceBadge source="lever" />);
  const el = screen.getByTestId('source-badge');
  expect(el).toHaveTextContent('via Lever');
  expect(getComputedStyle(el).borderRadius).toBe('4px');
});
```
- [ ] **Step 2: Run, expect FAIL** — `npm --prefix frontend run test -- jobAttributeBadges`.
- [ ] **Step 3: Implement** the Produces block; treat only `typeof n === 'number'` as known and only `=== true` as required.
- [ ] **Step 4: Run, expect PASS** — `npm --prefix frontend run test -- jobAttributeBadges jobCard sourceBadge`.
- [ ] **Step 5: Commit** — `feat(ui): clearance badge and years chip on job card and detail`.

### Task 5: Docs, BF-028 extension, CHANGELOG, explorer, full verification

**Files:**
- Modify: `frontend/docs/frontend-ui.md` §1 (URL params list at `:16`: add `source`, `experience`, `clearance`; new
  bullets "Experience & clearance filters" + "Attribute badges"), §3 (query params list)
- Modify: `frontend/docs/testing.md` §3 (add `jobAttributes.test.ts`, `attributeFilters.test.tsx`, `jobAttributeBadges.test.tsx`)
- Modify: `frontend/docs/known-issues.md` — add `#FE-05 (⚪)`: facet counts on all filters are global
  (`getFacets()` takes no args, `jobsApi.ts:69-73`), so Experience/Clearance counts do not narrow with other filters.
- Modify: `/Users/pavanreddy/Documents/anti-gravity/job-scrapper/DESIGN.md` (the repo-root design system, a different file from the plan spec `docs/plans/job-attributes/DESIGN.md`) **Components** list (`:83-86`): one line for `JobAttributeBadges` (quiet badge
  pattern shared with `SourceBadge` via `quietBadgeSx`) and one for the multi-select filter pill.
- Modify: `docs/testing.md` §6 — extend the **BF-028** row (created by E4) with the UI guard: "UI: URL ↔ state ↔
  request for `experience`/`clearance`, invalid values ignored, canonical order, Clear all, counts, badges render
  nothing for null" → `attributeFilters.test.tsx`, `jobAttributes.test.ts`, `jobAttributeBadges.test.tsx`. If the row
  is missing, STOP: E4 is incomplete.
- Modify: `docs/bug-fix-log.md` BF-028 entry: append the frontend guarding tests.
- Modify: `CHANGELOG.md` `## [Unreleased]` (skill `release-notes`): `feat(ui)` entry, BF-028, ADR-0023.
- Regenerate: `backend/docs/project-explorer.html`.

- [ ] **Step 1:** edit the docs above.
- [ ] **Step 2:** `npm --prefix backend run docs:generate` → explorer regenerated; stage it.
- [ ] **Step 3:** `npm --prefix frontend run check` → typecheck, lint, any-ratchet, all Vitest suites pass, build succeeds
  (note bundle size delta in the PR body).
- [ ] **Step 4:** commit (below), then `scripts/check-all.sh --no-install` → exit 0; `node --test 'scripts/repo-tests/**/*.test.mjs'` → pass.
- [ ] **Step 5:** screenshots via `npm --prefix frontend run dev` with mocked/fixture data (not production): desktop
  1440px and mobile 390px, light + dark — Experience menu open with counts, active chips, drawer, a card and the detail
  with both badges, a card with none. Put them in the PR body.

## COMMIT + PUBLISH
Final (squash) subject: `feat(ui): Experience and Security clearance filters with job attribute badges (BF-028, ADR-0023)`.
Bulleted body: root cause (no UI for the new attributes), changes (bucket constant/labels, URL sync, pills + drawer +
counts, badges), tests (named files above), docs (list). End with the session attribution lines.
Publish: `scripts/agents/push-branch.sh`; give the owner the PR link.

## ROLLOUT (PR body)
Merge → owner runs **Deploy to Vercel** `app=frontend` (only after E4 is deployed and the backfill is complete) →
owner smoke: `/?experience=3-5&clearance=exclude` returns results and shows both chips; a defense-company job shows
`Clearance required`. Rollback: Vercel Instant Rollback of the frontend; the change is additive (the backend keeps
serving the fields either way).

## DONE when
- [ ] All five tasks committed; `npm --prefix frontend run check` and `scripts/check-all.sh --no-install` green.
- [ ] Every Review-focus item has its named test passing.
- [ ] Copy matches `00-PLAN.md` byte for byte (en dash in labels, ASCII hyphen in values, `10plus` value / `10+ yrs` label).
- [ ] Explorer regenerated; CHANGELOG, frontend docs, `/Users/pavanreddy/Documents/anti-gravity/job-scrapper/DESIGN.md` (repo-root design system, not the plan's DESIGN.md), `docs/testing.md` BF-028 row updated; screenshots in the PR body.

## Notes for the plan owner
1. **`0+ yrs`.** The spec says "`<N>+ yrs` when experienceMinYears is a number"; a stated "0 years" therefore shows
   `0+ yrs`. Kept as specified; consider hiding the chip for 0 if that reads oddly.
2. **Facet counts are new UI.** No existing filter shows counts (country options show names only,
   `JobFiltersBar.tsx:154-158`), and facets are global, not narrowed by the other active filters (E4 D3). E5 shows
   counts only on the two new filters, which is slightly inconsistent; logged as `#FE-05`.
3. **"Active-filter chips".** The app has no separate chip row; the active pill itself (filled + delete icon) is the
   active-filter chip (`JobFiltersBar.tsx:211-217`, `:386`). E5 follows that pattern rather than adding a row.
4. **Pill label for several buckets** (`Experience: 2 selected`) and the idle clearance label (`Security clearance`)
   are not fixed by 00-PLAN; chosen here. Change before execution if you prefer other copy.
5. **Preconditions 3 and 4** need an owner confirmation (deploy + backfill done); the agent never deploys or calls production.
