# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary users are job seekers, software engineers, product managers, and knowledge workers looking for direct, verified job postings directly on company career boards (Ashby ATS) without intermediate recruiter spam, stale postings, or mandatory logins.

## Product Purpose

B.O.O.L.E.A.N is a clean, ultra-responsive job browsing web application and company career directory. It enables job seekers to quickly search, filter, and review verified company postings with full salary transparency and freshness tracking, and apply directly at the employer's official Ashby board.

## Positioning

Direct career-board postings index with verified freshness and direct apply links. Unlike cluttered aggregator boards with sponsored placements, ghost postings, and account walls, B.O.O.L.E.A.N provides direct company-board truth, transparent salary data, and clean LinkedIn-style list/detail browsing with zero tracking or user login required.

## Operating Context

- Web application accessed via desktop and mobile browsers.
- Desktop experience utilizes an efficient two-pane layout (scrollable job list on the left, sticky job details on the right with URL-synced selection).
- Mobile experience prioritizes focused browsing with tap-to-detail navigation and compact filter drawers.
- Surface mode: Operate. Scanability, speed, keyboard accessibility, and information density outrank decorative expression.

## Capabilities and Constraints

- **Stack:** React 19, TypeScript, Vite, Redux Toolkit (RTK Query), Material UI (MUI 9), Emotion.
- **Data Source:** Monorepo Express REST API deployed on Vercel (`/v1/jobs`, `/v1/jobs/:id`, `/v1/companies`, `/v1/companies/:slug`, `/v1/facets`, `/v1/meta`).
- **Browsing:**
  - Keyword search across title, company, department, and location (BF-020 all-words matching).
  - Filter pills: Date posted (`postedWithin=1d|7d|30d`), Workplace type, Employment type, Salary transparency (`hasSalary=true`), Remote only, and Sort options.
  - Two-pane desktop workspace with deep-linkable `?jobId=` query param and hover/focus detail prefetching.
- **Company Pages:**
  - Company directory (`/companies`) with "Most hiring / A–Z" sorting (`sort=jobs|name`).
  - Dedicated company profile (`/companies/:slug`) featuring Overview metrics (job count, salary availability, latest published date, top departments and locations) and a Jobs tab with a "Recently posted" carousel and department-grouped listings.
- **Constraints:**
  - No user logins or account creation; all actions lead directly to external employer apply URLs.
  - Strict accessibility: full keyboard navigation, `role="list"`, `aria-current="true"`, visible focus states, polite live-region result counts.

## Brand Commitments

- Brand Name / Wordmark: **B.O.O.L.E.A.N** (represented with semantic spacing/typography; do not invent an acronym expansion).
- Replaces legacy "Ashby Index" naming across public UI, page titles, header, footer, favicon, and about copy.
- Neutral, modern, restrained aesthetic with high-contrast readable typography and functional accent colors.

## Product Principles

1. **Direct to Source:** Every posting links directly to the employer's official Ashby ATS application. Zero middleman friction.
2. **Density and Precision (Operate Mode):** High information density without visual clutter. Clean metadata lines, humanized labels, clear salary ranges, and relative freshness badges.
3. **Frictionless Navigation:** Fast search, instant filter pill toggles, and two-pane master-detail desktop workflow with URL state persistence.
4. **Transparent Facts:** Always display verified salary ranges when available and accurate freshness timestamps based on content diffs and publication dates.

## Accessibility & Inclusion

WCAG 2.1 AA compliance across light and dark modes. Contrast ratios >= 4.5:1 for body copy and >= 3:1 for large text and UI components. Full screen reader support with semantic HTML, ARIA landmarks, keyboard navigation (Tab/Enter), and polite live announcements for filter updates.
