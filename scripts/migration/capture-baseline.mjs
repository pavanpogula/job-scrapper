// @ts-check
/**
 * @file capture-baseline.mjs
 * @summary Captures baseline verification metrics (test keys, tsc/lint errors, any counts, strict flags, smoke) into docs/monorepo-migration/baseline/ or a phase directory.
 * @tags migration, baseline, verification
 */

import { execSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { getRepoRoot } from '../repo-tests/_lib.mjs';
import { runSmoke } from '../smoke/smoke.mjs';

/**
 * Runs a command and returns stdout as string, ignoring non-zero exit codes if specified.
 * @param {string} cmd
 * @param {Object} [options]
 * @param {string} [options.cwd]
 * @param {boolean} [options.allowFailure]
 * @returns {string}
 */
function runCmd(cmd, options = {}) {
  try {
    return execSync(cmd, {
      cwd: options.cwd || getRepoRoot(),
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 50 * 1024 * 1024,
    });
  } catch (err) {
    if (options.allowFailure) {
      // @ts-ignore
      return (err.stdout ? String(err.stdout) : '') + (err.stderr ? String(err.stderr) : '');
    }
    throw err;
  }
}

/**
 * Captures all baseline metrics into the target directory.
 * @param {string} targetDir
 */
export async function captureBaseline(targetDir) {
  const root = getRepoRoot();
  const isBackendLayout = fs.existsSync(path.join(root, 'backend/package.json'));
  const uiDirName = fs.existsSync(path.join(root, 'frontend/package.json')) ? 'frontend' : 'job-scrapper-ui';
  const uiPath = path.join(root, uiDirName);
  const backendRoot = isBackendLayout ? path.join(root, 'backend') : root;

  fs.mkdirSync(targetDir, { recursive: true });
  console.log(`📊 Capturing verification baseline into: ${targetDir}`);

  // 1. files.txt
  console.log('  -> Capturing files.txt...');
  const filesList = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf-8' }).trim();
  fs.writeFileSync(path.join(targetDir, 'files.txt'), filesList + '\n', 'utf-8');

  // 2. jest-tests.json
  console.log('  -> Running backend/root Jest tests with --json...');
  const jestRaw = runCmd('npx jest --json', { cwd: backendRoot, allowFailure: true });
  let jestParsed;
  try {
    const jsonStart = jestRaw.indexOf('{');
    jestParsed = JSON.parse(jsonStart >= 0 ? jestRaw.slice(jsonStart) : jestRaw);
  } catch (e) {
    console.error('Failed to parse jest JSON output:', e);
    jestParsed = { testResults: [] };
  }

  /** @type {Array<{ key: string, status: string }>} */
  const jestTests = [];
  if (Array.isArray(jestParsed.testResults)) {
    for (const suite of jestParsed.testResults) {
      const suitePath = suite.name || '';
      // Make path relative to backend root and remove any leading backend/
      let relPath = path.relative(backendRoot, suitePath).replace(/\\/g, '/');
      if (relPath.startsWith('backend/')) {
        relPath = relPath.slice('backend/'.length);
      }
      if (Array.isArray(suite.assertionResults)) {
        for (const test of suite.assertionResults) {
          const key = `${relPath} > ${test.fullName}`;
          jestTests.push({ key, status: test.status });
        }
      }
    }
  }
  // Sort for deterministic snapshot comparison
  jestTests.sort((a, b) => a.key.localeCompare(b.key));
  fs.writeFileSync(path.join(targetDir, 'jest-tests.json'), JSON.stringify(jestTests, null, 2) + '\n', 'utf-8');

  // 3. vitest-tests.json
  console.log('  -> Running Vitest tests with --reporter=json...');
  runCmd('npm run test -- --reporter=json', { cwd: uiPath, allowFailure: true });
  const vitestJsonPath = path.join(uiPath, '.vitest/json/output.json');
  let vitestParsed = { testResults: [] };
  if (fs.existsSync(vitestJsonPath)) {
    try {
      vitestParsed = JSON.parse(fs.readFileSync(vitestJsonPath, 'utf-8'));
    } catch (e) {
      console.error('Failed to parse vitest JSON output:', e);
    }
  }

  /** @type {Array<{ key: string, status: string }>} */
  const vitestTests = [];
  if (Array.isArray(vitestParsed.testResults)) {
    for (const suite of vitestParsed.testResults) {
      const suitePath = suite.name || '';
      const relPath = path.relative(uiPath, suitePath).replace(/\\/g, '/');
      if (Array.isArray(suite.assertionResults)) {
        for (const test of suite.assertionResults) {
          const key = `${relPath} > ${test.fullName}`;
          vitestTests.push({ key, status: test.status });
        }
      }
    }
  }
  vitestTests.sort((a, b) => a.key.localeCompare(b.key));
  fs.writeFileSync(path.join(targetDir, 'vitest-tests.json'), JSON.stringify(vitestTests, null, 2) + '\n', 'utf-8');

  // 4. tsc.json
  console.log('  -> Capturing tsc error counts...');
  const tscRootOut = runCmd('npx tsc --noEmit -p .', { cwd: backendRoot, allowFailure: true });
  const tscTestOut = runCmd('npx tsc --noEmit -p tsconfig.test.json', { cwd: backendRoot, allowFailure: true });
  const countTscErrors = (/** @type {string} */ str) => (str.match(/error TS\d+:/g) || []).length;
  const tscData = {
    root: countTscErrors(tscRootOut),
    tests: countTscErrors(tscTestOut),
  };
  fs.writeFileSync(path.join(targetDir, 'tsc.json'), JSON.stringify(tscData, null, 2) + '\n', 'utf-8');

  // 5. lint.json & 6. any-counts.json
  console.log('  -> Running ESLint with JSON format...');
  const lintCmd = isBackendLayout
    ? 'npx eslint src/ api/ -f json'
    : 'npx eslint src/ api/ -f json';
  const lintRaw = runCmd(lintCmd, { cwd: backendRoot, allowFailure: true });
  let lintParsed = [];
  try {
    const jsonStart = lintRaw.indexOf('[');
    lintParsed = JSON.parse(jsonStart >= 0 ? lintRaw.slice(jsonStart) : lintRaw);
  } catch (e) {
    console.error('Failed to parse ESLint JSON output:', e);
  }

  let totalErrors = 0;
  let totalWarnings = 0;
  /** @type {Record<string, number>} */
  const anyCounts = {};

  if (Array.isArray(lintParsed)) {
    for (const item of lintParsed) {
      totalErrors += item.errorCount || 0;
      totalWarnings += item.warningCount || 0;
      const relFile = path.relative(root, item.filePath).replace(/\\/g, '/');
      const anyInFile = (item.messages || []).filter(
        (/** @type {any} */ m) => m.ruleId === '@typescript-eslint/no-explicit-any'
      ).length;
      if (anyInFile > 0) {
        anyCounts[relFile] = anyInFile;
      }
    }
  }

  fs.writeFileSync(
    path.join(targetDir, 'lint.json'),
    JSON.stringify({ errors: totalErrors, warnings: totalWarnings }, null, 2) + '\n',
    'utf-8'
  );
  fs.writeFileSync(path.join(targetDir, 'any-counts.json'), JSON.stringify(anyCounts, null, 2) + '\n', 'utf-8');

  // 7. strict-flags.json
  console.log('  -> Measuring strict flags error counts...');
  const flags = [
    'noUncheckedIndexedAccess',
    'noImplicitReturns',
    'noImplicitOverride',
    'exactOptionalPropertyTypes',
  ];
  /** @type {Record<string, number>} */
  const strictFlags = {};
  for (const flag of flags) {
    const out = runCmd(`npx tsc --noEmit -p . --${flag}`, { cwd: backendRoot, allowFailure: true });
    strictFlags[flag] = countTscErrors(out);
  }
  fs.writeFileSync(path.join(targetDir, 'strict-flags.json'), JSON.stringify(strictFlags, null, 2) + '\n', 'utf-8');

  // 8. build.json
  console.log('  -> Inspecting frontend build dist...');
  runCmd('npm run build', { cwd: uiPath, allowFailure: true });
  const distPath = path.join(uiPath, 'dist');
  let fileCount = 0;
  /** @type {Record<string, number>} */
  const byExt = {};

  if (fs.existsSync(distPath)) {
    /**
     * @param {string} dir
     */
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.isFile()) {
          fileCount++;
          const ext = path.extname(entry.name) || '(no_ext)';
          byExt[ext] = (byExt[ext] || 0) + 1;
        }
      }
    }
    walk(distPath);
  }

  fs.writeFileSync(
    path.join(targetDir, 'build.json'),
    JSON.stringify({ fileCount, byExt }, null, 2) + '\n',
    'utf-8'
  );

  // 9. prod-smoke.json (never stores bodies per A18)
  console.log('  -> Running smoke test against production URL...');
  try {
    const { summary } = await runSmoke('https://job-scrapper-ui.vercel.app', { silent: true });
    fs.writeFileSync(path.join(targetDir, 'prod-smoke.json'), JSON.stringify(summary, null, 2) + '\n', 'utf-8');
  } catch (err) {
    console.error('Smoke run error (recording failure):', err);
    fs.writeFileSync(
      path.join(targetDir, 'prod-smoke.json'),
      JSON.stringify({ error: String(err), timestamp: new Date().toISOString() }, null, 2) + '\n',
      'utf-8'
    );
  }

  console.log(`✅ Baseline capture complete in: ${targetDir}\n`);
}

// CLI
if (process.argv[1] && process.argv[1].endsWith('capture-baseline.mjs')) {
  const root = getRepoRoot();
  const target = process.argv[2]
    ? path.resolve(root, process.argv[2])
    : path.join(root, 'docs/monorepo-migration/baseline');
  captureBaseline(target).catch((err) => {
    console.error('Fatal error during baseline capture:', err);
    process.exit(1);
  });
}
