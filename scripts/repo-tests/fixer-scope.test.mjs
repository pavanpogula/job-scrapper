// @ts-check
/**
 * @file fixer-scope.test.mjs
 * @summary Unit and integration tests verifying check-fixer-scope.sh enforcement of permitted boundaries (A19, O13).
 * @tags repo-tests, fixer, scope, security, ci
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, execSync } from 'node:child_process';
import { getRepoRoot } from './_lib.mjs';

const root = getRepoRoot();
const scriptPath = path.join(root, 'scripts/ci/check-fixer-scope.sh');

test('check-fixer-scope.sh script exists and is executable', () => {
  assert.ok(fs.existsSync(scriptPath), `Script does not exist at: ${scriptPath}`);
  assert.doesNotThrow(() => {
    fs.accessSync(scriptPath, fs.constants.X_OK);
  });
});

test('script passes on clean worktree without diffs against HEAD', () => {
  const output = execSync(`bash "${scriptPath}" HEAD`, { cwd: root, encoding: 'utf-8' });
  assert.ok(output.includes('No files modified'));
});

/**
 * Creates a temporary git repository for testing scope checks.
 * @returns {{ dir: string; cleanup: () => void; runCheck: (base?: string) => { status: number; output: string } }}
 */
function createTempGitRepo() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fixer-scope-test-')));
  execFileSync('git', ['init', '-b', 'main'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Scope Tester'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'tester@example.com'], { cwd: dir });

  const initialPkg = {
    name: 'test-app',
    version: '1.0.0',
    scripts: {
      test: 'echo test',
    },
    dependencies: {
      lodash: '^4.17.21',
    },
    devDependencies: {
      typescript: '^5.0.0',
    },
    overrides: {},
  };
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(initialPkg, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'README.md'), '# Initial README\n');

  execFileSync('git', ['add', '.'], { cwd: dir });
  execFileSync('git', ['commit', '-m', 'initial commit'], { cwd: dir });

  return {
    dir,
    cleanup: () => {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {}
    },
    runCheck: (base = 'HEAD~1') => {
      try {
        const output = execFileSync('bash', [scriptPath, base], {
          cwd: dir,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        return { status: 0, output };
      } catch (err) {
        // @ts-ignore
        const output = (err.stdout?.toString() || '') + (err.stderr?.toString() || '');
        // @ts-ignore
        return { status: err.status || 1, output };
      }
    },
  };
}

test('fixer-scope: an allowed file passes', () => {
  const repo = createTempGitRepo();
  try {
    fs.mkdirSync(path.join(repo.dir, 'backend/src'), { recursive: true });
    fs.writeFileSync(path.join(repo.dir, 'backend/src/allowed.ts'), 'export const a = 1;\n');
    execFileSync('git', ['add', '.'], { cwd: repo.dir });
    execFileSync('git', ['commit', '-m', 'add allowed file'], { cwd: repo.dir });

    const res = repo.runCheck('HEAD~1');
    assert.equal(res.status, 0, `Expected pass but failed: ${res.output}`);
    assert.ok(res.output.includes('All modified files are within allowed fixer scope'));
  } finally {
    repo.cleanup();
  }
});

test('fixer-scope: a forbidden file fails', () => {
  const repo = createTempGitRepo();
  try {
    fs.mkdirSync(path.join(repo.dir, '.github/workflows'), { recursive: true });
    fs.writeFileSync(path.join(repo.dir, '.github/workflows/exploit.yml'), 'name: Hack\n');
    execFileSync('git', ['add', '.'], { cwd: repo.dir });
    execFileSync('git', ['commit', '-m', 'add forbidden file'], { cwd: repo.dir });

    const res = repo.runCheck('HEAD~1');
    assert.notEqual(res.status, 0, 'Expected failure for .github modification');
    assert.ok(res.output.includes('Forbidden file modified'));
  } finally {
    repo.cleanup();
  }
});

test('fixer-scope: a dependencies version bump fails (A19, O13)', () => {
  const repo = createTempGitRepo();
  try {
    const pkgPath = path.join(repo.dir, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    pkg.dependencies.lodash = '^4.17.22';
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    execFileSync('git', ['add', 'package.json'], { cwd: repo.dir });
    execFileSync('git', ['commit', '-m', 'bump lodash dependency'], { cwd: repo.dir });

    const res = repo.runCheck('HEAD~1');
    assert.notEqual(res.status, 0, 'Expected failure for dependencies bump');
    assert.ok(res.output.includes('package.json dependencies cannot be modified'));
  } finally {
    repo.cleanup();
  }
});

test('fixer-scope: a scripts edit fails (A19, O13)', () => {
  const repo = createTempGitRepo();
  try {
    const pkgPath = path.join(repo.dir, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    pkg.scripts.test = 'echo hacked';
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    execFileSync('git', ['add', 'package.json'], { cwd: repo.dir });
    execFileSync('git', ['commit', '-m', 'modify script'], { cwd: repo.dir });

    const res = repo.runCheck('HEAD~1');
    assert.notEqual(res.status, 0, 'Expected failure for scripts edit');
    assert.ok(res.output.includes('package.json scripts cannot be modified'));
  } finally {
    repo.cleanup();
  }
});

test('fixer-scope: every file fix-from-error-report skill tells fixer to write passes', () => {
  const skillWrittenFiles = [
    'backend/src/lib/AshbyClient.ts',
    'backend/tests/unit/AshbyClient.test.ts',
    'docs/bug-fix-log.md',
    'backend/docs/known-issues.md',
    'backend/docs/testing.md',
    'docs/decisions/ADR-0016-test-decision.md',
    'CHANGELOG.md',
    'docs/runs/run-2026-03-01.md',
    'backend/docs/project-explorer.html',
  ];

  for (const relPath of skillWrittenFiles) {
    const repo = createTempGitRepo();
    try {
      const fullPath = path.join(repo.dir, relPath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, `# Content for ${relPath}\n`);
      execFileSync('git', ['add', '.'], { cwd: repo.dir });
      execFileSync('git', ['commit', '-m', `write ${relPath}`], { cwd: repo.dir });

      const res = repo.runCheck('HEAD~1');
      assert.equal(
        res.status,
        0,
        `Expected file written by fix-from-error-report skill to pass: ${relPath}\nOutput: ${res.output}`
      );
      assert.ok(res.output.includes('All modified files are within allowed fixer scope'));
    } finally {
      repo.cleanup();
    }
  }
});

test('fixer-scope: frontend/docs modification fails', () => {
  const repo = createTempGitRepo();
  try {
    fs.mkdirSync(path.join(repo.dir, 'frontend/docs'), { recursive: true });
    fs.writeFileSync(path.join(repo.dir, 'frontend/docs/known-issues.md'), '# Edit\n');
    execFileSync('git', ['add', '.'], { cwd: repo.dir });
    execFileSync('git', ['commit', '-m', 'edit frontend doc'], { cwd: repo.dir });

    const res = repo.runCheck('HEAD~1');
    assert.notEqual(res.status, 0, 'Expected failure for frontend/docs modification');
    assert.ok(res.output.includes('Forbidden file modified'));
  } finally {
    repo.cleanup();
  }
});
