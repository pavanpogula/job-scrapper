// @ts-check
/**
 * @file settings-allowlist.test.mjs
 * @summary Guards that Claude allow-lists never auto-approve backend npm scripts that act on the production database (db:clean, scrape, seed, cache:publish, ...).
 * @tags repo-tests, agents, settings, safety
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getRepoRoot } from './_lib.mjs';

const root = getRepoRoot();

/** Scripts that read or write the production database or cache and must always prompt. */
const DANGEROUS = [
  'db:clean',
  'db:backfill-source',
  'db:normalize-countries',
  'scrape',
  'scrape:parallel',
  'scrape:csv',
  'seed',
  'seed:greenhouse',
  'discover',
  'enrich:companies',
  'cache:publish',
  'cache:purge-legacy',
  'source:deactivate',
  'process:cdx',
];

/**
 * Whether a Claude Bash permission rule would match the command (supports a trailing `*` wildcard only).
 * @param {string} rule
 * @param {string} command
 */
function ruleMatches(rule, command) {
  const m = rule.match(/^Bash\((.*)\)$/);
  if (!m) return false;
  const pattern = /** @type {string} */ (m[1]);
  if (pattern.endsWith('*')) return command.startsWith(pattern.slice(0, -1));
  return command === pattern;
}

for (const [file, commandFor] of /** @type {[string, (s: string) => string][]} */ ([
  ['.claude/settings.json', (s) => `npm --prefix backend run ${s}`],
  ['backend/.claude/settings.json', (s) => `npm run ${s}`],
])) {
  test(`${file}: allow-list does not auto-approve production-affecting backend scripts`, () => {
    const settings = JSON.parse(fs.readFileSync(path.join(root, file), 'utf-8'));
    const allow = /** @type {string[]} */ (settings.permissions.allow);
    for (const script of DANGEROUS) {
      const cmd = commandFor(script);
      const hit = allow.find((r) => ruleMatches(r, cmd));
      assert.equal(hit, undefined, `"${cmd}" must prompt but is allowed by ${hit}`);
    }
    assert.ok(allow.some((r) => ruleMatches(r, commandFor('typecheck'))), 'typecheck must stay allowed');
    assert.ok(allow.some((r) => ruleMatches(r, commandFor('lint'))), 'lint must stay allowed');
  });
}
