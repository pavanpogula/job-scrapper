# Frontend Known Issues & Tech Debt

Severity: 🔴 data-correctness bug · 🟠 reliability/operational risk · 🟡 inconsistency / docs drift · ⚪ cleanup.

This document tracks known issues, technical debt, and pending alignments specific to the React 19 web application in `frontend/`.

---

## 🟡 Contract Divergences & Alignment (Tracked for Phase P8a)

### #FE-01: `JobDetail` type specifies `createdAt` and `updatedAt`
- **Location:** `frontend/src/types/api.ts`
- **Impact:** Frontend interface expects `createdAt` and `updatedAt` on `JobDetail`, but Express REST API `Server.ts` maps DB rows without these fields.
- **Resolution Plan:** Per owner decision **O3**, remove `createdAt` and `updatedAt` from `JobDetail` in Phase P8a.

### #FE-02: Search and filter queries support unindexed filter keys
- **Location:** `frontend/src/types/api.ts`, `frontend/src/store/api/jobsApi.ts`
- **Impact:** Query builder references `company`, `department`, `location`, `city`, and `sortBy=title`, which the backend API ignores or does not support.
- **Resolution Plan:** Per owner decision **O4**, remove unsupported filter parameters and `sortBy=title` from UI query types in Phase P8a.

---

## ⚪ UI & Component Tech Debt

### #FE-03: Material-UI v6 deprecation warnings on Emotion cache
- **Location:** `frontend/src/main.tsx`
- **Impact:** Console warnings in dev mode regarding Emotion cache configuration with React 19 strict mode.
- **Status:** Non-blocking; production build compiles cleanly without runtime exceptions.

### #FE-04: Test coverage expansion for error boundaries
- **Location:** `frontend/src/components/`
- **Impact:** Core components are tested with Vitest + MSW (14 tests in 5 suites), but offline and edge error state handling relies on fallback UI without dedicated unit test cases.
- **Status:** Planned for post-migration UI test hardening.
