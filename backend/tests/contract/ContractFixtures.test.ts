/**
 * @file ContractFixtures.test.ts
 * @summary Golden API contract fixture test asserting deterministic endpoint shapes and cache HIT == MISS parity
 * @tags contract, fixtures, api, parity, P8a
 */

import fs from 'fs';
import path from 'path';
import request from 'supertest';
import app, { resetHealthCache } from '../../src/api/Server';
import { readThroughService } from '../../src/api/cache/ReadThrough';
import { mockCompany, mockJob, mockDepartment, mockLocation } from '../../__mocks__/@prisma/client';
import { createStatefulPrisma } from '../helpers/prismaFactory';
import { FakeRedis } from '../helpers/fakeRedis';
import { publishCacheGeneration } from '../../src/cache/Publisher';

const FIXED_DATE = new Date('2026-03-01T12:00:00.000Z');
const FIXTURES_DIR = path.resolve(__dirname, '../fixtures/contract');

/**
 * @summary Creates a deterministic sample job object for database seeding
 * @param n Job index
 */
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
    lastUpdatedAt: published,
    lastUpdatedSource: 'published',
    createdAt: published,
    updatedAt: published,
    metadata: {
      _source: 'rest',
      descriptionHtml: `<p>Job description for role ${n}</p>`,
      descriptionPlain: `Job description for role ${n}`,
      team: n % 2 === 1 ? 'Platform Engineering' : 'Product Growth',
      secondaryLocations: [{ location: 'New York, US' }],
    },
    department: { id: n % 2 === 1 ? 'dept-eng' : 'dept-prod', name: n % 2 === 1 ? 'Engineering' : 'Product' },
    location: { id: n % 3 === 0 ? 'loc-ny' : 'loc-sf', name: n % 3 === 0 ? 'New York' : 'San Francisco' },
    company: {
      id: n % 2 === 1 ? 'comp-acme' : 'comp-beta',
      slug: n % 2 === 1 ? 'acme-corp' : 'beta-inc',
      name: n % 2 === 1 ? 'Acme Corp' : 'Beta Inc',
      logoUrl: null,
      _count: { jobs: 3 },
    },
  };
}

/**
 * @summary Compares response payload against committed contract fixture or updates fixture file when UPDATE_CONTRACT_FIXTURES=1
 * @param fixtureName Fixture base name (e.g. 'jobs.default')
 * @param actualData Live response payload received from endpoint
 */
