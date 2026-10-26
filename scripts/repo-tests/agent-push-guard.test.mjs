// @ts-check
/**
 * @file agent-push-guard.test.mjs
 * @summary Proves scripts/agents/push-branch.sh lets agents publish and fast-forward task branches but never main/master, force, tags, deletes or secrets, and that agent settings allow only that script to push.
 * @tags repo-tests, agents, git, safety
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { getRepoRoot } from './_lib.mjs';

const root = getRepoRoot();
const script = path.join(root, 'scripts/agents/push-branch.sh');

/**
 * @param {string} cwd
 * @param {string[]} args
 */
function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf-8' });
  assert.equal(r.status, 0, `git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout.trim();
}

/**
 * Creates a working repo on `main` (one commit) whose origin is a local bare repo that already has `main`.
 * @returns {{ dir: string, remote: string }}
 */
function makeRepo() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'push-guard-'));
  const remote = path.join(base, 'remote.git');
  const dir = path.join(base, 'work');
  git(base, ['init', '-q', '--bare', '-b', 'main', remote]);
  git(base, ['init', '-q', '-b', 'main', dir]);
  for (const [k, v] of [['user.email', 'test@example.com'], ['user.name', 'Test'], ['commit.gpgsign', 'false']]) {
    git(dir, ['config', /** @type {string} */ (k), /** @type {string} */ (v)]);
  }
  fs.writeFileSync(path.join(dir, 'README.md'), 'hello\n');
  git(dir, ['add', '.']);
  git(dir, ['commit', '-q', '-m', 'init']);
  git(dir, ['remote', 'add', 'origin', remote]);
  git(dir, ['push', '-q', 'origin', 'main']);
  git(dir, ['fetch', '-q', 'origin']);
  return { dir, remote };
}

/**
 * @param {string} dir
 * @param {string} file
 * @param {string} msg
 */
function commit(dir, file, msg) {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  fs.writeFileSync(path.join(dir, file), `${msg}\n`);
  git(dir, ['add', '-f', '-A']);
  git(dir, ['commit', '-q', '-m', msg]);
}

/**
 * Runs the guard with a local bare origin allowed (test-only switch).
 * @param {string} cwd
 * @param {string[]} [args]
 */
function run(cwd, args = []) {
  return spawnSync('bash', [script, ...args], {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, PUSH_GUARD_ALLOW_LOCAL_ORIGIN: '1' },
  });
}

/**
 * @param {string} remote
 * @param {string} branch
 */
function remoteSha(remote, branch) {
  const r = spawnSync('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], { cwd: remote, encoding: 'utf-8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

test('push-branch: publishes a new task branch', () => {
  const { dir, remote } = makeRepo();
  git(dir, ['checkout', '-q', '-b', 'feat/demo']);
  commit(dir, 'a.txt', 'work');
  const r = run(dir);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(remoteSha(remote, 'feat/demo'), git(dir, ['rev-parse', 'HEAD']));
});

test('push-branch: fast-forwards an existing branch, including local:remote updates', () => {
  const { dir, remote } = makeRepo();
  git(dir, ['checkout', '-q', '-b', 'plan/x']);
  commit(dir, 'a.txt', 'one');
  assert.equal(run(dir).status, 0);
  commit(dir, 'a.txt', 'two');
  const r = run(dir);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(remoteSha(remote, 'plan/x'), git(dir, ['rev-parse', 'HEAD']));

  // A review-fix branch pushed onto the existing PR branch (fast-forward).
  git(dir, ['checkout', '-q', '-b', 'review-fix']);
  commit(dir, 'b.txt', 'three');
  const r2 = run(dir, ['review-fix:plan/x']);
  assert.equal(r2.status, 0, r2.stderr);
  assert.equal(remoteSha(remote, 'plan/x'), git(dir, ['rev-parse', 'HEAD']));
});

test('push-branch: a non-fast-forward update is rejected and the remote is unchanged', () => {
  const { dir, remote } = makeRepo();
  git(dir, ['checkout', '-q', '-b', 'plan/x']);
  commit(dir, 'a.txt', 'one');
  assert.equal(run(dir).status, 0);
  const before = remoteSha(remote, 'plan/x');
  git(dir, ['reset', '-q', '--hard', 'main']);
  commit(dir, 'c.txt', 'rewritten');
  const r = run(dir);
  assert.notEqual(r.status, 0, 'rewritten history must not be pushed');
  assert.equal(remoteSha(remote, 'plan/x'), before);
});

test('push-branch: never pushes main or master, in any spelling', () => {
  const { dir, remote } = makeRepo();
  const before = remoteSha(remote, 'main');
  commit(dir, 'a.txt', 'on main');
  assert.equal(run(dir).status, 1, 'current branch main');
  git(dir, ['checkout', '-q', '-b', 'feat/demo']);
  for (const spec of ['main', 'feat/demo:main', 'HEAD:main', 'feat/demo:refs/heads/main', 'feat/demo:master']) {
    const r = run(dir, [spec]);
    assert.notEqual(r.status, 0, `${spec} must be refused`);
  }
  assert.equal(remoteSha(remote, 'main'), before, 'remote main must be untouched');
});

test('push-branch: rejects force, tags, deletes, mirror and extra options', () => {
  const { dir } = makeRepo();
  git(dir, ['checkout', '-q', '-b', 'feat/demo']);
  for (const args of [
    ['--force'],
    ['--force-with-lease'],
    ['-f'],
    ['--tags'],
    ['--delete'],
    ['--mirror'],
    [':feat/demo'],
    ['feat/demo:refs/tags/v1'],
    ['refs/tags/v1'],
    ['a:b:c'],
    ['feat/demo', 'other'],
  ]) {
    const r = run(dir, args);
    assert.notEqual(r.status, 0, `args ${JSON.stringify(args)} must be rejected`);
  }
  git(dir, ['config', 'remote.origin.mirror', 'true']);
  assert.equal(run(dir).status, 1, 'mirror remotes are refused');
});

test('push-branch: refuses detached HEAD and a dirty tree', () => {
  const { dir } = makeRepo();
  git(dir, ['checkout', '-q', '--detach']);
  assert.equal(run(dir).status, 1);
  git(dir, ['checkout', '-q', '-b', 'feat/demo']);
  fs.writeFileSync(path.join(dir, 'README.md'), 'changed\n');
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /uncommitted changes/);
});

test('push-branch: refuses branches that add secret-bearing paths but allows .env.example', () => {
  const { dir } = makeRepo();
  git(dir, ['checkout', '-q', '-b', 'feat/demo']);
  commit(dir, 'backend/.env.example', 'DATABASE_URL=');
  assert.equal(run(dir, ['--dry-run']).status, 0, 'a committed .env.example is fine');
  commit(dir, 'backend/.env', 'DATABASE_URL=secret');
  const r = run(dir, ['--dry-run']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /secret-bearing path/);
});

test('push-branch: requires a github.com origin unless the test-only switch is set', () => {
  const { dir } = makeRepo();
  git(dir, ['checkout', '-q', '-b', 'feat/demo']);
  const r = spawnSync('bash', [script, '--dry-run'], {
    cwd: dir,
    encoding: 'utf-8',
    env: { ...process.env, PUSH_GUARD_ALLOW_LOCAL_ORIGIN: '' },
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /not a github\.com repository/);

  git(dir, ['remote', 'set-url', 'origin', 'https://github.com/octo/demo.git']);
  const ok = spawnSync('bash', [script, '--dry-run'], { cwd: dir, encoding: 'utf-8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /https:\/\/github\.com\/octo\/demo\/compare\/main\.\.\.feat\/demo\?expand=1/);
});

test('agent settings: raw git push and gh stay denied; only the guard script may push', () => {
  for (const [file, expected] of /** @type {[string, string[]][]} */ ([
    ['.claude/settings.json', ['Bash(./scripts/agents/push-branch.sh*)', 'Bash(scripts/agents/push-branch.sh*)']],
    ['backend/.claude/settings.json', ['Bash(../scripts/agents/push-branch.sh*)']],
    ['frontend/.claude/settings.json', ['Bash(../scripts/agents/push-branch.sh*)']],
  ])) {
    const settings = JSON.parse(fs.readFileSync(path.join(root, file), 'utf-8'));
    const { allow = [], deny = [] } = settings.permissions;
    assert.ok(deny.includes('Bash(git push *)'), `${file}: raw git push must stay denied`);
    assert.ok(deny.includes('Bash(gh *)'), `${file}: gh CLI must stay denied`);
    const pushAllows = allow.filter((/** @type {string} */ r) => /push/i.test(r)).sort();
    assert.deepEqual(pushAllows, expected.sort(), `${file}: only the guarded script may be allowed to push`);
  }
});
