// @ts-check
/**
 * @file compare-results.mjs
 * @summary Runs capture into results/<phase>/ and asserts metrics match or improve upon baseline.
 * @tags migration, verification, comparison
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { getRepoRoot } from '../repo-tests/_lib.mjs';
import { captureBaseline } from './capture-baseline.mjs';

/**
 * Compares results of a phase against baseline.
 * @param {string} phase
 */
export async function compareResults(phase) {
  const root = getRepoRoot();
  const baselineDir = path.join(root, 'docs/monorepo-migration/baseline');
  const resultsDir = path.join(root, 'docs/monorepo-migration/results', phase);

  if (!fs.existsSync(baselineDir)) {
    console.error(`❌ Baseline directory not found at: ${baselineDir}`);
    console.error('Run capture-baseline.mjs first to create the baseline.');
    process.exit(1);
  }

  // 1. Capture current metrics into results/PN/
  await captureBaseline(resultsDir);

  console.log(`🔍 Comparing results for phase ${phase} against baseline...\n`);

  // Load move-map and moved-tests
  const moveMapPath = path.join(root, 'scripts/migration/move-map.json');
  const movedTestsPath = path.join(root, 'scripts/migration/moved-tests.json');
  const moveMap = fs.existsSync(moveMapPath) ? JSON.parse(fs.readFileSync(moveMapPath, 'utf-8')) : { prefixes: [], deleted: [] };
  const movedTests = fs.existsSync(movedTestsPath) ? JSON.parse(fs.readFileSync(movedTestsPath, 'utf-8')) : [];

  let failed = false;
  /** @type {string[]} */
  const errors = [];

  /**
   * Helper to load JSON safely
   * @param {string} dir
   * @param {string} file
   */
  function loadJson(dir, file) {
    const p = path.join(dir, file);
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf-8')) : null;
  }

  // 2. Compare Jest & Vitest Tests
  const baseJest = loadJson(baselineDir, 'jest-tests.json') || [];
  const currJest = loadJson(resultsDir, 'jest-tests.json') || [];
  const baseVitest = loadJson(baselineDir, 'vitest-tests.json') || [];
  const currVitest = loadJson(resultsDir, 'vitest-tests.json') || [];

  /**
   * Maps a baseline key to current expected key using movedTests
   * @param {string} key
   */
  function mapKey(key) {
    for (const mt of movedTests) {
      if (mt.from === key) {
        return mt.to;
      }
    }
    return key;
  }

  /**
   * @param {string} key
   */
  function isDeleted(key) {
    for (const d of moveMap.deleted || []) {
      if (key.startsWith(d.path) || d.path.startsWith(key)) {
        return true;
      }
    }
    return false;
  }

  // Verify Jest tests
  const currJestMap = new Map(currJest.map((/** @type {any} */ t) => [t.key, t.status]));
  let missingJest = 0;
  for (const b of baseJest) {
    const mapped = mapKey(b.key);
    if (isDeleted(b.key)) continue;
    if (!currJestMap.has(mapped)) {
      errors.push(`Missing Jest test: ${b.key} (mapped: ${mapped})`);
      missingJest++;
      failed = true;
    } else if (currJestMap.get(mapped) !== 'passed' && b.status === 'passed') {
      errors.push(`Test failed: ${mapped} status is ${currJestMap.get(mapped)} (expected passed)`);
      failed = true;
    }
  }

  // Verify Vitest tests
  const currVitestMap = new Map(currVitest.map((/** @type {any} */ t) => [t.key, t.status]));
  let missingVitest = 0;
  for (const b of baseVitest) {
    const mapped = mapKey(b.key);
    if (isDeleted(b.key)) continue;
    if (!currVitestMap.has(mapped)) {
      errors.push(`Missing Vitest test: ${b.key} (mapped: ${mapped})`);
      missingVitest++;
      failed = true;
    } else if (currVitestMap.get(mapped) !== 'passed' && b.status === 'passed') {
      errors.push(`Vitest test failed: ${mapped} status is ${currVitestMap.get(mapped)} (expected passed)`);
      failed = true;
    }
  }

  // 3. Compare tsc errors
  const baseTsc = loadJson(baselineDir, 'tsc.json') || { root: 0, tests: 0 };
  const currTsc = loadJson(resultsDir, 'tsc.json') || { root: 0, tests: 0 };
  if (currTsc.root > baseTsc.root) {
    errors.push(`TypeScript root errors increased: ${currTsc.root} > ${baseTsc.root}`);
    failed = true;
  }
  if (currTsc.tests > baseTsc.tests) {
    errors.push(`TypeScript test errors increased: ${currTsc.tests} > ${baseTsc.tests}`);
    failed = true;
  }

  // 4. Compare lint errors
  const baseLint = loadJson(baselineDir, 'lint.json') || { errors: 0, warnings: 0 };
  const currLint = loadJson(resultsDir, 'lint.json') || { errors: 0, warnings: 0 };
  if (currLint.errors > baseLint.errors) {
    errors.push(`ESLint errors increased: ${currLint.errors} > ${baseLint.errors}`);
    failed = true;
  }

  // 5. Compare any counts
  const baseAny = loadJson(baselineDir, 'any-counts.json') || {};
  const currAny = loadJson(resultsDir, 'any-counts.json') || {};
  for (const [file, count] of Object.entries(currAny)) {
    let mappedBaseFile = file;
    for (const pref of moveMap.prefixes || []) {
      if (file.startsWith(pref.to)) {
        mappedBaseFile = pref.from + file.slice(pref.to.length);
        break;
      }
    }
    const prev = baseAny[mappedBaseFile] || 0;
    if (count > prev) {
      errors.push(`'any' count in ${file} increased: ${count} > ${prev}`);
      failed = true;
    }
  }

  // Summary output
  console.log('--- Comparison Summary ---');
  console.log(`Jest tests:    ${currJest.length} current, ${baseJest.length} baseline (missing: ${missingJest})`);
  console.log(`Vitest tests:  ${currVitest.length} current, ${baseVitest.length} baseline (missing: ${missingVitest})`);
  console.log(`TypeScript:    root=${currTsc.root} (base: ${baseTsc.root}), tests=${currTsc.tests} (base: ${baseTsc.tests})`);
  console.log(`ESLint errors: ${currLint.errors} (base: ${baseLint.errors}), warnings: ${currLint.warnings} (base: ${baseLint.warnings})`);

  if (failed) {
    console.error('\n❌ Verification Failed! Violations found:');
    for (const e of errors) {
      console.error(`  - ${e}`);
    }
    process.exit(1);
  }

  console.log('\n✅ All metrics match or improve upon baseline!\n');
}

// CLI
if (process.argv[1] && process.argv[1].endsWith('compare-results.mjs')) {
  let phase = '';
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--phase=')) {
      phase = arg.split('=')[1];
    } else if (arg === '--phase') {
      const idx = process.argv.indexOf('--phase');
      phase = process.argv[idx + 1];
    }
  }

  if (!phase) {
    console.error('Usage: node scripts/migration/compare-results.mjs --phase <PN>');
    process.exit(1);
  }

  compareResults(phase).catch((err) => {
    console.error('Error in compareResults:', err);
    process.exit(1);
  });
}
