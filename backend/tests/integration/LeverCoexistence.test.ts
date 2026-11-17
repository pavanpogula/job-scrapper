/**
 * @file Multi-Source Ashby & Lever Coexistence Integration Test
 * @summary Proves on real Postgres that Ashby `spotify` and Lever `lv--spotify` coexist without cross-source deactivation or quarantine, shared UUID (source, externalId) uniqueness holds, and allocateCompanySlug handles collisions
 * @tags Integration, Postgres, Lever, Ashby, Coexistence, Slug, BF-024, ADR-0022
 */

import axios from 'axios';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { queryCompanies, queryCompanyProfile } from '../../src/api/db/queries';
import { AshbyScraper } from '../../src/core/Scraper';
import { runLeverDiscovery, saveLeverDiscoveryState } from '../../src/discovery/LeverDiscovery';
import {
  AtsClient,
  BoardFetchResult,
  BoardRef,
  CanonicalUrls,
  CompanyMetadataResult,
} from '../../src/lib/ats/AtsClient';
import { AtsSource } from '../../src/lib/ats/source';
import { normalizeAshbyJob } from '../../src/lib/ats/AshbyAtsClient';
import { LeverClient, LeverPosting, LeverSiteValidationStatus, normalizeLeverJob } from '../../src/lib/ats/LeverClient';
import { allocateCompanySlug } from '../../src/lib/ats/slug';

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
    return { status: 'ok', name: 'Spotify' };
  }

  public canonicalUrls(ref: BoardRef, externalId: string): CanonicalUrls {
    return {
      jobUrl: `https://example.com/${ref.atsToken}/${externalId}`,
      applyUrl: `https://example.com/${ref.atsToken}/${externalId}`,
      boardUrl: `https://example.com/${ref.atsToken}`,
    };
  }
}

