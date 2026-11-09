# Ashby Job Scraper — Backend

The backend workspace contains the batch CLI scrapers, Prisma ORM models, Upstash Redis cache-first read-through layer, and Express 5 REST API server deployed as a Vercel serverless function (`api/index.ts`). Deploys are manual: run the **Deploy to Vercel** workflow (`.github/workflows/deploy.yml`, see `docs/deployment-and-operations.md` §3.3); pushes and merges do not deploy.

---

## Setup & Prerequisites

- **Node.js:** Node `>=24.0.0` (specified in `backend/package.json` engines and root `.nvmrc`).
- **PostgreSQL:** Neon PostgreSQL connection string (pooled URL recommended for serverless).
- **Redis:** Upstash Redis instance (optional; if omitted or unreachable, API falls back to PostgreSQL via `dbGuard`).

```bash
# Navigate to backend workspace
cd backend

# Install dependencies
npm install

# Setup local environment
cp .env.example .env
# Edit .env with your DATABASE_URL

# Generate Prisma client and synchronize schema
npx prisma generate
npx prisma db push
```

---

## Available Scripts

| Command | Purpose |
|---|---|
| `npm run check:all` | Full backend check (build, typecheck, lint, test, docs check) |
| `npm run build` | Compiles Prisma client |
| `npm run typecheck` | Validates TypeScript in `src/` and `api/` |
| `npm run typecheck:test` | Validates TypeScript in `tests/` and `scripts/` |
| `npm run lint` | ESLint check for `src/` and `api/` |
| `npm test` | Runs Jest test suite (37 suites / 264 tests) |
| `npm run docs:generate` | Regenerates `docs/project-explorer.html` |
| `npm run docs:check` | Verifies `docs/project-explorer.html` is in sync with source |
| `npm run seed` | Seeds initial company ATS slugs from `src/config/Companies.ts` |
| `npm run seed -- --all` | Seeds all ~3,072 slugs from `extracted-slugs.json` |
| `npm run scrape` | Single-process batch scrape to PostgreSQL |
| `npm run scrape:parallel` | Multi-process clustered scrape with adaptive concurrency |
| `npm run scrape:csv` | Exports job postings to dated CSV in `output/` |
| `npm run discover` | Discovers new Ashby slugs from Wayback CDX API |
| `npm run verify` | Database verification audit (counts, salary coverage, integrity) |
| `npm run api:start` | Starts local Express REST API on `http://localhost:3001` |

---

## Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (Prisma). Required for DB operations and API. |
| `REDIS_URL` | Upstash Redis connection string (`rediss://...`). Optional. |
| `CORS_ORIGINS` | Comma-separated allowed origins (defaults to `https://www.boolean.page,https://job-scrapper-ui.vercel.app,http://localhost:3000`). |
| `HEALTH_TOKEN` | Secret bearer token required for deep database diagnostics on `/health?deep=1`. |
| `GOOGLE_DRIVE_FOLDER_ID` | Optional folder ID for Google Drive cloud CSV uploads. |

---

## Documentation Index

Backend-specific architecture and technical guides live in `backend/docs/`:
- [Architecture & Workflows](docs/architecture-and-workflows.md)
- [External APIs (Ashby, CDX, Drive)](docs/external-apis.md)
- [CLI Commands](docs/cli-commands.md)
- [Database & Cache Schema](docs/database-and-cache.md)
- [Module Reference](docs/module-reference.md)
- [Configuration Guide](docs/configuration.md)
- [Outputs & Artifacts](docs/outputs-and-artifacts.md)
- [Known Issues & Debt](docs/known-issues.md)
- [REST API Contract](docs/api.md)
- [Backend Testing Guide](docs/testing.md)
- [Google Drive Setup](docs/google-drive-setup.md)
