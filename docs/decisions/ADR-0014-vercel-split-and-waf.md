# ADR-0014: Independent Vercel projects for backend API and frontend SPA with WAF risk acceptance

- Status: Accepted
- Date: 2026-10-25
- Deciders: owner, api-cache agent
- Related: O9, P3a, PR #6, PR #7

## Context
Previously, a single monolithic Vercel deployment served both the Express REST API (`/v1/*`, `/health`) and static SPA assets (`dist/`). Moving to a monorepo structure in P3a required separating the deployments into independent Vercel projects to allow isolated builds, independent domain routing, and distinct function execution budgets.

## Options Considered
1. **Single Vercel Project with Monorepo Root:** Keep one project deploying from repo root. Continues bundling static assets and functions into one project, creating unnecessary function invocations for frontend routing and coupled build triggers.
2. **Split Vercel Projects (`job-scrapper-api` and `job-scrapper-ui`):** Create separate Vercel projects with independent roots (`backend` and `frontend`). The UI project proxies `/v1/*` and `/health` requests to the API project via Vercel Edge rewrites.

## Decision
Adopt Option 2: Split Vercel deployments.
- **Backend API Project:** Project `job-scrapper-api` with Root Directory `backend`. Deployed at `https://job-scrapper-api-eight.vercel.app` (plain `job-scrapper-api.vercel.app` domain is owned by an external third party). Serves JSON API endpoints only (`/v1/*`, `/health`); static asset serving was removed from Express `Server.ts`. Configures `trust proxy: true` for Vercel edge reverse proxying. Environment variables are provisioned in both Production and Preview.
- **Frontend SPA Project:** Project `job-scrapper-ui` with Root Directory `frontend`. Deployed at `https://job-scrapper-ui.vercel.app`. Serves Vite React 19 application and proxies `/v1/*` and `/health` to `https://job-scrapper-api-eight.vercel.app` with standard security headers (CSP, XFO, nosniff, Permissions-Policy).
- **WAF Risk Acceptance (O9):** Per owner decision O9, we accept the risk that requests sent directly to the backend URL (`https://job-scrapper-api-eight.vercel.app`) bypass the frontend project's Vercel WAF protections. The Express server retains internal DbGuard and CircuitBreaker protections.

## Consequences
- Independent build pipelines: each project builds and deploys on its own. (Since ADR-0016, git pushes no longer trigger deploys; both projects deploy only through `.github/workflows/deploy.yml`.)
- Clean separation of serverless function costs and static asset delivery.
- Direct API URL bypasses frontend WAF, accepted as low-risk per decision O9.
