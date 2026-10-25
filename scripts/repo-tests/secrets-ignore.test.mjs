// @ts-check
/**
 * @file secrets-ignore.test.mjs
 * @summary Validates gitignore and .claude/settings.json secret hygiene patterns (A18).
 * @tags repo-tests, secrets, gitignore, permissions
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getRepoRoot, gitCheckIgnore } from './_lib.mjs';

test('git check-ignore covers all required sensitive paths while preserving .env.example', () => {
  const sensitivePaths = [
    '.env',
    '.env.local',
    '.env.production',
    'backend/.env',
    'backend/.env.local',
    '.vercel/project.json',
    'frontend/.vercel/output',
    'backend/.vercel/output',
    'apikeys/key.json',
    'backend/apikeys/key.json',
    'output/reports/run.json',
    'backend/output/reports/run.json',
  ];

  const ignored = gitCheckIgnore(sensitivePaths);
  for (const p of sensitivePaths) {
    assert.ok(
      ignored.includes(p),
      `Expected ${p} to be ignored by git, but git check-ignore did not match it`
    );
  }

  // Ensure .env.example is NOT ignored
  const exampleIgnored = gitCheckIgnore(['.env.example']);
  assert.ok(
    !exampleIgnored.includes('.env.example'),
    'Expected .env.example to NOT be ignored by git'
  );
});

test('.claude/settings.json denies access to sensitive path patterns', () => {
  const root = getRepoRoot();
  const settingsPath = path.join(root, '.claude/settings.json');
  assert.ok(fs.existsSync(settingsPath), '.claude/settings.json must exist');

  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  const denyList = settings.permissions?.deny || [];

  const requiredDenies = [
    'Read(**/.env*)',
    'Read(**/apikeys/**)',
    'Read(**/.vercel/**)',
    'Read(**/output/**)',
  ];

  for (const rule of requiredDenies) {
    assert.ok(
      denyList.includes(rule),
      `Expected .claude/settings.json to contain deny rule: ${rule}`
    );
  }
});
