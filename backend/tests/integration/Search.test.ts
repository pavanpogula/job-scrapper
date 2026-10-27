/**
 * @file Job Search Integration Tests (real PostgreSQL)
 * @summary Proves /v1/jobs search returns exactly the right jobs, combines with filters, and pages without loss (BF-020)
 * @tags tests, integration, search, postgres, pagination, BF-020
 *
 * Runs only when TEST_DATABASE_URL points at a localhost Postgres (CI starts one; see backend/docs/testing.md).
 * The unit suites mock Prisma and cannot evaluate text matching, so search correctness is only provable here.
 */

import { execSync } from 'child_process';
import path from 'path';
import request from 'supertest';
import type { Express } from 'express';
import { PrismaClient } from '@prisma/client';
import { queryJobs } from '../../src/api/db/queries';
import type { JobQueryParams } from '../../src/api/db/queries';
import { referenceSearch, type ReferenceJob } from './searchReference';
import { buildSeedJobs, SEED_COMPANIES, SEED_DEPARTMENTS, SEED_LOCATIONS, type SeedJob } from './searchSeed';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

/**
 * @summary Refuses anything but a local database so these destructive tests can never touch production
 */
function assertLocalDatabase(url: string): void {
  const host = new URL(url).hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') {
    throw new Error(`TEST_DATABASE_URL must point at localhost/127.0.0.1, got host "${host}"`);
  }
}

const describeIfDb = TEST_DATABASE_URL ? describe : describe.skip;
if (!TEST_DATABASE_URL) {
  console.warn('Skipping search integration tests: TEST_DATABASE_URL is not set (see backend/docs/testing.md).');
}