function assertOrUpdateFixture(fixtureName: string, actualData: unknown): void {
  const filePath = path.join(FIXTURES_DIR, `${fixtureName}.json`);

  if (process.env.UPDATE_CONTRACT_FIXTURES === '1') {
    fs.mkdirSync(FIXTURES_DIR, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(actualData, null, 2) + '\n', 'utf8');
    return;
  }

  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Contract fixture ${filePath} does not exist. Run 'npm --prefix backend run contract:fixtures' to generate it.`
    );
  }

  const expectedData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  expect(actualData).toEqual(expectedData);
}

describe('ContractFixtures API Integration Suite (P8a)', () => {
  let statefulPrisma: ReturnType<typeof createStatefulPrisma>;
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
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'], now: FIXED_DATE });
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    delete process.env.HEALTH_TOKEN;

    resetHealthCache();
    readThroughService.resetCaches();
    readThroughService.setRedisClient(null);

    statefulPrisma = createStatefulPrisma({
      // Mirror what Postgres returns: logoUrl is always present (string or null) and _count matches the seeded jobs
      // (3 acme-corp, 2 beta-inc), so the companies fixture has the same keys and counts as the live API.
      companies: [
        { id: 'comp-acme', slug: 'acme-corp', name: 'Acme Corp', logoUrl: 'https://example.com/acme-logo.png', status: 'ACTIVE', _count: { jobs: 3 } },
        { id: 'comp-beta', slug: 'beta-inc', name: 'Beta Inc', logoUrl: null, status: 'ACTIVE', _count: { jobs: 2 } },
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

    Object.assign(mockCompany, statefulPrisma.company);
    Object.assign(mockJob, statefulPrisma.job);
    Object.assign(mockDepartment, statefulPrisma.department);
    Object.assign(mockLocation, statefulPrisma.location);

    fakeRedis = new FakeRedis();
  });

  describe('Contract Fixture Verification', () => {
    it('verifies GET /v1/jobs (default)', async () => {
      const res = await request(app).get('/v1/jobs').set('X-Forwarded-For', '10.0.0.1');
      expect(res.status).toBe(200);
      assertOrUpdateFixture('jobs.default', res.body);
    });

    it('verifies GET /v1/jobs (filtered: workplaceType=Remote&country=US)', async () => {
      const allJobs = [1, 2, 3, 4, 5].map(createSampleJob);
      const filtered = allJobs.filter((j) => j.workplaceType === 'Remote' && j.country === 'US');
      mockJob.findMany.mockResolvedValueOnce(filtered);
      mockJob.count.mockResolvedValueOnce(filtered.length);

      const res = await request(app)
        .get('/v1/jobs?workplaceType=Remote&country=US')
        .set('X-Forwarded-For', '10.0.0.2');
      expect(res.status).toBe(200);
      assertOrUpdateFixture('jobs.filtered', res.body);
    });

    it('verifies GET /v1/jobs (empty page)', async () => {
      mockJob.findMany.mockResolvedValueOnce([]);
      mockJob.count.mockResolvedValueOnce(0);

      const res = await request(app)
        .get('/v1/jobs?search=nonexistentterm12345')
        .set('X-Forwarded-For', '10.0.0.3');
      expect(res.status).toBe(200);
      assertOrUpdateFixture('jobs.empty', res.body);
    });

    it('verifies GET /v1/jobs/:id (found)', async () => {
      const res = await request(app)
        .get('/v1/jobs/00000000-0000-4000-8000-000000000001')
        .set('X-Forwarded-For', '10.0.0.4');
      expect(res.status).toBe(200);
      assertOrUpdateFixture('job-detail.found', res.body);
    });

    it('verifies GET /v1/jobs/:id (404 not found)', async () => {
      const res = await request(app)
        .get('/v1/jobs/00000000-0000-0000-0000-000000000000')
        .set('X-Forwarded-For', '10.0.0.5');
      expect(res.status).toBe(404);
      assertOrUpdateFixture('job-detail.not-found', res.body);
    });

    it('verifies GET /v1/facets', async () => {
      const res = await request(app).get('/v1/facets').set('X-Forwarded-For', '10.0.0.6');
      expect(res.status).toBe(200);
      assertOrUpdateFixture('facets.default', res.body);
    });

    it('verifies GET /v1/companies', async () => {
      const res = await request(app).get('/v1/companies?page=1').set('X-Forwarded-For', '10.0.0.7');
      expect(res.status).toBe(200);
      assertOrUpdateFixture('companies.default', res.body);
    });

    it('verifies GET /v1/meta', async () => {
      const res = await request(app).get('/v1/meta').set('X-Forwarded-For', '10.0.0.8');
      expect(res.status).toBe(200);
      assertOrUpdateFixture('meta.default', res.body);
    });

    it('verifies GET /v1/companies/:slug (found)', async () => {
      const res = await request(app).get('/v1/companies/acme-corp').set('X-Forwarded-For', '10.0.0.11');
      expect(res.status).toBe(200);
      assertOrUpdateFixture('company-profile.found', res.body);
    });

    it('verifies GET /v1/companies/:slug (not found)', async () => {
      const res = await request(app).get('/v1/companies/unknown-company').set('X-Forwarded-For', '10.0.0.12');
      expect(res.status).toBe(404);
      assertOrUpdateFixture('company-profile.not-found', res.body);
    });

    it('verifies GET /v1/jobs?company=acme-corp', async () => {
      const res = await request(app).get('/v1/jobs?company=acme-corp').set('X-Forwarded-For', '10.0.0.13');
      expect(res.status).toBe(200);
      assertOrUpdateFixture('jobs.company', res.body);
    });

    it('verifies GET /v1/companies?sort=jobs', async () => {
      const res = await request(app).get('/v1/companies?sort=jobs').set('X-Forwarded-For', '10.0.0.14');
      expect(res.status).toBe(200);
      assertOrUpdateFixture('companies.sorted-by-jobs', res.body);
    });

    it('verifies error body shape (404 invalid UUID)', async () => {
      const res = await request(app).get('/v1/jobs/not-a-uuid').set('X-Forwarded-For', '10.0.0.9');
      expect(res.status).toBe(404);
      assertOrUpdateFixture('error.404', res.body);
    });
  });

  describe('BF-019 Parity: Cache HIT == MISS', () => {
    beforeEach(async () => {
      await publishCacheGeneration({
        runId: 'contract-parity-run',
        scrapeFinishedAt: '2026-03-01T12:00:00.000Z',
        prisma: statefulPrisma,
        redis: fakeRedis,
      });
    });

    it('asserts jobs listing HIT body equals MISS body', async () => {
      // 1. MISS path
      readThroughService.setRedisClient(null);
      const resMiss = await request(app).get('/v1/jobs?page=1').set('X-Forwarded-For', '10.1.0.1');
      expect(resMiss.status).toBe(200);
      expect(resMiss.headers['x-cache']).toBe('BYPASS');

      // 2. HIT path
      readThroughService.setRedisClient(fakeRedis);
      const resHit = await request(app).get('/v1/jobs?page=1').set('X-Forwarded-For', '10.1.0.2');
      expect(resHit.status).toBe(200);
      expect(resHit.headers['x-cache']).toBe('HIT');

      expect(resHit.body).toEqual(resMiss.body);
    });

    it('asserts job detail HIT body equals MISS body', async () => {
      const validId = '00000000-0000-4000-8000-000000000001';

      // 1. MISS path
      readThroughService.setRedisClient(null);
      const resMiss = await request(app).get(`/v1/jobs/${validId}`).set('X-Forwarded-For', '10.1.0.3');
      expect(resMiss.status).toBe(200);
      expect(resMiss.headers['x-cache']).toBe('BYPASS');

      // 2. HIT path
      readThroughService.setRedisClient(fakeRedis);
      const resHit = await request(app).get(`/v1/jobs/${validId}`).set('X-Forwarded-For', '10.1.0.4');
      expect(resHit.status).toBe(200);
      expect(resHit.headers['x-cache']).toBe('HIT');

      expect(resHit.body).toEqual(resMiss.body);
    });

    it('asserts facets HIT body equals MISS body', async () => {
      // 1. MISS path
      readThroughService.setRedisClient(null);
      const resMiss = await request(app).get('/v1/facets').set('X-Forwarded-For', '10.1.0.5');
      expect(resMiss.status).toBe(200);
      expect(resMiss.headers['x-cache']).toBe('BYPASS');

      // 2. HIT path
      readThroughService.setRedisClient(fakeRedis);
      const resHit = await request(app).get('/v1/facets').set('X-Forwarded-For', '10.1.0.6');
      expect(resHit.status).toBe(200);
      expect(resHit.headers['x-cache']).toBe('HIT');

      expect(resHit.body).toEqual(resMiss.body);
    });

    it('asserts companies HIT body equals MISS body', async () => {
      // 1. MISS path
      readThroughService.setRedisClient(null);
      const resMiss = await request(app).get('/v1/companies?page=1').set('X-Forwarded-For', '10.1.0.7');
      expect(resMiss.status).toBe(200);
      expect(resMiss.headers['x-cache']).toBe('BYPASS');

      // 2. HIT path
      readThroughService.setRedisClient(fakeRedis);
      const resHit = await request(app).get('/v1/companies?page=1').set('X-Forwarded-For', '10.1.0.8');
      expect(resHit.status).toBe(200);
      expect(resHit.headers['x-cache']).toBe('HIT');

      expect(resHit.body).toEqual(resMiss.body);
    });

    it('asserts meta HIT body equals MISS body (excluding generation and lastScrapeAt)', async () => {
      // 1. MISS path
      readThroughService.setRedisClient(null);
      const resMiss = await request(app).get('/v1/meta').set('X-Forwarded-For', '10.1.0.9');
      expect(resMiss.status).toBe(200);

      // 2. HIT path
      readThroughService.setRedisClient(fakeRedis);
      const resHit = await request(app).get('/v1/meta').set('X-Forwarded-For', '10.1.0.10');
      expect(resHit.status).toBe(200);
      expect(resHit.headers['x-cache']).toBe('HIT');

      const { generation: _gMiss, lastScrapeAt: _sMiss, ...metaMiss } = resMiss.body;
      const { generation: _gHit, lastScrapeAt: _sHit, ...metaHit } = resHit.body;

      expect(metaHit).toEqual(metaMiss);
    });
  });
});
