/**
 * @file Concurrency Limiter Exit Tests (P1-T09 / SCR-09)
 * @summary Asserts that limiter pause timer keeps event loop alive so process does not exit early with pending work
 * @tags Unit Test, Concurrency, Limiter, ProcessExit
 */

import { spawnSync } from 'child_process';
import * as path from 'path';

describe('Concurrency Limiter Process Exit (P1-T09 / SCR-09)', () => {
    test('limiter must not let the process exit early when paused (tasksDone=4/4 and exit 0)', () => {
        const fixturePath = path.resolve(__dirname, '../fixtures/limiter-exit.ts');
        const tsNodeScript = require.resolve('ts-node/dist/bin.js');

        const result = spawnSync(process.execPath, [tsNodeScript, fixturePath], {
            encoding: 'utf8',
            timeout: 10000
        });

        const output = (result.stdout || '') + (result.stderr || '');
        expect(result.status).toBe(0);
        expect(output).toContain('tasksDone=4/4');
    });
});
