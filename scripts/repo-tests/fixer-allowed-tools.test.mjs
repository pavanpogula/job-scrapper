// @ts-check
/**
 * @file fixer-allowed-tools.test.mjs
 * @summary Asserts that fixer workflow --allowedTools match real npm scripts and cover fix-from-error-report skill (P3a).
 * @tags repo-tests, fixer, allowed-tools, verification
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getRepoRoot } from './_lib.mjs';

const root = getRepoRoot();

test('fixer-allowed-tools: every Bash tool in --allowedTools maps to an existing npm script or valid git command', () => {
  const workflowPath = path.join(root, '.github/workflows/scrape-daily.yml');
  const workflowContent = fs.readFileSync(workflowPath, 'utf-8');

  const match = workflowContent.match(/--allowedTools\s+"([^"]+)"/);
  assert.ok(match, 'Could not find --allowedTools in scrape-daily.yml');

  const toolsStr = match[1];
  const tools = toolsStr.split(',').map((t) => t.trim());

  const backendPkg = JSON.parse(fs.readFileSync(path.join(root, 'backend/package.json'), 'utf-8'));
  const frontendPkg = JSON.parse(fs.readFileSync(path.join(root, 'frontend/package.json'), 'utf-8'));

  const bashTools = tools.filter((t) => t.startsWith('Bash(') && t.endsWith(')'));
  assert.ok(bashTools.length > 0, 'No Bash tools found in --allowedTools');

  for (const bashTool of bashTools) {
    const cmd = bashTool.slice('Bash('.length, -1).trim();
    if (cmd.startsWith('git ')) {
      // Valid git command prefix
      continue;
    }

    if (cmd.startsWith('npm --prefix backend run ')) {
      const scriptName = cmd.replace('npm --prefix backend run ', '').trim();
      assert.ok(
        backendPkg.scripts && backendPkg.scripts[scriptName],
        `Script "${scriptName}" from tool "${bashTool}" not found in backend/package.json`
      );
    } else if (cmd === 'npm --prefix backend test' || cmd.startsWith('npm --prefix backend test ')) {
      assert.ok(
        backendPkg.scripts && backendPkg.scripts.test,
        `Script "test" from tool "${bashTool}" not found in backend/package.json`
      );
    } else if (cmd.startsWith('npm --prefix frontend run ')) {
      const scriptName = cmd.replace('npm --prefix frontend run ', '').trim();
      assert.ok(
        frontendPkg.scripts && frontendPkg.scripts[scriptName],
        `Script "${scriptName}" from tool "${bashTool}" not found in frontend/package.json`
      );
    } else {
      assert.fail(`Unrecognized Bash command pattern in --allowedTools: ${cmd}`);
    }
  }
});

test('fixer-allowed-tools: every command in fix-from-error-report/SKILL.md is on the allow-list', () => {
  const workflowPath = path.join(root, '.github/workflows/scrape-daily.yml');
  const workflowContent = fs.readFileSync(workflowPath, 'utf-8');
  const match = workflowContent.match(/--allowedTools\s+"([^"]+)"/);
  assert.ok(match, 'Could not find --allowedTools in scrape-daily.yml');
  const toolsStr = match[1];
  const tools = toolsStr.split(',').map((t) => t.trim());
  const bashCommands = tools
    .filter((t) => t.startsWith('Bash(') && t.endsWith(')'))
    .map((t) => t.slice('Bash('.length, -1).trim());

  const skillPath = path.join(root, '.agents/skills/fix-from-error-report/SKILL.md');
  const skillContent = fs.readFileSync(skillPath, 'utf-8');

  // Find all inline code blocks in steps 6 & 7 of the skill
  const codeMatches = [...skillContent.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  const npmCommands = codeMatches.filter((c) => c.startsWith('npm ') || c.startsWith('npm --prefix'));

  assert.ok(npmCommands.length > 0, 'No npm commands found in fix-from-error-report/SKILL.md');

  for (const compoundCmd of npmCommands) {
    // Split compound && commands
    const subCmds = compoundCmd.split('&&').map((c) => c.trim());
    for (const subCmd of subCmds) {
      const isAllowed = bashCommands.some((allowed) => {
        if (allowed.endsWith('*')) {
          const prefix = allowed.slice(0, -1);
          return subCmd.startsWith(prefix);
        }
        return allowed === subCmd;
      });

      assert.ok(
        isAllowed,
        `Command "${subCmd}" in fix-from-error-report/SKILL.md is not permitted by --allowedTools: ${toolsStr}`
      );
    }
  }
});
