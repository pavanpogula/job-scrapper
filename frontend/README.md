# Frontend

React 19 + TypeScript + Vite + Redux Toolkit + MUI web app for B.O.O.L.E.A.N (browsing direct company job postings).

## Scripts
- `npm run dev` — Vite dev server.
- `npm run check` — typecheck, lint, test, build (the single check command).

## Deploy
Deployed as its own Vercel project (Root Directory `frontend`). `vercel.json` proxies `/v1/*` and `/health`
to the backend project, so the browser only ever talks to this site.

Deploys are manual: pushes and merges do not deploy. Run the **Deploy to Vercel** workflow
(`.github/workflows/deploy.yml`); runbook in `docs/deployment-and-operations.md` §3.3.

Full docs arrive with the P5 docs restructure (`docs/README.md`).
