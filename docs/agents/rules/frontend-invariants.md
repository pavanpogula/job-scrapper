---
id: frontend-invariants
scope: frontend
always: false
applies_to:
  - "frontend/**"
description: "Frontend web application invariants and stack rules (MUI, no Tailwind)"
---
# Frontend Invariants
1. **Stack & Components:** Built with React 19, TypeScript, Vite, Redux Toolkit, and Material UI (MUI). Do NOT use or introduce Tailwind CSS (fix any Tailwind drift).
2. **Mandatory Verification:** All changes must pass `npm --prefix frontend run check` (typecheck, lint, Vitest unit tests, build).
3. **Security (XSS):** All raw HTML rendering of job descriptions must be sanitized with DOMPurify.
4. **Accessibility & Localization:** Maintain accessible keyboard navigation and WCAG AA contrast standards. Country facets must use `Intl.DisplayNames` for localized display.
