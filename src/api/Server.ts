/**
 * @file Backend HTTP API Server for Ashby Job Scraper
 * @summary Serves REST API endpoints for jobs, companies, and facets querying Prisma PostgreSQL
 * @tags API, Server, Express, Jobs, REST
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
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

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 3001;

app.set('trust proxy', 1);

app.use(cors({ origin: true }));
app.use(express.json({ limit: '100kb' }));

// Security Headers Middleware
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https: blob:; connect-src 'self' https:;"
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

// In-Memory Rate Limiter: 10 requests per 1 minute window
interface ClientRateRecord {
  timestamps: number[];
}
const rateLimits = new Map<string, ClientRateRecord>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 10;              // 10 requests per 1 minute

// Periodic cleanup to prevent unbounded memory growth from stale IPs
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimits.entries()) {
    record.timestamps = record.timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (record.timestamps.length === 0) {
      rateLimits.delete(ip);
    }
  }
}, 5 * 60 * 1000).unref();

const rateLimiterMiddleware = (req: Request, res: Response, next: any) => {
  // Allow health check to pass without rate limiting
  if (req.path === '/health') return next();

  // Express trust proxy parses client IP securely
  const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
  const now = Date.now();

  let record = rateLimits.get(ip);
  if (!record) {
    record = { timestamps: [] };
    rateLimits.set(ip, record);
  }

  // Filter out timestamps older than the 1-minute window
  record.timestamps = record.timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

  if (record.timestamps.length >= RATE_LIMIT_MAX) {
    const oldest = record.timestamps[0];
    const retryAfter = Math.max(1, Math.ceil((oldest + RATE_LIMIT_WINDOW_MS - now) / 1000));
    res.setHeader('Retry-After', retryAfter);
    return res.status(429).json({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded: maximum 10 requests per 1 minute allowed.',
      retryAfterSeconds: retryAfter,
    });
  }

  record.timestamps.push(now);
  res.setHeader('X-RateLimit-Limit', RATE_LIMIT_MAX);
  res.setHeader('X-RateLimit-Remaining', RATE_LIMIT_MAX - record.timestamps.length);
  next();
};

app.use(rateLimiterMiddleware);

// Cached active jobs count for health check (10 min TTL - GAP-API-04)
let cachedHealthActiveJobs: number | null = null;
let lastHealthCheckTime = 0;
const HEALTH_CACHE_TTL_MS = 10 * 60 * 1000;

// Health check
app.get('/health', async (_req: Request, res: Response) => {
  try {
    const now = Date.now();
    if (cachedHealthActiveJobs === null || now - lastHealthCheckTime >= HEALTH_CACHE_TTL_MS) {
      cachedHealthActiveJobs = await prisma.job.count({
        where: { active: true, isListed: true },
      });
      lastHealthCheckTime = now;
    }
    res.json({ status: 'ok', activeJobs: cachedHealthActiveJobs });
  } catch (err: any) {
    res.status(500).json({ status: 'error', error: err.message });
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
          prisma.company.count({ where: { status: 'ACTIVE', jobs: { some: { active: true } } } }),
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

// Serve static UI production build if available
const distPath = path.resolve(__dirname, '../../job-scrapper-ui/dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((req: Request, res: Response, next) => {
    if ((req.method === 'GET' || req.method === 'HEAD') && !req.path.startsWith('/v1') && req.path !== '/health' && req.accepts('html')) {
      return res.sendFile(path.join(distPath, 'index.html'));
    }
    next();
  });
}

// Start server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Ashby Job API server listening on http://localhost:${PORT}`);
  });
}

export default app;
