/**
 * @file Backend HTTP API Server for Ashby Job Scraper
 * @summary Serves REST API endpoints for jobs, companies, and facets querying Prisma PostgreSQL
 * @tags API, Server, Express, Jobs, REST
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { PrismaClient, Prisma } from '@prisma/client';

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

  // Resolve client IP (supporting Cloudflare cf-connecting-ip or standard forwarded)
  const cfIp = req.headers['cf-connecting-ip'];
  const forwarded = req.headers['x-forwarded-for'];
  const ip = (typeof cfIp === 'string' ? cfIp : '') 
    || (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '') 
    || req.ip 
    || req.socket.remoteAddress 
    || 'client';
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

// Health check
app.get('/health', async (_req: Request, res: Response) => {
  try {
    const jobCount = await prisma.job.count({ where: { active: true } });
    res.json({ status: 'ok', activeJobs: jobCount });
  } catch (err: any) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// GET /v1/jobs - Paginated jobs query
app.get('/v1/jobs', async (req: Request, res: Response) => {
  try {
    const {
      search,
      workplaceType,
      employmentType,
      country,
      hasSalary,
      page = '1',
      pageSize = '25',
      sortBy = 'publishedAt',
      sortOrder = 'desc',
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(pageSize as string, 10) || 25));

    const where: Prisma.JobWhereInput = {
      active: true,
      isListed: true,
    };

    if (search && typeof search === 'string' && search.trim()) {
      const q = search.trim().slice(0, 100);
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { companySlug: { contains: q, mode: 'insensitive' } },
        { company: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }

    if (workplaceType && typeof workplaceType === 'string') {
      where.workplaceType = workplaceType;
    }

    if (employmentType && typeof employmentType === 'string') {
      where.employmentType = employmentType;
    }

    if (country && typeof country === 'string') {
      where.country = country;
    }

    if (hasSalary === 'true' || hasSalary === '1') {
      where.OR = [
        { salaryMin: { not: null } },
        { salaryMax: { not: null } },
      ];
    }

    let orderBy: Prisma.JobOrderByWithRelationInput | Prisma.JobOrderByWithRelationInput[] = [
      { publishedAt: 'desc' },
      { createdAt: 'desc' },
    ];

    const order = (sortOrder === 'asc' ? 'asc' : 'desc') as Prisma.SortOrder;
    if (sortBy === 'salary') {
      orderBy = { salaryMin: order };
    } else if (sortBy === 'title') {
      orderBy = { title: order };
    } else if (sortBy === 'publishedAt') {
      orderBy = [{ publishedAt: order }, { createdAt: order }];
    }

    const [total, jobs] = await Promise.all([
      prisma.job.count({ where }),
      prisma.job.findMany({
        where,
        skip: (pageNum - 1) * limit,
        take: limit,
        orderBy,
        include: {
          company: {
            select: {
              slug: true,
              name: true,
              logoUrl: true,
            },
          },
          department: {
            select: { name: true },
          },
          location: {
            select: { name: true },
          },
        },
      }),
    ]);

    const mapped = jobs.map((j) => ({
      id: j.id,
      ashbyId: j.ashbyId,
      title: j.title,
      applyUrl: j.applyUrl,
      companySlug: j.companySlug,
      companyName: j.company?.name || j.companySlug,
      companyLogoUrl: j.company?.logoUrl,
      department: j.department?.name,
      location: j.location?.name,
      country: j.country,
      region: j.region,
      city: j.city,
      isRemote: j.isRemote,
      workplaceType: j.workplaceType,
      employmentType: j.employmentType,
      publishedAt: j.publishedAt?.toISOString(),
      salaryMin: j.salaryMin,
      salaryMax: j.salaryMax,
      salaryCurrency: j.salaryCurrency,
      salaryInterval: j.salaryInterval,
      isListed: j.isListed,
      createdAt: j.createdAt.toISOString(),
      updatedAt: j.updatedAt.toISOString(),
    }));

    const totalPages = Math.max(1, Math.ceil(total / limit));

    res.json({
      data: mapped,
      meta: {
        total,
        page: pageNum,
        pageSize: limit,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
    });
  } catch (err: any) {
    console.error('Error fetching jobs:', err);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

// GET /v1/jobs/:id - Single job detail
app.get('/v1/jobs/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const job = await prisma.job.findFirst({
      where: {
        OR: [{ id }, { ashbyId: id }],
      },
      include: {
        company: true,
        department: true,
        location: true,
      },
    });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const meta = (job.metadata as any) || {};

    const jobCount = await prisma.job.count({
      where: { companySlug: job.companySlug, active: true },
    });

    res.json({
      id: job.id,
      ashbyId: job.ashbyId,
      title: job.title,
      applyUrl: job.applyUrl,
      jobUrl: meta.jobUrl || `https://jobs.ashbyhq.com/${job.companySlug}/${job.ashbyId}`,
      companySlug: job.companySlug,
      companyName: job.company?.name || job.companySlug,
      companyLogoUrl: job.company?.logoUrl,
      department: job.department?.name,
      location: job.location?.name,
      country: job.country,
      region: job.region,
      city: job.city,
      isRemote: job.isRemote,
      workplaceType: job.workplaceType,
      employmentType: job.employmentType,
      publishedAt: job.publishedAt?.toISOString(),
      salaryMin: job.salaryMin,
      salaryMax: job.salaryMax,
      salaryCurrency: job.salaryCurrency,
      salaryInterval: job.salaryInterval,
      isListed: job.isListed,
      team: meta.team,
      descriptionHtml: meta.descriptionHtml,
      descriptionPlain: meta.descriptionPlain,
      postalAddress: job.postalAddress,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
      company: {
        slug: job.company?.slug || job.companySlug,
        name: job.company?.name || job.companySlug,
        logoUrl: job.company?.logoUrl,
        jobCount,
      },
    });
  } catch (err: any) {
    console.error('Error fetching job detail:', err);
    res.status(500).json({ error: 'Failed to fetch job detail' });
  }
});

// GET /v1/companies - List active companies
app.get('/v1/companies', async (req: Request, res: Response) => {
  try {
    const { search, page = '1', pageSize = '30' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(pageSize as string, 10) || 30));

    const where: Prisma.CompanyWhereInput = {
      jobs: { some: { active: true } },
    };

    if (search && typeof search === 'string' && search.trim()) {
      const q = search.trim().slice(0, 100);
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { slug: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [total, companies] = await Promise.all([
      prisma.company.count({ where }),
      prisma.company.findMany({
        where,
        skip: (pageNum - 1) * limit,
        take: limit,
        orderBy: [{ name: 'asc' }],
        include: {
          _count: {
            select: { jobs: { where: { active: true } } },
          },
        },
      }),
    ]);

    const mapped = companies.map((c) => ({
      slug: c.slug,
      name: c.name || c.slug,
      logoUrl: c.logoUrl,
      jobCount: c._count.jobs,
    }));

    res.json({
      data: mapped,
      total,
      page: pageNum,
      pageSize: limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err: any) {
    console.error('Error fetching companies:', err);
    res.status(500).json({ error: 'Failed to fetch companies' });
  }
});

// Serve static UI production build if available
const distPath = path.resolve(__dirname, '../../job-scrapper-ui/dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((req: Request, res: Response, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/v1') && req.path !== '/health') {
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
