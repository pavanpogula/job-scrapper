/**
 * @file GenerateDocs.test.ts
 * @summary Unit test validating GenerateDocs refactoring, custom root/outFile options, and exclusion logic.
 * @tags documentation, generator, unit-test
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { generate } from '../../scripts/GenerateDocs';

describe('GenerateDocs refactoring (P0b)', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-docs-test-'));
    });

    afterEach(() => {
        if (fs.existsSync(tmpDir)) {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    test('generate() writes documentation to custom outFile and includes key project files', async () => {
        const root = path.resolve(__dirname, '../..');
        const outFile = path.join(tmpDir, 'output.html');

        const result = await generate({ root, outFile });

        expect(fs.existsSync(outFile)).toBe(true);
        expect(result.fileCount).toBeGreaterThan(10);

        const html = fs.readFileSync(outFile, 'utf-8');

        // Must document core backend entry points & schema
        expect(html).toContain('src/api/Server.ts');
        expect(html).toContain('prisma/schema.prisma');

        // Must exclude ignored/noisy directories
        expect(html).not.toContain('node_modules/');
        expect(html).not.toContain('.claude/');
        expect(html).not.toContain('.agents/');
        expect(html).not.toContain('frontend/src');
    });
});
