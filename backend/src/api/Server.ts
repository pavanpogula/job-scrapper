/**
 * @file Backend HTTP API Server for Ashby Job Scraper
 * @summary Serves REST API endpoints for jobs, companies, and facets querying Prisma PostgreSQL
 * @tags API, Server, Express, Jobs, REST
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import {
  queryJobs,
  queryJobDetail,
  computeFacets,
  queryCompanies,
} from './db/queries';
import { readThroughService } from './cache/ReadThrough';
import { canonicalJobsKey, isCacheableView } from '../lib/cache/keys';
import { isValidId } from './contract';
import { cacheControlMiddleware } from './middleware/cacheControl';

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 3001;

app.set('trust proxy', 1);

const DEFAULT_CORS_ORIGINS = ['https://job-scrapper-ui.vercel.app', 'http://localhost:3000'];
const configuredOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
  : DEFAULT_CORS_ORIGINS;

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, or same-origin)
      if (!origin) return callback(null, true);
      if (configuredOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    methods: ['GET', 'HEAD', 'OPTIONS'],
    exposedHeaders: [
      'X-Cache',
      'X-Cache-Reason',
      'X-Cache-Generation',
      'X-Data-Updated-At',
      'Retry-After',
      'X-Request-Id',
    ],
  })
);
app.use(express.json({ limit: '100kb' }));

// Cache-Control & CDN Header Middleware (04 §6)
app.use(cacheControlMiddleware);

// Security Headers Middleware
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https: blob:; connect-src 'self' https:;"
  );
  next();
});

// Request logger for telemetry and debugging
app.use((req, _res, next) => {
  if (req.path !== '/health') {
    console.log(`📡 [API] ${req.method} ${req.originalUrl} (${req.ip || 'local'})`);
  }
  next();
});

// Cached active jobs count for health check (10 min TTL - GAP-API-04)
let cachedHealthActiveJobs: number | null = null;
let lastHealthCheckTime = 0;
const HEALTH_CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * Resets the in-memory health activeJobs fallback cache (for testing).
 */
export function resetHealthCache(): void {
  cachedHealthActiveJobs = null;
  lastHealthCheckTime = 0;
}

// Health check v2 (P2-T07, API-04, CACHE-04; 04 §5)
app.get('/health', async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const cacheInfo = await readThroughService.getHealthInfo();

    let activeJobs: number | null = cacheInfo.activeJobs;
    let status: 'ok' | 'degraded' = 'ok';

    if (cacheInfo.state !== 'ok' || activeJobs === null) {
      status = 'degraded';
      const now = Date.now();
      if (cachedHealthActiveJobs === null || now - lastHealthCheckTime >= HEALTH_CACHE_TTL_MS) {
        cachedHealthActiveJobs = await prisma.job.count({
          where: { active: true, isListed: true },
        });
        lastHealthCheckTime = now;
      }
      activeJobs = cachedHealthActiveJobs;
    }

    let ageHours: number | null = null;
    let fresh = false;
    let stale = false;
    if (cacheInfo.lastScrapeAt) {
      const scrapeMs = new Date(cacheInfo.lastScrapeAt).getTime();
      if (!isNaN(scrapeMs)) {
        ageHours = Number(((Date.now() - scrapeMs) / (3600 * 1000)).toFixed(2));
        fresh = ageHours <= 26;
        stale = ageHours > 36;
      }
    }

    const isDeep = req.query.deep === '1';
    const hasValidToken = Boolean(
      process.env.HEALTH_TOKEN && req.headers['x-health-token'] === process.env.HEALTH_TOKEN
    );

    let dbStatus: { checked: boolean; status?: string; error?: string } = { checked: false };
    if (isDeep && hasValidToken) {
      try {
        await prisma.$queryRaw`SELECT 1`;
        dbStatus = { checked: true, status: 'ok' };
      } catch (err: any) {
        dbStatus = { checked: true, status: 'error', error: err.message };
      }
    }

    const payload = {
      status,
      activeJobs: activeJobs ?? 0,
      version: process.env.VERCEL_GIT_COMMIT_SHA || 'dev',
      time: new Date().toISOString(),
      cache: {
        configured: cacheInfo.configured,
        state: cacheInfo.state,
        generation: cacheInfo.generation,
        builtAt: cacheInfo.builtAt,
        latencyMs: cacheInfo.latencyMs,
        mode: cacheInfo.mode,
      },
      data: {
        lastScrapeAt: cacheInfo.lastScrapeAt,
        ageHours,
        fresh,
        stale,
      },
      db: dbStatus,
    };

    if (isDeep && hasValidToken && dbStatus.status === 'error' && cacheInfo.state !== 'ok') {
      return res.status(503).json(payload);
    }

    return res.status(200).json(payload);
  } catch (err: any) {
    return res.status(500).json({ status: 'error', error: err.message });
  }
});

