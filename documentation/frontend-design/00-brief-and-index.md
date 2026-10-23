# 00 · Frontend Design Brief & Index

> **Status:** DESIGN ONLY. Nothing in this folder is implemented. These documents are the hand-off package for an
> implementation agent. No application code, scaffolding or dependency installs have been done for the frontend.
> _Authored 2026-10-22. The backend HTTP API does not exist yet; its contract here is a **proposal** (see 08)._

## 1. What we are designing

A **public, read-only job board** that displays the jobs this repo's scraper collects from companies on the Ashby ATS.
Visitors browse, search, filter, paginate, open a job, and click **Apply** (which leaves our site for the company's own
Ashby application page). There is no account of any kind.

## 2. Job & audience (visitor mode: **Operate**, with a light **Read** mode on the job-detail page)

- **Who arrives:** job seekers, mostly on a phone or laptop, often from a search engine or a shared link; also people
  casually browsing "who is hiring". Many are comparing several roles quickly. They are task-focused, impatient, and
  trust-sensitive (they want to know where Apply leads).
- **Primary task:** find a relevant job fast, judge it at a glance (title, company, location, remote?, salary?, posted
  when?), and click Apply.
- **Success:** a visitor can go from landing to "Apply" in under ~30 seconds and ≤ 3 interactions; every filtered view
  is a shareable URL; the site is fast on a mid-range phone.
- **What is true here that a generic template could not claim:** the dataset is broad (≈34,000 live jobs across ≈1,750
  hiring companies at last run) and comes straight from companies' own Ashby boards, so Apply links go to the real
  source and there is no middleman, sign-up or tracking. Salary is shown when the company published it (≈40 % of jobs).

## 3. Hard constraints (from the product owner)

1. **No login / signup / personal features.** No saved jobs, alerts, profiles, applications tracked by us, or
   cookies-banner-worthy tracking. (Local-only conveniences such as "recently viewed" in `localStorage` are an
   _optional, flagged_ idea only; the core ships without them.)
2. **Pagination is required** (the list is far too large to render at once).
3. **Hosting:** free tier of **Vercel or Netlify**. Design for static/edge hosting, no always-on server of our own for
   the UI. Recommendation and trade-offs belong in 02.
4. **Latest stable tooling** (React and friends): verify current versions at implementation time, don't assume.
5. **Backend endpoints come later.** Design the UI against a **proposed API contract** (08) and a **mock-data strategy**
   so the frontend can be built before the backend exists.
6. **Deliverables are documents**, including a **Figma build spec** (07). The implementation is a separate task for
   another agent.

## 4. Data we can show (verified in this repo)

From `prisma/schema.prisma` and `src/core/Scraper.ts` (`Job.metadata` is the full sanitized Ashby job object):

| UI concept | Source | Notes |
|---|---|---|
| Job id | `Job.id` (uuid), `Job.ashbyId` | `ashbyId` is Ashby's job id |
| Title | `Job.title` | sanitized text |
| Company | `Company.slug` (unique), `Company.name`, `Company.logoUrl` | **99.0% enriched** (1,729 / 1,747 active hiring companies have real display name & hosted SVG/PNG logo; monogram fallback for remainder) |
| Department | `Department.name` | nullable |
| Location | `Location.name` (raw text), plus structured `Job.country`, `Job.region`, `Job.city`, `Job.postalAddress` | **Normalized & indexed** (97.3% have structured postal addresses; country/city filtering supported directly) |
| Remote & Workplace | `Job.isRemote`, `Job.workplaceType` | **First-class columns & indexed** (`Remote`, `OnSite`, `Hybrid`) |
| Employment type | `Job.employmentType` | **First-class column & indexed** (100.0% present: `FullTime`, `Contract`, `PartTime`, `Intern`, `Temporary`) |
| Posted date | `Job.publishedAt` | **99.94% present (34,015 / 34,037 active jobs)**; indexed first-class timestamp column |
| Salary | `salaryMin`, `salaryMax`, `salaryCurrency`, `salaryInterval` | Structured interval (`1 YEAR`, `1 HOUR`, etc.) prevents mixing hourly with annual compensation |
| Apply link | `Job.applyUrl` (absolute http(s), sanitized) | the only outbound action |
| Description | `metadata.descriptionHtml`, `metadata.descriptionPlain` | **99.94% present (34,015 / 34,037 active jobs)**; sanitized (scripts/iframes/dangerous HTML stripped) |
| Freshness | `Job.updatedAt`, `Job.createdAt`, `Job.active` | only `active = true` jobs are shown |

