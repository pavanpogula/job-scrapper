// @ts-check
/**
 * @file vercel-config.test.mjs
 * @summary Validates vercel.json configuration integrity (rewrites order, headers, functions, output directory) across layouts.
 * @tags repo-tests, vercel, configuration
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getRepoRoot } from './_lib.mjs';

test('every vercel.json file is valid, ordered properly, and matches project structure', () => {
  const root = getRepoRoot();
  const isBackendLayout = fs.existsSync(path.join(root, 'backend/package.json'));

  const vercelFiles = [];
  if (isBackendLayout) {
    if (fs.existsSync(path.join(root, 'backend/vercel.json'))) {
      vercelFiles.push({ file: 'backend/vercel.json', appDir: 'backend' });
    }
    if (fs.existsSync(path.join(root, 'frontend/vercel.json'))) {
      vercelFiles.push({ file: 'frontend/vercel.json', appDir: 'frontend' });
    }
  } else {
    if (fs.existsSync(path.join(root, 'vercel.json'))) {
      vercelFiles.push({ file: 'vercel.json', appDir: '.' });
    }
  }

  assert.ok(vercelFiles.length > 0, 'At least one vercel.json file must be found');

  for (const { file, appDir } of vercelFiles) {
    const fullPath = path.join(root, file);
    assert.ok(fs.existsSync(fullPath), `${file} must exist`);

    const raw = fs.readFileSync(fullPath, 'utf-8');
    /** @type {any} */
    let config;
    try {
      config = JSON.parse(raw);
    } catch (e) {
      assert.fail(`${file} is not valid JSON: ${e}`);
    }

    // 1. Check rewrites order: /v1 and /health must come BEFORE catch-all
    if (Array.isArray(config.rewrites)) {
      let catchAllIdx = -1;
      let v1Idx = -1;
      let healthIdx = -1;

      config.rewrites.forEach((/** @type {any} */ r, /** @type {number} */ i) => {
        if (r.source === '/(.*)' || r.source === '/(.*)?' || r.source === '/:match*') {
          catchAllIdx = i;
        }
        if (r.source.startsWith('/v1')) {
          v1Idx = i;
        }
        if (r.source.startsWith('/health')) {
          healthIdx = i;
        }
      });

      if (catchAllIdx !== -1) {
        if (v1Idx !== -1) {
          assert.ok(v1Idx < catchAllIdx, `${file}: /v1 rewrite must come before catch-all rewrite`);
        }
        if (healthIdx !== -1) {
          assert.ok(healthIdx < catchAllIdx, `${file}: /health rewrite must come before catch-all rewrite`);
        }
      }
    }

    // 2. Check required security headers
    if (Array.isArray(config.headers)) {
      const allHeaders = config.headers.flatMap((/** @type {any} */ h) =>
        Array.isArray(h.headers) ? h.headers.map((/** @type {any} */ x) => x.key?.toLowerCase()) : []
      );

      const required = [
        'x-content-type-options',
        'x-frame-options',
        'referrer-policy',
      ];

      for (const req of required) {
        assert.ok(
          allHeaders.includes(req),
          `${file}: required header '${req}' is missing from vercel.json headers`
        );
      }
    }

    // 3. Check functions keys exist on disk
    if (config.functions && typeof config.functions === 'object') {
      const baseDir = path.join(root, appDir);
      for (const fnKey of Object.keys(config.functions)) {
        const fnPath = path.join(baseDir, fnKey);
        assert.ok(
          fs.existsSync(fnPath),
          `${file}: function file '${fnKey}' does not exist at '${fnPath}'`
        );
      }
    }

    // 4. Check outputDirectory
    if (config.outputDirectory) {
      assert.ok(typeof config.outputDirectory === 'string', `${file}: outputDirectory must be a string`);
      if (config.outputDirectory.endsWith('dist')) {
        assert.ok(
          config.outputDirectory.includes('dist'),
          `${file}: outputDirectory must match vite build.outDir`
        );
      }
    }
  }
});
