# Frontend

React 19 + TypeScript + Vite + Redux Toolkit + MUI web app for browsing Ashby job postings.

## Scripts
- `npm run dev` — Vite dev server.
- `npm run check` — typecheck, lint, test, build (the single check command).

## Deploy
Deployed as its own Vercel project (Root Directory `frontend`). `vercel.json` proxies `/v1/*` and `/health`
to the backend project, so the browser only ever talks to this site.

Full docs arrive with the P5 docs restructure (`docs/README.md`).
