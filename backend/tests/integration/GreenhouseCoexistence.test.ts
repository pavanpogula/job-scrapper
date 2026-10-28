/**
 * @file Multi-Source Ashby & Greenhouse Coexistence Integration Test
 * @summary Proves on real Postgres that Ashby `stripe` and Greenhouse `gh--stripe` coexist without cross-source deactivation or quarantine, and (source, externalId) uniqueness holds
 * @tags Integration, Postgres, Greenhouse, Ashby, Coexistence, BF-023, ADR-0021
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { AshbyScraper } from '../../src/core/Scraper';
import {
  AtsClient,
  BoardFetchResult,
  BoardRef,
  CanonicalUrls,
  CompanyMetadataResult,
} from '../../src/lib/ats/AtsClient';
import { AtsSource } from '../../src/lib/ats/source';
import { normalizeAshbyJob } from '../../src/lib/ats/AshbyAtsClient';
import {
  GreenhouseRawJob,
  normalizeGreenhouseJob,
} from '../../src/lib/ats/GreenhouseClient';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DATABASE_URL ? describe : describe.skip;

class StubAtsClient implements AtsClient {
  public constructor(
    public readonly source: AtsSource,
    private handler: (ref: BoardRef) => Promise<BoardFetchResult>
  ) {}

  public async fetchBoard(ref: BoardRef): Promise<BoardFetchResult> {
    return this.handler(ref);
  }

  public async fetchCompanyMetadata(_ref: BoardRef): Promise<CompanyMetadataResult> {
    return { status: 'ok', name: 'Stripe' };
  }

  public canonicalUrls(ref: BoardRef, externalId: string): CanonicalUrls {
    return {
      jobUrl: `https://example.com/${ref.atsToken}/${externalId}`,
      applyUrl: `https://example.com/${ref.atsToken}/${externalId}`,
      boardUrl: `https://example.com/${ref.atsToken}`,
    };
  }
}

describeIfDb('BF-023 / ADR-0021: Ashby stripe and Greenhouse gh--stripe coexistence on real PostgreSQL', () => {
  let isolatedUrl: string;
  let prisma: PrismaClient;

  beforeAll(async () => {
    const url = new URL(TEST_DATABASE_URL as string);
    if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
      throw new Error(`TEST_DATABASE_URL must point to localhost, got ${url.hostname}`);
    }
    url.searchParams.set('schema', 'gh_coexist');
    isolatedUrl = url.toString();

    execSync('npx prisma db push --skip-generate --force-reset', {
      cwd: path.resolve(__dirname, '../..'),
      env: { ...process.env, DATABASE_URL: isolatedUrl },
      stdio: 'pipe',
    });

    prisma = new PrismaClient({ datasources: { db: { url: isolatedUrl } } });
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('coexists without cross-source deactivation or quarantine and enforces (source, externalId) uniqueness', async () => {
    // 1. Seed Ashby `stripe` and Greenhouse `gh--stripe` sharing atsToken = 'stripe'
    await prisma.company.createMany({
      data: [
        {
          slug: 'stripe',
          name: 'Stripe (Ashby)',
          source: 'ASHBY',
          atsToken: 'stripe',
          status: 'ACTIVE',
        },
        {
          slug: 'gh--stripe',
          name: 'Stripe (Greenhouse)',
          source: 'GREENHOUSE',
          atsToken: 'stripe',
          status: 'ACTIVE',
        },
      ],
    });

    // Seed initial active jobs for both
    await prisma.job.createMany({
      data: [
        {
          ashbyId: 'ashby-stripe-1',
          externalId: 'ashby-stripe-1',
          source: 'ASHBY',
          title: 'Ashby Kept Role',
          companySlug: 'stripe',
          applyUrl: 'https://jobs.ashbyhq.com/stripe/ashby-stripe-1/application',
          active: true,
          metadata: { _source: 'rest' },
          contentHash: 'hash-a1',
        },
        {
          ashbyId: 'ashby-stripe-2',
          externalId: 'ashby-stripe-2',
          source: 'ASHBY',
          title: 'Ashby Stale Role',
          companySlug: 'stripe',
          applyUrl: 'https://jobs.ashbyhq.com/stripe/ashby-stripe-2/application',
          active: true,
          metadata: { _source: 'rest' },
          contentHash: 'hash-a2',
        },
        {
          ashbyId: 'greenhouse:9100001',
          externalId: '9100001',
          source: 'GREENHOUSE',
          title: 'Distributed Systems Engineer',
          companySlug: 'gh--stripe',
          applyUrl: 'https://job-boards.greenhouse.io/stripe/jobs/9100001',
          active: true,
          metadata: { _source: 'rest', _ats: 'greenhouse', _normVersion: 1 },
          contentHash: 'hash-gh1',
        },
        {
          ashbyId: 'greenhouse:9100099',
          externalId: '9100099',
          source: 'GREENHOUSE',
          title: 'Greenhouse Stale Role',
          companySlug: 'gh--stripe',
          applyUrl: 'https://job-boards.greenhouse.io/stripe/jobs/9100099',
          active: true,
          metadata: { _source: 'rest', _ats: 'greenhouse', _normVersion: 1 },
          contentHash: 'hash-gh99',
        },
      ],
    });

    const ghFixture = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, '../fixtures/greenhouse/board-multi-location.json'),
        'utf8'
      )
    ) as { jobs: GreenhouseRawJob[] };

    const ashbyStub = new StubAtsClient('ashby', async (ref) => {
      const norm = normalizeAshbyJob(
        {
          id: 'ashby-stripe-1',
          title: 'Ashby Kept Role',
          department: 'Engineering',
          location: 'San Francisco, CA',
          employmentType: 'FullTime',
          applyUrl: 'https://jobs.ashbyhq.com/stripe/ashby-stripe-1/application',
          jobUrl: 'https://jobs.ashbyhq.com/stripe/ashby-stripe-1',
          isRemote: false,
        },
        ref.slug,
        'rest'
      )!;
      return {
        slug: ref.slug,
        source: 'ashby',
        jobs: [norm],
        notFound: false,
        fetchMode: 'primary',
      };
    });

    const ghStub = new StubAtsClient('greenhouse', async (ref) => {
      // Return only the first 2 jobs from fixture (9100001 and 9100002), omitting 9100099
      const jobs = ghFixture.jobs
        .slice(0, 2)
        .map((raw) => normalizeGreenhouseJob(raw, ref))
        .filter((j): j is NonNullable<typeof j> => j !== null);
      return {
        slug: ref.slug,
        source: 'greenhouse',
        jobs,
        notFound: false,
        fetchMode: 'primary',
      };
    });

    const clients = new Map<AtsSource, AtsClient>([
      ['ashby', ashbyStub],
      ['greenhouse', ghStub],
    ]);

    // 2. Scrape Ashby only: deactivates ashby-stripe-2, keeps ashby-stripe-1, NEVER touches gh--stripe jobs
    const scraper1 = new AshbyScraper({ clients, prisma });
    await scraper1.runAll({
      sources: ['ashby'],
      saveTelemetry: false,
      publish: false,
    });

    const afterAshbyScrape = await prisma.job.findMany({
      orderBy: { ashbyId: 'asc' },
      select: { ashbyId: true, companySlug: true, active: true },
    });
    expect(afterAshbyScrape).toEqual([
      { ashbyId: 'ashby-stripe-1', companySlug: 'stripe', active: true },
      { ashbyId: 'ashby-stripe-2', companySlug: 'stripe', active: false },
      { ashbyId: 'greenhouse:9100001', companySlug: 'gh--stripe', active: true },
      { ashbyId: 'greenhouse:9100099', companySlug: 'gh--stripe', active: true },
    ]);

    // 3. Scrape Greenhouse only: keeps greenhouse:9100001, creates greenhouse:9100002, deactivates greenhouse:9100099, NEVER touches Ashby stripe
    const scraper2 = new AshbyScraper({ clients, prisma });
    await scraper2.runAll({
      sources: ['greenhouse'],
      saveTelemetry: false,
      publish: false,
    });

    const afterGhScrape = await prisma.job.findMany({
      orderBy: { ashbyId: 'asc' },
      select: { ashbyId: true, externalId: true, source: true, companySlug: true, active: true },
    });
    expect(afterGhScrape).toEqual([
      { ashbyId: 'ashby-stripe-1', externalId: 'ashby-stripe-1', source: 'ASHBY', companySlug: 'stripe', active: true },
      { ashbyId: 'ashby-stripe-2', externalId: 'ashby-stripe-2', source: 'ASHBY', companySlug: 'stripe', active: false },
      { ashbyId: 'greenhouse:9100001', externalId: '9100001', source: 'GREENHOUSE', companySlug: 'gh--stripe', active: true },
      { ashbyId: 'greenhouse:9100002', externalId: '9100002', source: 'GREENHOUSE', companySlug: 'gh--stripe', active: true },
      { ashbyId: 'greenhouse:9100099', externalId: '9100099', source: 'GREENHOUSE', companySlug: 'gh--stripe', active: false },
    ]);

    // 4. Verify (source, externalId) uniqueness holds on Job and (source, atsToken) uniqueness holds on Company
    await expect(
      prisma.job.create({
        data: {
          ashbyId: 'greenhouse:duplicate-ext',
          externalId: '9100001',
          source: 'GREENHOUSE',
          title: 'Duplicate External ID',
          companySlug: 'gh--stripe',
          applyUrl: 'https://job-boards.greenhouse.io/stripe/jobs/9100001',
          metadata: {},
          contentHash: 'dup-hash',
        },
      })
    ).rejects.toThrow();

    await expect(
      prisma.company.create({
        data: {
          slug: 'gh--stripe-dup',
          name: 'Duplicate Token',
          source: 'GREENHOUSE',
          atsToken: 'stripe',
        },
      })
    ).rejects.toThrow();
  });

  it('G5: upserts Greenhouse company with gh-- slug, is idempotent on re-run, and leaves Ashby rows untouched', async () => {
    // Record current Ashby companies
    const initialAshby = await prisma.company.findMany({
      where: { source: 'ASHBY' },
      orderBy: { slug: 'asc' },
    });

    // 1. Initial upsert of a discovered Greenhouse token
    const token = 'airbnb';
    const slug = `gh--${token}`;
    const firstUpsert = await prisma.company.upsert({
      where: {
        source_atsToken: {
          source: 'GREENHOUSE',
          atsToken: token,
        },
      },
      create: {
        slug,
        source: 'GREENHOUSE',
        atsToken: token,
        name: 'Airbnb Initial',
        status: 'ACTIVE',
      },
      update: {
        name: 'Airbnb Initial',
        status: 'ACTIVE',
      },
    });

    expect(firstUpsert.slug).toBe('gh--airbnb');
    expect(firstUpsert.source).toBe('GREENHOUSE');
    expect(firstUpsert.atsToken).toBe('airbnb');
    expect(firstUpsert.name).toBe('Airbnb Initial');

    // 2. Idempotent re-run with updated name
    const secondUpsert = await prisma.company.upsert({
      where: {
        source_atsToken: {
          source: 'GREENHOUSE',
          atsToken: token,
        },
      },
      create: {
        slug,
        source: 'GREENHOUSE',
        atsToken: token,
        name: 'Airbnb Updated',
        status: 'ACTIVE',
      },
      update: {
        name: 'Airbnb Updated',
        status: 'ACTIVE',
      },
    });

    expect(secondUpsert.id).toBe(firstUpsert.id);
    expect(secondUpsert.slug).toBe('gh--airbnb');
    expect(secondUpsert.name).toBe('Airbnb Updated');

    // 3. Verify Ashby companies remain completely untouched
    const afterAshby = await prisma.company.findMany({
      where: { source: 'ASHBY' },
      orderBy: { slug: 'asc' },
    });
    expect(afterAshby).toEqual(initialAshby);
  });
});
