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

  // A rollback run skips the scrape, so classify (which needs a report and exits 1 without one) must be skipped too
  const classifyStep = scrapeJob.steps?.find((/** @type {any} */ s) => s.id === 'classify');
  assert.ok(classifyStep, 'classify step must exist in scrape-daily.yml');
  assert.ok(
    String(classifyStep.if).includes('inputs.deactivate_source'),
    `classify step must be skipped for deactivate_source runs, found: ${classifyStep.if}`
  );
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

  const leverJob = parsed.jobs?.['discover-lever'];
  assert.ok(leverJob, 'discover-lever job must exist in discover-weekly.yml');
  assert.ok(
    String(leverJob.if).includes("vars.DISCOVERY_LEVER_ENABLED == 'true'"),
    `discover-lever job must guard with vars.DISCOVERY_LEVER_ENABLED == 'true', found: ${leverJob.if}`
  );
  assert.equal(leverJob['timeout-minutes'] || leverJob.timeout_minutes, 120, 'discover-lever must have 120 min timeout');
  assert.equal(leverJob.needs, 'discover-greenhouse', 'discover-lever must run after discover-greenhouse');
  assert.equal(leverJob.concurrency, undefined, 'discover-lever must not set job-level concurrency (avoids deadlock with workflow group)');

  const leverSteps = leverJob.steps || [];
  const leverDbPushIdx = leverSteps.findIndex((s) => String(s.run).includes('prisma db push'));
  assert.ok(leverDbPushIdx !== -1, 'discover-lever must have a prisma db push step');

  const restoreIdx = leverSteps.findIndex(
    (s) =>
      String(s.uses).startsWith('actions/cache/restore') &&
      String(s.with?.path).includes('backend/output/lever-discovery-state.json')
  );
  assert.ok(restoreIdx !== -1, 'discover-lever must restore backend/output/lever-discovery-state.json cache');

  const runLeverIdx = leverSteps.findIndex((s) =>
    String(s.run).includes('npm run discover -- --source=lever --enrich')
  );
  assert.ok(runLeverIdx !== -1, 'discover-lever must run npm run discover -- --source=lever --enrich');

  const saveIdx = leverSteps.findIndex(
    (s) =>
      String(s.uses).startsWith('actions/cache/save') &&
      String(s.if).includes('always()') &&
      String(s.with?.path).includes('backend/output/lever-discovery-state.json')
  );
  assert.ok(saveIdx !== -1, 'discover-lever must save backend/output/lever-discovery-state.json cache with if: always()');

  assert.ok(leverDbPushIdx < runLeverIdx, 'discover-lever db push must run before discovery');
  assert.ok(restoreIdx < runLeverIdx && runLeverIdx < saveIdx, 'discover-lever must restore before and save after running discovery');
});

