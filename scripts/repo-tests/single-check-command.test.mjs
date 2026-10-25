// @ts-check
/**
 * @file single-check-command.test.mjs
 * @summary Asserts that AGENTS.md, CLAUDE.md, skills, roles, and PR template contain only canonical check commands (P3a).
 * @tags repo-tests, verification, standardization
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getRepoRoot } from './_lib.mjs';

const root = getRepoRoot();

test('single-check-command: verification commands adhere strictly to canonical monorepo standards', () => {
  const targetFiles = [
    path.join(root, 'AGENTS.md'),
    path.join(root, 'CLAUDE.md'),
    path.join(root, '.github/pull_request_template.md'),
  ];

  // Scan skills
  const skillsDir = path.join(root, '.agents/skills');
  if (fs.existsSync(skillsDir)) {
    for (const skill of fs.readdirSync(skillsDir)) {
      const skillFile = path.join(skillsDir, skill, 'SKILL.md');
      if (fs.existsSync(skillFile)) targetFiles.push(skillFile);
    }
  }

  // Scan role docs and shells
  const rolesDir = path.join(root, 'documentation/agents/roles');
  if (fs.existsSync(rolesDir)) {
    for (const role of fs.readdirSync(rolesDir)) {
      if (role.endsWith('.md')) targetFiles.push(path.join(rolesDir, role));
    }
  }

  const legacyVariants = [
    'npx tsc --noEmit -p .',
    'npx tsc --noEmit -p tsconfig.test.json',
    'npm run verify:ui',
    'npm test && npm run verify:ui',
  ];

  for (const filePath of targetFiles) {
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, 'utf-8');
    const relPath = path.relative(root, filePath);

    for (const legacy of legacyVariants) {
      assert.ok(
        !content.includes(legacy),
        `Found stale verification command "${legacy}" in ${relPath}. Use canonical command "scripts/check-all.sh --no-install" instead.`
      );
    }
  }
});
