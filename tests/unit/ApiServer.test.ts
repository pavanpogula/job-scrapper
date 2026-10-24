/**
 * @file API Server Integration Unit Tests
 * @summary Contract and snapshot tests for Express REST API endpoints (/health, /v1/jobs, /v1/jobs/:id, /v1/facets, /v1/companies)
 * @tags API, Express, Endpoints, Contract, Snapshots, Supertest
 */

import request from 'supertest';
import app from '../../src/api/Server';
import { mockJob, mockCompany } from '../../__mocks__/@prisma/client';
import sampleJob from '../fixtures/api/sample-job.json';
import sampleCompany from '../fixtures/api/sample-company.json';

describe('API Server Contract & Snapshot Tests', () => {
  let ipCounter = 1;
  const getNextIp = () => `10.0.1.${ipCounter++}`;

  const testJob = {
    ...sampleJob,
    publishedAt: new Date('2026-03-01T00:00:00.000Z'),
    createdAt: new Date('2026-03-01T00:00:00.000Z'),
    updatedAt: new Date('2026-03-01T00:00:00.000Z'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /health', () => {
    it('returns 200 with status ok and active jobs count', async () => {
      mockJob.count.mockResolvedValueOnce(34035);

      const res = await request(app)
        .get('/health')
        .set('X-Forwarded-For', getNextIp());

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.activeJobs).toBe(34035);
      expect(res.body).toMatchSnapshot();
    });
  });

  describe('GET /v1/jobs', () => {
    it('returns 200 with paginated jobs matching contract snapshot', async () => {
      mockJob.findMany.mockResolvedValueOnce([testJob]);
      mockJob.count.mockResolvedValueOnce(1);

      const res = await request(app)
        .get('/v1/jobs?page=1&pageSize=25')
        .set('X-Forwarded-For', getNextIp());

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.meta).toEqual({
        total: 1,
        page: 1,
        pageSize: 25,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
      });
      expect(res.body).toMatchSnapshot();
    });

    it('applies search filter across title, department, location, company', async () => {
      mockJob.findMany.mockResolvedValueOnce([]);
      mockJob.count.mockResolvedValueOnce(0);

      const res = await request(app)
        .get('/v1/jobs?search=engineer')
        .set('X-Forwarded-For', getNextIp());

      expect(res.status).toBe(200);
      expect(mockJob.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              expect.objectContaining({
                OR: expect.arrayContaining([
                  { title: { contains: 'engineer', mode: 'insensitive' } },
                ]),
              }),
            ]),
          }),
        })
      );
    });

    it('applies workplaceType filter', async () => {
      mockJob.findMany.mockResolvedValueOnce([]);
      mockJob.count.mockResolvedValueOnce(0);

      const res = await request(app)
        .get('/v1/jobs?workplaceType=Remote')
        .set('X-Forwarded-For', getNextIp());

      expect(res.status).toBe(200);
      expect(mockJob.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workplaceType: 'Remote',
          }),
        })
      );
    });

    it('applies employmentType filter', async () => {
      mockJob.findMany.mockResolvedValueOnce([]);
      mockJob.count.mockResolvedValueOnce(0);

      const res = await request(app)
        .get('/v1/jobs?employmentType=FullTime')
        .set('X-Forwarded-For', getNextIp());

      expect(res.status).toBe(200);
      expect(mockJob.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            employmentType: 'FullTime',
          }),
        })
      );
    });

    it('applies country filter', async () => {
      mockJob.findMany.mockResolvedValueOnce([]);
      mockJob.count.mockResolvedValueOnce(0);

      const res = await request(app)
        .get('/v1/jobs?country=US')
        .set('X-Forwarded-For', getNextIp());

      expect(res.status).toBe(200);
      expect(mockJob.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            country: 'US',
          }),
        })
      );
    });

    it('applies hasSalary and salaryInterval filter', async () => {
      mockJob.findMany.mockResolvedValueOnce([]);
      mockJob.count.mockResolvedValueOnce(0);

      const res = await request(app)
        .get('/v1/jobs?hasSalary=true&salaryInterval=1%20YEAR')
        .set('X-Forwarded-For', getNextIp());

      expect(res.status).toBe(200);
      expect(mockJob.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            salaryInterval: '1 YEAR',
          }),
        })
      );
    });

    it('returns valid meta pagination when results are empty', async () => {
      mockJob.findMany.mockResolvedValueOnce([]);
      mockJob.count.mockResolvedValueOnce(0);

      const res = await request(app)
        .get('/v1/jobs?page=1')
        .set('X-Forwarded-For', getNextIp());

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.meta).toEqual({
        total: 0,
        page: 1,
        pageSize: 25,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
      });
    });
  });

  describe('GET /v1/jobs/:id', () => {
    it('returns 200 with job details when found by id and matches snapshot', async () => {
      mockJob.findFirst.mockResolvedValueOnce(testJob);
      mockJob.count.mockResolvedValueOnce(42);

      const res = await request(app)
        .get(`/v1/jobs/${testJob.id}`)
        .set('X-Forwarded-For', getNextIp());

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(testJob.id);
      expect(res.body.title).toBe(testJob.title);
      expect(res.body.companyName).toBe(testJob.company.name);
      expect(res.body).toMatchSnapshot();
    });

    it('returns 200 with job details when found by ashbyId fallback', async () => {
      mockJob.findFirst.mockResolvedValueOnce(testJob);
      mockJob.count.mockResolvedValueOnce(42);

      const res = await request(app)
        .get(`/v1/jobs/${testJob.ashbyId}`)
        .set('X-Forwarded-For', getNextIp());

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(testJob.id);
      expect(mockJob.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [{ id: testJob.ashbyId }, { ashbyId: testJob.ashbyId }],
          },
        })
      );
    });

    it('returns 404 when job does not exist', async () => {
      mockJob.findFirst.mockResolvedValueOnce(null);

      const res = await request(app)
        .get('/v1/jobs/00000000-0000-0000-0000-000000000000')
        .set('X-Forwarded-For', getNextIp());

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Job not found' });
    });
  });

  describe('GET /v1/facets', () => {
    it('returns 200 with facet groups and matches snapshot', async () => {
      mockJob.groupBy
        .mockResolvedValueOnce([{ workplaceType: 'Remote', _count: { _all: 10 } }])
        .mockResolvedValueOnce([{ employmentType: 'FullTime', _count: { _all: 8 } }])
        .mockResolvedValueOnce([{ country: 'US', _count: { _all: 15 } }]);

      mockJob.count
        .mockResolvedValueOnce(12)
        .mockResolvedValueOnce(15);

      const res = await request(app)
        .get('/v1/facets')
        .set('X-Forwarded-For', getNextIp());

      expect(res.status).toBe(200);
      expect(res.body.workplaceTypes).toEqual([{ value: 'Remote', count: 10 }]);
      expect(res.body.employmentTypes).toEqual([{ value: 'FullTime', count: 8 }]);
      expect(res.body.countries).toEqual([{ value: 'US', count: 15 }]);
      expect(res.body.hasSalary).toEqual({ yes: 12, no: 3 });
      expect(res.body).toMatchSnapshot();
    });
  });

  describe('GET /v1/companies', () => {
    it('returns 200 with company list and matches snapshot', async () => {
      mockCompany.findMany.mockResolvedValueOnce([sampleCompany]);
      mockCompany.count.mockResolvedValueOnce(1);

      const res = await request(app)
        .get('/v1/companies?page=1&pageSize=20')
        .set('X-Forwarded-For', getNextIp());

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toEqual({
        slug: 'acme-corp',
        name: 'Acme Corp',
        logoUrl: 'https://logo.com/acme.png',
        jobCount: 42,
      });
      expect(res.body.total).toBe(1);
      expect(res.body.totalPages).toBe(1);
      expect(res.body).toMatchSnapshot();
    });

    it('applies search filter on companies', async () => {
      mockCompany.findMany.mockResolvedValueOnce([]);
      mockCompany.count.mockResolvedValueOnce(0);

      const res = await request(app)
        .get('/v1/companies?search=acme')
        .set('X-Forwarded-For', getNextIp());

      expect(res.status).toBe(200);
      expect(mockCompany.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { name: { contains: 'acme', mode: 'insensitive' } },
              { slug: { contains: 'acme', mode: 'insensitive' } },
            ],
          }),
        })
      );
    });

    it('returns 200 with empty list when no companies match', async () => {
      mockCompany.findMany.mockResolvedValueOnce([]);
      mockCompany.count.mockResolvedValueOnce(0);

      const res = await request(app)
        .get('/v1/companies?page=1')
        .set('X-Forwarded-For', getNextIp());

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.total).toBe(0);
      expect(res.body.totalPages).toBe(0);
    });
  });

  describe('Middleware & Error Handling', () => {
    it('enforces rate limiter and returns 429 when IP exceeds 10 requests', async () => {
      const rateLimitedIp = '10.99.99.1';
      mockJob.findMany.mockResolvedValue([]);
      mockJob.count.mockResolvedValue(0);

      for (let i = 0; i < 10; i++) {
        const res = await request(app)
          .get('/v1/jobs')
          .set('X-Forwarded-For', rateLimitedIp);
        expect(res.status).toBe(200);
      }

      // 11th request must receive 429
      const throttledRes = await request(app)
        .get('/v1/jobs')
        .set('X-Forwarded-For', rateLimitedIp);

      expect(throttledRes.status).toBe(429);
      expect(throttledRes.body.error).toBe('Too Many Requests');
      expect(throttledRes.headers['retry-after']).toBeDefined();
    });

    it('sets standard security headers on responses', async () => {
      mockJob.count.mockResolvedValueOnce(1);

      const res = await request(app)
        .get('/health')
        .set('X-Forwarded-For', getNextIp());

      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['x-xss-protection']).toBe('1; mode=block');
      expect(res.headers['content-security-policy']).toBeDefined();
    });

    it('returns 500 when database query throws an error', async () => {
      mockJob.findMany.mockRejectedValueOnce(new Error('Database connection failed'));

      const res = await request(app)
        .get('/v1/jobs')
        .set('X-Forwarded-For', getNextIp());

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Failed to fetch jobs' });
    });
  });
});
