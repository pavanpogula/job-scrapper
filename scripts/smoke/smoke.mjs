// @ts-check
/**
 * @file smoke.mjs
 * @summary Production & preview smoke testing script performing read-only GET checks against API and UI endpoints.
 * @tags smoke, verification, vercel
 */

import process from 'node:process';

/**
 * @typedef {Object} SmokeResult
 * @property {string} path
 * @property {number} status
 * @property {boolean} pass
 * @property {string} [error]
 * @property {string | null} [contentType]
 * @property {string | null} [vercelCache]
 * @property {Record<string, string>} [headers]
 */

/**
 * Runs smoke check suite against a base URL.
 * @param {string} baseUrl
 * @param {Object} [options]
 * @param {boolean} [options.backend]
 * @param {string} [options.bypassToken]
 * @param {boolean} [options.silent]
 * @returns {Promise<{ pass: boolean; results: SmokeResult[]; summary: Record<string, any> }>}
 */
export async function runSmoke(baseUrl, options = {}) {
  const normalizedBase = baseUrl.replace(/\/+$/, '');
  const isBackend = !!options.backend;
  const bypassToken = options.bypassToken;
  const silent = !!options.silent;

  /** @type {SmokeResult[]} */
  const results = [];

  const headers = {
    Accept: 'application/json, text/html, */*',
    'User-Agent': 'job-scrapper-smoke-test/1.0',
  };

  if (bypassToken) {
    headers['x-vercel-protection-bypass'] = bypassToken;
  }

  /**
   * Fetches an endpoint and extracts status and safe header names (never bodies per A18).
   * @param {string} relPath
   */
  async function check(relPath) {
    const url = `${normalizedBase}${relPath}`;
    try {
      const res = await fetch(url, { headers });
      const status = res.status;
      const contentType = res.headers.get('content-type');
      const vercelCache = res.headers.get('x-vercel-cache');

      // Record headers safely (key names only or safe non-secret headers)
      /** @type {Record<string, string>} */
      const recordedHeaders = {};
      for (const [k, v] of res.headers.entries()) {
        const lower = k.toLowerCase();
        if (
          [
            'content-type',
            'cache-control',
            'x-frame-options',
            'x-content-type-options',
            'referrer-policy',
            'permissions-policy',
            'x-vercel-cache',
            'content-security-policy',
          ].includes(lower)
        ) {
          recordedHeaders[lower] = v;
        }
      }

      let bodyJson = null;
      if (contentType && contentType.includes('application/json')) {
        try {
          bodyJson = await res.json();
        } catch {
          bodyJson = null;
        }
      } else {
        // Discard body
        await res.text();
      }

      return { status, contentType, vercelCache, recordedHeaders, bodyJson };
    } catch (err) {
      return {
        status: 0,
        contentType: null,
        vercelCache: null,
        recordedHeaders: {},
        bodyJson: null,
        // @ts-ignore
        error: err.message,
      };
    }
  }

  if (!silent) {
    console.log(`\n🚀 Running smoke tests against: ${normalizedBase} (mode: ${isBackend ? 'backend' : 'frontend/full'})\n`);
  }

  // 1. Frontend routes (skip if in backend-only mode)
  if (!isBackend) {
    for (const p of ['/', '/jobs/sample-slug']) {
      const { status, contentType, vercelCache, recordedHeaders, error } = await check(p);
      const isHtml = contentType && contentType.includes('text/html');
      const pass = status === 200 && !!isHtml;
      results.push({
        path: p,
        status,
        contentType,
        vercelCache,
        headers: recordedHeaders,
        pass,
        error: error || (!pass ? `Expected 200 text/html, got ${status} ${contentType}` : undefined),
      });
    }
  }

  // 2. /v1/jobs?pageSize=1
  let firstJobId = null;
  {
    const p = '/v1/jobs?pageSize=1';
    const { status, contentType, vercelCache, recordedHeaders, bodyJson, error } = await check(p);
    const hasData = bodyJson && Array.isArray(bodyJson.data);
    const hasMeta = bodyJson && bodyJson.meta;
    const pass = status === 200 && hasData && hasMeta;
    if (hasData && bodyJson.data.length > 0 && bodyJson.data[0].id) {
      firstJobId = bodyJson.data[0].id;
    }
    results.push({
      path: p,
      status,
      contentType,
      vercelCache,
      headers: recordedHeaders,
      pass: !!pass,
      error: error || (!pass ? `Expected 200 with {data, meta}, got ${status}` : undefined),
    });
  }

  // 3. /v1/jobs/<first id> (if found) or fallback check
  if (firstJobId) {
    const p = `/v1/jobs/${firstJobId}`;
    const { status, contentType, vercelCache, recordedHeaders, error } = await check(p);
    const pass = status === 200;
    results.push({
      path: p,
      status,
      contentType,
      vercelCache,
      headers: recordedHeaders,
      pass,
      error: error || (!pass ? `Expected 200 for job detail, got ${status}` : undefined),
    });
  }

  // 4. /v1/jobs/not-a-uuid
  {
    const p = '/v1/jobs/not-a-uuid';
    const { status, contentType, vercelCache, recordedHeaders, error } = await check(p);
    const pass = status === 404;
    results.push({
      path: p,
      status,
      contentType,
      vercelCache,
      headers: recordedHeaders,
      pass,
      error: error || (!pass ? `Expected 404 for invalid UUID, got ${status}` : undefined),
    });
  }

  // 5. /v1/facets, /v1/companies, /v1/meta
  for (const p of ['/v1/facets', '/v1/companies', '/v1/meta']) {
    const { status, contentType, vercelCache, recordedHeaders, error } = await check(p);
    const pass = status === 200;
    results.push({
      path: p,
      status,
      contentType,
      vercelCache,
      headers: recordedHeaders,
      pass,
      error: error || (!pass ? `Expected 200, got ${status}` : undefined),
    });
  }

  // 6. /health
  {
    const p = '/health';
    const { status, contentType, vercelCache, recordedHeaders, error } = await check(p);
    const cc = recordedHeaders['cache-control'] || '';
    const pass = (status === 200 || status === 503) && cc.includes('no-store');
    results.push({
      path: p,
      status,
      contentType,
      vercelCache,
      headers: recordedHeaders,
      pass,
      error: error || (!pass ? `Expected 200/503 with cache-control: no-store, got status ${status}, cc: ${cc}` : undefined),
    });
  }

  // 7. /v1/nope (404 expected; content type recorded but not asserted until O14)
  {
    const p = '/v1/nope';
    const { status, contentType, vercelCache, recordedHeaders, error } = await check(p);
    const pass = status === 404;
    results.push({
      path: p,
      status,
      contentType,
      vercelCache,
      headers: recordedHeaders,
      pass,
      error: error || (!pass ? `Expected 404 for unknown route, got ${status}` : undefined),
    });
  }

  // 8. Headers security checks on /v1/jobs
  {
    const jobsResult = results.find((r) => r.path === '/v1/jobs?pageSize=1');
    const h = jobsResult?.headers || {};
    const hasXFO = !!h['x-frame-options'];
    const hasNosniff = h['x-content-type-options'] === 'nosniff';
    const hasReferrer = !!h['referrer-policy'];
    const hasPermissions = !!h['permissions-policy'];
    const hasCacheControl = !!h['cache-control'];

    const passHeaders = hasXFO && hasNosniff && hasReferrer && hasPermissions && hasCacheControl;
    results.push({
      path: '[HEADER CHECKS /v1/jobs]',
      status: 200,
      pass: passHeaders,
      headers: h,
      error: passHeaders
        ? undefined
        : `Missing required security headers: ${JSON.stringify({ hasXFO, hasNosniff, hasReferrer, hasPermissions, hasCacheControl })}`,
    });
  }

  const overallPass = results.every((r) => r.pass);

  if (!silent) {
    for (const r of results) {
      const icon = r.pass ? '✅' : '❌';
      const cacheInfo = r.vercelCache ? ` (x-vercel-cache: ${r.vercelCache})` : '';
      console.log(`  ${icon} ${r.path} → ${r.status}${cacheInfo}${r.error ? ` [ERROR: ${r.error}]` : ''}`);
    }
    console.log(`\nOverall Smoke Status: ${overallPass ? 'PASSED ✅' : 'FAILED ❌'}\n`);
  }

  const summary = {
    baseUrl: normalizedBase,
    mode: isBackend ? 'backend' : 'frontend',
    timestamp: new Date().toISOString(),
    overallPass,
    endpoints: results.map((r) => ({
      path: r.path,
      status: r.status,
      pass: r.pass,
      contentType: r.contentType,
      vercelCache: r.vercelCache,
      headers: r.headers ? Object.keys(r.headers) : [],
    })),
  };

  return { pass: overallPass, results, summary };
}

// CLI execution
if (process.argv[1] && process.argv[1].endsWith('smoke.mjs')) {
  const args = process.argv.slice(2);
  let baseUrl = '';
  let backend = false;
  let bypassTokenEnv = '';

  for (const arg of args) {
    if (arg === '--backend') {
      backend = true;
    } else if (arg.startsWith('--bypass-token-env=')) {
      bypassTokenEnv = arg.split('=')[1];
    } else if (!arg.startsWith('-') && !baseUrl) {
      baseUrl = arg;
    }
  }

  if (!baseUrl) {
    console.error('Usage: node scripts/smoke/smoke.mjs <baseUrl> [--backend] [--bypass-token-env=VAR]');
    process.exit(1);
  }

  const bypassToken = bypassTokenEnv ? process.env[bypassTokenEnv] : undefined;

  runSmoke(baseUrl, { backend, bypassToken }).then(({ pass }) => {
    process.exit(pass ? 0 : 1);
  });
}