// GET /v1/jobs - Paginated jobs query
app.get('/v1/jobs', async (req: Request, res: Response) => {
  try {
    const canonKey = canonicalJobsKey(req.query as any);
    const cacheable = isCacheableView(canonKey);
    const page = Math.max(1, Math.min(5000, parseInt(String(req.query.page || '1'), 10) || 1));

    let viewName: string | undefined = undefined;
    if (!canonKey.includes('&') && canonKey.includes('page=')) {
      viewName = 'default';
    } else if (canonKey.includes('&') && canonKey.split('&').length === 2) {
      const parts = canonKey.replace('jobs?', '').split('&');
      const filterPart = parts.find((p) => !p.startsWith('page='));
      if (filterPart) viewName = filterPart;
    }

    const result = await readThroughService.serveView(
      canonKey,
      cacheable,
      res,
      () => queryJobs(prisma, req.query as any),
      { viewName, page }
    );
    res.json(result);
  } catch (err: any) {
    if (err.status === 503) {
      res.setHeader('Retry-After', String(err.retryAfterSeconds || 5));
      return res.status(503).json({
        error: err.message,
        code: err.code || 'UPSTREAM_UNAVAILABLE',
        retryAfterSeconds: err.retryAfterSeconds || 5,
      });
    }
    console.error('Error fetching jobs:', err);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

// GET /v1/jobs/:id - Single job detail
app.get('/v1/jobs/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    if (!isValidId(id)) {
      return res.status(404).json({ error: 'Job not found' });
    }
    const job = await readThroughService.serveDetail(
      id,
      res,
      () => queryJobDetail(prisma, id)
    );
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.json(job);
  } catch (err: any) {
    if (err.status === 503) {
      res.setHeader('Retry-After', String(err.retryAfterSeconds || 5));
      return res.status(503).json({
        error: err.message,
        code: err.code || 'UPSTREAM_UNAVAILABLE',
        retryAfterSeconds: err.retryAfterSeconds || 5,
      });
    }
    console.error('Error fetching job detail:', err);
    res.status(500).json({ error: 'Failed to fetch job detail' });
  }
});

// GET /v1/facets - Aggregate filter facets
app.get('/v1/facets', async (_req: Request, res: Response) => {
  try {
    const facets = await readThroughService.serveView(
      'facets',
      true,
      res,
      () => computeFacets(prisma)
    );
    res.json(facets);
  } catch (err: any) {
    if (err.status === 503) {
      res.setHeader('Retry-After', String(err.retryAfterSeconds || 5));
      return res.status(503).json({
        error: err.message,
        code: err.code || 'UPSTREAM_UNAVAILABLE',
        retryAfterSeconds: err.retryAfterSeconds || 5,
      });
    }
    console.error('Error fetching facets:', err);
    res.status(500).json({ error: 'Failed to fetch facets' });
  }
});

// GET /v1/companies - List active companies
app.get('/v1/companies', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize || '30'), 10) || 30));
    const hasSearch = Boolean(req.query.search);
    const isCacheable = !hasSearch && pageSize === 30;
    const canonKey = `companies?page=${page}`;

    const companies = await readThroughService.serveView(
      canonKey,
      isCacheable,
      res,
      () => queryCompanies(prisma, req.query as any),
      { page }
    );
    res.json(companies);
  } catch (err: any) {
    if (err.status === 503) {
      res.setHeader('Retry-After', String(err.retryAfterSeconds || 5));
      return res.status(503).json({
        error: err.message,
        code: err.code || 'UPSTREAM_UNAVAILABLE',
        retryAfterSeconds: err.retryAfterSeconds || 5,
      });
    }
    console.error('Error fetching companies:', err);
    res.status(500).json({ error: 'Failed to fetch companies' });
  }
});

// GET /v1/meta - Overall metadata
app.get('/v1/meta', async (_req: Request, res: Response) => {
  try {
    const meta = await readThroughService.serveView(
      'meta',
      true,
      res,
      async () => {
        const [activeJobs, hiringCompanies, facets] = await Promise.all([
          prisma.job.count({ where: { active: true, isListed: true } }),
          prisma.company.count({ where: { status: 'ACTIVE', jobs: { some: { active: true, isListed: true } } } }),
          computeFacets(prisma),
        ]);
        return {
          activeJobs,
          hiringCompanies,
          withSalary: facets.hasSalary.yes,
          lastScrapeAt: new Date().toISOString(),
          generation: 'live_db',
        };
      }
    );
    res.json(meta);
  } catch (err: any) {
    if (err.status === 503) {
      res.setHeader('Retry-After', String(err.retryAfterSeconds || 5));
      return res.status(503).json({
        error: err.message,
        code: err.code || 'UPSTREAM_UNAVAILABLE',
        retryAfterSeconds: err.retryAfterSeconds || 5,
      });
    }
    console.error('Error fetching meta:', err);
    res.status(500).json({ error: 'Failed to fetch meta' });
  }
});

// Start server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Ashby Job API server listening on http://localhost:${PORT}`);
  });
}

export default app;
