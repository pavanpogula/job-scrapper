// @ts-check
/**
 * @file _lib.mjs
 * @summary Common utilities for repo-level tests (root resolution, git file listing, git check-ignore).
 * @tags repo-tests, git, helpers
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * Returns the absolute path to the repository root.
 * @returns {string}
 */
export function getRepoRoot() {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf-8' }).trim();
  return root;
}

/**
 * Returns all tracked files from git ls-files.
 * @param {string} [cwd]
 * @returns {string[]}
 */
export function gitLsFiles(cwd) {
  const root = cwd || getRepoRoot();
  const output = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf-8' });
  return output.trim().split('\n').filter(Boolean);
}

/**
 * Runs git check-ignore on a list of paths and returns the ones that are ignored.
 * @param {string[]} paths
 * @param {string} [cwd]
 * @returns {string[]}
 */
export function gitCheckIgnore(paths, cwd) {
  const root = cwd || getRepoRoot();
  try {
    const output = execFileSync('git', ['check-ignore', '--', ...paths], {
      cwd: root,
      encoding: 'utf-8',
    });
    return output.trim().split('\n').filter(Boolean);
  } catch (err) {
    // git check-ignore exits with code 1 if no paths match
    // @ts-ignore
    if (err && (err.status === 1 || err.code === 1)) {
      // @ts-ignore
      const stdout = err.stdout ? String(err.stdout).trim() : '';
      return stdout ? stdout.split('\n').filter(Boolean) : [];
    }
    throw err;
  }
}
