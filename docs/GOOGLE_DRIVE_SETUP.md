# Google Drive API Setup Guide

Follow these steps to enable Google Drive uploads for your job scraper.

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

## Step 4: Configure Your Project

1. Rename the downloaded JSON file to `google-credentials.json`
2. Move it to your project root:
   ```
   mv ~/Downloads/your-file.json ./google-credentials.json
   ```

3. Add to `.gitignore` (important!):
   ```
   google-credentials.json
   ```

4. Add to `.env`:
   ```
   GOOGLE_DRIVE_FOLDER_ID=your_folder_id_here
   ```

## Step 5: Create a Shared Folder in Google Drive

1. Go to [Google Drive](https://drive.google.com/)
2. Create a new folder called `job-scraper-exports`
3. Right-click the folder → **Share**
4. Add the **service account email** (from Step 3, looks like `job-scraper-uploader@project-name.iam.gserviceaccount.com`)
5. Give it **Editor** access → Click **Send**
6. Get the folder ID from the URL:
   ```
   https://drive.google.com/drive/folders/THIS_IS_YOUR_FOLDER_ID
   ```
7. Add this ID to your `.env` file as `GOOGLE_DRIVE_FOLDER_ID`

## Step 6: Install Dependencies

```bash
npm install googleapis
```

## Step 7: Usage

```bash
# Export to CSV only
npm run scrape:csv

# Export to CSV and upload to Google Drive
npm run scrape:csv -- --upload-cloud
```

---

## Troubleshooting

**"File not found" error:**
- Make sure `google-credentials.json` is in the project root

**"Permission denied" error:**
- Make sure the service account email has Editor access to the folder

**"API not enabled" error:**
- Go back to Step 2 and enable the Google Drive API