describeIfDb('BF-020: job search against real PostgreSQL', () => {
  let prisma: PrismaClient;
  let app: Express;
  let jobs: SeedJob[];
  let ipCounter = 0;
  const nextIp = () => `10.20.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`;

  beforeAll(async () => {
    const url = TEST_DATABASE_URL as string;
    assertLocalDatabase(url);
    execSync('npx prisma db push --skip-generate --accept-data-loss', {
      cwd: path.resolve(__dirname, '../..'),
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'pipe',
    });

    // The API module creates its own PrismaClient from DATABASE_URL at import time.
    process.env.DATABASE_URL = url;
    delete process.env.REDIS_URL;
    delete process.env.UPSTASH_REDIS_REST_URL;
    app = (await import('../../src/api/Server')).default;

    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.job.deleteMany();
    await prisma.company.deleteMany();
    await prisma.department.deleteMany();
    await prisma.location.deleteMany();

    await prisma.company.createMany({ data: SEED_COMPANIES.map((c) => ({ slug: c.slug, name: c.name })) });
    await prisma.department.createMany({ data: SEED_DEPARTMENTS.map((name) => ({ id: `dept-${name}`, name })) });
    await prisma.location.createMany({ data: SEED_LOCATIONS.map((name) => ({ id: `loc-${name}`, name })) });

    jobs = buildSeedJobs();
    await prisma.job.createMany({
      data: jobs.map((j) => ({
        id: j.id,
        ashbyId: `ashby-${j.id}`,
        title: j.title,
        applyUrl: `https://jobs.ashbyhq.com/${j.companySlug}/${j.id}`,
        companySlug: j.companySlug,
        departmentId: j.departmentName ? `dept-${j.departmentName}` : null,
        locationId: j.locationName ? `loc-${j.locationName}` : null,
        workplaceType: j.workplaceType,
        employmentType: j.employmentType,
        country: j.country,
        isRemote: j.isRemote,
        salaryMin: j.salaryMin,
        salaryMax: j.salaryMax,
        salaryCurrency: j.salaryMin === null ? null : 'USD',
        salaryInterval: j.salaryMin === null ? null : '1 YEAR',
        publishedAt: j.publishedAt,
        active: j.active,
        isListed: j.isListed,
        metadata: {},
        contentHash: `hash-${j.id}`,
      })),
    });
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  const idsByTitle = (...titles: string[]) =>
    jobs.filter((j) => titles.includes(j.title) && j.active && j.isListed).map((j) => j.id).sort();

  /** Every id the API returns for a query, at pageSize 100 (the seed has fewer rows than that). */
  async function searchIds(params: JobQueryParams): Promise<{ ids: string[]; total: number }> {
    const res = await queryJobs(prisma, { pageSize: '100', ...params });
    return { ids: res.data.map((j) => j.id).sort(), total: res.meta.total };
  }

  describe('owner examples', () => {
    it('"senior engineer" matches every title holding both words, in any order, and nothing else', async () => {
      const { ids } = await searchIds({ search: 'senior engineer' });
      expect(ids).toEqual(expect.arrayContaining(
        idsByTitle('Senior Software Engineer', 'Staff Senior Software Engineer', 'Engineer, Senior Platform', 'Senior Engineer')
      ));
      expect(ids).not.toEqual(expect.arrayContaining(idsByTitle('Senior Accountant')));
      expect(ids).not.toEqual(expect.arrayContaining(idsByTitle('Software Engineer')));
      expect(ids).toEqual(referenceSearch(jobs, 'senior engineer'));
    });

    it('word order does not matter', async () => {
      const a = await searchIds({ search: 'senior software engineer' });
      const b = await searchIds({ search: 'software engineer senior' });
      expect(b.ids).toEqual(a.ids);
      expect(a.ids.length).toBeGreaterThan(0);
    });

    it('"sf" matches SF as a word but not inside "Transfer"', async () => {
      const { ids } = await searchIds({ search: 'sf' });
      expect(ids).toEqual(expect.arrayContaining(idsByTitle('Account Executive - SF', 'Senior Engineer', 'ML Engineer')));
      expect(ids).not.toEqual(expect.arrayContaining(idsByTitle('Transfer Pricing Analyst')));
      expect(ids).toEqual(referenceSearch(jobs, 'sf'));
    });

    it('a word may match the company or location while another matches the title', async () => {
      expect((await searchIds({ search: 'engineer acme' })).ids).toEqual(referenceSearch(jobs, 'engineer acme'));
      expect((await searchIds({ search: 'designer london' })).ids).toEqual(idsByTitle('Product Designer', 'Senior Product Designer'));
    });

    it('never returns inactive or unlisted jobs', async () => {
      const { ids } = await searchIds({ search: 'senior software engineer' });
      const hidden = jobs.filter((j) => !j.active || !j.isListed).map((j) => j.id);
      expect(hidden).toHaveLength(2);
      for (const id of hidden) expect(ids).not.toContain(id);
    });
  });

  const QUERIES = [
    'senior engineer', 'Senior Engineer', 'SENIOR ENGINEER', 'engineer senior', 'senior software engineer',
    'software engineer senior', 'senior  engineer', '  senior engineer  ', 'engineer', 'engineering', 'engineer,',
    'senior', 'staff', 'sf', 'SF', 'transfer', 'acme', 'engineer acme', 'globex engineer', 'designer london',
    'london', 'zürich', 'Zürich', 'zurich', 'remote', 'remote sf', 'c++', 'c#', 'node.js', 'node', 'js', 'r&d',
    'research & development', 'research development', '100%', '%', '_', 'data_engineer', 'data_platform',
    '"quoted"', '"senior engineer"', 'ml engineer', 'machine learning', 'platform sre', 'sre', 'senior living',
    'living care', 'contract', 'nonexistentword', 'senior engineer nonexistentword', 'a'.repeat(120), '',
  ];

  describe('every query returns exactly the reference set', () => {
    it.each(QUERIES)('search %j', async (q) => {
      const { ids, total } = await searchIds({ search: q });
      const expected = referenceSearch(jobs, q);
      expect(ids).toEqual(expected);
      expect(total).toBe(expected.length);
    });
  });

  describe('search through the HTTP API', () => {
    it.each(['senior engineer', 'engineer senior', 'sf', 'c++', 'r&d', '100%'])('GET /v1/jobs?search=%j', async (q) => {
      const res = await request(app)
        .get('/v1/jobs')
        .query({ search: q, pageSize: 100 })
        .set('X-Forwarded-For', nextIp());
      expect(res.status).toBe(200);
      const ids = (res.body.data as { id: string }[]).map((j) => j.id).sort();
      expect(ids).toEqual(referenceSearch(jobs, q));
      expect(res.body.meta.total).toBe(ids.length);
    });
  });

  describe('filters only narrow a search', () => {
    const FILTERS: JobQueryParams[] = [
      { workplaceType: 'Remote' },
      { employmentType: 'Contract' },
      { country: 'GB' },
      { isRemote: 'true' },
      { hasSalary: 'true' },
      { salaryMin: '100000' },
      { country: 'US', hasSalary: 'true' },
    ];
    const SEARCHES = ['senior engineer', 'engineer', 'sf', 'london'];

    for (const search of SEARCHES) {
      it.each(FILTERS)(`"${search}" + %j is the intersection of search-only and filter-only`, async (filter) => {
        const both = await searchIds({ search, ...filter });
        const searchOnly = await searchIds({ search });
        const filterOnly = await searchIds(filter);
        const intersection = searchOnly.ids.filter((id) => filterOnly.ids.includes(id));
        expect(both.ids).toEqual(intersection);
      });
    }
  });

  describe('pagination never loses or repeats jobs', () => {
    const SORTS: Array<Pick<JobQueryParams, 'sortBy' | 'sortOrder'>> = [
      {},
      { sortOrder: 'asc' },
      { sortBy: 'salary' },
      { sortBy: 'salary', sortOrder: 'asc' },
      { sortBy: 'company', sortOrder: 'asc' },
    ];

    /** Walks every page and returns ids in page order, checking the page metadata on the way. */
    async function walk(params: JobQueryParams, pageSize: number): Promise<{ order: string[]; total: number }> {
      const order: string[] = [];
      let total = -1;
      for (let page = 1; page <= 200; page++) {
        const res = await queryJobs(prisma, { ...params, page: String(page), pageSize: String(pageSize) });
        total = res.meta.total;
        expect(res.meta.page).toBe(page);
        expect(res.meta.totalPages).toBe(Math.max(1, Math.ceil(total / pageSize)));
        expect(res.meta.hasPrev).toBe(page > 1);
        expect(res.meta.hasNext).toBe(page < res.meta.totalPages);
        order.push(...res.data.map((j) => j.id));
        if (!res.meta.hasNext) break;
      }
      return { order, total };
    }

    for (const search of ['', 'engineer', 'senior engineer', 'sf']) {
      for (const pageSize of [1, 2, 7, 25]) {
        it.each(SORTS)(`search "${search}", pageSize ${pageSize}, sort %j`, async (sort) => {
          const params: JobQueryParams = { ...sort, ...(search ? { search } : {}) };
          const first = await walk(params, pageSize);
          const expected = referenceSearch(jobs, search);
          expect(new Set(first.order).size).toBe(first.order.length);
          expect([...first.order].sort()).toEqual(expected);
          expect(first.total).toBe(expected.length);
          const second = await walk(params, pageSize);
          expect(second.order).toEqual(first.order);
        });
      }
    }
  });
});

export type { ReferenceJob };
