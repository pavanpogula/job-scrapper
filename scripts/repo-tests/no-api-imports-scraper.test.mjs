// @ts-check
/**
 * @file no-api-imports-scraper.test.mjs
 * @summary Asserts that backend API modules never import scraper core, discovery, or child_process (guards D2, P3a).
 * @tags repo-tests, architecture, isolation, d2
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getRepoRoot } from './_lib.mjs';

const root = getRepoRoot();

test('no-api-imports-scraper: backend API never imports scraper core, discovery, or child_process', () => {
  const backendDir = path.join(root, 'backend');
  const apiDirs = [
    path.join(backendDir, 'src/api'),
    path.join(backendDir, 'api'),
  ];

  /** @type {string[]} */
  const apiFiles = [];

  function collectFiles(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        collectFiles(fullPath);
      } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
        apiFiles.push(fullPath);
      }
    }
  }

  for (const dir of apiDirs) {
    collectFiles(dir);
  }

  assert.ok(apiFiles.length > 0, 'Expected to find API TypeScript files to check');

  const forbiddenImportPatterns = [
    /from\s+['"][^'"]*core[^'"]*['"]/,
    /require\(['"][^'"]*core[^'"]*['"]\)/,
    /from\s+['"][^'"]*discovery[^'"]*['"]/,
    /require\(['"][^'"]*discovery[^'"]*['"]\)/,
    /from\s+['"](node:)?child_process['"]/,
    /require\(['"](node:)?child_process['"]\)/,
  ];

  for (const file of apiFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const relPath = path.relative(root, file);

    for (const pattern of forbiddenImportPatterns) {
      assert.ok(
        !pattern.test(content),
        `D2 architectural violation in ${relPath}: matches forbidden import pattern ${pattern}`
      );
    }
  }
});
