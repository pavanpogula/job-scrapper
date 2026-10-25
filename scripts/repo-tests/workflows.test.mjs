// @ts-check
/**
 * @file workflows.test.mjs
 * @summary Validates GitHub Actions workflow structures (toggles, working-directories, script paths, fixer defaults).
 * @tags repo-tests, workflows, ci, validation
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getRepoRoot } from './_lib.mjs';
import { parseYaml } from './_yaml-lite.mjs';

test('workflows structure, paths, and fixer constraints adhere to invariants', () => {
  const root = getRepoRoot();
  const workflowsDir = path.join(root, '.github/workflows');
  const isBackendLayout = fs.existsSync(path.join(root, 'backend/package.json'));

  // 1. scrape-daily.yml
  const scrapePath = path.join(workflowsDir, 'scrape-daily.yml');
  assert.ok(fs.existsSync(scrapePath), 'scrape-daily.yml must exist');
  const scrapeYaml = parseYaml(fs.readFileSync(scrapePath, 'utf-8'));

  // Stop-the-line toggles must exist
  const scrapeJob = scrapeYaml.jobs?.scrape;
  assert.ok(scrapeJob, 'scrape job must exist');
  assert.ok(String(scrapeJob.if).includes('SCRAPE_ENABLED'), 'scrape job must check SCRAPE_ENABLED');

  const fixerJob = scrapeYaml.jobs?.fixer;
  assert.ok(fixerJob, 'fixer job must exist');
  assert.ok(String(fixerJob.if).includes('FIXER_ENABLED'), 'fixer job must check FIXER_ENABLED');

  // Fixer job must NOT have a default working-directory (runs from root per A2)
  const fixerDefaults = fixerJob.defaults?.run?.['working-directory'] || fixerJob.defaults?.run?.working_directory;
  assert.equal(
    fixerDefaults,
    undefined,
    'fixer job must have NO working-directory default (runs from repo root per A2)'
  );

  // Referenced scripts in scrape-daily steps must exist on disk
  for (const step of scrapeJob.steps || []) {
    if (step.run && typeof step.run === 'string') {
      const match = step.run.match(/scripts\/ci\/([a-zA-Z0-9_-]+\.sh)/);
      if (match) {
        const scriptPath = path.join(root, 'scripts/ci', match[1]);
        assert.ok(fs.existsSync(scriptPath), `Script referenced in workflow must exist: ${scriptPath}`);
      }
    }
  }

  // 2. discover-weekly.yml
  const discoverPath = path.join(workflowsDir, 'discover-weekly.yml');
  assert.ok(fs.existsSync(discoverPath), 'discover-weekly.yml must exist');
  const discoverYaml = parseYaml(fs.readFileSync(discoverPath, 'utf-8'));
  const discoverJob = discoverYaml.jobs?.discover;
  assert.ok(discoverJob, 'discover job must exist');
  assert.ok(String(discoverJob.if).includes('DISCOVERY_ENABLED'), 'discover job must check DISCOVERY_ENABLED');

  // 3. ci.yml
  const ciPath = path.join(workflowsDir, 'ci.yml');
  if (fs.existsSync(ciPath)) {
    const ciYaml = parseYaml(fs.readFileSync(ciPath, 'utf-8'));
    const verifyJob = ciYaml.jobs?.verify;
    assert.ok(verifyJob, 'verify job must exist in ci.yml');

    for (const step of verifyJob.steps || []) {
      if (step.run && typeof step.run === 'string') {
        const match = step.run.match(/scripts\/ci\/([a-zA-Z0-9_-]+\.sh)/);
        if (match) {
          const scriptPath = path.join(root, 'scripts/ci', match[1]);
          assert.ok(fs.existsSync(scriptPath), `Script referenced in ci.yml must exist: ${scriptPath}`);
        }
      }
    }
  }
});
