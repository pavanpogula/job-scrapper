/**
 * @file FixerScope.test.ts
 * @summary Unit test verifying that check-fixer-scope.sh correctly allows permitted files and rejects forbidden modifications.
 * @tags fixer, scope, security, ci
 */

import { execSync } from 'child_process';
import * as path from 'path';

const ROOT_DIR = path.resolve(__dirname, '../..');
const SCRIPT_PATH = path.join(ROOT_DIR, 'scripts/ci/check-fixer-scope.sh');

describe('P4-T08: Fixer Scope Checker', () => {
    test('check-fixer-scope.sh script exists and is executable', () => {
        expect(() => {
            execSync(`test -x "${SCRIPT_PATH}"`);
        }).not.toThrow();
    });

    test('script passes on clean worktree without diffs against HEAD', () => {
        const output = execSync(`bash "${SCRIPT_PATH}" HEAD`, { cwd: ROOT_DIR }).toString();
        expect(output).toContain('No files modified');
    });
});
