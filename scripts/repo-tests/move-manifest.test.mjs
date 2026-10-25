// @ts-check
/**
 * @file move-manifest.test.mjs
 * @summary Asserts every baseline file after move-map transformations remains tracked or is explicitly recorded in deleted.
 * @tags repo-tests, move-manifest, migration, safety
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getRepoRoot, gitLsFiles } from './_lib.mjs';

test('move-manifest guarantees no files are lost during monorepo restructuring', () => {
  const root = getRepoRoot();
  const baselineFilesPath = path.join(root, 'docs/monorepo-migration/baseline/files.txt');
  const moveMapPath = path.join(root, 'scripts/migration/move-map.json');

  if (!fs.existsSync(baselineFilesPath)) {
    // If baseline has not been captured yet, this passes vacuously
    return;
  }

  const baselineFiles = fs
    .readFileSync(baselineFilesPath, 'utf-8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const moveMap = fs.existsSync(moveMapPath)
    ? JSON.parse(fs.readFileSync(moveMapPath, 'utf-8'))
    : { prefixes: [], deleted: [] };

  const currentTracked = new Set(gitLsFiles(root));

  /**
   * @param {string} filePath
   */
  function isDeleted(filePath) {
    return (moveMap.deleted || []).some((/** @type {any} */ d) =>
      filePath === d.path || filePath.startsWith(d.path)
    );
  }

  /**
   * @param {string} filePath
   */
  function mapPath(filePath) {
    for (const p of moveMap.prefixes || []) {
      if (filePath.startsWith(p.from)) {
        return p.to + filePath.slice(p.from.length);
      }
    }
    return filePath;
  }

  const missing = [];
  for (const file of baselineFiles) {
    if (isDeleted(file)) {
      continue;
    }
    const target = mapPath(file);
    if (!currentTracked.has(target)) {
      missing.push(`${file} -> ${target}`);
    }
  }

  assert.equal(
    missing.length,
    0,
    `Files lost in migration without record in move-map.deleted:\n${missing.slice(0, 20).join('\n')}`
  );
});
