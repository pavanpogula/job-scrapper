// @ts-check
/**
 * @file enrichment-raw-sql.test.mjs
 * @summary Guards that enrichment modules under backend/src/enrichment/ never call Prisma update/upsert on Job and persist only via raw UPDATE FROM unnest (BF-027).
 * @tags repo-tests, enrichment, prisma, sql, safety, BF-027
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getRepoRoot } from './_lib.mjs';

/**
 * Recursively collects all `.ts` files under a directory.
 * @param {string} dir
 * @returns {string[]}
 */
function collectTsFiles(dir) {
  /** @type {string[]} */
  const files = [];
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(full);
    }
  }
  return files;
}

test('enrichment writes Job only through the raw SQL writer', () => {
  const root = getRepoRoot();
  const enrichDir = path.join(root, 'backend/src/enrichment');
  const files = collectTsFiles(enrichDir);
  assert.ok(files.length > 0, 'Expected .ts files under backend/src/enrichment/');

  for (const file of files) {
    const src = fs.readFileSync(file, 'utf-8');
    const rel = path.relative(root, file);
    assert.ok(
      !/\.job\.(update|updateMany|upsert)\s*\(/.test(src),
      `${rel} must never call Prisma job.update/updateMany/upsert (would mutate updatedAt)`
    );
  }

  const writerPath = path.join(enrichDir, 'writer.ts');
  assert.ok(fs.existsSync(writerPath), 'backend/src/enrichment/writer.ts must exist');
  const writerSrc = fs.readFileSync(writerPath, 'utf-8');
  assert.ok(writerSrc.includes('$executeRaw'), 'writer.ts must use prisma.$executeRaw');
  assert.ok(writerSrc.includes('FROM unnest('), 'writer.ts must update rows via FROM unnest(');
});
