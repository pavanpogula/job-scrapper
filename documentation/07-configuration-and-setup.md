# 07 · Configuration & Setup

## 1. Environment Variables (`.env`, template: `.env.example`)

| Variable | Required | Used by | Default / Fallback | Example |
|---|---|---|---|---|
| `DATABASE_URL` | ✅ (for every script except `process:cdx`, `docs:generate`, `generate-readme`) | Prisma (`schema.prisma`) | none — Prisma throws | `postgresql://user:pass@host:5432/jobscraper` (Neon works; add `?sslmode=require`) |
| `REDIS_URL` | optional (README says required, code doesn't) | `src/lib/Redis.ts` | `redis://localhost:6379` | `rediss://default:xxx@xxx.upstash.io:6379` |
| `GOOGLE_DRIVE_FOLDER_ID` | optional | `ScraperCSV.ts` upload | undefined → uploads to SA's root | ID from `drive.google.com/drive/folders/<ID>` |

Current local `.env` defines `DATABASE_URL` and `GOOGLE_DRIVE_FOLDER_ID` only (no `REDIS_URL`).

> `dotenv.config()` is only called inside `src/lib/Redis.ts`. `ScraperCSV.ts` does **not** import Redis, so
> `process.env.GOOGLE_DRIVE_FOLDER_ID` is only available there because Prisma's runtime also loads `.env`. If Prisma
> ever stops doing that, the folder ID would silently be `undefined`. Safer: add `import 'dotenv/config'` to entry points.

## 2. Credential Files (`apikeys/`, gitignored)

| File | Kind | Required for | Created by |
|---|---|---|---|
| `apikeys/google-credentials.json` | Service-account key (`client_email`, `private_key`) | `scrape:csv --upload-cloud` | Downloaded from GCP IAM → Service Accounts → Keys |
| `apikeys/oauth-credentials.json` | OAuth client (Desktop app) | `scripts/test-drive-upload.ts` / `uploadWithUserOAuth` | Downloaded from GCP → Credentials → OAuth client ID |
| `apikeys/oauth-token.json` | Access + refresh token | same | Auto-written after first consent |

> ⚠️ `docs/GOOGLE_DRIVE_SETUP.md` and `README.md` say to put `google-credentials.json` in the **project root**; the code
> reads it from **`apikeys/`**.

## 3. First-Time Setup

```bash
npm install
cp .env.example .env               # fill DATABASE_URL (and REDIS_URL if available)
npx prisma generate
npx prisma db push                 # creates tables from schema.prisma
npm run seed                       # seeds TARGET_COMPANIES (4 by default)
# For the full ~3k company list: put extracted-slugs.json contents into src/config/Companies.ts, then npm run seed
npm run verify
```

Optional local Redis (macOS): `brew install redis && brew services start redis`.

## 4. Google Drive Upload
 
### 4.1 Comparison Table

| | Service account (`GoogleDriveOAuth.ts`) | User OAuth (`GoogleDriveUserOAuth.ts`) |
|---|---|---|
| Wired into `scrape:csv`? | ✅ yes | ❌ no (only test script) |
| Interactive? | No — good for cron/CI | First run needs browser consent + paste code |
| Storage | **No quota on personal Drive** → use a Shared Drive or share folder (may still fail) | User's own quota ✅ |
| Scope | `drive` (full) | `drive.file` (app-created files only) |

### 4.2 Step-by-Step Setup: Service Account Mode (used by `npm run scrape:csv -- --upload-cloud`)

*(Synthesized and corrected from [docs/GOOGLE_DRIVE_SETUP.md](file:///Users/pavanreddy/Documents/anti-gravity/job-scrapper/docs/GOOGLE_DRIVE_SETUP.md))*

1. **Google Cloud Console Project**:
   - Go to [Google Cloud Console](https://console.cloud.google.com/) and create a project (e.g. `job-scraper`).
2. **Enable Google Drive API**:
   - Navigate to **APIs & Services** → **Library** → Search for **"Google Drive API"** → Click **Enable**.
3. **Create Service Account Credentials**:
   - Go to **APIs & Services** → **Credentials** → **+ CREATE CREDENTIALS** → **Service Account**.
   - Name: `job-scraper-uploader`. Click **Create and Continue** → **Done**.
   - Click the newly created service account email (`job-scraper-uploader@<project>.iam.gserviceaccount.com`).
   - Go to **Keys** tab → **Add Key** → **Create new key** → Choose **JSON** → Download the `.json` file.
4. **Place Credentials in Project**:
   - ⚠️ **Important path discrepancy:** While `docs/GOOGLE_DRIVE_SETUP.md` says to put it in the project root, the actual code (`src/lib/GoogleDriveOAuth.ts:13`) looks for it at:
     ```bash
     mkdir -p apikeys
     mv ~/Downloads/your-key.json ./apikeys/google-credentials.json
     ```
   - Ensure `apikeys/` and `google-credentials.json` remain gitignored.
5. **Create & Share Google Drive Folder**:
   - In Google Drive, create a folder (e.g. `job-scraper-exports`).
   - Right-click folder → **Share** → Add the service account email with **Editor** permissions.
   - Get the folder ID from the browser URL (`https://drive.google.com/drive/folders/<FOLDER_ID>`).
   - Add to `.env`:
     ```env
     GOOGLE_DRIVE_FOLDER_ID="<FOLDER_ID>"
     ```
6. **Execution**:
   ```bash
   npm run scrape:csv -- --upload-cloud
   ```

### 4.3 Troubleshooting Service Account Uploads

- **"google-credentials.json not found"**: Ensure the JSON file is placed in `apikeys/google-credentials.json` (not in project root).
- **"Permission denied" / 404 on upload**: Ensure the service account email is added as an **Editor** to the specific folder whose ID is in `GOOGLE_DRIVE_FOLDER_ID`.
- **"API not enabled"**: Enable the **Google Drive API** in Google Cloud Console under APIs & Services.
- **"The user's drive storage quota has been exceeded" (HTTP 403)**: Service accounts have 0 bytes storage on personal Google accounts. Workarounds:
  1. Use a Google Workspace **Shared Drive** (Team Drive) where storage belongs to the workspace, OR
  2. Switch to User OAuth mode (below).

### 4.4 Step-by-Step Setup: User OAuth Mode (`GoogleDriveUserOAuth.ts`)

1. GCP Console → **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID**.
2. Application type: **Desktop app**.
3. Download JSON and save as: `apikeys/oauth-credentials.json`.
4. Run the test script:
   ```bash
   npx ts-node scripts/test-drive-upload.ts
   ```
5. Follow the terminal prompt: open the consent URL in your browser, approve access, and paste the authorization code back into the terminal.
6. The token is automatically cached at `apikeys/oauth-token.json`. Files uploaded will use your personal account storage quota.
7. *To use in `ScraperCSV.ts`:* Change import in `src/core/ScraperCSV.ts` from `uploadWithOAuth` to `uploadWithUserOAuth` from `../lib/GoogleDriveUserOAuth`.

## 5. TypeScript / Lint Config

- `tsconfig.json`: `target es2020`, `module commonjs`, `lib [es2020, dom]`, `strict`, `esModuleInterop`, `rootDir ./src`,
  `outDir ./dist`, `include src/**/*`. (`scripts/` is outside `include`; ts-node still runs them.)
- `.eslintrc.json`: `eslint:recommended` + `@typescript-eslint/recommended` + jsdoc rules; ignores `docs/`, `scripts/`, `*.js`, `dist/`.

## 6. Scheduling (not included in repo)

The README describes "hourly scraping" but there is no scheduler. Example cron (daily 06:00):

```cron
0 6 * * * cd /path/to/job-scrapper && npm run scrape:csv -- --upload-cloud >> output/cron.log 2>&1
```
Use the service-account mode (non-interactive) for unattended runs.

## 7. Security Notes

- `.env`, `apikeys/`, `output/`, `google-credentials.json` are gitignored. Keep it that way.
- `db:menu` option 7 executes arbitrary SQL with the DB user's privileges (`$queryRawUnsafe`) — local use only.