test('scrape-daily.yml wires LEVER_ENABLED and STAGED_SCRAPE with a timeout below the cron cadence', () => {
  const root = getRepoRoot();
  const content = fs.readFileSync(path.join(root, '.github/workflows/scrape-daily.yml'), 'utf-8');
  const parsed = parseYaml(content);
  const scrapeJob = parsed.jobs?.scrape;
  assert.ok(scrapeJob, 'scrape job must exist');

  // EFFECTIVE_SOURCES stays a job-level env expression and now also checks LEVER_ENABLED
  const env = scrapeJob.env || {};
  const effective = String(env.EFFECTIVE_SOURCES);
  assert.ok(effective.includes("vars.GREENHOUSE_ENABLED == 'true'"), 'EFFECTIVE_SOURCES must check GREENHOUSE_ENABLED');
  assert.ok(effective.includes("vars.LEVER_ENABLED == 'true'"), 'EFFECTIVE_SOURCES must check LEVER_ENABLED');
  assert.ok(effective.includes("format('ashby{0}{1}'"), 'EFFECTIVE_SOURCES must start from ashby and append the enabled sources');
  assert.ok(String(env.LEVER_ENABLED).includes('vars.LEVER_ENABLED'), 'LEVER_ENABLED env must come from the repo variable');
  assert.ok(String(env.STAGED_SCRAPE).includes('vars.STAGED_SCRAPE'), 'STAGED_SCRAPE env must come from the repo variable');

  // The job timeout must leave at least 20 minutes before the next scheduled run (cron hours are 3 h apart)
  const cron = String(parsed.on?.schedule?.[0]?.cron);
  const hours = cron.split(' ')[1].split(',').map((h) => parseInt(h, 10)).sort((a, b) => a - b);
  let minGapMinutes = Infinity;
  for (let i = 0; i < hours.length; i++) {
    const next = hours[(i + 1) % hours.length] + (i + 1 === hours.length ? 24 : 0);
    minGapMinutes = Math.min(minGapMinutes, (next - hours[i]) * 60);
  }
  assert.equal(minGapMinutes, 180, 'scheduled runs must stay 3 hours apart (or update the timeout rule and docs)');
  const timeout = Number(scrapeJob['timeout-minutes']);
  assert.equal(timeout, 150, 'scrape job timeout must be 150 minutes (staged worst case about 132)');
  assert.ok(minGapMinutes - timeout >= 20, `scrape timeout ${timeout} must leave 20+ minutes before the next run (gap ${minGapMinutes})`);
  assert.equal(scrapeJob.concurrency, undefined, 'scrape job must not set job-level concurrency (workflow-level group serializes runs)');

  // New dispatch inputs and the rollback choice
  const inputs = parsed.on?.workflow_dispatch?.inputs;
  assert.ok(inputs.staged, 'inputs.staged must exist');
  assert.ok(inputs.lever_max_boards, 'inputs.lever_max_boards must exist');
  assert.ok(inputs.lever_stage_min, 'inputs.lever_stage_min must exist');
  assert.ok(inputs.deactivate_source.options.includes('lever'), 'deactivate_source options must include lever');

  // The scrape step adds --staged only for the input or the variable, and the Lever flags only when set and validated
  const scrapeStep = scrapeJob.steps?.find((/** @type {any} */ s) => s.id === 'scrape');
  const run = String(scrapeStep.run);
  assert.ok(run.includes('"$STAGED_INPUT" = "true"') && run.includes('"$STAGED_SCRAPE" = "true"'), 'staged must depend on the input or STAGED_SCRAPE');
  assert.ok(run.includes('--staged'), 'scrape step must pass --staged');
  assert.ok(run.includes('--lever-max-boards=$LEVER_MAX_BOARDS_INPUT'), 'lever_max_boards must be passed through');
  assert.ok(run.includes('--lever-stage-min=$LEVER_STAGE_MIN_INPUT'), 'lever_stage_min must be passed through');
  assert.ok(run.includes('[ -n "$LEVER_MAX_BOARDS_INPUT" ]') && run.includes('[ -n "$LEVER_STAGE_MIN_INPUT" ]'), 'Lever flags only when the inputs are set');
  assert.ok(run.includes("grep -Eq '^([0-9]+|all)$'") && run.includes("grep -Eq '^[0-9]+$'"), 'Lever inputs must be validated as digits (or all)');
  assert.ok(!run.includes('${{ inputs.lever'), 'Lever inputs must reach the shell through env vars, never interpolated into the script');
  assert.ok(String(scrapeStep.env?.LEVER_MAX_BOARDS_INPUT).includes('inputs.lever_max_boards'), 'LEVER_MAX_BOARDS_INPUT env must come from the input');
});

