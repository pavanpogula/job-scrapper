/**
 * @file Mixed-source API Integration Tests (real PostgreSQL)
 * @summary Proves source filter, source/externalId fields, facets, board links and underscore slugs with Ashby and Greenhouse rows side by side (ADR-0021)
 * @tags tests, integration, multi-source, greenhouse, ashby, postgres, ADR-0021
 *
 * Runs only when TEST_DATABASE_URL points at a localhost Postgres (see backend/docs/testing.md). The Prisma mock cannot
 * prove that `source=` really filters rows or that an Ashby and a Greenhouse company with the same token coexist.
 */

import { execSync } from 'child_process';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { computeFacets, queryCompanies, queryCompanyProfile, queryJobDetail, queryJobs } from '../../src/api/db/queries';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DATABASE_URL ? describe : describe.skip;

describeIfDb('ADR-0021: API with Ashby and Greenhouse rows on real PostgreSQL', () => {
  let prisma: PrismaClient;
  let greenhouseJobId = '';

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

    // "stripe" exists on both ATSs: same token, different source, different slug.
    await prisma.company.createMany({
      data: [
        { slug: 'stripe', name: 'Stripe (Ashby)', source: 'ASHBY', atsToken: 'stripe' },
        { slug: 'gh--stripe', name: 'Stripe (Greenhouse)', source: 'GREENHOUSE', atsToken: 'stripe' },
        { slug: 'gh--foo_bar', name: 'Foo Bar', source: 'GREENHOUSE', atsToken: 'foo_bar' },
      ],
    });

    const job = (n: number, companySlug: string, source: 'ASHBY' | 'GREENHOUSE', metadata: object = {}) => ({
      ashbyId: source === 'ASHBY' ? `ashby-uuid-${n}` : `greenhouse:${1000 + n}`,
      source,
      externalId: source === 'ASHBY' ? `ashby-uuid-${n}` : String(1000 + n),
      title: `Engineer ${n}`,
      applyUrl: 'https://example.com/apply',
      companySlug,
      metadata,
      contentHash: `hash-${n}`,
    });
    await prisma.job.createMany({
      data: [
        job(1, 'stripe', 'ASHBY'),
        job(2, 'stripe', 'ASHBY'),
        job(3, 'stripe', 'ASHBY'),
        // No jobUrl in metadata: the detail URL must be built from atsToken, never from the gh-- slug.
        job(4, 'gh--stripe', 'GREENHOUSE'),
        job(5, 'gh--foo_bar', 'GREENHOUSE'),
      ],
    });
    greenhouseJobId = (await prisma.job.findFirstOrThrow({ where: { externalId: '1004' } })).id;
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('source=greenhouse returns exactly the Greenhouse jobs, source=ashby exactly the Ashby ones', async () => {
    const gh = await queryJobs(prisma, { source: 'greenhouse' });
    expect(gh.meta.total).toBe(2);
    expect(gh.data.every((j) => j.source === 'greenhouse')).toBe(true);

    const ashby = await queryJobs(prisma, { source: 'ashby' });
    expect(ashby.meta.total).toBe(3);
    expect(ashby.data.every((j) => j.source === 'ashby')).toBe(true);

    const all = await queryJobs(prisma, {});
    expect(all.meta.total).toBe(5);
  });

  it('source combines with search and company filters', async () => {
    const res = await queryJobs(prisma, { source: 'greenhouse', search: 'engineer 5' });
    expect(res.data.map((j) => j.externalId)).toEqual(['1005']);

    const none = await queryJobs(prisma, { source: 'ashby', search: 'engineer 5' });
    expect(none.meta.total).toBe(0);

    const byCompany = await queryJobs(prisma, { source: 'greenhouse', company: 'gh--stripe' });
    expect(byCompany.data.map((j) => j.externalId)).toEqual(['1004']);
  });

  it('job list items expose source and externalId next to the legacy ashbyId', async () => {
    const res = await queryJobs(prisma, { source: 'greenhouse', company: 'gh--stripe' });
    expect(res.data[0]).toMatchObject({ source: 'greenhouse', externalId: '1004', ashbyId: 'greenhouse:1004' });
  });

  it('facets count jobs per source', async () => {
    const facets = await computeFacets(prisma);
    expect(facets.sources).toEqual([
      { value: 'ashby', count: 3 },
      { value: 'greenhouse', count: 2 },
    ]);
  });

  it('companies carry source and a board link built from atsToken for each source', async () => {
    const res = await queryCompanies(prisma, {});
    const byName = new Map(res.data.map((c) => [c.slug, c]));
    expect(byName.get('stripe')).toMatchObject({ source: 'ashby', boardUrl: 'https://jobs.ashbyhq.com/stripe' });
    expect(byName.get('gh--stripe')).toMatchObject({
      source: 'greenhouse',
      boardUrl: 'https://job-boards.greenhouse.io/stripe',
    });
    expect(byName.get('gh--foo_bar')).toMatchObject({
      source: 'greenhouse',
      boardUrl: 'https://job-boards.greenhouse.io/foo_bar',
    });

    const ranked = await queryCompanies(prisma, { sort: 'jobs' });
    expect(ranked.data.find((c) => c.slug === 'gh--foo_bar')?.boardUrl).toBe('https://job-boards.greenhouse.io/foo_bar');
  });

  it('same-token companies stay separate: stripe (Ashby, 3 jobs) and gh--stripe (Greenhouse, 1 job)', async () => {
    const ashbyProfile = await queryCompanyProfile(prisma, 'stripe');
    const ghProfile = await queryCompanyProfile(prisma, 'gh--stripe');
    expect(ashbyProfile).toMatchObject({ source: 'ashby', jobCount: 3 });
    expect(ghProfile).toMatchObject({ source: 'greenhouse', jobCount: 1 });
  });

  it('a Greenhouse slug with an underscore is a valid company profile', async () => {
    const profile = await queryCompanyProfile(prisma, 'gh--foo_bar');
    expect(profile).toMatchObject({ slug: 'gh--foo_bar', source: 'greenhouse', jobCount: 1 });
    expect(profile?.boardUrl).toBe('https://job-boards.greenhouse.io/foo_bar');
  });

  it('job detail builds the fallback job URL from atsToken for Greenhouse (no gh-- in the URL)', async () => {
    const detail = await queryJobDetail(prisma, greenhouseJobId);
    expect(detail).toMatchObject({ source: 'greenhouse', externalId: '1004' });
    expect(detail?.jobUrl).toBe('https://job-boards.greenhouse.io/stripe/jobs/1004');
    expect(detail?.company).toMatchObject({
      source: 'greenhouse',
      boardUrl: 'https://job-boards.greenhouse.io/stripe',
    });
  });
});
