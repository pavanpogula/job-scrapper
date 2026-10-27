// @ts-check
/**
 * @file layout.test.mjs
 * @summary Asserts root directory monorepo layout invariants: no legacy root code/configs, only allow-listed entries (P3b).
 * @tags repo-tests, layout, monorepo, verification
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { getRepoRoot } from './_lib.mjs';

const root = getRepoRoot();

test('layout: forbidden legacy root code, configs, and artifacts do not exist at root', () => {
  const forbidden = [
    'src',
    'tests',
    'package.json',
    'package-lock.json',
    'vercel.json',
    'prisma',
    'api',
    '__mocks__',
    'jest.config.js',
    'tsconfig.json',
    'tsconfig.test.json',
    'extracted-slugs.json',
    'JOBS.md',
    'documentation',
  ];

  for (const item of forbidden) {
    const itemPath = path.join(root, item);
    assert.strictEqual(
      fs.existsSync(itemPath),
      false,
      `Expected "${item}" to NOT exist at repository root, but it was found`
    );
  }
});

test('layout: root contains only allow-listed tracked entries', () => {
  const allowed = new Set([
    '.agents',
    '.claude',
    '.codex',
    '.github',
    '.gitignore',
    '.nvmrc',
    'AGENTS.md',
    'CHANGELOG.md',
    'CLAUDE.md',
    // Design context the impeccable skill reads from the project root (ADR-0020)
    'DESIGN.md',
    'PRODUCT.md',
    'README.md',
    'backend',
    'docs',
    'frontend',
    'scripts',
    'skills-lock.json',
  ]);

  const output = execFileSync('git', ['ls-tree', 'HEAD', '--name-only'], {
    cwd: root,
    encoding: 'utf-8',
  });

  const trackedRootEntries = output.trim().split('\n').filter(Boolean);

  for (const entry of trackedRootEntries) {
    assert.ok(
      allowed.has(entry),
      `Root entry "${entry}" is not in the allow-list: [${Array.from(allowed).join(', ')}]`
    );
  }
});
