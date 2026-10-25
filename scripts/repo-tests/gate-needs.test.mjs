// @ts-check
/**
 * @file gate-needs.test.mjs
 * @summary Asserts that CI workflow gates cover all workflow jobs with if: always() and failure checks (P4a).
 * @tags repo-tests, workflows, gate-needs, ci
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getRepoRoot } from './_lib.mjs';
import { parseYaml } from './_yaml-lite.mjs';

const root = getRepoRoot();
const workflowsDir = path.join(root, '.github/workflows');

const GATES = [
  {
    file: 'backend-ci.yml',
    gate: 'backend-gate',
    expectedJobs: ['changes', 'verify', 'backend-gate'],
  },
  {
    file: 'frontend-ci.yml',
    gate: 'frontend-gate',
    expectedJobs: ['changes', 'verify', 'frontend-gate'],
  },
  {
    file: 'repo-ci.yml',
    gate: 'repo-gate',
    expectedJobs: ['repo-tests', 'actionlint', 'fixer-scope', 'repo-gate'],
  },
];

for (const { file, gate, expectedJobs } of GATES) {
  test(`gate-needs: ${file} gate "${gate}" covers all other jobs with if: always()`, () => {
    const filePath = path.join(workflowsDir, file);
    assert.ok(fs.existsSync(filePath), `Workflow file must exist: ${file}`);

    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = parseYaml(content);

    assert.ok(parsed.jobs, `Workflow ${file} must define jobs`);

    const actualJobKeys = Object.keys(parsed.jobs);
    for (const expectedJob of expectedJobs) {
      assert.ok(
        actualJobKeys.includes(expectedJob),
        `Workflow ${file} missing expected job "${expectedJob}"`
      );
    }

    const gateJob = parsed.jobs[gate];
    assert.ok(gateJob, `Gate job "${gate}" must exist in ${file}`);

    // Gate must specify if: always()
    assert.equal(
      String(gateJob.if).trim(),
      'always()',
      `Gate job "${gate}" in ${file} must have "if: always()"`
    );

    // Gate needs must cover every other job in the workflow
    const otherJobs = actualJobKeys.filter((k) => k !== gate);
    const gateNeeds = Array.isArray(gateJob.needs) ? gateJob.needs : [gateJob.needs].filter(Boolean);

    for (const job of otherJobs) {
      assert.ok(
        gateNeeds.includes(job),
        `Gate "${gate}" in ${file} must include "${job}" in needs. Found: [${gateNeeds.join(', ')}]`
      );
    }

    // Gate steps must contain the failure/cancel expression check
    const stepsContent = JSON.stringify(gateJob.steps || []);
    assert.ok(
      stepsContent.includes("contains(needs.*.result, 'failure')") &&
        stepsContent.includes("contains(needs.*.result, 'cancelled')"),
      `Gate "${gate}" in ${file} must check for failure and cancelled in needs.*.result`
    );
  });
}
