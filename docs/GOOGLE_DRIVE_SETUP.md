# Google Drive API Setup Guide

Follow these steps to enable Google Drive uploads for `npm run scrape:csv -- --upload-cloud`.

The upload is implemented in `src/lib/GoogleDriveOAuth.ts` (`uploadWithOAuth()`), which — despite its name — uses a
**service account** (JWT, scope `https://www.googleapis.com/auth/drive`). A separate, interactive user-OAuth flow
exists in `src/lib/GoogleDriveUserOAuth.ts` (see "Alternative" at the end).

> ⚠️ Service accounts have **no storage quota** on personal Google accounts. Uploading into a folder in a personal
> "My Drive" usually fails with `The user's drive storage quota has been exceeded`. Use a folder inside a Google
> Workspace **Shared Drive**, or use the user-OAuth alternative.

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **"Select a project"** → **"New Project"**
3. Name it `job-scraper` → Click **Create**
4. Wait for the project to be created, then select it

## Step 2: Enable Google Drive API

1. In the left sidebar, go to **APIs & Services** → **Library**
2. Search for **"Google Drive API"**
3. Click on it → Click **Enable**

## Step 3: Create Service Account Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **"+ CREATE CREDENTIALS"** → **"Service Account"**
3. Fill in:
   - Service account name: `job-scraper-uploader`
   - Click **Create and Continue**
4. Skip "Grant access" → Click **Done**
5. Click on the newly created service account email
6. Go to **Keys** tab → **Add Key** → **Create new key**
7. Select **JSON** → Click **Create**
8. A `.json` file will download - **save this file!**

## Step 4: Place the Key in `apikeys/`

The code reads the key from `apikeys/google-credentials.json`, resolved relative to `process.cwd()` (so run `npm` from
the repo root). It must be inside the `apikeys/` folder, **not** directly in the project root.

```bash
mkdir -p apikeys
mv ~/Downloads/your-file.json ./apikeys/google-credentials.json
```

`apikeys/` and `google-credentials.json` are already in `.gitignore`. Never commit or share this file.

## Step 5: Create a Folder and Share It with the Service Account

1. Go to [Google Drive](https://drive.google.com/) — ideally inside a **Shared Drive**
2. Create a new folder called `job-scraper-exports`
3. Share the folder (or the Shared Drive) with the **service account email** from Step 3
   (looks like `job-scraper-uploader@project-name.iam.gserviceaccount.com`)
4. Give it **Editor** access (**Content manager** or higher for a Shared Drive) → Click **Send**
5. Get the folder ID from the URL:
   ```
   https://drive.google.com/drive/folders/THIS_IS_YOUR_FOLDER_ID
   ```
6. Add it to your `.env` file:
   ```
   GOOGLE_DRIVE_FOLDER_ID="THIS_IS_YOUR_FOLDER_ID"
   ```
   If `GOOGLE_DRIVE_FOLDER_ID` is empty or missing, the file is uploaded to the service account's own Drive root,
   where you will not see it.

## Step 6: Install Dependencies

`googleapis` is already a dependency in `package.json`, so a normal install is enough:

```bash
npm install
```

## Step 7: Usage

```bash
# Export to CSV only (output/jobs_YYYY-MM-DD.csv)
npm run scrape:csv

# Export to CSV and upload it to Google Drive
npm run scrape:csv -- --upload-cloud
```

The upload runs after the CSV is complete, uses MIME type `text/csv`, keeps the local file name
(`jobs_YYYY-MM-DD.csv`, UTC date) and passes `supportsAllDrives: true`. On success it prints
`✅ Uploaded successfully!`, the file ID and a `webViewLink`. No upload happens when the scrape found 0 jobs.

---

## Troubleshooting

**`❌ google-credentials.json not found!`:**
- The key must be at `apikeys/google-credentials.json` and you must run the command from the repo root.

**`Error authorizing Google Drive API: ...`:**
- The JSON key is malformed, deleted or disabled — create a new key (Step 3).

**"File not found" / 404 on upload:**
- `GOOGLE_DRIVE_FOLDER_ID` is wrong, or the folder is not shared with the service account.

**"Permission denied" / 403 error:**
- Make sure the service account email has Editor (or Content manager) access to the folder.

**"The user's drive storage quota has been exceeded":**
- The folder lives in a personal My Drive. Move it into a Shared Drive, or use the user-OAuth alternative below.
  The scraper prints the service-account email as a reminder.

**"API not enabled" error:**
- Go back to Step 2 and enable the Google Drive API in the same project that owns the key.

> `npm run scrape:csv` exits with code 0 even when the upload fails — check the console output.

---

## Alternative: Upload as Your Own Account (User OAuth)

`src/lib/GoogleDriveUserOAuth.ts` (`uploadWithUserOAuth()`, scope `drive.file`) uploads with your own storage quota.
It is **not** wired into `scrape:csv`; it is exercised by `scripts/test-drive-upload.ts`.

1. **APIs & Services** → **OAuth consent screen**: configure it and add yourself as a test user.
2. **Credentials** → **Create Credentials** → **OAuth client ID** → Application type **Desktop app**.
3. Download the JSON and save it as `apikeys/oauth-credentials.json`.
4. Run:
   ```bash
   npx ts-node scripts/test-drive-upload.ts
   ```
5. Open the printed URL and approve. The browser is redirected to `http://localhost/?code=...` (the page will not load);
   copy the `code` value and paste it into the terminal.
6. The token is saved to `apikeys/oauth-token.json` and refreshed automatically when it expires. The test script
   uploads `output/test-upload.txt` to your My Drive root, lists your 10 most recent files and deletes the local file.
7. To use it for CSV uploads, change the import in `src/core/ScraperCSV.ts` from `uploadWithOAuth`
   (`../lib/GoogleDriveOAuth`) to `uploadWithUserOAuth` (`../lib/GoogleDriveUserOAuth`); the signature is the same.
