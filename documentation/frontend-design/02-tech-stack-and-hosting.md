# 02 · Tech Stack & Hosting

> **Status:** design decision only; nothing installed or scaffolded. Facts checked **2026-10-22**.
> **Evidence labels:** **[NPM]** = `npm view <pkg> version` run in this session. **[DOCS]** = vendor documentation page fetched in this session. **[SNIPPET]** = third-party page or search-result summary only (treat as weak). **[UNVERIFIED]** = not confirmed; the implementing agent must re-check before relying on it.
> Prices/limits change often. Re-verify the hosting numbers on the day the project is created.
>
> **Fact-check round 1 (2026-10-22):** every npm version in this file was re-run and matched; hosting/Next.js/Node/TypeScript claims were re-fetched; corrections are marked **[FC1]**. **Several recommendations below are overridden by `09-frontend-architecture.md` section 1 (D-01 indexing, D-04 data fetching/no TanStack Query, D-05 caching, D-06 `cacheComponents` off, D-08 404, D-14 rel, D-18 no nuqs, D-22 npm).** Each affected statement carries a **Superseded by 09 D-xx** note. A reader of 02 alone must treat 09 section 1 as authoritative. A legal/terms risk section was added (section 10).

---

## 1. Current stable versions (npm registry, 2026-10-22)

All numbers are from `npm view <pkg> version` (the `latest` dist-tag) unless noted. Full table with notes is in section 8.

