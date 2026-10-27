/**
 * @file API Server Integration Unit Tests
 * @summary Contract and snapshot tests for Express REST API endpoints (/health, /v1/jobs, /v1/jobs/:id, /v1/facets, /v1/companies)
 * @tags API, Express, Endpoints, Contract, Snapshots, Supertest
 */

import request from 'supertest';
import app from '../../src/api/Server';
import { buildSearchWhere } from '../../src/lib/search';
import { mockJob, mockCompany, mockDepartment, mockLocation } from '../../__mocks__/@prisma/client';
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
    it('returns 200 with status degraded when cache is not configured, counts active AND isListed, and caches for 10 minutes', async () => {
      mockJob.count.mockResolvedValue(34035);

      const res1 = await request(app)
        .get('/health')
        .set('X-Forwarded-For', getNextIp());

      expect(res1.status).toBe(200);
      expect(res1.body.status).toBe('degraded');
      expect(res1.body.activeJobs).toBe(34035);
      expect(res1.body.cache.state).toBe('not_configured');
      expect(mockJob.count).toHaveBeenCalledTimes(1);
      expect(mockJob.count).toHaveBeenCalledWith({
        where: { active: true, isListed: true },
      });

      // Second request within cache window makes 0 additional DB calls
      const res2 = await request(app)
        .get('/health')
        .set('X-Forwarded-For', getNextIp());

      expect(res2.status).toBe(200);
      expect(res2.body.activeJobs).toBe(34035);
      expect(mockJob.count).toHaveBeenCalledTimes(1);
      expect(res1.body).toMatchSnapshot({
        time: expect.any(String),
      });
    });

    it('ignores client-supplied X-Forwarded-Uri header', async () => {
      const res = await request(app)
        .get('/health')
        .set('X-Forwarded-Uri', '/v1/jobs')
        .set('X-Forwarded-For', getNextIp());

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('degraded');
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

    it('applies the BF-020 all-words search filter (matching itself is proven in tests/integration/Search.test.ts)', async () => {
      mockJob.findMany.mockResolvedValueOnce([]);
      mockJob.count.mockResolvedValueOnce(0);

      const res = await request(app)
        .get('/v1/jobs?search=Senior%20Engineer')
        .set('X-Forwarded-For', getNextIp());

      expect(res.status).toBe(200);
      expect(mockJob.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([buildSearchWhere(['senior', 'engineer'])]),
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

    it('ignores salaryInterval alone when salaryMin is absent', async () => {
      mockJob.findMany.mockResolvedValueOnce([]);
      mockJob.count.mockResolvedValueOnce(0);

      const res = await request(app)
        .get('/v1/jobs?salaryInterval=1%20YEAR')
        .set('X-Forwarded-For', getNextIp());

      expect(res.status).toBe(200);
      expect(mockJob.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            active: true,
            isListed: true,
          },
        })
      );
    });

    it('applies salaryInterval when salaryMin is a valid number', async () => {
      mockJob.findMany.mockResolvedValueOnce([]);
      mockJob.count.mockResolvedValueOnce(0);

      const res = await request(app)
        .get('/v1/jobs?salaryMin=100000&salaryInterval=1%20YEAR')
        .set('X-Forwarded-For', getNextIp());

      expect(res.status).toBe(200);
      expect(mockJob.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              { salaryMin: { gte: 100000 } },
              { salaryInterval: '1 YEAR' },
            ]),
          }),
        })
      );
    });

    it('findMany args have select with no metadata and orderBy ends with id asc and nulls last', async () => {
      mockJob.findMany.mockResolvedValueOnce([]);
      mockJob.count.mockResolvedValueOnce(0);

      await request(app)
        .get('/v1/jobs')
        .set('X-Forwarded-For', getNextIp());

      expect(mockJob.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.not.objectContaining({ metadata: true, postalAddress: true }),
          orderBy: [
            { publishedAt: { sort: 'desc', nulls: 'last' } },
            { createdAt: 'desc' },
            { id: 'asc' },
          ],
        })
      );
    });

    it('supports sortBy=company and appends id asc tie-breaker', async () => {
      mockJob.findMany.mockResolvedValueOnce([]);
      mockJob.count.mockResolvedValueOnce(0);

      await request(app)
        .get('/v1/jobs?sortBy=company&sortOrder=asc')
        .set('X-Forwarded-For', getNextIp());

      expect(mockJob.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ companySlug: 'asc' }, { id: 'asc' }],
        })
      );
    });

    it('filters jobs by company slug', async () => {
      mockJob.findMany.mockResolvedValueOnce([]);
      mockJob.count.mockResolvedValueOnce(0);

      await request(app)
        .get('/v1/jobs?company=acme-corp')
        .set('X-Forwarded-For', getNextIp());

      expect(mockJob.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companySlug: 'acme-corp',
          }),
        })
      );
    });

    it('combines company filter with search (BF-020)', async () => {
      mockJob.findMany.mockResolvedValueOnce([]);
      mockJob.count.mockResolvedValueOnce(0);

      await request(app)
        .get('/v1/jobs?company=acme-corp&search=software')
        .set('X-Forwarded-For', getNextIp());

      expect(mockJob.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companySlug: 'acme-corp',
            AND: expect.any(Array),
          }),
        })
      );
    });

    it('filters jobs by postedWithin window (1d, 7d, 30d)', async () => {
      mockJob.findMany.mockResolvedValueOnce([]);
      mockJob.count.mockResolvedValueOnce(0);

      await request(app)
        .get('/v1/jobs?postedWithin=7d')
        .set('X-Forwarded-For', getNextIp());

      expect(mockJob.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              expect.objectContaining({
                OR: expect.arrayContaining([
                  expect.objectContaining({ lastUpdatedAt: expect.any(Object) }),
                  expect.objectContaining({ AND: expect.any(Array) }),
                ]),
              }),
            ]),
          }),
        })
      );
    });

    it('ignores unknown postedWithin values', async () => {
      mockJob.findMany.mockResolvedValueOnce([]);
      mockJob.count.mockResolvedValueOnce(0);

      await request(app)
        .get('/v1/jobs?postedWithin=invalid_window')
        .set('X-Forwarded-For', getNextIp());

      expect(mockJob.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({
            AND: expect.arrayContaining([
              expect.objectContaining({
                OR: expect.arrayContaining([
                  expect.objectContaining({ lastUpdatedAt: expect.any(Object) }),
                ]),
              }),
            ]),
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

      const res = await request(app)
        .get(`/v1/jobs/${testJob.id}`)
        .set('X-Forwarded-For', getNextIp());

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(testJob.id);
      expect(res.body.title).toBe(testJob.title);
      expect(res.body.companyName).toBe(testJob.company.name);
      expect(res.body.active).toBe(true);
      expect(res.body.secondaryLocations).toEqual(['New York, US']);
      expect(res.body).toMatchSnapshot();
    });

    it('returns 200 with job details when found by ashbyId fallback', async () => {
      mockJob.findFirst.mockResolvedValueOnce(testJob);

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

    it('returns 404 when job does not exist in database', async () => {
      mockJob.findFirst.mockResolvedValueOnce(null);

      const res = await request(app)
        .get('/v1/jobs/00000000-0000-0000-0000-000000000000')
        .set('X-Forwarded-For', getNextIp());

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Job not found' });
      expect(mockJob.findFirst).toHaveBeenCalledTimes(1);
    });

    it('returns 404 immediately for non-UUID id without calling database', async () => {
      const res = await request(app)
        .get('/v1/jobs/invalid-not-a-uuid')
        .set('X-Forwarded-For', getNextIp());

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Job not found' });
      expect(mockJob.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('GET /v1/facets', () => {
    it('returns 200 with facet groups and matches snapshot', async () => {
      mockJob.groupBy
        .mockResolvedValueOnce([{ workplaceType: 'Remote', _count: { _all: 10 } }])
        .mockResolvedValueOnce([{ employmentType: 'FullTime', _count: { _all: 8 } }])
        .mockResolvedValueOnce([{ country: 'US', _count: { _all: 15 } }]);

      mockDepartment.findMany.mockResolvedValueOnce([
        { name: 'Engineering', _count: { jobs: 25 } },
        { name: 'Design', _count: { jobs: 10 } },
      ]);

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
      expect(res.body.departments).toEqual([
        { value: 'Engineering', count: 25 },
        { value: 'Design', count: 10 },
      ]);
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

    it('sorts companies by job count descending when sort=jobs', async () => {
      mockCompany.findMany.mockResolvedValueOnce([]);
      mockCompany.count.mockResolvedValueOnce(0);

      await request(app)
        .get('/v1/companies?sort=jobs')
        .set('X-Forwarded-For', getNextIp());

      expect(mockCompany.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ jobs: { _count: 'desc' } }, { name: 'asc' }, { slug: 'asc' }],
        })
      );
    });

    it('returns 200 with totalPages=1 when no companies match (O5)', async () => {
      mockCompany.findMany.mockResolvedValueOnce([]);
      mockCompany.count.mockResolvedValueOnce(0);

      const res = await request(app)
        .get('/v1/companies?page=1')
        .set('X-Forwarded-For', getNextIp());

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.total).toBe(0);
      expect(res.body.totalPages).toBe(1);
    });
  });

  describe('GET /v1/companies/:slug', () => {
    it('returns 200 with full company profile when found', async () => {
      mockCompany.findFirst.mockResolvedValueOnce({
        slug: 'acme-corp',
        name: 'Acme Corp',
        logoUrl: 'https://example.com/logo.png',
        status: 'ACTIVE',
      });
      mockJob.count
        .mockResolvedValueOnce(5) // jobCount
        .mockResolvedValueOnce(3); // withSalary
      mockJob.findFirst.mockResolvedValueOnce({
        publishedAt: new Date('2026-03-01T10:00:00.000Z'),
      });
      mockJob.groupBy
        .mockResolvedValueOnce([{ workplaceType: 'Remote', _count: { _all: 3 } }]) // workplaceTypes
        .mockResolvedValueOnce([{ employmentType: 'FullTime', _count: { _all: 5 } }]); // employmentTypes
      mockDepartment.findMany.mockResolvedValueOnce([
        { name: 'Engineering', _count: { jobs: 4 } },
      ]);
      mockLocation.findMany.mockResolvedValueOnce([
        { name: 'San Francisco', _count: { jobs: 3 } },
      ]);

      const res = await request(app)
        .get('/v1/companies/acme-corp')
        .set('X-Forwarded-For', getNextIp());

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        slug: 'acme-corp',
        name: 'Acme Corp',
        logoUrl: 'https://example.com/logo.png',
        jobCount: 5,
        withSalary: 3,
        latestPublishedAt: '2026-03-01T10:00:00.000Z',
        workplaceTypes: [{ value: 'Remote', count: 3 }],
        employmentTypes: [{ value: 'FullTime', count: 5 }],
        departments: [{ value: 'Engineering', count: 4 }],
        locations: [{ value: 'San Francisco', count: 3 }],
      });
    });

    it('returns 404 when company does not exist in database', async () => {
      mockCompany.findFirst.mockResolvedValueOnce(null);

      const res = await request(app)
        .get('/v1/companies/unknown-corp')
        .set('X-Forwarded-For', getNextIp());

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Company not found' });
    });

    it('returns 404 when company is NOT_FOUND status in database', async () => {
      mockCompany.findFirst.mockResolvedValueOnce(null); // findFirst filters by status: 'ACTIVE'

      const res = await request(app)
        .get('/v1/companies/inactive-corp')
        .set('X-Forwarded-For', getNextIp());

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Company not found' });
    });

    it('returns 404 immediately for invalid slug without querying database', async () => {
      const res = await request(app)
        .get('/v1/companies/INVALID_SLUG!')
        .set('X-Forwarded-For', getNextIp());

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Company not found' });
      expect(mockCompany.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('Middleware & Error Handling', () => {
    it('allows more than 10 requests from one IP as in-memory limiter is removed (P2-T08)', async () => {
      const rateLimitedIp = '10.99.99.1';
      mockJob.findMany.mockResolvedValue([]);
      mockJob.count.mockResolvedValue(0);

      for (let i = 0; i < 10; i++) {
        const res = await request(app)
          .get('/v1/jobs')
          .set('X-Forwarded-For', rateLimitedIp);
        expect(res.status).toBe(200);
      }

      // 11th request must succeed without 429 (handled upstream by Vercel WAF)
      const res11 = await request(app)
        .get('/v1/jobs')
        .set('X-Forwarded-For', rateLimitedIp);

      expect(res11.status).toBe(200);
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

    it('returns 404 JSON for unknown /v1/* route (O14)', async () => {
      const res = await request(app)
        .get('/v1/nope')
        .set('X-Forwarded-For', getNextIp());

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Not found' });
    });
  });

  describe('ApiNoStatic: Static Asset Serving Isolation (P0b)', () => {
    it('returns 404 on GET / and 200 on /v1/jobs when dist does not exist', async () => {
      let isolatedApp: any;
      jest.isolateModules(() => {
        mockJob.findMany.mockResolvedValueOnce([]);
        mockJob.count.mockResolvedValueOnce(0);
        isolatedApp = require('../../src/api/Server').default;
      });

      const resRoot = await request(isolatedApp).get('/');
      expect(resRoot.status).toBe(404);

      const resApi = await request(isolatedApp)
        .get('/v1/jobs')
        .set('X-Forwarded-For', getNextIp());
      expect(resApi.status).toBe(200);
    });
  });
});
