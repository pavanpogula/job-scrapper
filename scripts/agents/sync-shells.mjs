// @ts-check
/**
 * @file sync-shells.mjs
 * @summary Generates and validates tool-specific agent shells and rules for Claude Code and Google Antigravity from canonical sources in docs/agents/.
 * @tags generator, agents, rules, claude, antigravity, parity
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../..');

/**
 * Ordered rule definitions with their Antigravity sequential prefix.
 */
export const RULES_CONFIG = [
  { prefix: '00', id: 'context' },
  { prefix: '10', id: 'secrets-and-git' },
  { prefix: '20', id: 'changelog-and-commits' },
  { prefix: '30', id: 'api-contract-sync' },
  { prefix: '40', id: 'ci-and-workflows' },
  { prefix: '50', id: 'scraper-invariants' },
  { prefix: '60', id: 'api-cache' },
  { prefix: '70', id: 'prisma-schema' },
  { prefix: '80', id: 'frontend-invariants' },
  { prefix: '90', id: 'frontend-design' },
];

/**
 * Roles roster in deterministic order.
 */
export const ROLES = [
  'api-cache',
  'docs-release-keeper',
  'frontend',
  'run-reviewer',
  'scraper-architect',
  'scraper-bugfixer',
];

/**
 * Exempt files that are never modified or removed by this generator.
 */
export const EXEMPT_FILES = new Set([
  path.join('.claude', 'agents', 'impeccable-asset-producer.md'),
  path.join('.claude', 'agents', 'impeccable-documenter.md'),
  path.join('.claude', 'agents', 'impeccable-finish-reviewer.md'),
  path.join('.claude', 'agents', 'impeccable-manual-edit-applier.md'),
]);

/**
 * Parses frontmatter and body from markdown content.
 * @param {string} content
 * @returns {{ frontmatter: Record<string, any>; body: string }}
 */
