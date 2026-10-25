---
paths: ["frontend/**"]
---
<!-- GENERATED from docs/agents/rules/frontend-invariants.md - DO NOT EDIT DIRECTLY -->

# Frontend Invariants
1. **Stack & Components:** Built with React 19, TypeScript, Vite, Redux Toolkit, and Material UI (MUI). Do NOT use or introduce Tailwind CSS (fix any Tailwind drift).
2. **Mandatory Verification:** All changes must pass `npm --prefix frontend run check` (typecheck, lint, Vitest unit tests, build).
3. **Security (XSS):** All raw HTML rendering of job descriptions must be sanitized with DOMPurify.
4. **Accessibility & Localization:** Maintain accessible keyboard navigation and WCAG AA contrast standards. Country facets must use `Intl.DisplayNames` for localized display.
