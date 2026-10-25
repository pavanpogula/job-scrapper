---
trigger: glob
globs: "frontend/**"
description: "Frontend web application invariants"
---

# Frontend Invariants
1. All changes must pass `npm --prefix frontend run check` (typecheck, lint, Vitest unit tests, build).
2. All raw HTML rendering of job descriptions must be sanitized with DOMPurify.
3. Country facets must use `Intl.DisplayNames` for localized display.
4. Maintain accessible keyboard navigation and WCAG AA contrast standards.