test('scrape-daily.yml wires job attribute enrichment behind ENRICH_ENABLED and an enrich_backfill dispatch', () => {
  const root = getRepoRoot();
  const content = fs.readFileSync(path.join(root, '.github/workflows/scrape-daily.yml'), 'utf-8');
  const parsed = parseYaml(content);

  const inputs = parsed.on?.workflow_dispatch?.inputs;
  assert.ok(inputs?.enrich_backfill, 'inputs.enrich_backfill must exist');
  assert.equal(inputs.enrich_backfill.type, 'boolean', 'inputs.enrich_backfill must be boolean');
  assert.equal(inputs.enrich_backfill.default, false, 'inputs.enrich_backfill default must be false');
  assert.ok(inputs?.enrich_budget_min, 'inputs.enrich_budget_min must exist');
  assert.equal(inputs.enrich_budget_min.default, '120', 'inputs.enrich_budget_min default must be 120');

  const scrapeJob = parsed.jobs?.scrape;
  assert.ok(scrapeJob, 'scrape job must exist');
  assert.equal(Number(scrapeJob['timeout-minutes']), 150, 'scrape job timeout-minutes must stay 150');
  assert.equal(scrapeJob.concurrency, undefined, 'scrape job must not set job-level concurrency');

  const steps = scrapeJob.steps || [];
  const enrichCompaniesStep = steps.find((/** @type {any} */ s) => s.name === 'Enrich active companies metadata');
  const scrapeStep = steps.find((/** @type {any} */ s) => s.id === 'scrape');
  const classifyStep = steps.find((/** @type {any} */ s) => s.id === 'classify');
  const enrichAttrStep = steps.find((/** @type {any} */ s) => s.name === 'Enrich job attributes');
  const backfillStep = steps.find((/** @type {any} */ s) => s.name === 'Backfill job attributes');
  const uploadStep = steps.find((/** @type {any} */ s) => s.name === 'Upload scrape report artifact');

  assert.ok(enrichCompaniesStep, 'Enrich active companies metadata step must exist');
  assert.ok(scrapeStep, 'Run scrape or fixture step must exist');
  assert.ok(classifyStep, 'Classify scrape telemetry step must exist');
  assert.ok(enrichAttrStep, 'Enrich job attributes step must exist');
  assert.ok(backfillStep, 'Backfill job attributes step must exist');
  assert.ok(uploadStep, 'Upload scrape report artifact step must exist');

  assert.ok(
    String(scrapeStep.if).includes('inputs.enrich_backfill != true'),
    `scrape step must skip on enrich_backfill, found: ${scrapeStep.if}`
  );
  assert.ok(
    String(classifyStep.if).includes('inputs.enrich_backfill != true'),
    `classify step must skip on enrich_backfill, found: ${classifyStep.if}`
  );
  assert.ok(
    String(enrichCompaniesStep.if).includes('inputs.enrich_backfill != true'),
    `Enrich active companies metadata step must skip on enrich_backfill, found: ${enrichCompaniesStep.if}`
  );

  const classifyIdx = steps.indexOf(classifyStep);
  const enrichIdx = steps.indexOf(enrichAttrStep);
  const backfillIdx = steps.indexOf(backfillStep);
  const uploadIdx = steps.indexOf(uploadStep);
  assert.ok(
    classifyIdx < enrichIdx && enrichIdx < backfillIdx && backfillIdx < uploadIdx,
    `step order must be classify (${classifyIdx}) < Enrich job attributes (${enrichIdx}) < Backfill job attributes (${backfillIdx}) < Upload artifact (${uploadIdx})`
  );

  const enrichIf = String(enrichAttrStep.if);
  assert.ok(enrichIf.includes("vars.ENRICH_ENABLED == 'true'"), 'Enrich job attributes must gate on ENRICH_ENABLED');
  assert.ok(enrichIf.includes('inputs.enrich_backfill != true'), 'Enrich job attributes must skip on backfill');
  assert.ok(enrichIf.includes('inputs.fixture_report'), 'Enrich job attributes must guard fixture_report');
  assert.ok(enrichIf.includes('inputs.deactivate_source'), 'Enrich job attributes must guard deactivate_source');
  assert.ok(enrichIf.includes('inputs.publish_only != true'), 'Enrich job attributes must guard publish_only');
  assert.ok(
    enrichIf.includes("steps.scrape.outputs.exit_code == '0'") &&
      enrichIf.includes("steps.scrape.outputs.exit_code == '2'"),
    'Enrich job attributes must run only when scrape exit_code is 0 or 2'
  );
  assert.equal(enrichAttrStep['continue-on-error'], true, 'Enrich job attributes must be continue-on-error: true');
  assert.equal(Number(enrichAttrStep['timeout-minutes']), 15, 'Enrich job attributes timeout-minutes must be 15');

  const enrichRun = String(enrichAttrStep.run);
  assert.ok(enrichRun.includes('enrich:jobs'), 'Enrich job attributes must run enrich:jobs');
  assert.ok(enrichRun.includes('--budget-min=10'), 'Enrich job attributes must use --budget-min=10');
  assert.ok(enrichRun.includes('MAX_CALLS=300'), 'Enrich job attributes must default MAX_CALLS=300');
  assert.ok(enrichRun.includes('--model-max-calls=$MAX_CALLS'), 'Enrich job attributes must pass --model-max-calls=$MAX_CALLS');
  assert.ok(enrichRun.includes("grep -Eq '^[0-9]+$'"), 'Enrich job attributes must validate GEMINI_MAX_CALLS');
  assert.ok(
    String(enrichAttrStep.env?.GEMINI_MAX_CALLS_VAR).includes('vars.GEMINI_MAX_CALLS'),
    'GEMINI_MAX_CALLS_VAR must come from vars.GEMINI_MAX_CALLS in Enrich job attributes'
  );

  assert.equal(
    String(backfillStep.if),
    'inputs.enrich_backfill == true',
    'Backfill job attributes if condition must be inputs.enrich_backfill == true'
  );
  assert.equal(
    backfillStep['continue-on-error'],
    undefined,
    'Backfill job attributes must not set continue-on-error'
  );
  assert.equal(Number(backfillStep['timeout-minutes']), 140, 'Backfill job attributes timeout-minutes must be 140');

  const backfillRun = String(backfillStep.run);
  assert.ok(backfillRun.includes('--all'), 'Backfill job attributes must pass --all');
  assert.ok(backfillRun.includes("grep -Eq '^[0-9]+$'"), 'Backfill job attributes must validate digits');
  assert.ok(
    !backfillRun.includes('${{ inputs.enrich_budget_min'),
    'Backfill script must never splice inputs.enrich_budget_min directly'
  );
  assert.ok(
    String(backfillStep.env?.ENRICH_BUDGET_INPUT).includes('inputs.enrich_budget_min'),
    'ENRICH_BUDGET_INPUT must come from inputs.enrich_budget_min'
  );
  assert.ok(
    String(backfillStep.env?.GEMINI_MAX_CALLS_VAR).includes('vars.GEMINI_MAX_CALLS'),
    'GEMINI_MAX_CALLS_VAR must come from vars.GEMINI_MAX_CALLS in Backfill job attributes'
  );
});

