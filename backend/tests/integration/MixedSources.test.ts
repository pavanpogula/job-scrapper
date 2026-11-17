/**
 * @file Mixed-source API Integration Tests (real PostgreSQL)
 * @summary Proves source filter, source/externalId fields, facets, board links and special-char tokens with Ashby, Greenhouse, and Lever rows side by side (ADR-0021, ADR-0022)
 * @tags tests, integration, multi-source, ashby, greenhouse, lever, postgres, ADR-0021, ADR-0022
 *
 * Runs only when TEST_DATABASE_URL points at a localhost Postgres (see backend/docs/testing.md). The Prisma mock cannot
 * prove that `source=` really filters rows or that companies from all three ATS sources with the same token coexist.
 */

import { execSync } from 'child_process';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { computeFacets, queryCompanies, queryCompanyProfile, queryJobDetail, queryJobs } from '../../src/api/db/queries';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DATABASE_URL ? describe : describe.skip;

describeIfDb('ADR-0021 / ADR-0022: API with Ashby, Greenhouse, and Lever rows on real PostgreSQL', () => {
  let prisma: PrismaClient;
  let greenhouseJobId = '';
  let leverJobId = '';

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

    // "stripe" exists on all three ATSs: same token, different source, different slug.
    await prisma.company.createMany({
      data: [
        { slug: 'stripe', name: 'Stripe (Ashby)', source: 'ASHBY', atsToken: 'stripe' },
        { slug: 'gh--stripe', name: 'Stripe (Greenhouse)', source: 'GREENHOUSE', atsToken: 'stripe' },
        { slug: 'gh--foo_bar', name: 'Foo Bar', source: 'GREENHOUSE', atsToken: 'foo_bar' },
        { slug: 'lv--stripe', name: 'Stripe (Lever)', source: 'LEVER', atsToken: 'stripe' },
        { slug: 'lv--arcteryx-com', name: "Arc'teryx (Lever)", source: 'LEVER', atsToken: 'arcteryx.com' },
      ],
    });

    const job = (
      n: number,
      companySlug: string,
      source: 'ASHBY' | 'GREENHOUSE' | 'LEVER',
      metadata: object = {}
    ) => {
      const ashbyId =
        source === 'ASHBY'
          ? `ashby-uuid-${n}`
          : source === 'GREENHOUSE'
          ? `greenhouse:${1000 + n}`
          : `lever:00000000-0000-4000-8000-${String(1000 + n).padStart(12, '0')}`;
      const externalId =
        source === 'ASHBY'
          ? `ashby-uuid-${n}`
          : source === 'GREENHOUSE'
          ? String(1000 + n)
          : `00000000-0000-4000-8000-${String(1000 + n).padStart(12, '0')}`;
      return {
        ashbyId,
        source,
        externalId,
        title: `Engineer ${n}`,
        applyUrl: 'https://example.com/apply',
        companySlug,
        metadata,
        contentHash: `hash-${n}`,
      };
    };
    await prisma.job.createMany({
      data: [
        job(1, 'stripe', 'ASHBY'),
        job(2, 'stripe', 'ASHBY'),
        job(3, 'stripe', 'ASHBY'),
        // No jobUrl in metadata: the detail URL must be built from atsToken, never from the gh--/lv-- slug.
        job(4, 'gh--stripe', 'GREENHOUSE'),
        job(5, 'gh--foo_bar', 'GREENHOUSE'),
        job(6, 'lv--stripe', 'LEVER'),
        job(7, 'lv--arcteryx-com', 'LEVER'),
      ],
    });
    greenhouseJobId = (await prisma.job.findFirstOrThrow({ where: { externalId: '1004' } })).id;
    leverJobId = (
      await prisma.job.findFirstOrThrow({
        where: { source: 'LEVER', companySlug: 'lv--stripe' },
      })
    ).id;
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('source=ashby, source=greenhouse, and source=lever return only jobs of that source', async () => {
    const gh = await queryJobs(prisma, { source: 'greenhouse' });
    expect(gh.meta.total).toBe(2);
    expect(gh.data.every((j) => j.source === 'greenhouse')).toBe(true);

    const ashby = await queryJobs(prisma, { source: 'ashby' });
    expect(ashby.meta.total).toBe(3);
    expect(ashby.data.every((j) => j.source === 'ashby')).toBe(true);

    const lever = await queryJobs(prisma, { source: 'lever' });
    expect(lever.meta.total).toBe(2);
    expect(lever.data.every((j) => j.source === 'lever')).toBe(true);

    const all = await queryJobs(prisma, {});
    expect(all.meta.total).toBe(7);
  });

  it('source combines with search and company filters', async () => {
    const res = await queryJobs(prisma, { source: 'greenhouse', search: 'engineer 5' });
    expect(res.data.map((j) => j.externalId)).toEqual(['1005']);

    const leverSearch = await queryJobs(prisma, { source: 'lever', search: 'engineer 7' });
    expect(leverSearch.data.map((j) => j.externalId)).toEqual([
      '00000000-0000-4000-8000-000000001007',
    ]);

    const none = await queryJobs(prisma, { source: 'ashby', search: 'engineer 5' });
    expect(none.meta.total).toBe(0);

    const byCompany = await queryJobs(prisma, { source: 'greenhouse', company: 'gh--stripe' });
    expect(byCompany.data.map((j) => j.externalId)).toEqual(['1004']);

    const leverByCompany = await queryJobs(prisma, { source: 'lever', company: 'lv--stripe' });
    expect(leverByCompany.data.map((j) => j.externalId)).toEqual([
      '00000000-0000-4000-8000-000000001006',
    ]);
  });

  it('job list items expose source and externalId next to the legacy ashbyId', async () => {
    const res = await queryJobs(prisma, { source: 'greenhouse', company: 'gh--stripe' });
    expect(res.data[0]).toMatchObject({ source: 'greenhouse', externalId: '1004', ashbyId: 'greenhouse:1004' });

    const leverRes = await queryJobs(prisma, { source: 'lever', company: 'lv--stripe' });
    expect(leverRes.data[0]).toMatchObject({
      source: 'lever',
      externalId: '00000000-0000-4000-8000-000000001006',
      ashbyId: 'lever:00000000-0000-4000-8000-000000001006',
    });
  });

  it('facets count jobs per source across all three sources', async () => {
    const facets = await computeFacets(prisma);
    expect(facets.sources).toEqual([
      { value: 'ashby', count: 3 },
      { value: 'greenhouse', count: 2 },
      { value: 'lever', count: 2 },
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
    expect(byName.get('lv--stripe')).toMatchObject({
      source: 'lever',
      boardUrl: 'https://jobs.lever.co/stripe',
    });
    expect(byName.get('lv--arcteryx-com')).toMatchObject({
      source: 'lever',
      boardUrl: 'https://jobs.lever.co/arcteryx.com',
    });

    const ranked = await queryCompanies(prisma, { sort: 'jobs' });
    expect(ranked.data.find((c) => c.slug === 'gh--foo_bar')?.boardUrl).toBe('https://job-boards.greenhouse.io/foo_bar');
    expect(ranked.data.find((c) => c.slug === 'lv--arcteryx-com')?.boardUrl).toBe('https://jobs.lever.co/arcteryx.com');
  });

  it('same-token companies stay separate: stripe (Ashby, 3 jobs), gh--stripe (Greenhouse, 1 job), and lv--stripe (Lever, 1 job)', async () => {
    const ashbyProfile = await queryCompanyProfile(prisma, 'stripe');
    const ghProfile = await queryCompanyProfile(prisma, 'gh--stripe');
    const leverProfile = await queryCompanyProfile(prisma, 'lv--stripe');
    expect(ashbyProfile).toMatchObject({ source: 'ashby', jobCount: 3 });
    expect(ghProfile).toMatchObject({ source: 'greenhouse', jobCount: 1 });
    expect(leverProfile).toMatchObject({ source: 'lever', boardUrl: 'https://jobs.lever.co/stripe', jobCount: 1 });
  });

  it('a Greenhouse slug with an underscore and a Lever slug from dotted token are valid company profiles', async () => {
    const ghProfile = await queryCompanyProfile(prisma, 'gh--foo_bar');
    expect(ghProfile).toMatchObject({ slug: 'gh--foo_bar', source: 'greenhouse', jobCount: 1 });
    expect(ghProfile?.boardUrl).toBe('https://job-boards.greenhouse.io/foo_bar');

    const leverProfile = await queryCompanyProfile(prisma, 'lv--arcteryx-com');
    expect(leverProfile).toMatchObject({ slug: 'lv--arcteryx-com', source: 'lever', jobCount: 1 });
    expect(leverProfile?.boardUrl).toBe('https://jobs.lever.co/arcteryx.com');
  });

  it('job detail builds fallback job URL from atsToken for Greenhouse and Lever (never from prefixed slug)', async () => {
    const detail = await queryJobDetail(prisma, greenhouseJobId);
    expect(detail).toMatchObject({ source: 'greenhouse', externalId: '1004' });
    expect(detail?.jobUrl).toBe('https://job-boards.greenhouse.io/stripe/jobs/1004');
    expect(detail?.company).toMatchObject({
      source: 'greenhouse',
      boardUrl: 'https://job-boards.greenhouse.io/stripe',
    });

    const leverDetail = await queryJobDetail(prisma, leverJobId);
    expect(leverDetail).toMatchObject({
      source: 'lever',
      externalId: '00000000-0000-4000-8000-000000001006',
    });
    expect(leverDetail?.jobUrl).toBe('https://jobs.lever.co/stripe/00000000-0000-4000-8000-000000001006');
    expect(leverDetail?.company).toMatchObject({
      source: 'lever',
      boardUrl: 'https://jobs.lever.co/stripe',
    });
  });
});
