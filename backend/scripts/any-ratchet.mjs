/**
 * @file any-ratchet.mjs
 * @summary Ratchet script enforcing non-increasing no-explicit-any counts against .any-baseline.json
 * @tags Ratchet, TypeScript, ESLint, Static Analysis
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');
const baselinePath = path.join(appRoot, '.any-baseline.json');

/**
 * Runs ESLint with no-explicit-any forced to error and parses the JSON results.
 * @returns {Record<string, number>} Map of relative file paths to any-count
 */
function runEslintAnyScan() {
  const targets = ['src/', 'api/', 'tests/', 'scripts/'];
  const cmd = `npx eslint ${targets.join(' ')} --ext .ts --rule "@typescript-eslint/no-explicit-any: error" -f json`;

  let stdout = '';
  try {
    stdout = execSync(cmd, { cwd: appRoot, encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });
  } catch (err) {
    // ESLint exits with code 1 when rules configured as error are triggered
    stdout = err.stdout || '';
  }

  const jsonStart = stdout.indexOf('[');
  const jsonEnd = stdout.lastIndexOf(']');
  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error(`Failed to parse ESLint JSON output: could not find array bounds.\n${stdout.slice(0, 500)}`);
  }

  const results = JSON.parse(stdout.slice(jsonStart, jsonEnd + 1));
  const counts = {};

  for (const item of results) {
    const relFile = path.relative(appRoot, item.filePath).replace(/\\/g, '/');
    const anyCount = (item.messages || []).filter(
      (m) => m.ruleId === '@typescript-eslint/no-explicit-any'
    ).length;
    if (anyCount > 0) {
      counts[relFile] = anyCount;
    }
  }

  return counts;
}

/**
 * Main execution function for the any-ratchet.
 */
function main() {
  const isUpdate = process.argv.includes('--update');
  const currentCounts = runEslintAnyScan();

  const baselineExists = fs.existsSync(baselinePath);
  let baseline = {};
  if (baselineExists) {
    try {
      baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf-8'));
    } catch (e) {
      console.error(`Failed to read baseline from ${baselinePath}:`, e);
      process.exit(1);
    }
  }

  if (isUpdate && !baselineExists) {
    // Initial creation of baseline
    const sorted = Object.keys(currentCounts)
      .sort()
      .reduce((acc, key) => {
        acc[key] = currentCounts[key];
        return acc;
      }, {});
    fs.writeFileSync(baselinePath, JSON.stringify(sorted, null, 2) + '\n', 'utf-8');
    console.log(`✅ Created initial any-baseline with ${Object.keys(sorted).length} files in ${baselinePath}`);
    return;
  }

  const errors = [];
  // Verify that no current file exceeds baseline and no new file has any
  for (const [file, count] of Object.entries(currentCounts)) {
    const baseCount = baseline[file];
    if (baseCount === undefined) {
      errors.push(`New file "${file}" has ${count} 'any' occurrence(s) (baseline: 0). No new 'any' allowed.`);
    } else if (count > baseCount) {
      errors.push(`File "${file}" 'any' count increased: ${count} > ${baseCount}`);
    }
  }

  if (errors.length > 0) {
    console.error('\n❌ Any-ratchet check failed! The following violations were detected:');
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  if (isUpdate) {
    // --update may only lower counts
    const updated = {};
    let drops = 0;
    for (const [file, baseCount] of Object.entries(baseline)) {
      const current = currentCounts[file] || 0;
      const count = Math.min(baseCount, current);
      if (count > 0) {
        updated[file] = count;
      }
      if (count < baseCount) {
        drops += (baseCount - count);
      }
    }

    const sorted = Object.keys(updated)
      .sort()
      .reduce((acc, key) => {
        acc[key] = updated[key];
        return acc;
      }, {});

    fs.writeFileSync(baselinePath, JSON.stringify(sorted, null, 2) + '\n', 'utf-8');
    console.log(`✅ Baseline updated successfully! Lowered ${drops} 'any' occurrence(s). Total files remaining: ${Object.keys(sorted).length}`);
    return;
  }

  // Verification mode passed
  let dropsAvailable = 0;
  let totalCurrentAny = 0;
  for (const [file, baseCount] of Object.entries(baseline)) {
    const current = currentCounts[file] || 0;
    totalCurrentAny += current;
    if (current < baseCount) {
      dropsAvailable += (baseCount - current);
    }
  }

  if (dropsAvailable > 0) {
    console.log(`\n💡 Ratchet notice: ${dropsAvailable} 'any' occurrence(s) eliminated! Run with --update to lock in progress.`);
  }

  console.log(`✅ Any-ratchet passed: 0 increases across ${Object.keys(currentCounts).length} files (${totalCurrentAny} total 'any').`);
}

main();
