/**
 * @file Test Google Drive Upload with User OAuth
 * @summary Tests the OAuth user consent flow - YOU will own the uploaded files
 */

import * as fs from 'fs';
import * as path from 'path';
import { uploadWithUserOAuth, listUserFiles } from '../src/lib/GoogleDriveUserOAuth';

async function main() {
    console.log('🧪 Testing Google Drive Upload with User OAuth...\n');
    console.log('📌 This uses YOUR Google account, so files use YOUR storage quota.\n');

    // Create a test file
    const testFilePath = path.join(process.cwd(), 'output', 'test-upload.txt');
    const testContent = `Test file created at ${new Date().toISOString()}\n\nUploaded via User OAuth - YOU own this file! 🎉`;

    // Ensure output directory exists
    const outputDir = path.dirname(testFilePath);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // Write test file
    fs.writeFileSync(testFilePath, testContent);
    console.log(`📄 Created test file: ${testFilePath}\n`);

    // Upload (first time will prompt for browser auth)
    const result = await uploadWithUserOAuth(testFilePath);

    if (result) {
        console.log('\n✅ TEST PASSED: File uploaded successfully!');
        console.log(`   View it at: ${result}`);
    } else {
        console.log('\n❌ TEST FAILED: Upload returned null');
    }

    // List files
    console.log('\n--- Your recent files ---');
    await listUserFiles();

    // Cleanup
    fs.unlinkSync(testFilePath);
    console.log('\n🧹 Cleaned up local test file');
}

main().catch(console.error);