Known data characteristics:
- Full job descriptions and published dates are present on **99.94%** of jobs (only 22 out of 34,037 GraphQL-fallback jobs currently lack them).
- Real company display names and logos exist for **99.0%** of active hiring companies.
- Locations have structured country, region, and city data for 97.3% of jobs.
- Salaries are published on ≈40% of jobs and include structured `salaryInterval` so salary filters can cleanly isolate annual vs. hourly roles.

## 5. Scope & anti-goals

- **In scope:** home/browse (search + filters + paginated results), job detail, company page (all jobs of one company),
  about/how-it-works + privacy note, 404/error/empty states, light/dark theme, mobile-first responsive layouts,
  accessibility, SEO and share-ability, performance budget, hosting/deployment design, API contract proposal,
  frontend architecture, mock-data strategy, test strategy, implementation roadmap.
- **Out of scope / anti-goals:** accounts, saved searches, email alerts, application tracking, employer posting tools,
  admin, analytics dashboards of the scraper, AI chat, "resume matching", ads, newsletter pop-ups, cookie walls,
  anything that makes the visitor think we are the employer.

## 6. Assumptions (correct me)

- A1. The UI is a **separate app** (suggested location: a new top-level `web/` folder in this repo, or a new repo; 09
  recommends one). The backend API will be provided later at a base URL given by an env var.
- A2. English only for v1; currencies shown as published; no localization framework, but no hard-coded layout that
  breaks with longer strings.
- A3. Public-data only; we display the company's title/location/salary and link out. A short, neutral description
  excerpt is shown only if the API provides it.
- A4. The API will be read-only `GET` with permissive CORS for our domain; no auth headers.
- A5. Traffic is modest; free-tier limits are acceptable (verify in 02).

## 7. Document map (read in order)

| # | File | Content |
|---|------|---------|
| 00 | this file | Brief, constraints, data facts, index |
| 01 | `01-research-and-references.md` | Job-board UI research, patterns to adopt/avoid, reference sites |
| 02 | `02-tech-stack-and-hosting.md` | Latest stack decision (verified versions), Vercel vs Netlify free-tier comparison + recommendation |
| 03 | `03-personas-and-use-cases.md` | Personas, jobs-to-be-done, use cases, success metrics |
| 04 | `04-information-architecture-and-flows.md` | Sitemap, URL scheme, user flows, navigation model, pagination/filter model |
| 05 | `05-screens-and-states.md` | Per-screen wireframes (ASCII), components used, all states (loading/empty/error/…) |
| 06 | `06-visual-direction-and-design-system.md` | Visual world, tokens, type, colour, spacing, components, motion, dark mode |
| 07 | `07-figma-build-spec.md` | How to build the Figma file: pages, frames, variables, components, variants, prototypes |
| 08 | `08-api-contract-proposal.md` | Proposed REST endpoints, params, response shapes, errors, caching, backend gaps |
| 09 | `09-frontend-architecture.md` | Project structure, routing, data fetching, state, SEO, perf, a11y, testing, CI/CD |
| 10 | `10-implementation-roadmap.md` | Phased plan, task breakdown, acceptance criteria, handoff checklist for the implementing agent |
| 11 | `11-design-review-and-open-questions.md` | Validation results, risks, decisions needed from the owner |
