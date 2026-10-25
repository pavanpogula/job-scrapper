---
trigger: glob
globs: ".github/**, scripts/ci/**"
description: "CI workflows, path filtering, and status gate invariants"
---
<!-- GENERATED from docs/agents/rules/ci-and-workflows.md - DO NOT EDIT DIRECTLY -->

# CI & Workflow Invariants
1. **Parallel Monorepo Workflows:** CI is split into `.github/workflows/backend-ci.yml`, `frontend-ci.yml`, and `repo-ci.yml`.
2. **Path Filtering & Gates:** Every workflow uses path-based change detection via a `changes` job, and must define a final gate job (`backend-gate`, `frontend-gate`, `repo-gate`) using `if: always()` that checks all other jobs.
3. **Actionlint Pinning:** `actionlint` runs exclusively in `repo-ci` with a pinned version and SHA-256 verification; never add actionlint to `scripts/check-all.sh`.
4. **Fixer Scope Verification:** `scripts/ci/check-fixer-scope.sh` enforces file modification boundaries on `auto-fix/*` branches.
5. **Feature Toggles:** Scheduled workflows include feature flags (`SCRAPE_ENABLED`, `FIXER_ENABLED`, `DISCOVERY_ENABLED`) controlled by repository variables.
