// @ts-check
/**
 * @file yaml-lite.test.mjs
 * @summary Unit test validating the lightweight YAML extractor against real workflows.
 * @tags repo-tests, yaml-lite, workflows
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getRepoRoot } from './_lib.mjs';
import { parseYaml } from './_yaml-lite.mjs';

test('parseYaml parses scrape-daily.yml accurately', () => {
  const root = getRepoRoot();
  const filePath = path.join(root, '.github/workflows/scrape-daily.yml');
  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = parseYaml(content);

  assert.ok(parsed.jobs, 'Expected jobs object');
  assert.ok(parsed.jobs.scrape, 'Expected scrape job');
  assert.ok(parsed.jobs.fixer, 'Expected fixer job');
  assert.equal(parsed.jobs.scrape.runs_on || parsed.jobs.scrape['runs-on'], 'ubuntu-24.04');
  assert.equal(parsed.jobs.scrape.if, "vars.SCRAPE_ENABLED != 'false'");
  assert.ok(Array.isArray(parsed.jobs.scrape.steps), 'Expected steps array');
  assert.ok(parsed.jobs.scrape.steps.length > 5, 'Expected multiple steps');
});

test('parseYaml parses ci.yml accurately', () => {
  const root = getRepoRoot();
  const filePath = path.join(root, '.github/workflows/ci.yml');
  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = parseYaml(content);

  assert.ok(parsed.jobs, 'Expected jobs object');
  assert.ok(parsed.jobs.verify, 'Expected verify job');
  assert.ok(Array.isArray(parsed.jobs.verify.steps), 'Expected steps array');
});

test('parseYaml parses discover-weekly.yml accurately', () => {
  const root = getRepoRoot();
  const filePath = path.join(root, '.github/workflows/discover-weekly.yml');
  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = parseYaml(content);

  assert.ok(parsed.jobs, 'Expected jobs object');
  assert.ok(parsed.jobs.discover, 'Expected discover job');
  assert.equal(parsed.jobs.discover.if, "vars.DISCOVERY_ENABLED != 'false'");
});
