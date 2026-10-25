// @ts-check
/**
 * @file hooks.test.mjs
 * @summary Validates lifecycle hooks, stdin filtering, Codex launch-location safety, Antigravity hooks schema, and nested settings parity.
 * @tags repo-tests, hooks, settings, claude, antigravity, codex
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { getRepoRoot } from './_lib.mjs';

const root = getRepoRoot();

test('post-commit-reminder hook: produces zero output when tool command is not git commit', () => {
  const hookScript = path.join(root, 'scripts/hooks/post-commit-reminder.sh');

  // 1. Claude stdin format with "ls"
  const claudeLs = execFileSync(hookScript, [], {
    input: JSON.stringify({ tool_input: { command: 'ls -la' } }),
    encoding: 'utf-8',
    cwd: root,
  });
  assert.equal(claudeLs, '', 'Claude hook should produce no output for "ls -la"');

  // 2. Antigravity stdin format with "ls"
  const agyLs = execFileSync(hookScript, ['--antigravity'], {
    input: JSON.stringify({
      toolCall: {
        name: 'run_command',
        args: { CommandLine: 'ls' },
      },
    }),
    encoding: 'utf-8',
    cwd: root,
  });
  assert.equal(agyLs, '', 'Antigravity hook should produce no output for "ls"');

  // 3. Unrelated command "npm test"
  const npmTest = execFileSync(hookScript, [], {
    input: JSON.stringify({ tool_input: { command: 'npm test' } }),
    encoding: 'utf-8',
    cwd: root,
  });
  assert.equal(npmTest, '', 'Hook should produce no output for "npm test"');

  // 4. Empty stdin
  const empty = execFileSync(hookScript, [], {
    input: '',
    encoding: 'utf-8',
    cwd: root,
  });
  assert.equal(empty, '', 'Hook should produce no output for empty stdin');
});

test('post-commit-reminder hook: warns when git commit does not touch CHANGELOG.md and is silent when it does', () => {
  const hookScript = path.join(root, 'scripts/hooks/post-commit-reminder.sh');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-test-'));

  try {
    // Set up a temporary git repository
    execFileSync('git', ['init'], { cwd: tempDir, encoding: 'utf-8' });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: tempDir, encoding: 'utf-8' });
    execFileSync('git', ['config', 'user.name', 'Test Committer'], { cwd: tempDir, encoding: 'utf-8' });

    // Commit 1: does NOT touch CHANGELOG.md
    fs.writeFileSync(path.join(tempDir, 'foo.txt'), 'hello', 'utf-8');
    execFileSync('git', ['add', 'foo.txt'], { cwd: tempDir, encoding: 'utf-8' });
    execFileSync('git', ['commit', '-m', 'feat: initial'], { cwd: tempDir, encoding: 'utf-8' });

    // Test Claude format: should output reminder
    const claudeWarn = execFileSync(hookScript, [], {
      input: JSON.stringify({ tool_input: { command: 'git commit -m "feat: initial"' } }),
      encoding: 'utf-8',
      cwd: tempDir,
    });
    assert.ok(claudeWarn.includes('Reminder: every commit should update CHANGELOG.md [Unreleased]'));
    assert.ok(claudeWarn.includes('hookSpecificOutput'));
    assert.ok(claudeWarn.includes('PostToolUse'));

    // Test Antigravity format: should output reminder
    const agyWarn = execFileSync(hookScript, ['--antigravity'], {
      input: JSON.stringify({
        toolCall: {
          name: 'run_command',
          args: { CommandLine: 'git commit -m "feat: initial"' },
        },
      }),
      encoding: 'utf-8',
      cwd: tempDir,
    });
    assert.ok(agyWarn.includes('Reminder: every commit should update CHANGELOG.md [Unreleased]'));
    assert.ok(agyWarn.includes('injectSteps'));

    // Commit 2: DOES touch CHANGELOG.md
    fs.writeFileSync(path.join(tempDir, 'CHANGELOG.md'), '# Changelog\n', 'utf-8');
    execFileSync('git', ['add', 'CHANGELOG.md'], { cwd: tempDir, encoding: 'utf-8' });
    execFileSync('git', ['commit', '-m', 'docs: update changelog'], { cwd: tempDir, encoding: 'utf-8' });

    // Test Claude format: should be silent
    const claudeOk = execFileSync(hookScript, [], {
      input: JSON.stringify({ tool_input: { command: 'git commit -m "docs: update changelog"' } }),
      encoding: 'utf-8',
      cwd: tempDir,
    });
    assert.equal(claudeOk, '', 'Hook should produce no output when commit touches CHANGELOG.md');

    // Test Antigravity format: should be silent
    const agyOk = execFileSync(hookScript, ['--antigravity'], {
      input: JSON.stringify({
        toolCall: {
          name: 'run_command',
          args: { CommandLine: 'git commit -m "docs: update changelog"' },
        },
      }),
      encoding: 'utf-8',
      cwd: tempDir,
    });
    assert.equal(agyOk, '', 'Hook should produce no output when commit touches CHANGELOG.md');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('Codex impeccable hook resolves root correctly from frontend/ as cwd', () => {
  const codexHooksPath = path.join(root, '.codex/hooks.json');
  assert.ok(fs.existsSync(codexHooksPath), '.codex/hooks.json must exist');

  const codexHooks = JSON.parse(fs.readFileSync(codexHooksPath, 'utf-8'));
  const postToolHook = codexHooks.hooks?.PostToolUse?.[0]?.hooks?.[0]?.command;
  assert.ok(postToolHook, 'PostToolUse command hook must be defined in .codex/hooks.json');
  assert.ok(
    postToolHook.includes('$(git rev-parse --show-toplevel'),
    'Codex hook command must use $(git rev-parse --show-toplevel)'
  );

  // Execute the path evaluation portion in frontend/ cwd
  const frontendDir = path.join(root, 'frontend');
  const evaluatedRoot = execFileSync(
    'sh',
    ['-c', 'ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"; echo "$ROOT"'],
    { cwd: frontendDir, encoding: 'utf-8' }
  ).trim();

  assert.equal(evaluatedRoot, root, 'Command run from frontend/ must resolve to repository root');
});

test('.agents/hooks.json conforms to documented Antigravity lifecycle schema', () => {
  const hooksPath = path.join(root, '.agents/hooks.json');
  assert.ok(fs.existsSync(hooksPath), '.agents/hooks.json must exist');

  const content = JSON.parse(fs.readFileSync(hooksPath, 'utf-8'));
  assert.ok(typeof content === 'object' && content !== null);

  const validEvents = new Set([
    'SessionStart',
    'PreToolUse',
    'PostToolUse',
    'PreInvocation',
    'PostInvocation',
    'Stop',
  ]);

  for (const [hookName, hookSpec] of Object.entries(content)) {
    assert.ok(typeof hookName === 'string' && hookName.length > 0, 'Hook name must be non-empty');
    assert.ok(typeof hookSpec === 'object' && hookSpec !== null);

    for (const [event, handlers] of Object.entries(hookSpec)) {
      if (event === 'enabled') {
        assert.ok(typeof handlers === 'boolean');
        continue;
      }

      assert.ok(validEvents.has(event), `Invalid event type "${event}" in hook "${hookName}"`);
      assert.ok(Array.isArray(handlers), `Handlers for event "${event}" must be an array`);

      if (event === 'PreToolUse' || event === 'PostToolUse') {
        // Grouped structure: { matcher, hooks: [ { type, command, timeout } ] }
        for (const group of handlers) {
          assert.ok(typeof group === 'object' && group !== null);
          assert.ok('matcher' in group, `Matcher required in ${event} group`);
          assert.ok(Array.isArray(group.hooks), `hooks array required in ${event} group`);
          for (const handler of group.hooks) {
            assert.ok(typeof handler.command === 'string' && handler.command.length > 0);
          }
        }
      } else {
        // Flat structure: [ { type, command, timeout } ]
        for (const handler of handlers) {
          assert.ok(typeof handler === 'object' && handler !== null);
          assert.ok(typeof handler.command === 'string' && handler.command.length > 0);
        }
      }
    }
  }
});

test('nested .claude/settings.json deny lists match the root settings deny list', () => {
  const rootSettingsPath = path.join(root, '.claude/settings.json');
  const backendSettingsPath = path.join(root, 'backend/.claude/settings.json');
  const frontendSettingsPath = path.join(root, 'frontend/.claude/settings.json');

  assert.ok(fs.existsSync(backendSettingsPath), 'backend/.claude/settings.json must exist');
  assert.ok(fs.existsSync(frontendSettingsPath), 'frontend/.claude/settings.json must exist');

  const rootSettings = JSON.parse(fs.readFileSync(rootSettingsPath, 'utf-8'));
  const backendSettings = JSON.parse(fs.readFileSync(backendSettingsPath, 'utf-8'));
  const frontendSettings = JSON.parse(fs.readFileSync(frontendSettingsPath, 'utf-8'));

  const rootDeny = rootSettings.permissions?.deny || [];
  const backendDeny = backendSettings.permissions?.deny || [];
  const frontendDeny = frontendSettings.permissions?.deny || [];

  assert.ok(rootDeny.length > 0, 'Root deny list must not be empty');
  assert.deepEqual(backendDeny, rootDeny, 'backend deny list must match root deny list');
  assert.deepEqual(frontendDeny, rootDeny, 'frontend deny list must match root deny list');
});

test('nested AGENTS.md and CLAUDE.md adhere to size, import, and launch-location constraints', () => {
  const backendAgentsPath = path.join(root, 'backend/AGENTS.md');
  const frontendAgentsPath = path.join(root, 'frontend/AGENTS.md');
  const backendClaudePath = path.join(root, 'backend/CLAUDE.md');
  const frontendClaudePath = path.join(root, 'frontend/CLAUDE.md');

  assert.ok(fs.existsSync(backendAgentsPath), 'backend/AGENTS.md must exist');
  assert.ok(fs.existsSync(frontendAgentsPath), 'frontend/AGENTS.md must exist');
  assert.ok(fs.existsSync(backendClaudePath), 'backend/CLAUDE.md must exist');
  assert.ok(fs.existsSync(frontendClaudePath), 'frontend/CLAUDE.md must exist');

  // Byte size <= 3 KB (3072 bytes)
  const backendAgentsSize = fs.statSync(backendAgentsPath).size;
  const frontendAgentsSize = fs.statSync(frontendAgentsPath).size;
  assert.ok(backendAgentsSize <= 3072, `backend/AGENTS.md size ${backendAgentsSize} exceeds 3072 bytes`);
  assert.ok(frontendAgentsSize <= 3072, `frontend/AGENTS.md size ${frontendAgentsSize} exceeds 3072 bytes`);

  // Launch location recommendation
  const backendAgentsContent = fs.readFileSync(backendAgentsPath, 'utf-8');
  const frontendAgentsContent = fs.readFileSync(frontendAgentsPath, 'utf-8');
  assert.match(backendAgentsContent, /prefer launching.*repo root/i);
  assert.match(frontendAgentsContent, /prefer launching.*repo root/i);

  // CLAUDE.md <= 10 lines and imports @AGENTS.md
  const backendClaudeContent = fs.readFileSync(backendClaudePath, 'utf-8');
  const frontendClaudeContent = fs.readFileSync(frontendClaudePath, 'utf-8');

  const backendClaudeLines = backendClaudeContent.split('\n');
  const frontendClaudeLines = frontendClaudeContent.split('\n');

  assert.ok(backendClaudeLines.length <= 10, `backend/CLAUDE.md has ${backendClaudeLines.length} lines (max 10)`);
  assert.ok(frontendClaudeLines.length <= 10, `frontend/CLAUDE.md has ${frontendClaudeLines.length} lines (max 10)`);

  assert.ok(backendClaudeContent.includes('@AGENTS.md'), 'backend/CLAUDE.md must import @AGENTS.md');
  assert.ok(frontendClaudeContent.includes('@AGENTS.md'), 'frontend/CLAUDE.md must import @AGENTS.md');
});
