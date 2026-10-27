// @ts-check
/**
 * @file sync-fixtures.mjs
 * @summary Synchronizes backend API contract test fixtures to frontend test fixtures byte-for-byte
 * @tags contract, fixtures, sync, P8a
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

const SRC_DIR = path.join(REPO_ROOT, 'backend/tests/fixtures/contract');
const DEST_DIR = path.join(REPO_ROOT, 'frontend/src/test/fixtures/contract');

/**
 * @summary Synchronizes all contract fixtures from backend to frontend
 */
export function syncContractFixtures() {
  if (!fs.existsSync(SRC_DIR)) {
    console.error(`❌ Source fixtures directory does not exist: ${SRC_DIR}`);
    process.exit(1);
  }

  fs.mkdirSync(DEST_DIR, { recursive: true });

  const srcFiles = fs
    .readdirSync(SRC_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();

  if (srcFiles.length === 0) {
    console.error(`❌ No JSON contract fixtures found in ${SRC_DIR}`);
    process.exit(1);
  }

  // Remove stale files in destination
  const destFiles = fs.readdirSync(DEST_DIR).filter((f) => f.endsWith('.json'));
  for (const file of destFiles) {
    if (!srcFiles.includes(file)) {
      fs.unlinkSync(path.join(DEST_DIR, file));
      console.log(`🗑️ Removed stale fixture: ${file}`);
    }
  }

  // Copy all source fixtures byte-for-byte
  for (const file of srcFiles) {
    const srcPath = path.join(SRC_DIR, file);
    const destPath = path.join(DEST_DIR, file);
    const content = fs.readFileSync(srcPath);
    fs.writeFileSync(destPath, content);
  }

  console.log(`✅ Synchronized ${srcFiles.length} contract fixtures to frontend/src/test/fixtures/contract/`);
}

// Execute if invoked directly
if (process.argv[1] === __filename) {
  syncContractFixtures();
}
