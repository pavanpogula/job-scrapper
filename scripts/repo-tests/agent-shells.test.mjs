// @ts-check
/**
 * @file agent-shells.test.mjs
 * @summary Parity test validating agent shells, roles, skills symlinks, rules, and file size budgets across Claude Code and Google Antigravity environments.
 * @tags repo-tests, parity, agents, claude, antigravity, rules, skills
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { getRepoRoot } from './_lib.mjs';
import {
  ROLES,
  RULES_CONFIG,
  EXEMPT_FILES,
  parseMarkdown,
  buildExpectedOutputs,
  runSync,
} from '../agents/sync-shells.mjs';

test('every role in roster has canonical role file, claude shell, and antigravity shell', () => {
  const root = getRepoRoot();
  const rosterContent = fs.readFileSync(path.join(root, 'docs/agents/roster.md'), 'utf-8');

  for (const role of ROLES) {
    assert.ok(rosterContent.includes(role), `Roster missing role: ${role}`);

    const roleFilePath = path.join(root, `docs/agents/roles/${role}.md`);
    const claudeShellPath = path.join(root, `.claude/agents/${role}.md`);
    const agyShellPath = path.join(root, `.agents/agents/${role}.md`);

    assert.ok(fs.existsSync(roleFilePath), `Missing role file: ${roleFilePath}`);
    assert.ok(fs.existsSync(claudeShellPath), `Missing claude shell: ${claudeShellPath}`);
    assert.ok(fs.existsSync(agyShellPath), `Missing agy shell: ${agyShellPath}`);
  }
});

test('both shells for each role have identical name and description', () => {
  const root = getRepoRoot();
  for (const role of ROLES) {
    const claudeContent = fs.readFileSync(path.join(root, `.claude/agents/${role}.md`), 'utf-8');
    const agyContent = fs.readFileSync(path.join(root, `.agents/agents/${role}.md`), 'utf-8');

    const claudeFm = parseMarkdown(claudeContent).frontmatter;
    const agyFm = parseMarkdown(agyContent).frontmatter;

    assert.equal(claudeFm.name, role);
    assert.equal(agyFm.name, role);
    assert.ok(claudeFm.description);
    assert.ok(agyFm.description);
    assert.equal(claudeFm.description, agyFm.description);
  }
});

test('sync-shells generator in --check mode verifies all shells and rules match canonical sources byte-for-byte', () => {
  const root = getRepoRoot();
  const syncScript = path.join(root, 'scripts/agents/sync-shells.mjs');

  const output = execFileSync('node', [syncScript, '--check'], {
    cwd: root,
    encoding: 'utf-8',
  });
  assert.ok(output.includes('in sync with canonical sources'));

  const checkResult = runSync(true);
  assert.equal(checkResult.success, true, `Sync check failed: ${checkResult.errors.join(', ')}`);
});

test('every generated shell contains a valid banner naming an existing canonical file and inlines its body', () => {
  const root = getRepoRoot();
  const expected = buildExpectedOutputs();

  for (const [relPath, { canonicalPath }] of expected.entries()) {
    const fullPath = path.join(root, relPath);
    assert.ok(fs.existsSync(fullPath), `Expected file missing: ${relPath}`);

    const diskContent = fs.readFileSync(fullPath, 'utf-8');
    const banner = `<!-- GENERATED from ${canonicalPath} - DO NOT EDIT DIRECTLY -->`;
    assert.ok(
      diskContent.includes(banner),
      `File ${relPath} missing banner: ${banner}`
    );

    const canonicalFull = path.join(root, canonicalPath);
    assert.ok(
      fs.existsSync(canonicalFull),
      `Canonical file referenced in banner does not exist: ${canonicalPath}`
    );

    const canonicalBody = parseMarkdown(fs.readFileSync(canonicalFull, 'utf-8')).body;
    assert.ok(
      diskContent.includes(canonicalBody),
      `File ${relPath} does not inline canonical body from ${canonicalPath}`
    );
  }
});

test('every entry in .claude/skills/ is a symlink resolving into .agents/skills/ and skills-lock.json entries exist', () => {
  const root = getRepoRoot();
  const claudeSkillsDir = path.join(root, '.claude/skills');
  const entries = fs.readdirSync(claudeSkillsDir);

  assert.ok(entries.length > 0);
  for (const entry of entries) {
    const fullPath = path.join(claudeSkillsDir, entry);
    const stat = fs.lstatSync(fullPath);
    assert.ok(stat.isSymbolicLink(), `${entry} should be a symlink`);

    const realPath = fs.realpathSync(fullPath);
    assert.ok(realPath.includes(path.normalize('.agents/skills')));
  }

  // Verify skills-lock.json entries exist under .agents/skills/
  const skillsLockPath = path.join(root, 'skills-lock.json');
  assert.ok(fs.existsSync(skillsLockPath), 'skills-lock.json must exist');
  const skillsLock = JSON.parse(fs.readFileSync(skillsLockPath, 'utf-8'));
  for (const skillName of Object.keys(skillsLock.skills || {})) {
    const targetDir = path.join(root, '.agents/skills', skillName);
    assert.ok(
      fs.existsSync(targetDir),
      `Skill ${skillName} in skills-lock.json must exist in .agents/skills/`
    );
  }
});

test('every .agents/rules/*.md file has a valid trigger, and glob rules specify globs', () => {
  const root = getRepoRoot();
  const rulesDir = path.join(root, '.agents/rules');
  const rules = fs.readdirSync(rulesDir).filter((f) => f.endsWith('.md'));

  assert.ok(rules.length > 0);
  const validTriggers = ['always_on', 'model_decision', 'glob', 'manual'];

  for (const file of rules) {
    const content = fs.readFileSync(path.join(rulesDir, file), 'utf-8');
    const triggerMatch = content.match(/trigger:\s*(\w+)/);
    assert.ok(triggerMatch, `Missing trigger in ${file}`);
    const trigger = triggerMatch[1];
    assert.ok(validTriggers.includes(trigger), `Invalid trigger ${trigger} in ${file}`);

    if (trigger === 'glob') {
      assert.match(content, /globs:/);
    }
  }
});

test('every .claude/rules/*.md file has valid frontmatter and context rule is not generated', () => {
  const root = getRepoRoot();
  const rulesDir = path.join(root, '.claude/rules');
  const rules = fs.readdirSync(rulesDir).filter((f) => f.endsWith('.md'));

  assert.ok(rules.length > 0);
  assert.strictEqual(
    fs.existsSync(path.join(rulesDir, 'context.md')),
    false,
    '.claude/rules/context.md should NOT be generated (imported directly in CLAUDE.md)'
  );

  for (const file of rules) {
    const content = fs.readFileSync(path.join(rulesDir, file), 'utf-8');
    const { frontmatter } = parseMarkdown(content);
    // If rule has paths, paths must be non-empty array
    if (frontmatter.paths) {
      assert.ok(Array.isArray(frontmatter.paths), `paths must be an array in ${file}`);
      assert.ok(frontmatter.paths.length > 0, `paths must not be empty in ${file}`);
    }
  }
});

test('file byte budgets for AGENTS.md and context.md are respected', () => {
  const root = getRepoRoot();
  const agentsSize = fs.statSync(path.join(root, 'AGENTS.md')).size;
  const contextSize = fs.statSync(path.join(root, 'docs/agents/context.md')).size;

  assert.ok(agentsSize <= 6144, `AGENTS.md size ${agentsSize} exceeds 6144`);
  assert.ok(contextSize <= 6144, `context.md size ${contextSize} exceeds 6144`);
  assert.ok(agentsSize + contextSize <= 12288, `Combined size exceeds 12288`);
});

test('CLAUDE.md is <= 40 lines and imports AGENTS.md and context.md', () => {
  const root = getRepoRoot();
  const content = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf-8');
  const lines = content.split('\n');

  assert.ok(lines.length <= 40, `CLAUDE.md line count ${lines.length} exceeds 40`);
  assert.ok(content.includes('@AGENTS.md'));
  assert.ok(content.includes('@docs/agents/context.md'));
});

test('.claude/settings.local.json is gitignored and not tracked', () => {
  const root = getRepoRoot();
  const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf-8');
  assert.ok(gitignore.includes('.claude/settings.local.json'));

  const tracked = execFileSync('git', ['ls-files', '.claude/settings.local.json'], {
    cwd: root,
    encoding: 'utf-8',
  }).trim();
  assert.equal(tracked, '');
});
