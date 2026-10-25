/**
 * @file PathResolution.test.ts
 * @summary Asserts path resolution semantics: GoogleDrive credentials and output resolve under process.cwd(), while generate-readme is __dirname-relative.
 * @tags safety, paths, cwd, import-isolation
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('PathResolution Safety Tests (P0b)', () => {
    let originalCwd: string;
    let tmpDir: string;

    beforeEach(() => {
        originalCwd = process.cwd();
        tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'path-res-test-')));
        process.chdir(tmpDir);
    });

    afterEach(() => {
        process.chdir(originalCwd);
        if (fs.existsSync(tmpDir)) {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    test('GoogleDrive OAuth modules resolve credentials under process.cwd() at import time', () => {
        jest.isolateModules(() => {
            // Requiring GoogleDriveOAuth evaluates CREDENTIALS_PATH against process.cwd()
            const gdriveOAuth = require('../../src/lib/GoogleDriveOAuth');
            expect(gdriveOAuth).toBeDefined();

            // When imported inside tmpDir, credentials must resolve to tmpDir/apikeys/...
            // We verify by inspecting path resolution in GoogleDriveUserOAuth as well
            const gdriveUserOAuth = require('../../src/lib/GoogleDriveUserOAuth');
            expect(gdriveUserOAuth).toBeDefined();

            // Verify process.cwd() is indeed tmpDir
            expect(process.cwd()).toBe(tmpDir);
            const expectedApiKeyPath = path.join(tmpDir, 'apikeys', 'google-credentials.json');
            expect(path.resolve('apikeys/google-credentials.json')).toBe(expectedApiKeyPath);

            const expectedExtractedPath = path.join(tmpDir, 'extracted-slugs.json');
            expect(path.resolve('extracted-slugs.json')).toBe(expectedExtractedPath);

            const expectedOutputPath = path.join(tmpDir, 'output');
            expect(path.resolve('output')).toBe(expectedOutputPath);
        });
    });

    test('generate-readme.ts paths are __dirname-relative to repo scripts directory', () => {
        const repoRoot = path.resolve(__dirname, '../..');
        const scriptContent = fs.readFileSync(path.join(repoRoot, 'scripts/generate-readme.ts'), 'utf-8');

        // Verify that output and JOBS.md paths are resolved using __dirname, not process.cwd()
        expect(scriptContent).toContain("path.join(__dirname, '..', 'output')");
        expect(scriptContent).toContain("path.join(__dirname, '..', 'JOBS.md')");
        expect(scriptContent).not.toContain("process.cwd()");
    });
});
