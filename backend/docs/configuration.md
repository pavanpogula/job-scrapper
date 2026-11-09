# 07 · Configuration & Setup

## 1. Environment Variables (`.env`, template: `.env.example`)

These are the **only** environment variables read anywhere in `src/`, `scripts/` or `prisma/` (verified by grepping
`process.env` / `env(`):

| Variable | Required | Read by | Default / Fallback | Example |
|---|---|---|---|---|
| `DATABASE_URL` | ✅ for every DB command and the backend API (`seed`, `discover`, `scrape`, `scrape:parallel`, `api:start`, etc.). In serverless (Vercel), connect via the Neon pooled pgBouncer URL to prevent connection exhaustion. | Prisma (`prisma/schema.prisma` → `env("DATABASE_URL")`) | none — Prisma throws on first query | `postgresql://user:pass@host-pooler.region.neon.tech:5432/jobscraper?sslmode=require&pgbouncer=true` |
| `REDIS_URL` | optional (Upstash Redis for `jc:v1:*` generation read-through caching; if omitted, API falls back to PostgreSQL via `dbGuard`) | `src/lib/cache/RedisClient.ts`, `src/lib/Redis.ts` | `null` for API; if unreachable, cache disabled | `rediss://default:xxx@xxx.upstash.io:6379` |
| `CORS_ORIGINS` | optional (comma-separated origins allowed to access the REST API) | `src/api/Server.ts` | `https://www.boolean.page,https://job-scrapper-ui.vercel.app,http://localhost:3000` | `https://my-app.vercel.app,http://localhost:3000` |
| `HEALTH_TOKEN` | optional (secret token required to run deep database inspection via `GET /health?deep=1`) | `src/api/Server.ts` | `undefined` (deep ping disabled) | `sec-xxxx-yyyy` |
| `VERCEL_TOKEN` | not set for the backend (removed from the scrape workflow in P3a; CDN purge not used). A separate token lives only in the GitHub `vercel-production` environment for `.github/workflows/deploy.yml` | `src/cache/Publisher.ts` | `undefined` (purge skipped) | — |
| `VERCEL_PROJECT_ID` | deprecated / unused (removed from scrape workflow in P3a) | `src/cache/Publisher.ts` | `undefined` (purge skipped) | — |
| `GOOGLE_DRIVE_FOLDER_ID` | optional; only with `scrape:csv -- --upload-cloud` | `src/core/ScraperCSV.ts` → `uploadToGoogleDrive()` | `undefined` → file goes to the service account's own My Drive root (not visible to you) | ID from `drive.google.com/drive/folders/<ID>` |

No other tunables are environment-driven: concurrency (`CONCURRENCY_LIMIT = 15` in `Scraper.ts`/`ScraperCSV.ts`),
`BATCH_SIZE = 100`, Redis TTL (7 days), HTTP timeouts (10 s Ashby, 15 s CommonCrawl), retries (`maxRetries = 2`,
`baseDelayMs = 300`), limiter settings (`minConcurrency 2`, `recoveryThreshold 25`, `defaultCooldownMs 2000`), CDX
`limit = 1000`, and the CommonCrawl index (`CC-MAIN-2024-51`) are hard-coded constants. Worker count is the CLI flag
`--workers=N` (see [04 → `scrape:parallel`](./cli-commands.md)).

> **How `.env` gets loaded:** `dotenv.config()` is only called inside `src/lib/Redis.ts` (imported by `Scraper.ts`;
> it reads `.env` from `process.cwd()`). Every other entry point relies on Prisma Client: `new PrismaClient()` loads the
> repo-root `.env` (path baked into the generated client as `schemaEnvPath`) into `process.env`. `ScraperCSV.ts` does **not** import Redis, so `process.env.GOOGLE_DRIVE_FOLDER_ID` is only populated
> because Prisma loaded `.env`. If that ever changes, the folder ID would silently be `undefined`. Safer: add
> `import 'dotenv/config'` to entry points.

## 2. Credential Files (`apikeys/`, gitignored)

| File | Kind | Required for | Read/written by | Created by |
|---|---|---|---|---|
| `apikeys/google-credentials.json` | Service-account key (`client_email`, `private_key`) | `scrape:csv -- --upload-cloud` | `src/lib/GoogleDriveOAuth.ts` (`CREDENTIALS_PATH = <cwd>/apikeys/google-credentials.json`) | GCP IAM → Service Accounts → Keys |
| `apikeys/oauth-credentials.json` | OAuth client (Desktop app; `installed` or `web` block) | `uploadWithUserOAuth()` | `src/lib/GoogleDriveUserOAuth.ts` | GCP → Credentials → OAuth client ID |
| `apikeys/oauth-token.json` | Access + refresh token | same | written by `GoogleDriveUserOAuth.ts` after consent / refresh; deleted if refresh fails | auto |

All three paths are resolved relative to `process.cwd()`, so run commands from the repo root.