export function parseMarkdown(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content.trim() };
  }

  const rawYaml = match[1];
  const body = match[2].trim();
  /** @type {Record<string, any>} */
  const frontmatter = {};

  const lines = rawYaml.split(/\r?\n/);
  let currentArrayKey = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (currentArrayKey && trimmed.startsWith('-')) {
      const val = trimmed.replace(/^-\s*/, '').trim().replace(/^["']|["']$/g, '');
      frontmatter[currentArrayKey].push(val);
      continue;
    }

    currentArrayKey = '';
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    const val = trimmed.slice(colonIdx + 1).trim();

    if (val === '') {
      currentArrayKey = key;
      frontmatter[key] = [];
    } else if (val.startsWith('[') && val.endsWith(']')) {
      const inside = val.slice(1, -1).trim();
      frontmatter[key] = inside
        ? inside.split(',').map((s) => s.trim().replace(/^["']|["']$/g, ''))
        : [];
    } else if (val === 'true' || val === 'false') {
      frontmatter[key] = val === 'true';
    } else if (/^\d+$/.test(val)) {
      frontmatter[key] = parseInt(val, 10);
    } else {
      frontmatter[key] = val.replace(/^["']|["']$/g, '');
    }
  }

  return { frontmatter, body };
}

/**
 * Builds expected file map: relative path from root -> expected content.
 * @returns {Map<string, { content: string; canonicalPath: string }>}
 */
export function buildExpectedOutputs() {
  /** @type {Map<string, { content: string; canonicalPath: string }>} */
  const outputs = new Map();

  // 1. Roles
  for (const role of ROLES) {
    const canonicalRel = path.join('docs', 'agents', 'roles', `${role}.md`);
    const canonicalFull = path.join(root, canonicalRel);
    if (!fs.existsSync(canonicalFull)) {
      throw new Error(`Canonical role missing: ${canonicalRel}`);
    }

    const { frontmatter, body } = parseMarkdown(fs.readFileSync(canonicalFull, 'utf-8'));
    const isReadOnly = Boolean(frontmatter.read_only);
    const maxTurns = frontmatter.max_turns || 60;
    /** @type {string[]} */
    const skills = Array.isArray(frontmatter.skills) ? frontmatter.skills : [];

    // Claude shell
    const claudeTools = isReadOnly
      ? 'Read, Grep, Glob, Bash'
      : 'Read, Grep, Glob, Edit, Write, Bash';
    const claudeRel = path.join('.claude', 'agents', `${role}.md`);
    const claudeSkillsLine = skills.length > 0 ? `skills: [${skills.join(', ')}]\n` : '';
    const claudeContent = `---
name: ${role}
description: "${frontmatter.description}"
tools: ${claudeTools}
model: inherit
maxTurns: ${maxTurns}
${claudeSkillsLine}---
<!-- GENERATED from ${canonicalRel} - DO NOT EDIT DIRECTLY -->

${body}
`;
    outputs.set(claudeRel, { content: claudeContent, canonicalPath: canonicalRel });

    // Antigravity shell
    const agyTools = isReadOnly
      ? '[view_file, grep_search, run_command]'
      : '[view_file, grep_search, run_command, replace_file_content]';
    const agyRel = path.join('.agents', 'agents', `${role}.md`);
    const agySkillsLine = skills.length > 0 ? `skills: [${skills.join(', ')}]\n` : '';
    const agyContent = `---
name: ${role}
description: "${frontmatter.description}"
tools: ${agyTools}
model: inherit
commandExecutionPolicy: sandbox
${agySkillsLine}---
<!-- GENERATED from ${canonicalRel} - DO NOT EDIT DIRECTLY -->

${body}
`;
    outputs.set(agyRel, { content: agyContent, canonicalPath: canonicalRel });
  }

  // 2. Rules
  for (const { prefix, id } of RULES_CONFIG) {
    const canonicalRel = path.join('docs', 'agents', 'rules', `${id}.md`);
    const canonicalFull = path.join(root, canonicalRel);
    if (!fs.existsSync(canonicalFull)) {
      throw new Error(`Canonical rule missing: ${canonicalRel}`);
    }

    const { frontmatter, body } = parseMarkdown(fs.readFileSync(canonicalFull, 'utf-8'));
    const isAlways = Boolean(frontmatter.always);
    /** @type {string[]} */
    const appliesTo = Array.isArray(frontmatter.applies_to) ? frontmatter.applies_to : [];
    const description = frontmatter.description || '';

    // Claude rule: skip context rule (imported directly in CLAUDE.md)
    if (id !== 'context') {
      const claudeRel = path.join('.claude', 'rules', `${id}.md`);
      let claudeHeader = '';
      if (isAlways) {
        claudeHeader = `---\n# Always-on rule\n---`;
      } else {
        const pathsStr = appliesTo.map((p) => `"${p}"`).join(', ');
        claudeHeader = `---\npaths: [${pathsStr}]\n---`;
      }
      const claudeContent = `${claudeHeader}
<!-- GENERATED from ${canonicalRel} - DO NOT EDIT DIRECTLY -->

${body}
`;
      outputs.set(claudeRel, { content: claudeContent, canonicalPath: canonicalRel });
    }

    // Antigravity rule
    const agyRel = path.join('.agents', 'rules', `${prefix}-${id}.md`);
    let agyHeader = '';
    if (isAlways) {
      agyHeader = `---
trigger: always_on
description: "${description}"
---`;
    } else {
      const globsStr = appliesTo.join(', ');
      agyHeader = `---
trigger: glob
globs: "${globsStr}"
description: "${description}"
---`;
    }
    const agyContent = `${agyHeader}
<!-- GENERATED from ${canonicalRel} - DO NOT EDIT DIRECTLY -->

${body}
`;
    outputs.set(agyRel, { content: agyContent, canonicalPath: canonicalRel });
  }

  return outputs;
}

/**
 * Scans managed directories for unmanaged files.
 * @param {Set<string>} expectedPaths
 * @returns {string[]} List of unmanaged relative paths.
 */
export function findUnmanagedFiles(expectedPaths) {
  /** @type {string[]} */
  const unmanaged = [];

  const dirsToScan = [
    { relDir: path.join('.claude', 'rules'), checkAll: true },
    { relDir: path.join('.agents', 'rules'), checkAll: true },
  ];

  for (const { relDir } of dirsToScan) {
    const fullDir = path.join(root, relDir);
    if (!fs.existsSync(fullDir)) continue;

    for (const file of fs.readdirSync(fullDir)) {
      if (!file.endsWith('.md')) continue;
      const relPath = path.join(relDir, file);
      if (EXEMPT_FILES.has(relPath)) continue;
      if (!expectedPaths.has(relPath)) {
        unmanaged.push(relPath);
      }
    }
  }

  return unmanaged;
}

/**
 * Runs generator or validator.
 * @param {boolean} checkMode
 * @returns {{ success: boolean; errors: string[] }}
 */
export function runSync(checkMode) {
  const expected = buildExpectedOutputs();
  const expectedKeys = new Set(expected.keys());
  const unmanaged = findUnmanagedFiles(expectedKeys);
  /** @type {string[]} */
  const errors = [];

  if (checkMode) {
    // 1. Check all expected files exist and match byte-for-byte
    for (const [relPath, { content, canonicalPath }] of expected.entries()) {
      const fullPath = path.join(root, relPath);
      if (!fs.existsSync(fullPath)) {
        errors.push(`Missing generated file: ${relPath}`);
        continue;
      }

      const diskContent = fs.readFileSync(fullPath, 'utf-8');
      if (diskContent !== content) {
        errors.push(`Content mismatch in: ${relPath}`);
      }

      // Check banner validity
      const bannerExpected = `<!-- GENERATED from ${canonicalPath} - DO NOT EDIT DIRECTLY -->`;
      if (!diskContent.includes(bannerExpected)) {
        errors.push(`Missing or incorrect banner in: ${relPath} (expected: "${bannerExpected}")`);
      }
    }

    // 2. Check no unmanaged files exist
    for (const extra of unmanaged) {
      errors.push(`Unmanaged extra file: ${extra}`);
    }

    return { success: errors.length === 0, errors };
  }

  // Write mode
  for (const [relPath, { content }] of expected.entries()) {
    const fullPath = path.join(root, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf-8');
  }

  for (const extra of unmanaged) {
    const fullPath = path.join(root, extra);
    fs.unlinkSync(fullPath);
  }

  return { success: true, errors: [] };
}

// CLI execution
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const isCheck = process.argv.includes('--check');
  const result = runSync(isCheck);

  if (!result.success) {
    console.error(`❌ sync-shells --check failed with ${result.errors.length} error(s):`);
    for (const err of result.errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  if (isCheck) {
    console.log('✅ All agent shells and rules are in sync with canonical sources.');
  } else {
    console.log('✅ Synchronized all agent shells and rules from canonical sources.');
  }
}
