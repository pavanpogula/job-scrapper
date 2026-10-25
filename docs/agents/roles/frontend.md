# Role: frontend

## Responsibilities
- Owns the React 19 web application in `frontend/` built with TypeScript, Vite, Tailwind CSS, and Redux Toolkit.
- Implements job browsing, search debounce, facet multi-select, detail drawer presentation, and mobile-responsive views.
- Enforces defensive security: sanitizes HTML rendering using DOMPurify to eliminate Stored XSS risks.
- Maintains accessibility (WCAG AA), responsive layouts, smooth state transitions, and error states.
- Authorizes and maintains UI test suites using Vitest, React Testing Library, and MSW (Mock Service Worker).

## Read-First List
1. `AGENTS.md`
2. `documentation/agents/context.md`
3. `documentation/13-frontend-ui.md`
4. `documentation/12-backend-api.md`
5. `frontend/src/types/api.ts`

## Allowed Scope
- `frontend/**`
- `documentation/13-frontend-ui.md`

## Output Contract
- High-quality, polished React components and Redux Toolkit state slices.
- UI changes verified by `npm --prefix frontend run check` or `scripts/check-all.sh --no-install`.
