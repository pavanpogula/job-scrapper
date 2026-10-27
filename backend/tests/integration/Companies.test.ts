/**
 * @file Company Directory & Profile Integration Tests (real PostgreSQL)
 * @summary Proves "most hiring" counts only open jobs and a company profile's top departments/locations are the real top 10 (ADR-0019)
 * @tags tests, integration, companies, postgres, ADR-0019
 *
 * Runs only when TEST_DATABASE_URL points at a localhost Postgres (see backend/docs/testing.md). Relation counts and
 * groupBy ordering cannot be proven with the Prisma mock, so these cases need the real database.
 */

import { execSync } from 'child_process';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { queryCompanies, queryCompanyProfile } from '../../src/api/db/queries';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DATABASE_URL ? describe : describe.skip;

describeIfDb('ADR-0019: company directory and profile against real PostgreSQL', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    const url = TEST_DATABASE_URL as string;
    const host = new URL(url).hostname;
    if (host !== 'localhost' && host !== '127.0.0.1') {
      throw new Error(`TEST_DATABASE_URL must point at localhost/127.0.0.1, got host "${host}"`);
    }
    execSync('npx prisma db push --skip-generate --accept-data-loss', {
      cwd: path.resolve(__dirname, '../..'),
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'pipe',
    });
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.job.deleteMany();
    await prisma.company.deleteMany();
    await prisma.department.deleteMany();
    await prisma.location.deleteMany();

    await prisma.company.createMany({
      data: [
        { slug: 'old-co', name: 'Old Co' },
        { slug: 'hiring-co', name: 'Hiring Co' },
        { slug: 'big-co', name: 'Big Co' },
        { slug: 'quiet-co', name: 'Quiet Co' },
      ],
    });
    // 60 small departments/locations sort before the big ones by id, so a "first 50, then sort" query misses the big ones.
    const small = Array.from({ length: 60 }, (_, d) => String(d).padStart(2, '0'));
    await prisma.department.createMany({
      data: [...small.map((d) => ({ id: `d${d}`, name: `Dept ${d}` })), { id: 'zz-dept', name: 'Zeta Big' }],
    });
    await prisma.location.createMany({
      data: [...small.map((d) => ({ id: `l${d}`, name: `City ${d}` })), { id: 'zz-loc', name: 'Zeta City' }],
    });

    let n = 0;
    const job = (companySlug: string, active: boolean, departmentId: string | null = null, locationId: string | null = null) => ({
      ashbyId: `ashby-${n}`,
      title: `Job ${n++}`,
      applyUrl: 'https://jobs.ashbyhq.com/x',
      companySlug,
      departmentId,
      locationId,
      active,
      metadata: {},
      contentHash: `hash-${n}`,
    });
    await prisma.job.createMany({
      data: [
        // old-co: 1 open job, 20 closed ones that must not count
        job('old-co', true),
        ...Array.from({ length: 20 }, () => job('old-co', false)),
        // hiring-co: 5 open jobs
        ...Array.from({ length: 5 }, () => job('hiring-co', true)),
        // big-co: 1 job in each of 60 small departments/locations, 9 in "Zeta Big"/"Zeta City", plus 30 closed in Dept 00
        ...small.map((d) => job('big-co', true, `d${d}`, `l${d}`)),
        ...Array.from({ length: 9 }, () => job('big-co', true, 'zz-dept', 'zz-loc')),
        ...Array.from({ length: 30 }, () => job('big-co', false, 'd00', 'l00')),
      ],
    });
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('"most hiring" orders by open jobs only (closed jobs never count)', async () => {
    const res = await queryCompanies(prisma, { sort: 'jobs' });
    expect(res.data.map((c) => [c.slug, c.jobCount])).toEqual([
      ['big-co', 69],
      ['hiring-co', 5],
      ['old-co', 1],
      ['quiet-co', 0],
    ]);
    expect(res.total).toBe(4);
  });

  it('"most hiring" pages without losing or repeating companies', async () => {
    const seen: string[] = [];
    for (let page = 1; page <= 4; page++) {
      const res = await queryCompanies(prisma, { sort: 'jobs', page: String(page), pageSize: '1' });
      expect(res.totalPages).toBe(4);
      seen.push(...res.data.map((c) => c.slug));
    }
    expect(seen).toEqual(['big-co', 'hiring-co', 'old-co', 'quiet-co']);
  });

  it('"most hiring" respects search', async () => {
    const res = await queryCompanies(prisma, { sort: 'jobs', search: 'co' });
    expect(res.data.map((c) => c.slug)).toEqual(['big-co', 'hiring-co', 'old-co', 'quiet-co']);
    const one = await queryCompanies(prisma, { sort: 'jobs', search: 'hiring' });
    expect(one.data.map((c) => c.slug)).toEqual(['hiring-co']);
  });

  it('profile top departments and locations are the real top 10 by open jobs', async () => {
    const profile = await queryCompanyProfile(prisma, 'big-co');
    expect(profile?.jobCount).toBe(69);
    expect(profile?.departments).toHaveLength(10);
    expect(profile?.departments[0]).toEqual({ value: 'Zeta Big', count: 9 });
    expect(profile?.locations[0]).toEqual({ value: 'Zeta City', count: 9 });
    // Closed jobs in Dept 00 must not inflate it above the other 1-job departments.
    expect(profile?.departments.find((d) => d.value === 'Dept 00')?.count ?? 1).toBe(1);
    // Ties are broken by name, so the list is deterministic.
    expect(profile?.departments.slice(1).map((d) => d.value)).toEqual(
      Array.from({ length: 9 }, (_, i) => `Dept ${String(i).padStart(2, '0')}`)
    );
  });
});
