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

const ROLES = [
  'scraper-architect',
  'run-reviewer',
  'scraper-bugfixer',
  'api-cache',
  'frontend',
  'docs-release-keeper',
];

/**
 * Extracts frontmatter string values from markdown text.
 * @param {string} content
 * @returns {{ name?: string; description?: string; body: string }}
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return { body: content };
  }
  const yaml = match[1];
  const body = match[2];

  const nameMatch = yaml.match(/^name:\s*(.+)$/m);
  const descMatch = yaml.match(/^description:\s*(.+)$/m);

  const name = nameMatch ? nameMatch[1].trim().replace(/^["']|["']$/g, '') : undefined;
  const description = descMatch ? descMatch[1].trim().replace(/^["']|["']$/g, '') : undefined;

  return { name, description, body };
}

test('every role in roster has canonical role file, claude shell, and antigravity shell', () => {
  const root = getRepoRoot();
  const rosterContent = fs.readFileSync(path.join(root, 'documentation/agents/roster.md'), 'utf-8');

  for (const role of ROLES) {
    assert.ok(rosterContent.includes(role), `Roster missing role: ${role}`);

    const roleFilePath = path.join(root, `documentation/agents/roles/${role}.md`);
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

    const claudeFm = parseFrontmatter(claudeContent);
    const agyFm = parseFrontmatter(agyContent);

    assert.equal(claudeFm.name, role);
    assert.equal(agyFm.name, role);
    assert.ok(claudeFm.description);
    assert.ok(agyFm.description);
    assert.equal(claudeFm.description, agyFm.description);
  }
});

test('every shell body references its canonical role file', () => {
  const root = getRepoRoot();
  for (const role of ROLES) {
    const claudeContent = fs.readFileSync(path.join(root, `.claude/agents/${role}.md`), 'utf-8');
    const agyContent = fs.readFileSync(path.join(root, `.agents/agents/${role}.md`), 'utf-8');

    const expectedRef = `documentation/agents/roles/${role}.md`;
    assert.ok(claudeContent.includes(expectedRef));
    assert.ok(agyContent.includes(expectedRef));
  }
});

test('every entry in .claude/skills/ is a symlink resolving into .agents/skills/', () => {
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

test('file byte budgets for AGENTS.md and context.md are respected', () => {
  const root = getRepoRoot();
  const agentsSize = fs.statSync(path.join(root, 'AGENTS.md')).size;
  const contextSize = fs.statSync(path.join(root, 'documentation/agents/context.md')).size;

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
  assert.ok(content.includes('@documentation/agents/context.md'));
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
