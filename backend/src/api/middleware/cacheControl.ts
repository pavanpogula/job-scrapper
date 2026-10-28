/**
 * @file Cache-Control and CDN caching header middleware
 * @summary Applies Cache-Control and Vercel-Cache-Tag headers based on route, status code, and cache status
 * @tags Middleware, Cache, CDN, Vercel
 */

import { Request, Response, NextFunction } from 'express';

/**
 * Cache-Control middleware implementing the CDN and Edge caching matrix (04 §6).
 */
export function cacheControlMiddleware(req: Request, res: Response, next: NextFunction): void {
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);

  const applyCacheHeaders = () => {
    const status = res.statusCode;
    const path = req.path;

    // 4xx, 5xx, 429, /health -> no-store
    if (path === '/health' || status === 429 || (status >= 400 && status !== 404)) {
      res.setHeader('Cache-Control', 'no-store');
      return;
    }

    const isDetailRoute = path.startsWith('/v1/jobs/') && path !== '/v1/jobs';
    if (isDetailRoute) {
      if (status === 200) {
        res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400');
        res.setHeader('Vercel-Cache-Tag', 'jobs-v1');
      } else if (status === 404) {
        res.setHeader('Cache-Control', 'public, s-maxage=300');
      } else {
        res.setHeader('Cache-Control', 'no-store');
      }
      return;
    }

    // 404 on non-detail route -> no-store
    if (status === 404) {
      res.setHeader('Cache-Control', 'no-store');
      return;
    }

    const isListOrMeta =
      path === '/v1/jobs' ||
      path === '/v1/facets' ||
      path === '/v1/companies' ||
      path.startsWith('/v1/companies/') ||
      path === '/v1/meta';

    if (isListOrMeta && status === 200) {
      const cacheHeader = res.getHeader('X-Cache');
      const cacheReason = res.getHeader('X-Cache-Reason');
      // BYPASS normally means a degraded cache (circuit_open, budget_exhausted, no_generation): keep it short so the
      // site recovers quickly. "not_configured" means there is no Redis at all, so BYPASS is the permanent state and
      // the edge cache is the only cache: use the long time.
      if (cacheHeader === 'BYPASS' && cacheReason !== 'not_configured') {
        res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=60, stale-while-revalidate=600');
      } else {
        // Data changes only when a scrape finishes (a few times a day), so the edge may reuse an answer for an hour.
        // Worst case a visitor sees data up to ~2h old (1h fresh + 1h stale-while-revalidate).
        res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=3600, stale-while-revalidate=3600, stale-if-error=86400');
        res.setHeader('Vercel-Cache-Tag', 'jobs-v1');
      }
      return;
    }

    if (status >= 400) {
      res.setHeader('Cache-Control', 'no-store');
    }
  };

  res.json = (body: unknown) => {
    applyCacheHeaders();
    return originalJson(body);
  };

  res.send = (body: unknown) => {
    applyCacheHeaders();
    return originalSend(body);
  };

  next();
}
