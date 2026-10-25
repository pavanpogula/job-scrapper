// @ts-check
/**
 * @file docs-links.test.mjs
 * @summary Validates documentation integrity: link resolution, reachability from docs/README.md, root README structure, and absence of legacy documentation/ path strings.
 * @tags repo-tests, docs, links, verification
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getRepoRoot, gitLsFiles } from './_lib.mjs';

const root = getRepoRoot();

test('docs-links: first ## in root README.md is Workflows', () => {
  const readmePath = path.join(root, 'README.md');
  assert.ok(fs.existsSync(readmePath), 'Root README.md must exist');

  const content = fs.readFileSync(readmePath, 'utf-8');
  const match = content.match(/^##\s+(.+)$/m);
  assert.ok(match, 'README.md must contain at least one ## heading');

  const headingText = match[1].trim();
  assert.ok(
    /^Workflows(\s+&|\b)/i.test(headingText),
    `First ## heading in README.md must start with "Workflows", found: "${headingText}"`
  );
});

test('docs-links: documentation/ is absent from tracked files outside archive and history', () => {
  const trackedFiles = gitLsFiles(root);
  const violations = [];

  for (const relFile of trackedFiles) {
    if (
      relFile.startsWith('docs/archive/') ||
      relFile.startsWith('docs/monorepo-migration/') ||
      relFile === 'CHANGELOG.md' ||
      relFile === 'scripts/migration/move-map.json'
    ) {
      continue;
    }

    const fullPath = path.join(root, relFile);
    if (!fs.existsSync(fullPath)) continue;

    const stat = fs.statSync(fullPath);
    if (!stat.isFile() || stat.size > 1024 * 1024) continue;

    const content = fs.readFileSync(fullPath, 'utf-8');
    if (content.includes('documentation/')) {
      violations.push(relFile);
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Found legacy "documentation/" path strings in:\n${violations.join('\n')}`
  );
});

test('docs-links: every relative link and @import in active docs resolves to an existing file', () => {
  const docRoots = [
    path.join(root, 'docs'),
    path.join(root, 'backend/docs'),
    path.join(root, 'frontend/docs'),
  ];

  /** @type {string[]} */
  const docFiles = [
    path.join(root, 'README.md'),
    path.join(root, 'AGENTS.md'),
    path.join(root, 'CLAUDE.md'),
  ];

  function collectMds(/** @type {string} */ dir) {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (full.includes('docs/archive') || full.includes('docs/monorepo-migration')) continue;
        collectMds(full);
      } else if (ent.isFile() && ent.name.endsWith('.md')) {
        docFiles.push(full);
      }
    }
  }

  for (const d of docRoots) collectMds(d);

  const brokenLinks = [];

  for (const file of docFiles) {
    const dir = path.dirname(file);
    let content = fs.readFileSync(file, 'utf-8');

    // Strip fenced code blocks and inline backticks so example syntax like `[text](link)` is ignored
    content = content.replace(/```[\s\S]*?```/g, '');
    content = content.replace(/`[^`\n]+`/g, '');

    // 1. Markdown links: [text](target)
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match;
    while ((match = linkRegex.exec(content)) !== null) {
      const target = match[2].trim();
      // Skip external, anchors, mailto, or placeholder 'link'
      if (
        target.startsWith('http://') ||
        target.startsWith('https://') ||
        target.startsWith('mailto:') ||
        target.startsWith('#') ||
        target === 'link'
      ) {
        continue;
      }

      const cleanTarget = target.split('#')[0].split('?')[0];
      if (!cleanTarget) continue;

      const resolved = path.resolve(dir, cleanTarget);
      if (!fs.existsSync(resolved)) {
        brokenLinks.push(`${path.relative(root, file)} -> ${target} (resolved: ${path.relative(root, resolved)})`);
      }
    }

    // 2. Claude/Antigravity @imports: @path/to/file or @[name](path)
    const importRegex = /(?:^|\s)@([a-zA-Z0-9_./-]+\.(?:md|ts|json))/gm;
    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1].trim();
      const resolved = path.resolve(root, importPath);
      if (!fs.existsSync(resolved)) {
        brokenLinks.push(`@import in ${path.relative(root, file)} -> ${importPath}`);
      }
    }
  }

  assert.deepEqual(
    brokenLinks,
    [],
    `Broken relative links or @imports found:\n${brokenLinks.join('\n')}`
  );
});

test('docs-links: every active .md under docs/, backend/docs/, and frontend/docs/ is reachable from docs/README.md', () => {
  const startFile = path.join(root, 'docs/README.md');
  assert.ok(fs.existsSync(startFile), 'docs/README.md must exist');

  const visited = new Set();
  const queue = [startFile];

  while (queue.length > 0) {
    const curr = queue.shift();
    if (!curr || visited.has(curr)) continue;
    visited.add(curr);

    if (!fs.existsSync(curr)) continue;
    const dir = path.dirname(curr);
    let content = fs.readFileSync(curr, 'utf-8');
    content = content.replace(/```[\s\S]*?```/g, '');

    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match;
    while ((match = linkRegex.exec(content)) !== null) {
      const target = match[2].trim();
      if (
        target.startsWith('http://') ||
        target.startsWith('https://') ||
        target.startsWith('mailto:') ||
        target.startsWith('#')
      ) {
        continue;
      }
      const cleanTarget = target.split('#')[0].split('?')[0];
      if (!cleanTarget) continue;

      const resolved = path.resolve(dir, cleanTarget);
      if (resolved.endsWith('.md') && !visited.has(resolved)) {
        queue.push(resolved);
      }
    }
  }

  /** @type {string[]} */
  const activeDocs = [];

  function collectActiveDocs(/** @type {string} */ dir) {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (full.includes('docs/archive') || full.includes('docs/monorepo-migration')) continue;
        collectActiveDocs(full);
      } else if (ent.isFile() && ent.name.endsWith('.md')) {
        activeDocs.push(full);
      }
    }
  }

  collectActiveDocs(path.join(root, 'docs'));
  collectActiveDocs(path.join(root, 'backend/docs'));
  collectActiveDocs(path.join(root, 'frontend/docs'));

  const unreachable = [];
  for (const doc of activeDocs) {
    if (!visited.has(doc)) {
      unreachable.push(path.relative(root, doc));
    }
  }

  assert.deepEqual(
    unreachable,
    [],
    `Active documentation files unreachable from docs/README.md:\n${unreachable.join('\n')}`
  );
});
