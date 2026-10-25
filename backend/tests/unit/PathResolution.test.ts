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

    test('GoogleDrive OAuth modules resolve credentials under process.cwd() at import time', async () => {
        const checkedPaths: string[] = [];
        const realFs = jest.requireActual('fs');
        const existsSpy = jest.spyOn(realFs, 'existsSync').mockImplementation((p: any) => {
            checkedPaths.push(String(p));
            return false;
        });

        let gdriveOAuth: any;
        let gdriveUserOAuth: any;
        let seed: any;
        let ErrorTracker: any;

        jest.isolateModules(() => {
            gdriveOAuth = require('../../src/lib/GoogleDriveOAuth');
            gdriveUserOAuth = require('../../src/lib/GoogleDriveUserOAuth');
            seed = require('../../src/utils/Seed');
            ErrorTracker = require('../../src/lib/ErrorTracker').ErrorTracker;
        });

        try {
            // Trigger runtime path resolutions in the isolated cwd
            await gdriveOAuth.uploadWithOAuth('test.csv');
            await gdriveUserOAuth.uploadWithUserOAuth('test.csv');
            seed.loadTargetSlugs(true);

            const tracker = new ErrorTracker('test-run', 'test-mode');
            tracker.saveReport();

            const expectedGdriveCreds = path.join(tmpDir, 'apikeys', 'google-credentials.json');
            const expectedGdriveUserCreds = path.join(tmpDir, 'apikeys', 'oauth-credentials.json');
            const expectedExtractedSlugs = path.join(tmpDir, 'extracted-slugs.json');
            const expectedOutputDir = path.join(tmpDir, 'output');

            expect(checkedPaths).toContain(expectedGdriveCreds);
            expect(checkedPaths).toContain(expectedGdriveUserCreds);
            expect(checkedPaths).toContain(expectedExtractedSlugs);
            expect(checkedPaths.some(p => p.startsWith(expectedOutputDir))).toBe(true);
        } finally {
            existsSpy.mockRestore();
        }
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
