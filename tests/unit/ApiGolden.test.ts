/**
 * @file ApiGolden.test.ts
 * @summary Golden API snapshot tests for Express REST endpoints (/v1/* and /health) across MISS (stateful Prisma) and HIT (FakeRedis) cache states.
 * @tags golden, snapshots, api, contract, parity
 */

import request from 'supertest';
import app, { resetHealthCache } from '../../src/api/Server';
import { readThroughService } from '../../src/api/cache/ReadThrough';
import { mockCompany, mockJob, mockDepartment, mockLocation } from '../../__mocks__/@prisma/client';
import { createStatefulPrisma } from '../helpers/prismaFactory';
import { FakeRedis } from '../helpers/fakeRedis';
import { publishCacheGeneration } from '../../src/cache/Publisher';

const FIXED_DATE = new Date('2026-03-01T12:00:00.000Z');

function createSampleJob(n: number) {
  const published = new Date(Date.UTC(2026, 1, 15, 10, n));
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    ashbyId: `ashby-job-${n}`,
    title: n % 2 === 1 ? `Senior Software Engineer ${n}` : `Product Manager ${n}`,
    companySlug: n % 2 === 1 ? 'acme-corp' : 'beta-inc',
    departmentId: n % 2 === 1 ? 'dept-eng' : 'dept-prod',
    locationId: n % 3 === 0 ? 'loc-ny' : 'loc-sf',
    employmentType: 'FullTime',
    workplaceType: n % 2 === 1 ? 'Remote' : 'OnSite',
    isRemote: n % 2 === 1,
    country: n % 2 === 1 ? 'US' : 'CA',
    region: 'CA',
    city: n % 2 === 1 ? 'San Francisco' : 'Toronto',
    postalAddress: null,
    salaryMin: n * 50000,
    salaryMax: n * 60000,
    salaryCurrency: 'USD',
    salaryInterval: '1 YEAR',
    compensationTierSummary: `$${n * 50}k - $${n * 60}k`,
    descriptionHtml: `<p>Job description for role ${n}</p>`,
    applyUrl: `https://jobs.ashbyhq.com/example/job-${n}`,
    contentHash: `hash-${n}`,
    active: true,
    isListed: true,
    publishedAt: published,
    createdAt: published,
    updatedAt: published,
    department: { id: n % 2 === 1 ? 'dept-eng' : 'dept-prod', name: n % 2 === 1 ? 'Engineering' : 'Product' },
    location: { id: n % 3 === 0 ? 'loc-ny' : 'loc-sf', name: n % 3 === 0 ? 'New York' : 'San Francisco' },
    company: {
      id: n % 2 === 1 ? 'comp-acme' : 'comp-beta',
      slug: n % 2 === 1 ? 'acme-corp' : 'beta-inc',
      name: n % 2 === 1 ? 'Acme Corp' : 'Beta Inc',
      logoUrl: null,
    },
  };
}