> `README.md` and older docs said `google-credentials.json` goes in the **project root**; the code reads it from
> **`apikeys/`**. `./google-drive-setup.md` has been corrected.

## 3. Requirements

| Component | Requirement | Notes |
|---|---|---|
| Node.js | 18+ recommended (no `engines` field in `package.json`; Jest 30 needs ≥ 18; analysed on v24.21.0) | `ts-node` 10 runs everything; no build step |
| npm | bundled with Node | `package-lock.json` is committed |
| PostgreSQL | any version supported by Prisma 5.22 (Neon used in practice) | tables created by `npx prisma db push` |
| Redis | optional; any server reachable by `ioredis` 5 (local or Upstash `rediss://`) | |
| Google Cloud | optional; Drive API enabled + service-account key or OAuth client | only for uploads |

Key packages: `@prisma/client`/`prisma` ^5.22.0, `ioredis` ^5.8.2, `axios` ^1.13.2, `googleapis` ^169.0.0,
`dotenv` ^17.2.3, `typescript` ^5.9.3, `ts-node` ^10.9.2 (all in `dependencies`); `jest` ^30, `ts-jest` ^29,
`eslint` ^8.57 + `@typescript-eslint` ^6 + `eslint-plugin-jsdoc` ^46 (dev). `google-auth-library` is imported by
`GoogleDriveUserOAuth.ts` but only installed transitively via `googleapis`.

## 4. First-Time Setup

```bash
npm install
cp .env.example .env               # fill DATABASE_URL (and REDIS_URL if available)
npx prisma generate                # (also run automatically by npm install via @prisma/client postinstall)
npx prisma db push                 # creates tables/enum/indexes from schema.prisma
npm run seed                       # seeds TARGET_COMPANIES (7 slugs in ../src/config/Companies.ts)
npm run seed -- --all              # or: seed all 3,072 slugs from extracted-slugs.json
npm run verify                     # sanity-check counts
npm run scrape                     # or: npm run scrape:parallel -- --workers=8
```

Optional local Redis (macOS): `brew install redis && brew services start redis`.

Verify the toolchain: `npx tsc --noEmit -p . && npm run lint && npm test`.

## 5. Google Drive Upload

### 5.1 Comparison Table

| | Service account (`GoogleDriveOAuth.ts`, `uploadWithOAuth`) | User OAuth (`GoogleDriveUserOAuth.ts`, `uploadWithUserOAuth`) |
|---|---|---|
| Wired into `scrape:csv`? | ✅ yes (`--upload-cloud`) | ❌ no (alternative implementation) |
| Auth | JWT from `client_email` + `private_key` | OAuth2 installed-app flow, token cached in `apikeys/oauth-token.json` |
| Interactive? | No — good for cron/CI | First run: open URL, approve, paste code |
| Storage | **No quota on personal Drive** → use a Shared Drive (`supportsAllDrives: true` is set) | User's own quota ✅ |
| Scope | `https://www.googleapis.com/auth/drive` (full) | `https://www.googleapis.com/auth/drive.file` (app-created files only) |
| MIME type | always `text/csv` | by extension: `.csv`, `.txt`, `.json`, `.pdf`, else `application/octet-stream` |

### 5.2 Service Account Mode (used by `npm run scrape:csv -- --upload-cloud`)

Step-by-step instructions live in [./google-drive-setup.md](./google-drive-setup.md). Summary:

1. Create a GCP project and enable the **Google Drive API**.
2. Create a service account → **Keys** → **Add Key** → JSON.
3. Save it as `apikeys/google-credentials.json`:
   ```bash
   mkdir -p apikeys
   mv ~/Downloads/your-key.json ./apikeys/google-credentials.json
   ```
4. Create a Drive folder (preferably inside a **Shared Drive**), share it with the service-account email as
   **Editor** (Content manager for Shared Drives), and add its ID to `.env`:
   ```env
   GOOGLE_DRIVE_FOLDER_ID="<FOLDER_ID>"
   ```
5. Run `npm run scrape:csv -- --upload-cloud`. Success prints `✅ Uploaded successfully!`, the file ID and a link.

### 5.3 Troubleshooting Service Account Uploads

- **`❌ google-credentials.json not found!`**: the file must be at `apikeys/google-credentials.json` (relative to the
  directory you run from), not in the project root. The upload is skipped (returns `null`).
- **`Error authorizing Google Drive API: …`**: malformed/revoked key — this is thrown, and because `scrape:csv` uses
  `.catch(console.error)` the process still exits 0.
- **"File not found" / 404 on upload**: the folder ID is wrong, or the service account was not added to that folder.
- **"API not enabled"**: enable the **Google Drive API** for the project that owns the key.
- **"The user's drive storage quota has been exceeded" (HTTP 403)**: service accounts have no storage on personal Google
  accounts; the code then prints the service-account email as a sharing tip. Workarounds: upload into a Workspace
  **Shared Drive**, or switch to User OAuth mode.

