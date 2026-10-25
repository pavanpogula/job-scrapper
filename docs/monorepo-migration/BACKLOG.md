# Backlog (found during the migration, not part of it)

| # | Item | Why | Added |
|---|---|---|---|
| B1 | Decide the future of `discover-weekly` (currently `DISCOVERY_ENABLED=false`) | `npm run discover` calls Wayback CDX with `limit=1000` and never paginates, so it sees about 1,000 archived URLs per run and finds few new companies. The manual bulk path (`npm run process:cdx` fed with a full CDX download, ~8 MB) is the useful one. Options: disable the weekly schedule, or raise the limit and paginate (and then dispatch-test it once, which was skipped in P3a). | 2026-10-25 |
| B2 | Production Redis (Upstash `REDIS_URL`) is not configured | API serves from Postgres only (`x-cache-reason: not_configured`, `/health` = degraded). | 2026-10-25 |
| B3 | Fixer not configured (no `ANTHROPIC_API_KEY`, no `fixer` environment) | Fixer job auto-skips. Optional. | 2026-10-25 |
| B4 | Search bugs from the earlier audit (multi-word queries match only as a phrase, Enter-only UI search, no trigram index) | Unfixed. | 2026-10-25 |
| B5 | After 7 days of stability remove `DATABASE_URL`/Redis env vars from the frontend Vercel project; delete `job-scrapper-web-staging` project in P10 | Cleanup per plan. | 2026-10-25 |
