# ADR-0016: Manual Vercel deploys from a GitHub Actions workflow

- Status: Accepted
- Date: 2026-10-26
- Deciders: owner
- Related: ADR-0014, P3a (ignoreCommand outage), `.github/workflows/deploy.yml`

## Context
Both Vercel projects (`job-scrapper-ui`, `job-scrapper-api`) built and deployed on every git push. The owner
pushes to `main` often while the project is in active development, so production changed with every push and
build minutes were spent on throwaway states. The P3a `ignoreCommand` (skip builds without changes) also cancelled
manual redeploys, which caused a ~30 minute outage after the backend split.

## Options Considered
1. **Keep git deploys, add an ignore rule:** still automatic; `ignoreCommand` already proved fragile.
2. **Vercel Deploy Hooks:** a secret URL per project triggers a build, but the build runs only on Vercel, so the
   workflow cannot gate it on our own tests or smoke-check the result in one place.
3. **Disable git deploys and deploy with the Vercel CLI from a manual GitHub Actions workflow:** one place that
   runs every check, deploys backend before frontend, smoke-tests production, and can redeploy any commit.

## Decision
Option 3. Both `vercel.json` files set `"git": { "deploymentEnabled": false }` and drop `ignoreCommand`.
`.github/workflows/deploy.yml` runs only on `workflow_dispatch` (inputs `app`, `target`, `ref`): `verify`
(`scripts/check-all.sh`) must pass, then `vercel pull` / `build` / `deploy --prebuilt` with a pinned CLI, backend
first, then frontend, then `scripts/smoke/smoke.mjs` against both production URLs. Secrets (`VERCEL_TOKEN`,
`VERCEL_ORG_ID`, `VERCEL_PROJECT_ID_FRONTEND`, `VERCEL_PROJECT_ID_BACKEND`) live only in the GitHub
`vercel-production` environment.

## Consequences
- Pushes (to `main` or any branch) never change the live site; CI (`backend-ci`, `frontend-ci`, `repo-ci`) still
  checks every PR and every push to `main`.
- No automatic PR preview URLs; previews are created on demand with `target=preview`.
- A Vercel token now exists in GitHub; it is scoped to the `vercel-production` environment and never reaches the
  scraper or fixer jobs.
- Rollback: Vercel Instant Rollback / Promote, or re-run the workflow with an older `ref`. Reverting this change
  turns git deploys back on.
- Guarded by `scripts/repo-tests/vercel-config.test.mjs` and `scripts/repo-tests/workflows.test.mjs`.
