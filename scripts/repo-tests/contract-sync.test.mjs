// @ts-check
/**
 * @file contract-sync.test.mjs
 * @summary Asserts that backend and frontend contract fixtures match identically byte-for-byte
 * @tags repo-tests, contract, fixtures, sync, P8a
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getRepoRoot } from './_lib.mjs';

test('contract-sync: backend and frontend contract fixtures match byte-for-byte', () => {
  const root = getRepoRoot();
  const backendDir = path.join(root, 'backend/tests/fixtures/contract');
  const frontendDir = path.join(root, 'frontend/src/test/fixtures/contract');

  assert.ok(fs.existsSync(backendDir), `Backend contract fixtures dir missing: ${backendDir}`);
  assert.ok(fs.existsSync(frontendDir), `Frontend contract fixtures dir missing: ${frontendDir}`);

  const backendFiles = fs
    .readdirSync(backendDir)
    .filter((f) => f.endsWith('.json'))
    .sort();
  const frontendFiles = fs
    .readdirSync(frontendDir)
    .filter((f) => f.endsWith('.json'))
    .sort();

  assert.ok(backendFiles.length > 0, 'Backend contract fixtures directory is empty');
  assert.deepEqual(
    frontendFiles,
    backendFiles,
    `Fixture file set mismatch between backend and frontend. Run 'node scripts/contract/sync-fixtures.mjs'`
  );

  for (const file of backendFiles) {
    const backendContent = fs.readFileSync(path.join(backendDir, file));
    const frontendContent = fs.readFileSync(path.join(frontendDir, file));
    assert.deepEqual(
      frontendContent,
      backendContent,
      `Contract fixture ${file} differs between backend and frontend. Run 'node scripts/contract/sync-fixtures.mjs'`
    );
  }
});