test('scrape-daily.yml passes Gemini settings only to the job attribute steps', () => {
  const root = getRepoRoot();
  const content = fs.readFileSync(path.join(root, '.github/workflows/scrape-daily.yml'), 'utf-8');
  const parsed = parseYaml(content);

  const geminiSteps = new Set(['Enrich job attributes', 'Backfill job attributes']);
  const foundSteps = new Set();

  for (const [jobId, job] of Object.entries(parsed.jobs || {})) {
    const jobEnvStr = JSON.stringify(job?.env || {});
    assert.ok(!jobEnvStr.includes('GEMINI_API_KEY'), `${jobId} job-level env must not contain GEMINI_API_KEY`);

    for (const step of job?.steps || []) {
      const stepName = String(step?.name || '');
      const envStr = JSON.stringify(step?.env || {});
      const withStr = JSON.stringify(step?.with || {});
      const runStr = String(step?.run || '');

      if (geminiSteps.has(stepName)) {
        foundSteps.add(stepName);
        assert.ok(
          String(step.env?.GEMINI_API_KEY).includes('secrets.GEMINI_API_KEY'),
          `${stepName} must set GEMINI_API_KEY from secrets.GEMINI_API_KEY`
        );
        assert.ok(
          String(step.env?.GEMINI_ENABLED).includes('vars.GEMINI_ENABLED'),
          `${stepName} must set GEMINI_ENABLED from vars.GEMINI_ENABLED`
        );
        assert.ok(
          String(step.env?.GEMINI_MODEL).includes('vars.GEMINI_MODEL'),
          `${stepName} must set GEMINI_MODEL from vars.GEMINI_MODEL`
        );
        assert.ok(
          String(step.env?.GEMINI_MAX_CALLS_VAR).includes('vars.GEMINI_MAX_CALLS'),
          `${stepName} must keep GEMINI_MAX_CALLS_VAR from vars.GEMINI_MAX_CALLS`
        );
        if (stepName === 'Backfill job attributes') {
          assert.ok(
            String(step.env?.ENRICH_BUDGET_INPUT).includes('inputs.enrich_budget_min'),
            `${stepName} must keep ENRICH_BUDGET_INPUT`
          );
        }
        assert.ok(!withStr.includes('GEMINI_API_KEY'), `${stepName} with block must not contain GEMINI_API_KEY`);
        assert.ok(!runStr.includes('GEMINI_API_KEY'), `${stepName} run block must not reference GEMINI_API_KEY directly`);
      } else {
        const combined = `${envStr}\n${withStr}\n${runStr}`;
        assert.ok(
          !combined.includes('GEMINI_API_KEY'),
          `Non-enrichment step "${stepName}" in job "${jobId}" must not mention GEMINI_API_KEY`
        );
      }
    }
  }

  assert.equal(foundSteps.size, geminiSteps.size, 'Both job attribute steps must exist in scrape-daily.yml');
});
