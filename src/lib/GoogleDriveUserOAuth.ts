/**
 * @file Google Drive Upload with User OAuth
 * @summary OAuth 2.0 user consent flow - files owned by YOUR account, not a service account
 * 
 * This solves the "service account has no storage quota" problem by having YOU
 * authenticate and own the uploaded files.
 * 
 * Setup:
 * 1. Go to Google Cloud Console → APIs & Services → Credentials
 * 2. Create OAuth 2.0 Client ID (Desktop App type)
 * 3. Download and save as: apikeys/oauth-credentials.json
 * 4. First run will open browser for consent, then saves token for reuse
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
const CREDENTIALS_PATH = path.join(process.cwd(), 'apikeys', 'oauth-credentials.json');
const TOKEN_PATH = path.join(process.cwd(), 'apikeys', 'oauth-token.json');

/**
 * Get OAuth2 client, prompting for user consent if needed
 */
async function getAuthenticatedClient(): Promise<OAuth2Client | null> {
    // Check for OAuth credentials
    if (!fs.existsSync(CREDENTIALS_PATH)) {
        console.log('\n❌ oauth-credentials.json not found!');
        console.log('\n📋 Setup Instructions:');
        console.log('1. Go to: https://console.cloud.google.com/apis/credentials');
        console.log('2. Click "Create Credentials" → "OAuth client ID"');
        console.log('3. Application type: "Desktop app"');
        console.log('4. Download JSON and save as: apikeys/oauth-credentials.json');
        console.log('\n⚠️  Make sure Google Drive API is enabled!');
        return null;
    }

    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));
    const { client_id, client_secret, redirect_uris } = credentials.installed || credentials.web;

    const oAuth2Client = new google.auth.OAuth2(
        client_id,
        client_secret,
        redirect_uris?.[0] || 'http://localhost'
    );

    // Check for existing token
    if (fs.existsSync(TOKEN_PATH)) {
        const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
        oAuth2Client.setCredentials(token);

        // Refresh if expired
        if (token.expiry_date && token.expiry_date < Date.now()) {
            console.log('🔄 Refreshing expired token...');
            try {
                const { credentials: newCreds } = await oAuth2Client.refreshAccessToken();
                oAuth2Client.setCredentials(newCreds);
                fs.writeFileSync(TOKEN_PATH, JSON.stringify(newCreds, null, 2));
            } catch (error: any) {
                console.log('Token refresh failed, need to re-authenticate');
                fs.unlinkSync(TOKEN_PATH);
                return getAuthenticatedClient();
            }
        }

        return oAuth2Client;
    }

    // Need to get new token via user consent
    return getNewToken(oAuth2Client);
}

/**
 * Get new token by prompting user to authorize in browser
 */
async function getNewToken(oAuth2Client: OAuth2Client): Promise<OAuth2Client> {
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
    });

    console.log('\n🔐 Authorization required!');
    console.log('\n1. Open this URL in your browser:\n');
    console.log(`   ${authUrl}\n`);
    console.log('2. Sign in with your Google account');
    console.log('3. Copy the authorization code and paste it below\n');

    const code = await askQuestion('Enter the authorization code: ');

    try {
        const { tokens } = await oAuth2Client.getToken(code);
        oAuth2Client.setCredentials(tokens);

        // Save token for future use
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
        console.log('✅ Token saved to', TOKEN_PATH);

        return oAuth2Client;
    } catch (error: any) {
        throw new Error(`Error getting token: ${error.message}`);
    }
}

/**
 * Helper to ask question in terminal
 */
function askQuestion(question: string): Promise<string> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

/**
 * Upload file to Google Drive using user OAuth
 * Files will be owned by YOUR account, using YOUR storage quota
 */
export async function uploadWithUserOAuth(
    filePath: string,
    folderId?: string
): Promise<string | null> {
    const auth = await getAuthenticatedClient();
    if (!auth) return null;

    const drive = google.drive({ version: 'v3', auth });
    const fileName = path.basename(filePath);

    const fileMetadata: any = { name: fileName };
    if (folderId) {
        fileMetadata.parents = [folderId];
    }

    // Determine MIME type
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
        '.csv': 'text/csv',
        '.txt': 'text/plain',
        '.json': 'application/json',
        '.pdf': 'application/pdf',
    };

    const media = {
        mimeType: mimeTypes[ext] || 'application/octet-stream',
        body: fs.createReadStream(filePath),
    };

    try {
        console.log('☁️  Uploading to Google Drive (as your account)...');
        const response = await drive.files.create({
            requestBody: fileMetadata,
            media: media,
            fields: 'id, webViewLink, owners',
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
        return null;
    }
}

/**
 * List files accessible by the authenticated user
 */
export async function listUserFiles(): Promise<void> {
    const auth = await getAuthenticatedClient();
    if (!auth) return;

    const drive = google.drive({ version: 'v3', auth });

    try {
        const response = await drive.files.list({
            pageSize: 10,
            fields: 'files(id, name, owners)',
            orderBy: 'modifiedTime desc',
        });

        const files = response.data.files;
        if (files && files.length) {
            console.log('📁 Your recent files:');
            files.forEach(file => {
                const owner = file.owners?.[0]?.emailAddress || 'unknown';
                console.log(`   ${file.name} (owner: ${owner})`);
            });
        } else {
            console.log('No files found.');
        }
    } catch (error: any) {
        console.error('Error listing files:', error.message);
    }
}