describe('ApiGolden Snapshot Tests (P0b)', () => {
  let statefulPrisma: any;
  let fakeRedis: FakeRedis;
  let originalEnvSha: string | undefined;
  let originalHealthToken: string | undefined;

  beforeAll(() => {
    originalEnvSha = process.env.VERCEL_GIT_COMMIT_SHA;
    originalHealthToken = process.env.HEALTH_TOKEN;
  });

  afterAll(() => {
    if (originalEnvSha !== undefined) {
      process.env.VERCEL_GIT_COMMIT_SHA = originalEnvSha;
    } else {
      delete process.env.VERCEL_GIT_COMMIT_SHA;
    }
    if (originalHealthToken !== undefined) {
      process.env.HEALTH_TOKEN = originalHealthToken;
    } else {
      delete process.env.HEALTH_TOKEN;
    }
    jest.useRealTimers();
  });

  beforeEach(() => {
    // Exact requirement: jest.setSystemTime(FIXED) only, with no fake timers on nextTick/setImmediate
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'], now: FIXED_DATE });

    // Exact requirement: VERCEL_GIT_COMMIT_SHA is unset
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    delete process.env.HEALTH_TOKEN;

    // Reset service state
    resetHealthCache();
    readThroughService.resetCaches();
    readThroughService.setRedisClient(null);

    // Setup stateful database mock with 5 sample jobs and 2 companies
    statefulPrisma = createStatefulPrisma({
      companies: [
        { id: 'comp-acme', slug: 'acme-corp', name: 'Acme Corp', status: 'ACTIVE' },
        { id: 'comp-beta', slug: 'beta-inc', name: 'Beta Inc', status: 'ACTIVE' },
      ],
      departments: [
        { id: 'dept-eng', name: 'Engineering' },
        { id: 'dept-prod', name: 'Product' },
      ],
      locations: [
        { id: 'loc-sf', name: 'San Francisco' },
        { id: 'loc-ny', name: 'New York' },
      ],
    });

    for (let i = 1; i <= 5; i++) {
      statefulPrisma.seed('job', createSampleJob(i));
    }

    // Bind stateful mock to global Prisma mocks
    Object.assign(mockCompany, statefulPrisma.company);
    Object.assign(mockJob, statefulPrisma.job);
    Object.assign(mockDepartment, statefulPrisma.department);
    Object.assign(mockLocation, statefulPrisma.location);

    fakeRedis = new FakeRedis();
  });

  describe('Cache MISS (Database Path)', () => {
    it('matches snapshot for GET /v1/jobs (default)', async () => {
      const res = await request(app).get('/v1/jobs').set('X-Forwarded-For', '10.0.0.1');
      expect(res.status).toBe(200);
      expect(res.headers['x-cache']).toBe('BYPASS');
      expect(res.body).toMatchSnapshot();
    });

    it('matches snapshot for GET /v1/jobs with filters', async () => {
      const res = await request(app)
        .get('/v1/jobs?search=Engineer&workplaceType=Remote&country=US')
        .set('X-Forwarded-For', '10.0.0.2');
      expect(res.status).toBe(200);
      expect(res.body).toMatchSnapshot();
    });

    it('matches snapshot for GET /v1/jobs pagination edges', async () => {
      const res = await request(app)
        .get('/v1/jobs?page=2&pageSize=2')
        .set('X-Forwarded-For', '10.0.0.3');
      expect(res.status).toBe(200);
      expect(res.body).toMatchSnapshot();
    });

    it('matches snapshot for GET /v1/jobs with capped pageSize', async () => {
      const res = await request(app)
        .get('/v1/jobs?pageSize=500')
        .set('X-Forwarded-For', '10.0.0.4');
      expect(res.status).toBe(200);
      expect(res.body.meta.pageSize).toBe(100);
      expect(res.body).toMatchSnapshot();
    });

    it('matches snapshot for GET /v1/jobs/:id (valid)', async () => {
      const res = await request(app)
        .get('/v1/jobs/00000000-0000-4000-8000-000000000001')
        .set('X-Forwarded-For', '10.0.0.5');
      expect(res.status).toBe(200);
      expect(res.body).toMatchSnapshot();
    });

    it('matches snapshot for GET /v1/jobs/:id non-UUID (404)', async () => {
      const res = await request(app)
        .get('/v1/jobs/not-a-uuid')
        .set('X-Forwarded-For', '10.0.0.6');
      expect(res.status).toBe(404);
      expect(res.body).toMatchSnapshot();
    });

    it('matches snapshot for GET /v1/jobs/:id missing UUID (404)', async () => {
      const res = await request(app)
        .get('/v1/jobs/00000000-0000-0000-0000-000000000000')
        .set('X-Forwarded-For', '10.0.0.7');
      expect(res.status).toBe(404);
      expect(res.body).toMatchSnapshot();
    });

    it('matches snapshot for GET /v1/facets', async () => {
      const res = await request(app).get('/v1/facets').set('X-Forwarded-For', '10.0.0.8');
      expect(res.status).toBe(200);
      expect(res.body).toMatchSnapshot();
    });

    it('matches snapshot for GET /v1/companies', async () => {
      const res = await request(app).get('/v1/companies?page=1').set('X-Forwarded-For', '10.0.0.9');
      expect(res.status).toBe(200);
      expect(res.body).toMatchSnapshot();
    });

    it('matches snapshot for GET /v1/companies empty result', async () => {
      const res = await request(app)
        .get('/v1/companies?search=NonExistentCompany')
        .set('X-Forwarded-For', '10.0.0.10');
      expect(res.status).toBe(200);
      expect(res.body).toMatchSnapshot();
    });

    it('matches snapshot for GET /v1/meta', async () => {
      const res = await request(app).get('/v1/meta').set('X-Forwarded-For', '10.0.0.11');
      expect(res.status).toBe(200);
      expect(res.body).toMatchSnapshot();
    });

    it('matches snapshot for GET /health without token', async () => {
      const res = await request(app).get('/health').set('X-Forwarded-For', '10.0.0.12');
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body).toMatchSnapshot();
    });

    it('matches snapshot for GET /health with token', async () => {
      process.env.HEALTH_TOKEN = 'secret-token-123';
      const res = await request(app)
        .get('/health')
        .set('x-health-token', 'secret-token-123')
        .set('X-Forwarded-For', '10.0.0.13');
      expect(res.status).toBe(200);
      expect(res.body).toMatchSnapshot();
    });
  });

  describe('Cache HIT (Redis Seeded Path)', () => {
    beforeEach(async () => {
      await publishCacheGeneration({
        runId: 'golden-run',
        scrapeFinishedAt: '2026-03-01T12:00:00.000Z',
        prisma: statefulPrisma,
        redis: fakeRedis as any,
      });
      readThroughService.setRedisClient(fakeRedis);
    });

    it('matches snapshot for GET /v1/jobs on cache HIT', async () => {
      const res = await request(app).get('/v1/jobs?page=1').set('X-Forwarded-For', '10.0.0.14');
      expect(res.status).toBe(200);
      expect(res.headers['x-cache']).toBe('HIT');
      expect(res.body).toMatchSnapshot();
    });

    it('matches snapshot for GET /v1/facets on cache HIT', async () => {
      const res = await request(app).get('/v1/facets').set('X-Forwarded-For', '10.0.0.15');
      expect(res.status).toBe(200);
      expect(res.headers['x-cache']).toBe('HIT');
      expect(res.body).toMatchSnapshot();
    });

    it('matches snapshot for GET /v1/meta on cache HIT', async () => {
      const res = await request(app).get('/v1/meta').set('X-Forwarded-For', '10.0.0.16');
      expect(res.status).toBe(200);
      expect(res.headers['x-cache']).toBe('HIT');
      expect(res.body).toMatchSnapshot();
    });

    it('matches snapshot for GET /v1/companies on cache HIT', async () => {
      const res = await request(app).get('/v1/companies?page=1').set('X-Forwarded-For', '10.0.0.17');
      expect(res.status).toBe(200);
      expect(res.headers['x-cache']).toBe('HIT');
      expect(res.body).toMatchSnapshot();
    });
  });
});
