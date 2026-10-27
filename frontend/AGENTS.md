# Frontend Agents Guide

> [!IMPORTANT]
> **Preferred Launch Location:** Prefer launching AI coding sessions from the monorepo root. If launched from `frontend/`, verify all commands and paths are relative to this directory.

## Scope & Architecture
The frontend application comprises:
1. **React 19 SPA (B.O.O.L.E.A.N):** Built with TypeScript, Vite, Redux Toolkit (RTK Query), and Material UI (MUI).
2. **Core Capabilities:** Public job board browsing, debounced search, facet multi-select, detail drawer presentation, and mobile-responsive views.
3. **API Integration:** Queries Express REST API endpoints (`/v1/jobs`, `/v1/companies`, `/v1/facets`, `/v1/meta`).

## Verification & Commands
Run from `frontend/`:
- **Full Verification:** `npm run check` (`typecheck && lint && test && build`).
- **Individual Checks:**
  - Tests: `npm test` (Vitest with React Testing Library and MSW).
  - Typecheck: `npm run typecheck` (`tsc --noEmit`).
  - Lint: `npm run lint` (`eslint .`).
  - Production Build: `npm run build` (`vite build`).

*Note: From the monorepo root, run `scripts/check-all.sh --no-install` or prefix with `npm --prefix frontend run <script>`.*

## Stack & Security Invariants
- **UI Framework:** Exclusively Material UI (MUI). Do NOT introduce Tailwind CSS (fix any Tailwind drift).
- **Security (XSS):** All raw HTML rendering of job descriptions must be sanitized with DOMPurify.
- **Accessibility & Localization:** Maintain accessible keyboard navigation and WCAG AA contrast standards. Country facets must use `Intl.DisplayNames` for localized display.
- **Design & Polish:** Consult the `impeccable` skill for visual hierarchy, typography, motion, and design system tokens.
- **Deploys:** manual only via `.github/workflows/deploy.yml` (ADR-0016); a merge does not publish the site. Keep `git.deploymentEnabled: false` in `vercel.json`.

## Working Directory & Git Safety
- **CWD:** All commands in this workspace run with `frontend/` as the current working directory.
- **Git Safety:** Commit only on task/phase branches with Conventional Commits. Agents never push to `main`/`master`, never merge, never force-push, push tags or delete branches, and never run raw `git push` or `gh`. Publish or update a task branch only with `../scripts/agents/push-branch.sh` (from `frontend/`) (fast-forward only; it prints the pull-request link). The owner reviews and merges.

## Key Documentation
- Frontend UI routes & components: `frontend/docs/frontend-ui.md`
- Frontend technical debt & contract items: `frontend/docs/known-issues.md`
- Component testing & MSW guide: `frontend/docs/testing.md`
- Backend API contract reference: `backend/docs/api.md`
- Full documentation index: `docs/README.md`
