// @ts-check
/**
 * @file toggles.test.mjs
 * @summary Asserts stop-the-line toggles exist in scrape-daily and discover-weekly workflows (O11).
 * @tags repo-tests, toggles, workflows
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getRepoRoot } from './_lib.mjs';
import { parseYaml } from './_yaml-lite.mjs';

test('scrape-daily.yml has SCRAPE_ENABLED and FIXER_ENABLED toggles', () => {
  const root = getRepoRoot();
  const filePath = path.join(root, '.github/workflows/scrape-daily.yml');
  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = parseYaml(content);

  const scrapeJob = parsed.jobs?.scrape;
  assert.ok(scrapeJob, 'scrape job must exist in scrape-daily.yml');
  assert.ok(
    String(scrapeJob.if).includes("vars.SCRAPE_ENABLED != 'false'"),
    `scrape job must guard with vars.SCRAPE_ENABLED != 'false', found: ${scrapeJob.if}`
  );

  const fixerJob = parsed.jobs?.fixer;
  assert.ok(fixerJob, 'fixer job must exist in scrape-daily.yml');
  assert.ok(
    String(fixerJob.if).includes("vars.FIXER_ENABLED != 'false'"),
    `fixer job must guard with vars.FIXER_ENABLED != 'false', found: ${fixerJob.if}`
  );

  // Check enrich step in scrape job
  const enrichStep = scrapeJob.steps?.find(
    (/** @type {any} */ s) => s.name === 'Enrich active companies metadata' || s.run?.includes('enrich:companies')
  );
  assert.ok(enrichStep, 'Enrich active companies metadata step must exist');
  assert.ok(
    String(enrichStep.if).includes('inputs.fixture_report'),
    `enrich step must guard against fixture_report, found: ${enrichStep.if}`
  );
  assert.ok(
    String(enrichStep.run).includes('--sources=$EFFECTIVE_SOURCES'),
    `enrich step must pass --sources=$EFFECTIVE_SOURCES, found: ${enrichStep.run}`
  );

  // G6: Check inputs in workflow_dispatch
  const dispatchInputs = parsed.on?.workflow_dispatch?.inputs;
  assert.ok(dispatchInputs, 'workflow_dispatch inputs must exist in scrape-daily.yml');
  assert.ok(dispatchInputs.sources, 'inputs.sources must exist in scrape-daily.yml');
  assert.ok(dispatchInputs.force_publish, 'inputs.force_publish must exist in scrape-daily.yml');
  assert.ok(dispatchInputs.deactivate_source, 'inputs.deactivate_source must exist in scrape-daily.yml');

  // G6: Check effective sources expression in env
  const env = scrapeJob.env || {};
  assert.ok(
    String(env.EFFECTIVE_SOURCES).includes("vars.GREENHOUSE_ENABLED == 'true'"),
    `scrape job env must define EFFECTIVE_SOURCES checking GREENHOUSE_ENABLED, found: ${env.EFFECTIVE_SOURCES}`
  );

  // G6: Check deactivate_source step
  const deactivateStep = scrapeJob.steps?.find(
    (/** @type {any} */ s) => s.run?.includes('source:deactivate')
  );
  assert.ok(deactivateStep, 'source:deactivate step must exist in scrape-daily.yml');
  assert.ok(
    String(deactivateStep.if).includes('inputs.deactivate_source'),
    `deactivate step must check inputs.deactivate_source, found: ${deactivateStep.if}`
  );

  // G6: Check scrape step passes --sources=$EFFECTIVE_SOURCES
  const scrapeStep = scrapeJob.steps?.find(
    (/** @type {any} */ s) => s.id === 'scrape' || s.name === 'Run scrape or fixture'
  );
  assert.ok(scrapeStep, 'scrape step must exist');
  assert.ok(
    String(scrapeStep.run).includes('--sources=$EFFECTIVE_SOURCES'),
    `scrape step must pass --sources=$EFFECTIVE_SOURCES, found: ${scrapeStep.run}`
  );

  // G6: force_publish only affects publish_only, never --accept-data-loss
  assert.ok(
    String(scrapeStep.run).includes('force_publish') && String(scrapeStep.run).includes('publish_only'),
    'force_publish must only be checked in the publish_only branch'
  );
});

test('workflows invariant: no workflow ever includes --accept-data-loss', () => {
  const root = getRepoRoot();
  const workflowsDir = path.join(root, '.github/workflows');
  const files = fs.readdirSync(workflowsDir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
  for (const file of files) {
    const content = fs.readFileSync(path.join(workflowsDir, file), 'utf-8');
    assert.ok(
      !content.includes('--accept-data-loss'),
      `Workflow ${file} must NEVER include --accept-data-loss`
    );
  }
});

test('discover-weekly.yml has DISCOVERY_ENABLED toggle', () => {
  const root = getRepoRoot();
  const filePath = path.join(root, '.github/workflows/discover-weekly.yml');
  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = parseYaml(content);

  const discoverJob = parsed.jobs?.discover;
  assert.ok(discoverJob, 'discover job must exist in discover-weekly.yml');
  assert.ok(
    String(discoverJob.if).includes("vars.DISCOVERY_ENABLED != 'false'"),
    `discover job must guard with vars.DISCOVERY_ENABLED != 'false', found: ${discoverJob.if}`
  );

  const ghJob = parsed.jobs?.['discover-greenhouse'];
  assert.ok(ghJob, 'discover-greenhouse job must exist in discover-weekly.yml');
  assert.ok(
    String(ghJob.if).includes("vars.DISCOVERY_GREENHOUSE_ENABLED == 'true'"),
    `discover-greenhouse job must guard with vars.DISCOVERY_GREENHOUSE_ENABLED == 'true', found: ${ghJob.if}`
  );
  assert.equal(ghJob['timeout-minutes'] || ghJob.timeout_minutes, 30, 'discover-greenhouse must have 30 min timeout');
  assert.equal(ghJob.needs, 'discover', 'discover-greenhouse must run after discover job');

  const ghSteps = ghJob.steps || [];
  const dbPushIndex = ghSteps.findIndex((s) => String(s.run).includes('prisma db push'));
  assert.ok(dbPushIndex !== -1, 'discover-greenhouse must have a prisma db push step');
  const runGhDiscoveryIndex = ghSteps.findIndex((s) =>
    String(s.run).includes('npm run discover -- --source=greenhouse --enrich')
  );
  assert.ok(runGhDiscoveryIndex !== -1, 'discover-greenhouse must run npm run discover -- --source=greenhouse --enrich');
  assert.ok(dbPushIndex < runGhDiscoveryIndex, 'discover-greenhouse db push must run before discovery');
});