| Area | Package | latest | Note |
|---|---|---|---|
| UI | `react` / `react-dom` | **19.3.1** | |
| Framework | `next` | **16.4.2** | peer `react ^18.2 \|\| ^19` (**[FC1]** was "^19"), Node `>=20.9`; `middleware.ts` is deprecated and renamed **`proxy.ts`** since 16.0.0 (Node.js runtime by default) [DOCS: nextjs.org/docs/app/api-reference/file-conventions/proxy, lastUpdated 2026-09-04] |
| Framework | `react-router` | **8.5.0** | Node `>=22.22.0` |
| Framework | `@tanstack/react-start` | **1.169.4** | 1.0 declared stable on **2026-10-13** ([TanStack blog](https://tanstack.com/blog/tanstack-start-1-0), [DOCS]) |
| Framework | `astro` | **7.4.2** | |
| Bundler | `vite` | **8.3.5** | Node `^20.19 || >=22.12` |
| Language | `typescript` | **7.0.2** (Go-native compiler) | see warning in 1.1 |
| Styling | `tailwindcss` | **4.3.3** | |
| Components | `radix-ui` | 1.8.1 | unified package |
| Components | `shadcn` (CLI) | 4.22.1 | copies components into the repo |
| Components | `react-aria-components` | 1.22.1 | |
| Components | `@base-ui/react` | 1.9.0 | |
| Data | `@tanstack/react-query` | 5.104.5 | |
| Routing | `@tanstack/react-router` | 1.170.46 | |
| Validation | `zod` | 4.6.7 | |
| URL state | `nuqs` | 2.10.2 | supports Next App Router, React Router, TanStack Router, SPAs ([nuqs.dev](https://nuqs.dev), [DOCS]) |
| Test | `vitest` | 5.0.5 | vite `^6.4 || ^7 || ^8` |
| Test | `@playwright/test` | 1.64.1 | |
| Test | `@axe-core/playwright` | 4.14.0 | a11y assertions in E2E |
| Test | `msw` | 3.0.3 | Node `>=22.12` |
| Docs | `storybook` | 10.6.3 | optional |
| Lint | `eslint` | 10.13.0 | |
| Lint | `typescript-eslint` | 8.72.0 | **peer `typescript >=4.8.4 <6.1.0`** |
| Lint | `eslint-plugin-react-hooks` | 7.1.1 | carries React Compiler lint rules |
| Format/lint | `@biomejs/biome` | 2.6.2 | |
| Compiler | `babel-plugin-react-compiler` | 1.0.0 | stable since 2025-10-07 |
| Vite plugin | `@vitejs/plugin-react` | 6.1.2 | compiler via optional `@rolldown/plugin-babel` (0.2.4) |
| Runtime | Node.js | **24.22.1 (LTS "Krypton")**; v26.12.1 is "Current"; v22.23.4 LTS | [nodejs.org previous-releases](https://nodejs.org/en/about/previous-releases) [DOCS, page updated 2026-10-20/21, re-fetched 2026-10-22 **[FC1]**]. The page labels 24 and 22 "LTS" without saying Active vs Maintenance. |
| Types | `@types/node` | 26.6.5 (latest) | **[FC1] pin to the 24.x line** to match the runtime; `latest` is 26.x |
| Icons | `lucide-react` | 1.61.0 | named by 06/07; peer `react ^16.5 .. ^19` |
| Fonts | `@fontsource-variable/geist`, `@fontsource-variable/geist-mono` | 5.3.0 each (`geist` npm package 1.8.2, peer `next >=13.2`) | named by 06; 06 also lists `next/font/google` as an option |
| Test | `jsdom` | 30.1.3 | not named in 02; Vitest 5 needs `@types/node ^22 \|\| >=24` |

### 1.1 Warnings the implementing agent must respect

1. **TypeScript 7 vs the ecosystem.** `typescript@latest` is 7.0.2 (stable Go compiler, shipped July 2026 per [InfoQ](https://www.infoq.com/news/2026/08/typescript-7-released/) / [The Register](https://www.theregister.com/devops/2026/07/09/speedier-type-checks-in-typescript-70-as-first-stable-go-release-ships/5268828) [SNIPPET]). Its programmatic compiler API is reportedly not stable until 7.1 (`7.1.0-beta` exists on the `beta` tag [NPM]), and `typescript-eslint@8.72.0` **declares a peer range that excludes TypeScript >= 6.1** [NPM, re-run 2026-10-22 **[FC1]**: `>=4.8.4 <6.1.0`]. A web search found reports that forcing TS 7 under typescript-eslint crashes at runtime and that the tracking issue typescript-eslint#12518 was closed "not planned" [SNIPPET: secondary blog/search summary; repo issue not read directly - **UNVERIFIED** detail, re-check before relying]. **Decision: pin `typescript` to the 6.0.x line (6.0.3 is the latest 6.x [NPM]) for the project**, and re-evaluate when typescript-eslint supports 7.x. Whether `next build`'s built-in type check works with TS 7 is **UNVERIFIED**; the pin avoids the question. Optionally run `tsc` 7 in CI as an extra, non-blocking check.
2. **Node.** Target **Node 24 LTS** (`.nvmrc` = `24`, `engines.node = ">=24"`). Vite 8, React Router 8 (`>=22.22`) and MSW 3 (`>=22.12`) all accept it. Node 26 is "Current" (not yet LTS on the nodejs.org page read today); do not target it. **[FC1] Vercel:** its Node.js versions page (last_updated 2026-02-27) lists **24.x (default)** and 22.x, and `engines.node` of `24.x` or `>=22.0.0` deploys the latest 24.x [DOCS: vercel.com/docs/functions/runtimes/node-js/node-js-versions]; the same page's related-links list an announcement that Node 20 is deprecated on 2026-10-01. **Netlify** build-image Node versions remain **UNVERIFIED** (its Next.js page does not state one); set the version explicitly in `.nvmrc` / `NODE_VERSION`. Also pin `@types/node` to 24.x.
3. **Version drift.** These are the registry values today. Pin exact versions in `package.json` + lockfile (the compiler docs also recommend pinning `babel-plugin-react-compiler` exactly).

### 1.2 React 19.x / React Compiler: what matters for this app

Source: [React Compiler 1.0 announcement](https://react.dev/blog/2025/10/07/react-compiler-1) (2025-10-07) [DOCS], plus Next.js docs [DOCS].
- **React Compiler 1.0 is stable.** It auto-memoizes components/hooks at build time. For a list-heavy page (25 cards + filter UI) it removes the need for hand-written `useMemo/useCallback/React.memo`. Enable it (Next: `reactCompiler` option; Vite: Babel plugin) and install `eslint-plugin-react-hooks@latest` so rules-of-React violations are linted. Reported gains (Meta Quest Store: up to 12% faster loads) are **not** a promise for us. Pin the exact compiler version and keep E2E coverage because memoization can change `useEffect` timing if code breaks the Rules of React.
- **Server Components + Suspense streaming** (used by Next.js App Router): data fetching happens on the server, the client bundle stays small, and slow parts stream behind `<Suspense>`. This directly helps mid-range phones (less JS).
- **Actions / `useTransition`**: wrap filter/page navigations in a transition so the existing results stay visible with a pending indicator rather than flashing a spinner.
- **`useDeferredValue`**: for a search input if any client-side filtering is done.
- **Document metadata hoisting** (`<title>`, `<meta>`, `<link>` in components) and `ref` as a plain prop: minor, but simplify SEO and component code.
- Not relied upon: `<ViewTransition>` / other newer React 19.x additions (status **UNVERIFIED** for 19.3; skip in v1).

---

## 2. Architecture options for THIS app

Facts that drive the choice (from `00-brief`): ~34,000 live jobs and ~1,750 companies; job and company pages should be shareable and findable via search; a separate read-only API that does **not exist yet** and which we do not control; free hosting only; no accounts; must be buildable against mock data first.

### 2.1 The three options

- **A. Static SPA on a CDN.** Vite + React + TanStack Router (or React Router declarative mode); one `index.html`; all data fetched in the browser from the API; deep links handled by a catch-all rewrite to `index.html`.
- **B. SSR / ISR framework app.** Next.js 16 (App Router, React Server Components; Cache Components were considered but are **off by default in v1 - see 09 D-06**) - or TanStack Start / React Router 8 framework mode. HTML for every job/company/list URL is produced on the server (and cached), the API is called server-side.
- **C. Static shell + client fetch.** A prerendered shell for a handful of static routes (home, about, privacy; optionally a pre-built top-N job pages), the rest fetched client-side. In practice this is A with a few prerendered pages (e.g. Astro + React islands, or Vite SPA + a prerender step).

### 2.2 Comparison

Scores: **++** strong, **+** ok, **-** weak, **--** fails the requirement.

| Criterion | A. Static SPA | B. SSR/ISR framework | C. Static shell + client fetch |
|---|---|---|---|
| **SEO / share previews of job & company pages** | **--** Content is client-rendered; link-preview bots (Slack, WhatsApp, X) generally do not run JS so OG tags are the generic shell's; a missing job cannot return a real 404 (soft 404). Google renders JS, but status codes, canonical and JSON-LD are most reliable in initial HTML (Google's JobPosting doc requires expired jobs to be removed, [DOCS]). | **++** Per-URL HTML, correct 404/410, per-page `<title>`/OG/JSON-LD in the first response. | **-** Only the prerendered routes are good; dynamic job pages have the same problems as A. Prerendering 34k job pages at build is impractical (Vercel build limit 45 min per deployment [DOCS]). |
| **First load on a mid-range phone** | **-/+** Ship JS + wait for an API round trip before any content (blank/skeleton first). Fine with code-splitting but content arrives after JS + fetch. | **+/++** HTML with real content arrives first; Server Components keep list-rendering code out of the bundle; streaming for slow parts. Cold start of a serverless function adds latency on cache misses. | **+** Shell is instant (static), content after fetch. |
| **Free-tier fit** | **++** Static files only: no function invocations. Bandwidth is the only meter. | **+** Uses function invocations / compute and cache reads. Vercel Hobby includes 1M invocations and 100 GB; Netlify Free's 300-credit pool covers about 15 GB and 1.5M requests ([section 4](#4-vercel-vs-netlify-free-tier-comparison-numbers-checked-2026-10-22)). Needs caching discipline and `robots.txt` rules so crawlers do not burn the quota. | **++** Same as A. |
| **Complexity** | **++** Smallest: one bundler, no server concepts, trivial to test. | **-** Server/client boundary, caching model (Next 16 Cache Components: `use cache`, `cacheLife`, Suspense around uncached reads [DOCS]), hydration pitfalls, hosting-adapter concerns. | **+** Slightly more than A. |
| **Backend is a separate API we don't control (yet)** | **+** Needs CORS on the API for our domain (assumption A4); client talks directly; outages show in the UI. | **++** Server-to-server calls avoid CORS and can hide the API URL, add caching/stale-while-error, and normalise responses. But SSR now depends on API availability and latency per cache miss; need timeouts + fallbacks. | **+** Same as A. |
| **Ship before the backend exists (mock data)** | **++** MSW in the browser or an in-app fixtures module. | **++** In-process mock adapter (seeded fixtures) chosen by env var; MSW 3 also supports Node for tests. Slightly more wiring than A. | **++** |
| **Portability across hosts** | **++** Any static host. | **+** Next.js on Netlify is supported ([Netlify frameworks doc](https://docs.netlify.com/build/frameworks/overview/): App Router, SSR, ISR, image optimisation "with zero configuration" [DOCS]); **[FC1]** Netlify's Next.js page lists ISR and Cache Components as "Full Support", supports Next.js >= 13.5, and says it tests every new stable Next.js; it does **not** mention `proxy.ts` or `use cache` explicitly, and Next 16.4 specifically is not named [DOCS: docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/, fetched 2026-10-22]. Treat Netlify as a fallback to be proven in a preview deploy. TanStack Start / React Router 8 are Vite/Nitro-based and deploy broadly. | **++** |

### 2.3 RECOMMENDATION

**Choose Option B: an SSR/ISR-capable framework app, and the framework is Next.js 16 (App Router), deployed on Vercel Hobby, with Netlify Free as the documented fallback.** Build it **mock-first** behind a thin data-access layer.

Reasoning:
1. The product's primary entry is search engines and shared links to job and company pages. That needs per-URL HTML, correct 404/410 for closed jobs, canonical tags and (where data allows) `JobPosting` JSON-LD in the initial response. Only B delivers this without hacks (see `01` section 2.11).
2. Server-side fetch + caching shields phones from waterfalls (HTML first, small JS) and shields the not-yet-built API from per-visitor load (one fetch per cache window, not per visitor).
3. A separate, uncontrolled API is easier to live with behind a server: no CORS dependency for the main pages, one place for timeouts, retries, response validation (Zod) and stale-on-error.
4. Free-tier fit is acceptable if filter/search URLs are cached and disallowed in `robots.txt` (crawler traffic is the main risk to the invocation budget).
5. Next.js has the largest ecosystem and agent familiarity; nuqs, shadcn/ui, Playwright and MSW all have first-class Next support. The version in the registry today (16.4.2) is a mature major rather than a brand-new one.

Guardrails to keep B cheap and portable:
- Keep the **data-access layer framework-agnostic** (`src/api/` pure TypeScript functions + Zod schemas) so a later move to TanStack Start / SPA is possible.
- Use `fetch`/`use cache` with a **short, explicit lifetime** (**Superseded by 09 D-05/D-06:** v1 uses the classic Data Cache - `fetch` with `revalidate` + tags, plus on-demand `revalidateTag('catalog')` - and `cacheComponents` is off, so no `use cache`/`cacheLife`) (e.g. 60-300 s for lists, longer for company pages; numbers to be tuned) and pair every cache directive with `cacheLife` (Next docs recommendation [DOCS]). Page numbers and filters live in `searchParams`; Next's caching docs describe `searchParams` as runtime data that must sit behind `<Suspense>` or be passed into a cached function as an argument [DOCS]. The exact Cache Components wiring for list pages is something the implementing agent must validate against the Next 16.4 docs and measure in a preview deploy.
- Don't use Vercel-only features (Edge Config, Vercel KV, Vercel-specific middleware APIs) so Netlify stays viable.
- Do **not** use the image optimiser for external company logos (see section 4.4).

### 2.4 When to choose otherwise

| Situation | Choose instead | Why |
|---|---|---|
| The owner decides SEO/social previews are irrelevant (pure internal/tool use) or the API will never support SSR-friendly latency | **A. Vite SPA** (React 19 + TanStack Router + TanStack Query + nuqs) on any static host | Simplest, cheapest, most portable |
| Owner wants a Vite-native, router-first stack and accepts a young framework (1.0 stable only since 2026-10-13) | **TanStack Start 1.x** (SSR on Vite/Nitro) | Type-safe routing + search-param validation built in; deploys to Vercel/Netlify/Cloudflare per its release post ([DOCS], hosting list not formal) |
| Team prefers web-standards loaders/actions | **React Router 8 framework mode** | Netlify docs list build command `react-router build`, publish `build/client` [DOCS]; maturity for this use not assessed |
| Site is mostly editorial/static pages with a few interactive islands | **Astro 7 + React islands** | Tiny JS; but the filter UI is highly interactive, so islands add little here (not recommended for the core listing) |
| API cannot respond within ~1 s p95 or is rate-limited | Static JSON snapshots generated by a scheduled job (outside this UI's scope) served from CDN | Decouples UI from API availability |
| Traffic or crawler load exceeds the free tiers | Pro tier of the chosen host, or Cloudflare (not evaluated in depth, see 4.6) | See cost cliffs |

---

## 3. Recommended stack (summary)

| Concern | Choice |
|---|---|
| Framework | Next.js 16.x App Router, React 19.x, React Compiler 1.0 (pinned). Edge logic lives in `proxy.ts` (not `middleware.ts`) [FC1] |
| Language | TypeScript **6.0.x pinned** (see 1.1), `strict`, Node 24 LTS |
| Styling | Tailwind CSS 4.x with CSS variable design tokens (06) |
| Components | shadcn/ui (Radix-based copy-in components: Dialog/Sheet, Checkbox, Collapsible, Select) for the filter sheet and primitives; **React Aria Components** only if a suggestions combobox is built (best-tested keyboard/AT behaviour for combobox/listbox). Whether shadcn's current default primitives are Radix or Base UI is **UNVERIFIED**; check when initialising. Package manager: **npm** (09 D-22). |
| URL state | ~~`nuqs` 2.x~~ **Superseded by 09 D-18:** own pure-TS Zod codec, no nuqs in v1 (nuqs 2.10.2 remains a possible thin client binding later) |
| Data fetching | Server Components + `fetch` through the API layer (**09 D-04: TanStack Query is not installed in v1**; three tiny client fetches go through same-origin Route Handlers); **TanStack Query was optional** (use only for client-side suggestion/autocomplete or if mock mode runs fully in the browser). Don't add it by default. |
| Validation | Zod 4 for API responses and `searchParams` schemas |
| Tests | Vitest 5 (+ Testing Library) for units/components; Playwright 1.64 + `@axe-core/playwright` for E2E and a11y; MSW 3 for API mocking in tests |
| Lint/format | ESLint 10 + typescript-eslint + `eslint-plugin-react-hooks` + `jsx-a11y`; Biome 2 optional for formatting only. (The repo root already uses ESLint per AGENTS.md; keep the web app self-contained in its own `package.json`.) |
| Storybook | Optional; skip in v1 unless the design system is being handed off visually |
| Mock data | `API_MODE=mock\|live` env var switching an in-process fixtures adapter (deterministic, seeded, covers all edge cases from `00-brief` section 4) vs the real HTTP adapter |
| Analytics | None at launch; optional cookieless (see 4.5) |

---

## 4. Vercel vs Netlify free-tier comparison (numbers checked 2026-10-22)

Primary sources: Vercel docs [limits](https://vercel.com/docs/limits) (last updated 2026-09-16), [fair-use guidelines](https://vercel.com/docs/limits/fair-use-guidelines) (2026-09-14), [ISR pricing](https://vercel.com/docs/incremental-static-regeneration/limits-and-pricing) (2026-08-11), [vercel.json](https://vercel.com/docs/project-configuration/vercel-json) (2026-08-14); Netlify [pricing](https://www.netlify.com/pricing/), [credit-based plans docs](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/), [file-based config](https://docs.netlify.com/build/configure-builds/file-based-configuration/), [frameworks](https://docs.netlify.com/build/frameworks/overview/).

### 4.1 Commercial use: the decisive difference

| | Vercel Hobby | Netlify Free |
|---|---|---|
| Rule | **"Hobby teams are restricted to non-commercial personal use only. All commercial usage ... requires either a Pro or Enterprise plan."** [DOCS fair-use, last_updated 2026-09-14, re-fetched verbatim 2026-10-22 **[FC1]**] | The Netlify pricing page and credit-plan docs say nothing about commercial use [DOCS, re-fetched 2026-10-22 **[FC1]**]. The Website Terms of Use (last updated 2026-10-14) say Netlify's Services "are governed by the Self-Serve Subscription Agreement or the Enterprise Master Subscription Agreement" and require compliance with the Acceptable Use Policy [DOCS: netlify.com/legal/terms-of-use/]. Netlify's launch post for the Free plan reportedly says commercial projects are allowed, and forum answers say reselling hosting is not [SNIPPET: answers.netlify.com, netlify.com/blog/introducing-netlify-free-plan]. **The Subscription Agreement/AUP text itself is still UNVERIFIED - the owner must read it before relying on Netlify for anything commercial.** |
| Definition | Commercial = any deployment "used for the purpose of financial gain of **anyone** involved in **any part of the production** of the project, including a paid employee or consultant writing the code". Examples: requesting/processing payment from visitors; advertising a product/service for sale; being **paid to create, update or host** the site; **affiliate linking as the primary purpose**; **including advertisements (e.g. Google AdSense)**. **Donations are not commercial.** [DOCS] | not defined on pages read |

**What this means for a public job board:**
- A free, ad-free, affiliate-free personal/portfolio project, with at most a donation link, fits Vercel Hobby.
- **Any of these breaks Hobby terms:** display ads (AdSense etc.), sponsored/promoted job listings, "post a job" paid placement, affiliate links as the point of the site, or the owner being paid by an employer/client to build or run it. The `00-brief` already lists ads and employer posting tools as out of scope, so Hobby is compatible **today**, but it must be a conscious constraint recorded in the decision log.
- If monetisation is ever added: move to Vercel Pro, or switch host (the stack in section 3 is portable to Netlify; re-check Netlify's current terms first).
- Note also that a job board built for an employer/portfolio-for-hire could be read as "paid consultant writing the code"; the owner should confirm intent.

### 4.2 Limits and features

| Item | Vercel Hobby | Netlify Free |
|---|---|---|
| Pricing model | Fixed monthly allotments per resource ("Hobby teams get a monthly allotment of each billable resource") [DOCS] | **300 credits/month**, hard limit, no recharge, no rollover; resets each cycle [DOCS] |
| Bandwidth | **100 GB** Fast Data Transfer / month [DOCS fair-use table] | 20 credits per GB, i.e. about **15 GB** if the pool is used for bandwidth alone [DOCS rates; the 15 GB figure is derived] |
| Requests | Edge request allotment not stated in fetched docs (~1M per [SNIPPET: supadrop]) - **UNVERIFIED** | 2 credits per 10,000 web requests (about 1.5M if used alone) [DOCS] |
| Functions / SSR | **1,000,000 invocations**, 4 h Active CPU, 360 GB-hrs provisioned memory, 10 GB Fast Origin Transfer per month [DOCS]; max duration 300 s default and max [DOCS] | Compute 10 credits per GB-hour (about 30 GB-hours if used alone) [DOCS]. Functions invocation count is not a separate meter on the pricing page read. |
| Build minutes | No monthly build-minute quota found in docs read; **45 min max per build**; **100 builds/hour; 100 deployments/day** [DOCS]. (A "6,000 build minutes" figure appears in a third-party page: **UNVERIFIED**.) Static file hosting is not classed as a build [DOCS]. | Build minutes are **not metered** on the pricing page read; **1 concurrent build** on Free [DOCS]. **Production deploys cost 15 credits each (about 20 per month if nothing else is used)**; deploy previews, branch deploys and failed deploys are not charged [DOCS]. |
| ISR / on-demand revalidation | Supported. CDN cache reads/writes free; durable ISR reads/writes (8 KB units) are metered, **Hobby included amount not stated in the page read: UNVERIFIED** [DOCS] | Next.js "ISR, middleware, image optimization ... with zero configuration" [DOCS]. Parity of Next 16 `use cache` / Cache Components on Netlify: **UNVERIFIED**. |
| What happens at the limit | Third-party source claims the feature is locked for 30 days and sustained overuse can 503 [SNIPPET: convika.com]: **UNVERIFIED**. Hobby cannot buy more; upgrade to Pro (reported $20/seat/month [SNIPPET]; **not re-verified in round 1**). | Docs: "hard limit so no recharge option"; whether sites are paused is not stated on the page read [DOCS]. Netlify's 2024 launch post said sites are suspended for the rest of the month; mid-2026 forum reports describe a newer behaviour (existing site stays live, **production deploys paused**) plus users reporting a stuck-flag bug [SNIPPET]. **Treat as unresolved.** |
| Custom domain + HTTPS | Domains per project 50 on Hobby [DOCS]; HTTPS automatic (standard behaviour; not re-fetched) | "Add Custom domains with SSL" [DOCS] |
| Preview deploys | Preview deployments per Git push (standard; **count limit UNVERIFIED**); previews are not indexed by default per a Vercel KB title seen in the docs [DOCS/title only] | "Unlimited deploy previews" [DOCS], not credit-metered |
| Redirects/headers config | `vercel.json` (`redirects`, `rewrites`, `headers`; each counts as a Route, project limit applies) or framework config (`next.config.ts`) [DOCS] | `netlify.toml` `[[redirects]]` / `[[headers]]` and/or `_redirects`/`_headers` files [DOCS] |
| Monorepo subfolder | Project "Root Directory" setting (standard; not re-fetched). Hobby: **25 projects per Git repo**, 200 projects total [DOCS] | `[build] base = "web/"` [DOCS] |
| Git org repos | **Hobby cannot connect repos owned by a Git organisation** ("switch to an existing Team or create a new one") [DOCS]; the repo here is under a personal account (`pavan-reddy-28`), so OK | not stated |
| Env vars | Per environment (Production/Preview/Development); 64 KB total [DOCS] | UI/CLI/API, plus `[context.*.environment]` in `netlify.toml`; do not put secrets in the file [DOCS] |
| Image optimisation | Hobby: **5K transformations**, 300K cache reads, 100K cache writes per month [DOCS] | Not itemised on the pricing page read: **UNVERIFIED** |
| Source upload (CLI) | 100 MB [DOCS] | n/a |
| Runtime logs | 1 hour retention on Hobby [DOCS] | not checked |

### 4.3 Capacity estimate (order of magnitude, ASSUMPTIONS)

Assume ~200 KB transferred per first visit (compressed HTML + JS + CSS), ~60 KB per later navigation, 3 pageviews per visit.
- **Vercel Hobby 100 GB** is roughly 250-400k visits per month before bandwidth binds; function invocations (1M) bind around the same order if most pages are cache misses, so caching matters.
- **Netlify Free 15 GB-equivalent** is roughly 40-60k visits per month if bandwidth is the only consumer, and the same pool pays for requests, compute and production deploys. It is much tighter.
- Crawler traffic is a real consumer: 34k job URLs + 1.7k companies. Rate and scope are controlled by the sitemap and `robots.txt`; disallow filter/search parameters (01 section 2.11).

These are assumptions to be replaced by measurement from a preview deploy.

### 4.4 Image handling

Company logos are optional external URLs (`Company.logoUrl?`, often null). Do not run them through a paid optimiser: use a plain `<img>` (explicit width/height, `loading="lazy"`, `decoding="async"`, `referrerpolicy="no-referrer"`) with a monogram fallback; set `images.unoptimized` (or a restrictive `remotePatterns`) so the Vercel 5K-transformation allotment is never at risk.

### 4.5 Analytics (privacy-friendly, free)

| Option | Free allowance | Status |
|---|---|---|
| Vercel Web Analytics | Hobby: 50,000 events/month, 1-month reporting window; **collection pauses** when exceeded (Hobby cannot be charged) [SNIPPET of Vercel docs] | Cookie behaviour not confirmed in this session: **UNVERIFIED**; check that it needs no consent banner under the owner's jurisdiction |
| Vercel Speed Insights | Hobby: 1 project, 10,000 data points/month, 7-day window [SNIPPET of Vercel docs] | A third-party article claims a broader free tier: **UNVERIFIED** |
| Cloudflare Web Analytics, Plausible, Umami, Netlify Analytics | not researched this session | **UNVERIFIED** |

Default: **ship with no analytics** (brief hard constraint 1: nothing cookie-banner-worthy). Optionally enable one cookieless option after the owner confirms.

### 4.6 Third option noted but not evaluated

Cloudflare Pages Free plan limits fetched today: 500 builds/month, 20,000 files per site, 25 MiB per asset, 100 projects [DOCS]. Bandwidth, request quotas, commercial-use terms and Next.js support there were **not verified**. Mention only as an escape hatch for a pure-static build (Option A).

### 4.7 Cost cliffs

- **Vercel Hobby:** no overage billing - hitting a limit means features pause (exact behaviour UNVERIFIED); the next tier is Pro per seat. Commercial use of any kind forces Pro regardless of traffic. 100 deploys/day and 100 builds/hour cap CI-heavy workflows. 1-hour log retention hampers debugging.
- **Netlify Free:** one shared credit pool; bandwidth at 20 credits/GB is the tightest meter; **each production deploy costs 15 credits (about 20 deploys/month if nothing else is used)**; unresolved pause-behaviour reports. Next tier Personal $9/month (1,000 credits), Pro $20/month (3,000 credits, unlimited members) [DOCS: netlify.com/pricing, fetched 2026-10-22 **[FC1]** - now vendor-verified; credit rates 20/GB, 2 per 10k requests, 10 per GB-hour, 15 per production deploy also confirmed there]. Free-plan behaviour at the limit: the credit-plan doc says only "300 credits/month with credit hard limit" and "Hard limit so no recharge option" (it does not say whether sites go offline); forum threads from July-August 2026 report banners saying "Your sites may go offline and production deploys ... are currently disabled" and deploys blocked despite remaining credits, attributed by users to a stale-flag bug after a July 2026 credit migration [SNIPPET: answers.netlify.com threads; Netlify's response not seen]. **Plan for: production deploys can be blocked on Free.**

### 4.8 Recommendation

- **Primary: Vercel Hobby**, because (1) it is the maker's platform for Next.js, (2) it has the larger free allotments (100 GB, 1M invocations) for an SSR app, (3) no credit pool shared with deploys. **Constraint: strictly non-commercial** (no ads, no affiliate focus, no paid listings, owner not paid to run it). Donations are allowed.
- **Fallback: Netlify Free**, kept viable by not using Vercel-only features. Use it if (a) monetisation or paid work appears, (b) Vercel policy/limits change, or (c) the owner prefers its terms. Plan on a stricter budget (about 15 GB) and batch production deploys (about 20/month).
- If neither free tier fits long-term, budget for Vercel Pro or Netlify Personal/Pro.

---

## 5. Files and settings the implementing agent will create

Names and key fields only; the implementing agent writes the content. Assumes the app lives in `web/` at the repo root (recommended in 09).

### 5.1 In `web/`

| File | Key fields / purpose |
|---|---|
| `package.json` | `"engines": {"node": ">=24"}`, pinned deps (exact versions), scripts: `dev`, `build`, `start`, `lint`, `typecheck` (`tsc --noEmit`), `test` (Vitest), `test:e2e` (Playwright) |
| `.nvmrc` | `24` |
| `next.config.ts` | ~~`cacheComponents: true`, `partialPrefetching: true`~~ **Superseded by 09 D-06: `cacheComponents` is OFF in v1** (spike S1 decides; if ever enabled, set `partialPrefetching` explicitly - the cacheComponents docs, lastUpdated 2026-10-15, warn that leaving it unset logs a warning and that both become default in the next major [DOCS, FC1]), `reactCompiler: true`, `images: { unoptimized: true }` or restricted `remotePatterns`, `async headers()` (security headers), `async redirects()` (legacy/trailing slash), `poweredByHeader: false` |
| `tsconfig.json` | `strict`, `noUncheckedIndexedAccess`, path alias `@/*`; separate from the repo-root tsconfig (the root uses ts-node) |
| `postcss.config.mjs` + `app/globals.css` | Tailwind 4 (`@import "tailwindcss"`, `@theme` tokens from 06) |
| `components.json` | shadcn/ui config |
| `eslint.config.mjs` | flat config; `typescript-eslint`, `eslint-plugin-react-hooks` (recommended incl. compiler rules), `jsx-a11y` |
| `vitest.config.ts`, `playwright.config.ts` | `webServer` pointing at `npm run build && npm start` or dev with `API_MODE=mock` |
| `src/app/robots.ts` | disallow `/*?q=`, sort and multi-facet parameter patterns; reference sitemap. **Superseded by 09 D-01:** `?page=` is deliberately NOT disallowed (page>=2 is `noindex, follow`, self canonical, not in the sitemap) and every filter parameter (`q, sort, size, company, department, location, remote, salary, type, posted`) is disallowed plus `noindex` as backstop |
| `proxy.ts` | **[FC1]** Next 16 name for middleware (09 uses it for redirects and request headers) |
| `src/app/sitemap.ts` (+ index/children) | job + company canonical URLs (protocol cap 50,000 URLs/file; general knowledge, not fetched) |
| `src/api/` | typed client + Zod schemas + mock adapter (`API_MODE`) |
| `.env.example` | names only (below); never commit real values |

### 5.2 Environment variable names (proposed)

| Name | Scope | Meaning |
|---|---|---|
| `API_MODE` | server | `mock` or `live`; default `mock` until the backend exists |
| `API_BASE_URL` | server | Base URL of the read-only jobs API (live mode) |
| `NEXT_PUBLIC_SITE_URL` | public | Canonical origin for canonical tags, sitemap, OG URLs (e.g. `https://example.com`) |
| `NEXT_PUBLIC_API_BASE_URL` | public (only if the browser calls the API directly, e.g. suggestions) | **Superseded by 09 D-04: not created** (BFF Route Handlers; no CORS dependency) |
| `NEXT_PUBLIC_ANALYTICS_ID` | public, optional | **Superseded by 09 D-21: not created** in v1 |

### 5.3 Vercel (primary)

- Project settings: Framework Preset **Next.js**; **Root Directory = `web`**; Install `npm ci`; Build `npm run build`; Output: default (leave blank; Next.js manages `.next`); Node.js Version **24.x** (offered and the default per Vercel's Node versions page, last_updated 2026-02-27 [DOCS, FC1]); env vars per environment.
- `vercel.json` is optional. If used: `"framework": "nextjs"`, `headers` (only what `next.config.ts` cannot do), `redirects`. Avoid duplicating what `next.config.ts` already sets. Preview deployments should send `X-Robots-Tag: noindex` (Vercel's KB says previews are not indexed by default - [DOCS title], verify behaviour on first deploy).
- Git: connect the personal-account repo (Hobby cannot connect org-owned repos [DOCS]). Production branch `main`. Optionally "Ignored Build Step" so changes outside `web/` do not trigger deploys (setting name/behaviour **UNVERIFIED**; skipped monorepo deployments no longer count against limits per a Vercel changelog title seen in the docs).
- Production domain: add custom domain; HTTPS is automatic.

### 5.4 Netlify (fallback)

`netlify.toml` (at repo root, or inside `web/` with base set):
- `[build]` `base = "web"`, `command = "npm run build"`, `publish = ".next"` (per Netlify's Next.js entry: build `next build`, publish `.next` [DOCS]; the Next runtime handles SSR/ISR). `[build.environment]` `NODE_VERSION = "24"`.
- `[[headers]]` for `/*` security headers; a `[[headers]]` or `[context.deploy-preview]`/`branch-deploy` `X-Robots-Tag = "noindex"` for non-production.
- `[context.production.environment]` and `[context.deploy-preview.environment]` to set `API_MODE`/`API_BASE_URL` per context (secrets only in the UI).
- No SPA catch-all redirect needed for SSR; only if the project falls back to Option A (then `[[redirects]] from="/*" to="/index.html" status=200`, [DOCS]).
- Exact plugin/adapter requirements for Next 16 on Netlify: **UNVERIFIED**; the frameworks page says "zero configuration", confirm on first deploy.

### 5.5 If the project falls back to Option A (static SPA)

Vite config with `build.outDir = dist`; Vercel `rewrites` `{ "source": "/(.*)", "destination": "/index.html" }` (or Netlify redirect above); `public/robots.txt` and a **pre-generated** `sitemap.xml` (the SPA has no server to generate one); accept soft-404 for missing jobs. Document this loss in the decision log.

---

## 6. Open items the implementing agent must settle on day 1

1. Run a preview deploy of an empty Next 16.4 app on Vercel Hobby and on Netlify Free; confirm Node 24 (Netlify), the 09 D-06 spike S1 (real 404 status for unknown job ids with and without `cacheComponents`), and that `searchParams`-driven pages cache as designed. Record the real build/function numbers.
2. Confirm `next build` type-checks cleanly with the pinned TypeScript 6.0.x, and that React Compiler works with the chosen Next release.
3. Confirm whether `shadcn` init defaults to Radix or Base UI today and choose consciously.
4. Re-read Vercel's fair-use page and the owner's monetisation intent; record the answer.
5. Decide analytics (none vs one cookieless option).

---

## 7. Decision record

| # | Decision | Choice | Alternatives rejected | Reason |
|---|---|---|---|---|
| D1 | Rendering architecture | **SSR/ISR framework app (Option B)** | Static SPA; static shell + client fetch | Per-URL HTML, real 404/410, OG/JSON-LD in first response; shields uncontrolled API; acceptable free-tier fit |
| D2 | Framework | **Next.js 16.x App Router** | TanStack Start 1.x (stable only since 2026-10-13); React Router 8 framework mode; Astro 7 islands; Vite SPA | Ecosystem and portability; mature major; best support from nuqs/shadcn/Playwright; others remain the documented alternatives |
| D3 | Primary host | **Vercel Hobby** (non-commercial only) | Netlify Free; Cloudflare Pages | Larger free allotments (100 GB, 1M invocations), no shared credit pool; constraint recorded |
| D4 | Fallback host | **Netlify Free** | Cloudflare Pages (not evaluated) | Commercial use reportedly allowed; supports Next.js; much tighter credit budget (about 15 GB, about 20 prod deploys/month) |
| D5 | Language/tooling | **TypeScript 6.0.x pinned**, Node 24 LTS | TypeScript 7.0.2 | `typescript-eslint` peer range excludes >= 6.1; TS 7 compiler API not stable until 7.1 (reported) |
| D6 | Styling | **Tailwind CSS 4.x** + CSS-variable tokens | CSS Modules; vanilla-extract | Matches shadcn/ui, fast to iterate, tokens map to 06 |
| D7 | Component layer | **shadcn/ui (Radix) + React Aria Components for combobox only if needed** | Base UI; all-React-Aria; hand-rolled | Accessible primitives, owned code, minimal bundle; APG-correct combobox only where needed |
| D8 | URL state | **nuqs 2.x** with shared parsers (**Superseded by 09 D-18: own Zod codec, no nuqs in v1**) | hand-rolled `URLSearchParams`; TanStack Router search params | Type-safe, Next App Router support, server access to parsed params |
| D9 | Data fetching | **Server Components + typed API layer**, TanStack Query optional (**09 D-04: not installed in v1**) | TanStack Query everywhere | Less client JS; caching handled on server; Query only for client-side suggestions |
| D10 | Validation | **Zod 4** at API boundary and for params | Valibot; none | Contract safety against an API we don't control |
| D11 | Testing | **Vitest 5 + Testing Library; Playwright + axe; MSW 3** | Jest; Cypress | Native Vite/ESM fit; a11y in E2E; shared mocks with dev mock mode |
| D12 | Lint/format | **ESLint 10 + typescript-eslint + react-hooks (compiler rules) + jsx-a11y; Biome optional (format)** | Biome-only | React Compiler diagnostics and a11y rules live in ESLint plugins |
| D13 | Compiler | **React Compiler 1.0**, exact-pinned | manual memoisation | Stable; fewer manual hooks; keep E2E coverage |
| D14 | Mock strategy (09 D-16 adds `API_ADAPTER=proposal\|owner`) | **In-process fixtures adapter via `API_MODE`**, MSW for tests | MSW-only in browser | Works with server-side rendering (no browser service worker involved) |
| D15 | Images | **No optimiser for external logos**; monogram fallback | Next/Vercel image optimisation | Protects the 5K-transformation Hobby allotment; logos are often null |
| D16 | Analytics | **None at launch**; optional cookieless later | GA4 | Brief forbids cookie-banner-worthy tracking |
| D17 | Monorepo layout | **`web/` subfolder with its own `package.json`** | Root-level app | Root is a ts-node CLI project; both hosts support a root/base directory |
| D18 | Indexing (**Superseded by 09 D-01**: hybrid - clean `/` indexed, page>=2 `noindex, follow`, filter URLs disallowed + `noindex`) | Sitemap + robots.txt per `01` 2.11; no filter/search URLs indexed | Index everything | Crawl budget, free-tier invocations, duplicate content |

---

## 8. Versions verified on 2026-10-22

Command: `npm view <pkg> version` (and `dist-tags`/`peerDependencies`/`engines` where noted) on 2026-10-22.

| Package | `latest` | Evidence / note |
|---|---|---|
| react | 19.3.1 | [NPM] |
| next | 16.4.2 | [NPM] (re-run 2026-10-22, unchanged); `engines.node >=20.9.0`; peer `react ^18.2 \|\| ^19`; optional peer `babel-plugin-react-compiler` |
| react-router | 8.5.0 | [NPM]; `engines.node >=22.22.0` |
| @tanstack/react-start | 1.169.4 | [NPM]; 1.0 stable announced 2026-10-13 [DOCS] |
| @tanstack/react-router | 1.170.46 | [NPM] |
| @tanstack/react-query | 5.104.5 | [NPM]; peer `react ^18 || ^19` |
| astro | 7.4.2 | [NPM] |
| typescript | 7.0.2 (latest); 6.0.3 (latest 6.x); 7.1.0-beta (beta tag) | [NPM] dist-tags |
| vite | 8.3.5 | [NPM]; Node `^20.19.0 || >=22.12.0` |
| @vitejs/plugin-react | 6.1.2 | [NPM]; peer `vite ^8`; compiler via optional `@rolldown/plugin-babel` + `babel-plugin-react-compiler` |
| babel-plugin-react-compiler | 1.0.0 | [NPM]; stable per react.dev post 2025-10-07 |
| tailwindcss | 4.3.3 | [NPM]; `@tailwindcss/vite` 4.3.3 |
| radix-ui | 1.8.1 | [NPM] |
| shadcn (CLI) | 4.22.1 | [NPM] |
| react-aria-components | 1.22.1 | [NPM] |
| @base-ui/react | 1.9.0 | [NPM] |
| zod | 4.6.7 | [NPM] |
| nuqs | 2.10.2 | [NPM] |
| vitest | 5.0.5 | [NPM]; peer `vite ^6.4 || ^7 || ^8` |
| @playwright/test | 1.64.1 | [NPM] |
| @axe-core/playwright | 4.14.0 | [NPM] |
| msw | 3.0.3 | [NPM]; Node `>=22.12.0` |
| storybook | 10.6.3 | [NPM] |
| eslint | 10.13.0 | [NPM] |
| typescript-eslint | 8.72.0 | [NPM]; peer `typescript >=4.8.4 <6.1.0`, `eslint ^8.57 || ^9 || ^10` |
| eslint-plugin-react-hooks | 7.1.1 | [NPM] |
| @biomejs/biome | 2.6.2 | [NPM] |
| @types/node | 26.6.5 (latest) | [NPM] **[FC1]**; pin 24.x |
| lucide-react | 1.61.0 | [NPM] **[FC1]** |
| geist | 1.8.2 | [NPM]; peer `next >=13.2.0` **[FC1]** |
| @fontsource-variable/geist, @fontsource-variable/geist-mono | 5.3.0 | [NPM] **[FC1]** |
| eslint-plugin-jsx-a11y | 6.10.2 | [NPM] **[FC1]** |
| @testing-library/react | 16.3.3 | [NPM] **[FC1]** |
| jsdom | 30.1.3 | [NPM] **[FC1]** |
| Node.js | LTS 24.22.1 "Krypton" (also LTS 22.23.4); Current 26.12.1; local machine runs v24.21.0 | [DOCS] nodejs.org previous-releases; `node -v` |

## 9. Unverified items (carry to `11`)

- Whether `next build` and the Next type plugin work with TypeScript 7; the pin to 6.0.x avoids the question.
- Netlify's Free-plan commercial-use terms (Self-Serve Subscription Agreement/AUP text; the Website Terms only defer to them), and its exact behaviour when credits run out (docs silent; forum reports of blocked production deploys).
- Vercel Hobby: edge-request allotment, ISR read/write allotment, preview deployment limits, behaviour at limit, cookie behaviour of Web Analytics. (Node 24 availability is now verified, see 1.1.)
- Netlify: image CDN and analytics pricing, `proxy.ts`/`use cache` support and Next 16.4 specifically (docs list ISR and Cache Components generically as supported), build-image Node versions.
- Cloudflare Pages/Workers: bandwidth, request quotas, commercial terms, Next.js support.
- Whether shadcn's current init defaults to Radix or Base UI; `<ViewTransition>` status in React 19.3.
- Third-party pricing figure ($20/seat Vercel Pro) came from non-vendor summaries. (Netlify $9/$20 is now vendor-verified.)
- Whether `next build` type-checking and typescript-eslint work with TS 7: typescript-eslint peer range verified by `npm view`; the "closed as not planned" status is from a secondary summary only.

---

## 10. Legal & terms risk (not legal advice)

> Added in fact-check round 1, 2026-10-22. This is a first-pass desk check by an AI agent, **not legal advice**. It lists what was found and what the owner must confirm. The product re-displays job postings that this repo's scraper collects from Ashby-hosted boards (`jobs.ashbyhq.com/<company>` and the posting API) on a public site.

### 10.1 What was found

| Topic | Finding | Source / date |
|---|---|---|
| Ashby `robots.txt` for the job-board host | `User-agent: *` with only `Disallow: /meeting/`, `Disallow: /b/`, `Disallow: /api/`. Job-board paths are not disallowed. **Caveat:** the GraphQL fallback this repo uses lives under `/api/` (`https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams`), which that robots.txt disallows for generic crawlers. The posting API this repo uses first is on another host (`https://api.ashbyhq.com/posting-api/job-board/{slug}`, `src/lib/AshbyClient.ts:264`); a fetch of `https://api.ashbyhq.com/robots.txt` returned HTTP 401, so its robots policy is **unknown**. | https://jobs.ashbyhq.com/robots.txt, fetched 2026-10-22 |
| Ashby Customer Terms of Service | The agreement binds Ashby and its business customers (and their users). No clause on scraping, crawling, bots, robots.txt or automated access; closest is s5.1(f) (do not circumvent security features of the Service). It mentions job boards only as customer-elected "Third-Party Integrations". It does not grant or restrict third-party redisplay of public postings. Last updated 2025-09-29 per a search summary. | https://www.ashbyhq.com/terms, fetched 2026-10-22 |
| Ashby visitor/website terms | A search for visitor terms of use for the website or job boards returned only customer, AI-feature, design-partner and privacy documents. **No visitor terms were found; none confirmed or ruled out.** | web search 2026-10-22 |
| Public job posting API docs | Describes the API as the way to "get data for all currently published Job Postings for your organization" and says "If you host your own careers page, you can use this data to populate it." Examples use unauthenticated GET. The page states **no rate limits, caching rules, attribution rules or terms about third-party redisplay**. `isListed=false` postings "should only be available via direct link". `includeCompensation=true` is opt-in. Users wanting more fields are told to reach out. | https://developers.ashbyhq.com/docs/public-job-posting-api, fetched 2026-10-22 |
| Google JobPosting policies | "Only employers can provide `baseSalary`." Violations include "Job postings on behalf of an organization or company without authorization." Third-party sites should "provide the title as you received it from the employer"; `logo` is only eligible on the employer's own site; expired jobs not allowed; details must be visible without login; one job per page. The page does not define "job aggregator". | https://developers.google.com/search/docs/appearance/structured-data/job-posting, Last updated 2026-09-08 UTC, fetched 2026-10-22 |
| Hosting terms | Vercel Hobby: non-commercial only (see 4.1). Netlify: governed by the Self-Serve Subscription Agreement and AUP (not read). Neither page mentions scraped content. | see 4.1 |

### 10.2 Risk assessment (desk-level)

1. **Contractual:** nothing found forbids reading publicly published postings or the documented public API, but nothing grants a licence to republish them either. Silence is not permission. The posting API docs frame the data as the *employer's* to use on its *own* careers page.
2. **Robots/technical:** the production scraper's GraphQL fallback path (`/api/non-user-graphql`) falls under `Disallow: /api/` on jobs.ashbyhq.com. Respecting robots.txt is a convention, not law, but it is a visible compliance gap if the project is public. (This concerns the existing scraper, not the frontend; flag to the owner.)
3. **Copyright / database rights / employer relationship:** job text and company names/logos belong to the employers. Full descriptions are the highest-risk content; title, company, location and an outbound Apply link are the lowest. No jurisdiction-specific analysis was done (EU database right, US scraping case law, etc.).
4. **Google for Jobs:** markup for postings "on behalf of an organization ... without authorization" is a listed violation, and only employers may supply `baseSalary`. Emitting JSON-LD for scraped postings could be treated as spam and risk the whole site's Jobs eligibility. This conflicts with 09 D-15, which allows JSON-LD and `baseSalary` when the data gates pass.
5. **Personal data:** descriptions or metadata may contain recruiter names, emails or phone numbers. The privacy implications (GDPR/CCPA) of republishing them were not assessed.
6. **Misrepresentation:** the brief already requires that visitors never think the site is the employer; keep "Source: Ashby, via {Company}" and a takedown contact.
7. **Hosting terms:** Vercel Hobby forbids commercial use; if the owner monetises later, hosting and licensing questions both change.

### 10.3 What the owner must confirm

- Read Ashby's full legal pages (customer terms, any website/candidate terms for jobs.ashbyhq.com, AUP) and, ideally, ask Ashby support in writing whether redisplaying public job-board data on a third-party site is acceptable and under what rate limits; save the answer.
- Decide whether to rely only on the documented `posting-api` host (check its robots.txt and rate-limit behaviour) and retire or justify the `/api/non-user-graphql` fallback.
- Decide the content scope: title/company/location/salary/link-out only, versus descriptions (higher risk). Consider linking to the employer's page instead of copying descriptions.
- Decide whether to emit `JobPosting` JSON-LD at all, and never emit `baseSalary` from a non-employer site unless Google's policy is confirmed to allow it.
- Provide a takedown/contact route and honour removal requests promptly (the scraper already deactivates stale jobs).
- Check privacy/GDPR obligations for any personal data in descriptions; consider stripping contact details.
- Confirm hosting terms match intent (Vercel Hobby non-commercial; Netlify Subscription Agreement unread).
- Get a lawyer's opinion before any monetisation or heavy promotion.

