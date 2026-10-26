// @ts-check
/**
 * @file workflows.test.mjs
 * @summary Validates GitHub Actions workflow structures (toggles, working-directories, script paths, fixer defaults, manual-only deploys).
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

  // 3. Legacy ci.yml must be deleted
  const ciPath = path.join(workflowsDir, 'ci.yml');
  assert.strictEqual(
    fs.existsSync(ciPath),
    false,
    'Legacy ci.yml must not exist (retired in P4b in favor of split CI workflows)'
  );

  // 4. Split CI workflows (backend-ci.yml, frontend-ci.yml, repo-ci.yml)
  for (const splitWf of ['backend-ci.yml', 'frontend-ci.yml', 'repo-ci.yml']) {
    const wfPath = path.join(workflowsDir, splitWf);
    assert.ok(fs.existsSync(wfPath), `${splitWf} must exist`);
    const wfYaml = parseYaml(fs.readFileSync(wfPath, 'utf-8'));
    for (const job of Object.values(wfYaml.jobs || {})) {
      for (const step of job.steps || []) {
        if (step.run && typeof step.run === 'string') {
          const match = step.run.match(/scripts\/ci\/([a-zA-Z0-9_-]+\.sh)/);
          if (match) {
            const scriptPath = path.join(root, 'scripts/ci', match[1]);
            assert.ok(fs.existsSync(scriptPath), `Script referenced in ${splitWf} must exist: ${scriptPath}`);
          }
        }
      }
    }
  }
});

test('deploy.yml is manual-only, verifies before deploying, and keeps Vercel secrets in deploy jobs', () => {
  const root = getRepoRoot();
  const deployPath = path.join(root, '.github/workflows/deploy.yml');
  assert.ok(fs.existsSync(deployPath), 'deploy.yml must exist (Vercel git deploys are disabled)');
  const raw = fs.readFileSync(deployPath, 'utf-8');
  const wf = parseYaml(raw);

  // Manual only: no push / pull_request / schedule trigger may ever deploy.
  assert.deepEqual(Object.keys(wf.on || {}), ['workflow_dispatch'], 'deploy.yml must trigger on workflow_dispatch only');

  // Vercel CLI version is pinned to an exact semver.
  assert.match(String(wf.env?.VERCEL_CLI_VERSION), /^\d+\.\d+\.\d+$/, 'VERCEL_CLI_VERSION must be an exact version');
  assert.doesNotMatch(raw, /vercel@latest|npx (--yes )?vercel(\s|$)/, 'every vercel invocation must use the pinned version');

  const jobs = wf.jobs || {};
  for (const name of ['verify', 'deploy-backend', 'deploy-frontend']) {
    assert.ok(jobs[name], `deploy.yml must define job ${name}`);
  }

  // Nothing deploys without a green verify; frontend waits for the backend (it proxies to it).
  assert.deepEqual(jobs['deploy-backend'].needs, ['verify']);
  assert.deepEqual(jobs['deploy-frontend'].needs, ['verify', 'deploy-backend']);
  assert.match(String(jobs['deploy-frontend'].if), /needs\.verify\.result == 'success'/);
  assert.match(String(jobs['deploy-frontend'].if), /needs\.deploy-backend\.result == 'success'/);

  // Secrets only in the deploy jobs, which run in the vercel-production environment.
  assert.doesNotMatch(JSON.stringify(jobs.verify), /secrets\./, 'verify job must not see any secret');
  for (const name of ['deploy-backend', 'deploy-frontend']) {
    assert.equal(jobs[name].environment, 'vercel-production', `${name} must run in the vercel-production environment`);
  }
  assert.match(String(jobs['deploy-backend'].env?.VERCEL_PROJECT_ID), /VERCEL_PROJECT_ID_BACKEND/);
  assert.match(String(jobs['deploy-frontend'].env?.VERCEL_PROJECT_ID), /VERCEL_PROJECT_ID_FRONTEND/);
  assert.match(JSON.stringify(jobs.verify.steps), /scripts\/check-all\.sh/, 'verify must run scripts/check-all.sh');
});