describeIfDb('BF-024 / ADR-0022: Ashby spotify and Lever lv--spotify coexistence on real PostgreSQL', () => {
  let isolatedUrl: string;
  let prisma: PrismaClient;

  beforeAll(async () => {
    const url = new URL(TEST_DATABASE_URL as string);
    if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
      throw new Error(`TEST_DATABASE_URL must point to localhost, got ${url.hostname}`);
    }
    url.searchParams.set('schema', 'lever_coexist');
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

  it('coexists without cross-source deactivation/quarantine even when Ashby and Lever share a job UUID', async () => {
    const sharedUuid = '22222222-2222-4222-8222-222222222221';

    await prisma.company.createMany({
      data: [
        {
          slug: 'spotify',
          name: 'Spotify (Ashby)',
          source: 'ASHBY',
          atsToken: 'spotify',
          status: 'ACTIVE',
        },
        {
          slug: 'lv--spotify',
          name: 'Spotify (Lever)',
          source: 'LEVER',
          atsToken: 'spotify',
          status: 'ACTIVE',
        },
      ],
    });

    await prisma.job.createMany({
      data: [
        {
          ashbyId: sharedUuid,
          externalId: sharedUuid,
          source: 'ASHBY',
          title: 'Ashby Kept Role',
          companySlug: 'spotify',
          applyUrl: `https://jobs.ashbyhq.com/spotify/${sharedUuid}/application`,
          active: true,
          metadata: { _source: 'rest' },
          contentHash: 'hash-a1',
        },
        {
          ashbyId: 'ashby-spotify-stale',
          externalId: 'ashby-spotify-stale',
          source: 'ASHBY',
          title: 'Ashby Stale Role',
          companySlug: 'spotify',
          applyUrl: 'https://jobs.ashbyhq.com/spotify/ashby-spotify-stale/application',
          active: true,
          metadata: { _source: 'rest' },
          contentHash: 'hash-a2',
        },
        {
          ashbyId: `lever:${sharedUuid}`,
          externalId: sharedUuid,
          source: 'LEVER',
          title: 'Staff Backend Engineer',
          companySlug: 'lv--spotify',
          applyUrl: `https://jobs.lever.co/spotify/${sharedUuid}/apply`,
          active: true,
          metadata: { _source: 'rest', _ats: 'lever', _normVersion: 1 },
          contentHash: 'hash-lv1',
        },
        {
          ashbyId: 'lever:99999999-9999-4999-8999-999999999999',
          externalId: '99999999-9999-4999-8999-999999999999',
          source: 'LEVER',
          title: 'Lever Stale Role',
          companySlug: 'lv--spotify',
          applyUrl: 'https://jobs.lever.co/spotify/99999999-9999-4999-8999-999999999999/apply',
          active: true,
          metadata: { _source: 'rest', _ats: 'lever', _normVersion: 1 },
          contentHash: 'hash-lv99',
        },
      ],
    });

    const leverFixture = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../fixtures/lever/spotify.json'), 'utf8')
    ) as LeverPosting[];

    const ashbyStub = new StubAtsClient('ashby', async (ref) => {
      const norm = normalizeAshbyJob(
        {
          id: sharedUuid,
          title: 'Ashby Kept Role',
          department: 'Engineering',
          location: 'Stockholm',
          employmentType: 'FullTime',
          applyUrl: `https://jobs.ashbyhq.com/spotify/${sharedUuid}/application`,
          jobUrl: `https://jobs.ashbyhq.com/spotify/${sharedUuid}`,
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

    const leverStub = new StubAtsClient('lever', async (ref) => {
      const jobs = leverFixture
        .map((raw) => normalizeLeverJob(raw, ref))
        .filter((j): j is NonNullable<typeof j> => j !== null);
      return {
        slug: ref.slug,
        source: 'lever',
        jobs,
        notFound: false,
        fetchMode: 'primary',
      };
    });

    const clients = new Map<AtsSource, AtsClient>([
      ['ashby', ashbyStub],
      ['lever', leverStub],
    ]);

    // 1. Ashby-only scrape: deactivates ashby-spotify-stale, never touches lv--spotify jobs or company
    const scraper1 = new AshbyScraper({ clients, prisma });
    await scraper1.runAll({ sources: ['ashby'], saveTelemetry: false, publish: false });

    const leverCompanyAfterAshby = await prisma.company.findUnique({ where: { slug: 'lv--spotify' } });
    expect(leverCompanyAfterAshby?.lastCheckedAt).toBeNull();
    expect(leverCompanyAfterAshby?.status).toBe('ACTIVE');

    const afterAshby = await prisma.job.findMany({
      orderBy: { ashbyId: 'asc' },
      select: { ashbyId: true, companySlug: true, active: true },
    });
    expect(afterAshby).toEqual([
      { ashbyId: sharedUuid, companySlug: 'spotify', active: true },
      { ashbyId: 'ashby-spotify-stale', companySlug: 'spotify', active: false },
      { ashbyId: `lever:${sharedUuid}`, companySlug: 'lv--spotify', active: true },
      { ashbyId: 'lever:99999999-9999-4999-8999-999999999999', companySlug: 'lv--spotify', active: true },
    ]);

    // 2. Lever-only scrape: keeps lever:<uuid>, deactivates lever stale job, never touches Ashby spotify
    const scraper2 = new AshbyScraper({ clients, prisma });
    await scraper2.runAll({ sources: ['lever'], saveTelemetry: false, publish: false });

    const afterLever = await prisma.job.findMany({
      orderBy: { ashbyId: 'asc' },
      select: { ashbyId: true, externalId: true, source: true, companySlug: true, active: true },
    });
    expect(afterLever).toEqual([
      { ashbyId: sharedUuid, externalId: sharedUuid, source: 'ASHBY', companySlug: 'spotify', active: true },
      { ashbyId: 'ashby-spotify-stale', externalId: 'ashby-spotify-stale', source: 'ASHBY', companySlug: 'spotify', active: false },
      { ashbyId: `lever:${sharedUuid}`, externalId: sharedUuid, source: 'LEVER', companySlug: 'lv--spotify', active: true },
      { ashbyId: 'lever:99999999-9999-4999-8999-999999999999', externalId: '99999999-9999-4999-8999-999999999999', source: 'LEVER', companySlug: 'lv--spotify', active: false },
    ]);

    // 3. Quarantine isolation: 404 on Lever lv--spotify 3x quarantines lv--spotify only, leaves Ashby spotify ACTIVE
    const lever404 = new StubAtsClient('lever', async (ref) => ({
      slug: ref.slug,
      source: 'lever',
      jobs: [],
      notFound: true,
      fetchMode: 'none',
    }));
    const qClients = new Map<AtsSource, AtsClient>([['lever', lever404]]);
    for (let i = 0; i < 3; i++) {
      const qScraper = new AshbyScraper({ clients: qClients, prisma });
      await qScraper.runAll({ sources: ['lever'], slugs: ['lv--spotify'], saveTelemetry: false, publish: false });
    }
    const quarantinedLever = await prisma.company.findUnique({ where: { slug: 'lv--spotify' } });
    const ashbySpotify = await prisma.company.findUnique({ where: { slug: 'spotify' } });
    expect(quarantinedLever?.status).toBe('NOT_FOUND');
    expect(ashbySpotify?.status).toBe('ACTIVE');

    // 4. Duplicate (source, externalId) for LEVER fails
    await expect(
      prisma.job.create({
        data: {
          ashbyId: 'lever:duplicate-ext',
          externalId: sharedUuid,
          source: 'LEVER',
          title: 'Duplicate Lever UUID',
          companySlug: 'lv--spotify',
          applyUrl: `https://jobs.lever.co/spotify/${sharedUuid}/apply`,
          metadata: {},
          contentHash: 'dup',
        },
      })
    ).rejects.toThrow();
  });

  it('allocateCompanySlug derives lv--arcteryx-com, appends -2/-3 on collision, and reuses existing slug', async () => {
    const slug1 = await allocateCompanySlug(prisma, 'lever', 'arcteryx.com');
    expect(slug1).toBe('lv--arcteryx-com');

    await prisma.company.create({
      data: {
        slug: slug1,
        source: 'LEVER',
        atsToken: 'arcteryx.com',
        name: "Arc'teryx",
        status: 'ACTIVE',
      },
    });

    // Existing company keeps its slug
    const existingSlug = await allocateCompanySlug(prisma, 'lever', 'arcteryx.com');
    expect(existingSlug).toBe('lv--arcteryx-com');

    // Second distinct token sanitizing to the same base slug gets -2
    const slug2 = await allocateCompanySlug(prisma, 'lever', 'arcteryx_com');
    expect(slug2).toBe('lv--arcteryx-com-2');

    await prisma.company.create({
      data: {
        slug: slug2,
        source: 'LEVER',
        atsToken: 'arcteryx_com',
        name: 'Arcteryx Underscore',
        status: 'ACTIVE',
      },
    });

    // Third distinct token sanitizing to the same base slug gets -3
    const slug3 = await allocateCompanySlug(prisma, 'lever', 'arcteryx&com');
    expect(slug3).toBe('lv--arcteryx-com-3');
  });

  it('Lever discovery upserts collision-safe slugs idempotently, keeps assembly & Assembly distinct, preserves Ashby/GH rows, and hides empty Lever boards from /v1/companies', async () => {
    await prisma.company.createMany({
      data: [
        { slug: 'ashby-keep', name: 'Ashby Keep', source: 'ASHBY', atsToken: 'ashby-keep', status: 'ACTIVE' },
        { slug: 'gh--keep', name: 'Greenhouse Keep', source: 'GREENHOUSE', atsToken: 'keep', status: 'ACTIVE' },
      ],
    });

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lever-integ-'));
    const stateFilePath = path.join(tmpDir, 'state.json');

    const axiosSpy = jest.spyOn(axios, 'get').mockImplementation((async (url: string) => {
      if (url.includes('url=jobs.lever.co/a&')) {
        return {
          data: [
            ['original'],
            ['https://jobs.lever.co/assembly/1'],
            ['https://jobs.lever.co/Assembly/2'],
            ['https://jobs.lever.co/arcteryx.net/3'],
            ['https://jobs.lever.co/arcteryx_net/4'],
          ],
        };
      }
      return { data: [['original']] };
    }) as never);

    const fakeLeverClient = {
      validateSite: jest.fn().mockImplementation(async (): Promise<LeverSiteValidationStatus> => 'live'),
      fetchCompanyMetadata: jest.fn().mockImplementation(async (ref: BoardRef): Promise<CompanyMetadataResult> => ({
        status: 'ok',
        name: `Name ${ref.atsToken}`,
      })),
    } as unknown as LeverClient;

    try {
      const firstRun = await runLeverDiscovery({
        prismaClient: prisma,
        stateFilePath,
        leverClient: fakeLeverClient,
        prefixes: ['a'],
        waybackMinIntervalMs: 0,
        enrichMetadata: true,
        timeBudgetMs: 60_000,
      });

      expect(firstRun.live).toBe(4);
      expect(firstRun.inserted).toBe(4);

      const assemblyLower = await prisma.company.findUnique({
        where: { source_atsToken: { source: 'LEVER', atsToken: 'assembly' } },
      });
      const assemblyUpper = await prisma.company.findUnique({
        where: { source_atsToken: { source: 'LEVER', atsToken: 'Assembly' } },
      });
      const dotRow = await prisma.company.findUnique({
        where: { source_atsToken: { source: 'LEVER', atsToken: 'arcteryx.net' } },
      });
      const underRow = await prisma.company.findUnique({
        where: { source_atsToken: { source: 'LEVER', atsToken: 'arcteryx_net' } },
      });

      expect(assemblyLower?.slug).toBe('lv--assembly');
      expect(assemblyUpper?.slug).toBe('lv--assembly-2');
      expect(dotRow?.slug).toBe('lv--arcteryx-net');
      expect(underRow?.slug).toBe('lv--arcteryx-net-2');

      // Re-run with fresh state file to prove DB upsert is idempotent and preserves allocated slugs
      saveLeverDiscoveryState(
        {
          version: 1,
          harvest: { nextPrefix: 'a', resumeKey: null, completedAt: null },
          tokens: {},
        },
        stateFilePath
      );
      const secondRun = await runLeverDiscovery({
        prismaClient: prisma,
        stateFilePath,
        leverClient: fakeLeverClient,
        prefixes: ['a'],
        waybackMinIntervalMs: 0,
        timeBudgetMs: 60_000,
      });
      expect(secondRun.alreadyKnown).toBe(4);
      expect(secondRun.validated).toBe(0);
      expect(secondRun.inserted).toBe(0);

      // Direct allocateCompanySlug + upsert re-run keeps existing slug lv--assembly-2
      expect(await allocateCompanySlug(prisma, 'lever', 'Assembly')).toBe('lv--assembly-2');

      // Ashby and Greenhouse rows untouched
      const ashbyKeep = await prisma.company.findUnique({ where: { slug: 'ashby-keep' } });
      const ghKeep = await prisma.company.findUnique({ where: { slug: 'gh--keep' } });
      expect(ashbyKeep).toMatchObject({ source: 'ASHBY', name: 'Ashby Keep', status: 'ACTIVE' });
      expect(ghKeep).toMatchObject({ source: 'GREENHOUSE', name: 'Greenhouse Keep', status: 'ACTIVE' });

      // Empty Lever company (0 active jobs) is hidden from /v1/companies and /v1/companies/:slug
      const directory = await queryCompanies(prisma, { pageSize: 50 });
      expect(directory.data.some((c) => c.slug === 'lv--assembly')).toBe(false);
      expect(directory.data.some((c) => c.slug === 'lv--assembly-2')).toBe(false);
      expect(await queryCompanyProfile(prisma, 'lv--assembly')).toBeNull();
    } finally {
      axiosSpy.mockRestore();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