### 5.4 User OAuth Mode (`GoogleDriveUserOAuth.ts`)

1. GCP Console → **APIs & Services** → **OAuth consent screen**: configure it (External, add yourself as a test user).
2. **Credentials** → **Create Credentials** → **OAuth client ID** → Application type **Desktop app**.
3. Download JSON and save as `apikeys/oauth-credentials.json`.
4. Configure your script or scraper to call `uploadWithUserOAuth`.
5. Open the printed consent URL, approve access. The browser is redirected to the client's first `redirect_uris` entry
   (`http://localhost` for Desktop clients), which will not load — copy the `code=` query parameter from the address bar
   and paste it into the terminal.
6. The token is saved at `apikeys/oauth-token.json` and refreshed automatically when `expiry_date` has passed.
7. *To use it in `scrape:csv`:* change the import in `src/core/ScraperCSV.ts` from `uploadWithOAuth`
   (`../lib/GoogleDriveOAuth`) to `uploadWithUserOAuth` (`../lib/GoogleDriveUserOAuth`) — same `(filePath, folderId?)`
   signature. Note that this makes `scrape:csv --upload-cloud` interactive on first run.

## 6. TypeScript / Lint / Test Config

- **`tsconfig.json`**: `target es2020`, `module commonjs`, `lib [es2020, dom]`, `strict`, `esModuleInterop`,
  `skipLibCheck`, `forceConsistentCasingInFileNames`, `types [node]`, `rootDir ./src`, `outDir ./dist`,
  `include ["./src/**/*"]` (relative to backend). ⇒ `npm --prefix backend run typecheck` type-checks **only `../src/`**; `../scripts/`, `backend/tests/` and `backend/__mocks__/`
  are not type-checked by it (ts-node still runs `scripts/`).
- **`.eslintrc.json`**: `eslint:recommended` + `plugin:@typescript-eslint/recommended` + `eslint-plugin-jsdoc`;
  env `node`, `es2022`. JSDoc rules: `jsdoc/require-jsdoc` (functions, methods, classes; not arrows/constructors) and
  `jsdoc/check-tag-names` (extra tags `file`, `summary`, `tags`, `example`, `configuration`, `behavior`) — both
  **warn**. `@typescript-eslint/no-explicit-any` off; `no-unused-vars` warns (ignores `_`-prefixed); `no-console` off;
  `no-empty` and `prefer-const` warn. `ignorePatterns`: `node_modules/`, `dist/`, `docs/`, `*.js`, `scripts/`.
  `npm run lint` only targets `src/` anyway, so `tests/` and `__mocks__/` are never linted.
- **`jest.config.js`**: preset `ts-jest`, `testEnvironment node`, `roots ['<rootDir>/tests']`, `testMatch **/*.test.ts`,
  `clearMocks: true`, `modulePathIgnorePatterns` for `output/`, `docs/`, `node_modules/`. ts-jest runs with
  `isolatedModules: true` (transpile only — tests are **not** type-checked) and an inline tsconfig mirroring the root one.
- **Prisma mock (`__mocks__/@prisma/client.ts`)**: `moduleNameMapper` maps `^@prisma/client$` to this file for **every**
  test, so no Prisma engine or database is loaded. It exports a fake `PrismaClient` with `company`
  (`findMany`, `createMany`, `deleteMany`, `upsert`, `update`, `count`), `job` (`findMany`, `deleteMany`, `updateMany`,
  `upsert`, `count`, `groupBy`), `department`/`location` (`findMany`, `upsert`, `count`), `$transaction`, `$disconnect`,
  `$queryRaw`, `$queryRawUnsafe`. The global mock has **no** `job.createMany` (so `Scraper.ts` takes the
  `$transaction` path) and no `findUnique` — tests that need them override with their own `jest.mock('@prisma/client', …)`.
  Redis, axios, `fs` and `googleapis` are mocked per test file. When you add a Prisma call to source code, add it to this
  mock too.

## 7. Scheduling (not included in repo)

There is no scheduler in the repo (older README versions advertised "hourly scraping"; see 09 #17/18). Example cron (daily 06:00):

```cron
0 6 * * * cd /path/to/job-scrapper && npm run scrape:csv -- --upload-cloud >> output/cron.log 2>&1
```
Use the service-account mode (non-interactive) for unattended runs. Remember `scrape:csv` exits 0 even on failure — check
`output/latest-error-report.json` or the log instead of the exit code.

## 8. Security Notes

- `.env`, `apikeys/`, `output/`, `google-credentials.json` and `/extracted-slugs*` are gitignored (`extracted-slugs.json`
  is nevertheless tracked in git). Keep secrets out of git.
- `db:menu` option 7 executes arbitrary SQL with the DB user's privileges (`$queryRawUnsafe`) — local use only.
- The service-account scope is full `drive`; prefer a dedicated service account with access to one folder only.
