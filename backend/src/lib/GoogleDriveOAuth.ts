/**
 * @file Google Drive Upload Helper
 * @summary JWT authentication for Google Drive using service account credentials
 * @tags Google Drive, JWT, Upload, Service Account
 * @see https://dev.to/mearjuntripathi/upload-files-on-drive-with-nodejs-15j2
 */

import * as fs from 'fs';
import * as path from 'path';
import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/drive'];
const CREDENTIALS_PATH = path.join(process.cwd(), 'apikeys', 'google-credentials.json');

/**
 * @summary Authorize using JWT with service account credentials
 */
async function authorize() {
    if (!fs.existsSync(CREDENTIALS_PATH)) {
        console.log('\n❌ google-credentials.json not found!');
        console.log('\n📋 Setup Instructions:');
        console.log('1. Go to: https://console.cloud.google.com/iam-admin/serviceaccounts');
        console.log('2. Create a service account (or use existing)');
        console.log('3. Click on service account → Keys → Add Key → Create new key → JSON');
        console.log('4. Save the downloaded file as: apikeys/google-credentials.json');
        console.log('\n⚠️  Make sure Google Drive API is enabled!');
        return null;
    }

    const apikeys = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));

    const auth = new google.auth.JWT({
        email: apikeys.client_email,
        key: apikeys.private_key,
        scopes: SCOPES
    });

    try {
        await auth.authorize();
        return auth;
    } catch (error: any) {
        throw new Error(`Error authorizing Google Drive API: ${error.message}`);
    }
}

/**
 * @summary Uploads a file to Google Drive using JWT authentication
 */
export async function uploadWithOAuth(
    filePath: string,
    folderId?: string
): Promise<string | null> {
    const auth = await authorize();
    if (!auth) return null;

    const drive = google.drive({ version: 'v3', auth });
    const fileName = path.basename(filePath);

    const fileMetadata: any = {
        name: fileName
    };

    if (folderId) {
        fileMetadata.parents = [folderId];
    }

    const media = {
        mimeType: 'text/csv',
        body: fs.createReadStream(filePath)
    };

    try {
        console.log('☁️  Uploading to Google Drive...');
        const response = await drive.files.create({
            requestBody: fileMetadata,
            media: media,
            fields: 'id, webViewLink',
            supportsAllDrives: true
        });

        const fileId = response.data.id;
        const fileLink = response.data.webViewLink ||
            `https://drive.google.com/file/d/${fileId}/view`;

        console.log(`✅ Uploaded successfully!`);
        console.log(`   File ID: ${fileId}`);
        console.log(`   Link: ${fileLink}`);

        return fileLink;
    } catch (error: any) {
        console.error('❌ Upload failed:', error.message);

        // Provide helpful error messages
        if (error.message.includes('storage quota')) {
            console.log('\n💡 Tip: Share your Google Drive folder with the service account email:');
            const apikeys = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));
            console.log(`   ${apikeys.client_email}`);
        }

        return null;
    }
}

/**
 * @summary Lists files in Google Drive (for debugging)
 */
export async function listFiles(): Promise<void> {
    const auth = await authorize();
    if (!auth) return;

    const drive = google.drive({ version: 'v3', auth });

    try {
        const response = await drive.files.list({
            pageSize: 10,
            fields: 'files(id, name)',
            supportsAllDrives: true
        });

        const files = response.data.files;
        if (files && files.length) {
            console.log('📁 Available files:');
            files.forEach(file => {
                console.log(`   ${file.name} (${file.id})`);
            });
        } else {
            console.log('No files found.');
        }
    } catch (error: any) {
        console.error('Error listing files:', error.message);
    }
}
