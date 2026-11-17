/**
 * @file LeverClient, Normalizer, Pacer, Board Cap & Deadline Unit Test Suite
 * @summary Tests Lever Postings API fetching, global pacer, retry/404/429/unexpected_body handling, job normalization, commitment/salary mapping, HTML/logo extraction, selectCompanies, leverDeadlineMs, deactivation safety, and seedLever
 * @tags Unit Test, Lever, AtsClient, Normalizer, Pacer, BF-024, ADR-0022
 */

import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import * as childProcess from 'child_process';
import axios from 'axios';
import {
  extractLeverLogo,
  LeverClient,
  LeverPosting,
  normalizeLeverJob,
} from '../../src/lib/ats/LeverClient';
import { BoardRef } from '../../src/lib/ats/AtsClient';
import { BROWSER_HEADERS } from '../../src/lib/AshbyClient';
import { ValidationIssue } from '../../src/lib/Sanitizer';
import { AshbyScraper, computeJobContentHash } from '../../src/core/Scraper';
import { selectCompanies } from '../../src/core/selectCompanies';
import { runWorkerShard } from '../../src/core/ClusterScraper';
import { seedLever } from '../../src/utils/SeedLever';
import { createStatefulPrisma } from '../helpers/prismaFactory';
import { mockCompany, mockDepartment, mockJob, mockLocation } from '../../__mocks__/@prisma/client';
import type { PrismaClient } from '@prisma/client';

jest.mock('axios');
jest.mock('child_process', () => {
  const actual = jest.requireActual('child_process');
  return {
    ...actual,
    fork: jest.fn(),
  };
});
const mockedAxios = axios as jest.Mocked<typeof axios>;

const FIXTURES_DIR = path.join(__dirname, '../fixtures/lever');

function readJsonFixture<T>(filename: string): T {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, filename), 'utf8')) as T;
}

function readTextFixture(filename: string): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, filename), 'utf8');
}

describe('LeverClient & normalizeLeverJob (BF-024)', () => {
  const palantirRef: BoardRef = { slug: 'lv--palantir', source: 'lever', atsToken: 'palantir' };
  const spotifyRef: BoardRef = { slug: 'lv--spotify', source: 'lever', atsToken: 'spotify' };
  const outreachRef: BoardRef = { slug: 'lv--outreach', source: 'lever', atsToken: 'outreach' };
  const matchRef: BoardRef = { slug: 'lv--matchgroup', source: 'lever', atsToken: 'matchgroup' };
  const aiFundRef: BoardRef = { slug: 'lv--aifund', source: 'lever', atsToken: 'AIFund' };
  const appenRef: BoardRef = { slug: 'lv--appen', source: 'lever', atsToken: 'appen' };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.isAxiosError.mockImplementation((e: unknown) =>
      Boolean(e && typeof e === 'object' && 'isAxiosError' in e)
    );
  });

  describe('normalizeLeverJob field mapping & sanitization', () => {
    it('maps externalId, lever:<uuid> legacyKey, department->team fallback, createdAt ISO, and lists/additional HTML', () => {
      const postings = readJsonFixture<LeverPosting[]>('palantir.json');
      const issues: ValidationIssue[] = [];
      const norm = normalizeLeverJob(postings[0], palantirRef, issues);

      expect(norm).not.toBeNull();
      if (!norm) throw new Error('Expected normalized job');

      expect(norm.externalId).toBe('11111111-1111-4111-8111-111111111111');
      expect(norm.legacyKey).toBe('lever:11111111-1111-4111-8111-111111111111');
      expect(norm.title).toBe('Software Engineer Intern');
      // department absent -> falls back to team; team becomes null
      expect(norm.department).toBe('Foundry Platform');
      expect(norm.team).toBeNull();
      expect(norm.location).toBe('New York, NY');
      expect(norm.secondaryLocations).toEqual([{ location: 'Palo Alto, CA' }]);
      expect(norm.country).toBe('US');
      expect(norm.region).toBe('NY');
      expect(norm.city).toBe('New York');
      expect(norm.workplaceType).toBe('OnSite');
      expect(norm.isRemote).toBe(false);
      expect(norm.employmentType).toBe('Intern');
      expect(norm.publishedAt?.toISOString()).toBe('2026-08-11T17:38:11.368Z');
      expect(norm.sourceUpdatedAt).toBeNull();
      expect(norm.isListed).toBe(true);

      // Description combines description + escaped list headings + <ul><li> + additional
      expect(norm.descriptionHtml).toContain('Build core infrastructure at Palantir.');
      expect(norm.descriptionHtml).toContain('<h3>What You&#39;ll Do &amp; Build</h3>');
      expect(norm.descriptionHtml).toContain('<ul><li>Design distributed pipelines</li>');
      expect(norm.descriptionHtml).toContain('Palantir is an equal opportunity employer.');
      expect(norm.descriptionPlain).toContain("What You'll Do & Build");

      // Metadata drops raw narrative blocks and matches normalized values
      expect(norm.raw._source).toBe('rest');
      expect(norm.raw._ats).toBe('lever');
      expect(norm.raw._normVersion).toBe(1);
      expect(norm.raw.team).toEqual(norm.team);
      expect(norm.raw.secondaryLocations).toEqual(norm.secondaryLocations);
      expect(norm.raw.descriptionHtml).toBe(norm.descriptionHtml);
      expect(norm.raw.descriptionPlain).toBe(norm.descriptionPlain);
      expect(norm.raw.lists).toBeUndefined();
      expect(norm.raw.opening).toBeUndefined();
      expect(norm.raw.openingPlain).toBeUndefined();
      expect(norm.raw.descriptionBody).toBeUndefined();
      expect(norm.raw.descriptionBodyPlain).toBeUndefined();
      expect(norm.raw.additional).toBeUndefined();
      expect(norm.raw.additionalPlain).toBeUndefined();
      expect(norm.raw.salaryDescription).toBeUndefined();
      expect(norm.raw.salaryDescriptionPlain).toBeUndefined();
      expect(norm.raw.description).toBeUndefined();
    });

    it('keeps department + team when both are set, wraps div lists without <ul>, and resolves remote workplace', () => {
      const postings = readJsonFixture<LeverPosting[]>('spotify.json');
      const norm = normalizeLeverJob(postings[0], spotifyRef)!;

      expect(norm.department).toBe('Engineering');
      expect(norm.team).toBe('Audio Streaming');
      expect(norm.raw.team).toBe('Audio Streaming');
      expect(norm.location).toBe('Stockholm, Sweden');
      expect(norm.secondaryLocations).toEqual([
        { location: 'New York, NY' },
        { location: 'London, United Kingdom' },
      ]);
      expect(norm.raw.secondaryLocations).toEqual(norm.secondaryLocations);
      expect(norm.country).toBe('SE');
      expect(norm.workplaceType).toBe('Remote');
      expect(norm.isRemote).toBe(true);
      expect(norm.employmentType).toBe('FullTime');
      expect(norm.descriptionHtml).toContain('<h3>What You&#39;ll Do</h3>');
      expect(norm.descriptionHtml).toContain('<div>Architect low-latency services</div>');
      expect(norm.descriptionHtml).not.toContain('<ul><div>');
    });

    it('returns null and records filtered issue when id or title is missing', () => {
      const issues: ValidationIssue[] = [];
      expect(normalizeLeverJob({ text: 'Engineer' }, spotifyRef, issues)).toBeNull();
      expect(normalizeLeverJob({ id: 'abc-123', text: '   ' }, spotifyRef, issues)).toBeNull();
      expect(issues).toHaveLength(2);
      expect(issues.every((i) => i.action === 'filtered')).toBe(true);
    });

    it('handles missing location, empty allLocations, missing team, null country, and unspecified+remote', () => {
      const postings = readJsonFixture<LeverPosting[]>('matchgroup.json');
      const noLocJob = normalizeLeverJob(postings[1], matchRef)!;

      expect(noLocJob.department).toBe('');
      expect(noLocJob.team).toBeNull();
      expect(noLocJob.location).toBe('');
      expect(noLocJob.secondaryLocations).toEqual([]);
      expect(noLocJob.country).toBeNull();
      expect(noLocJob.postal).toBeNull();
      // commitment "Full-time: Remote" triggers isRemote=true and workplaceType="Remote" for unspecified
      expect(noLocJob.isRemote).toBe(true);
      expect(noLocJob.workplaceType).toBe('Remote');
      expect(noLocJob.employmentType).toBe('FullTime');

      const unspecifiedNoRemote = normalizeLeverJob(
        { id: 'u-1', text: 'Analyst', workplaceType: 'unspecified' },
        matchRef
      )!;
      expect(unspecifiedNoRemote.isRemote).toBe(false);
      expect(unspecifiedNoRemote.workplaceType).toBeNull();

      const onSiteJob = normalizeLeverJob(postings[0], matchRef)!;
      expect(onSiteJob.workplaceType).toBe('OnSite');
    });

    it('maps every verified commitment string to decision-11 values and never maps International to Intern', () => {
      const cases: Array<[string, string | null]> = [
        ['Full-time', 'FullTime'],
        ['Full-Time', 'FullTime'],
        ['Permanent', 'FullTime'],
        ['Internship', 'Intern'],
        ['Contract', 'Contract'],
        ['Fixed-Term', 'Temporary'],
        ['Short Term', 'Temporary'],
        ['Scholarship', 'Intern'],
        ['Full-time: Remote', 'FullTime'],
        ['Full Time/Part Time', 'FullTime'],
        ['Seasonal', 'Temporary'],
        ['Freelance', 'Contract'],
        ['Temp Full-time', 'Temporary'],
        ['PT Temp/Seasonal', 'Temporary'],
        ['Part-time', 'PartTime'],
        ['PT', 'PartTime'],
        ['International', null],
      ];

      for (let i = 0; i < cases.length; i++) {
        const [commitment, expected] = cases[i];
        const job = normalizeLeverJob(
          { id: `commit-${i}`, text: 'Software Engineer', categories: { commitment } },
          spotifyRef
        )!;
        expect(job.employmentType).toBe(expected);
      }

      const titleFallback = normalizeLeverJob(
        { id: 't-1', text: 'Software Engineering Intern' },
        spotifyRef
      )!;
      expect(titleFallback.employmentType).toBe('Intern');
    });

    it('maps yearly, monthly, hourly salaries as given and drops one-time salaryRange', () => {
      const outreach = normalizeLeverJob(readJsonFixture<LeverPosting[]>('outreach.json')[0], outreachRef)!;
      expect(outreach.salary).toEqual({
        min: 150000,
        max: 190000,
        currency: 'USD',
        interval: '1 YEAR',
      });
      expect(outreach.descriptionHtml).toContain('Base salary range is $150,000 - $190,000 plus equity.');
      expect(outreach.descriptionHtml).toContain('Outreach EEO statement: all qualified applicants welcome.');

      const match = normalizeLeverJob(readJsonFixture<LeverPosting[]>('matchgroup.json')[0], matchRef)!;
      expect(match.salary).toEqual({
        min: 25,
        max: 32,
        currency: 'USD',
        interval: '1 HOUR',
      });

      const aprio = normalizeLeverJob(readJsonFixture<LeverPosting[]>('aprio-or-aifund.json')[0], aiFundRef)!;
      expect(aprio.salary).toEqual({
        min: 45000,
        max: 60000,
        currency: 'PHP',
        interval: '1 MONTH',
      });

      const appen = normalizeLeverJob(readJsonFixture<LeverPosting[]>('appen.json')[0], appenRef)!;
      expect(appen.salary).toEqual({
        min: null,
        max: null,
        currency: null,
        interval: null,
      });
      expect(appen.employmentType).toBe('Contract');
    });

    it('strips script tags and escapes special characters in list headings', () => {
      const job = normalizeLeverJob(
        {
          id: 'xss-1',
          text: 'Security Engineer',
          description: '<p>Intro</p><script>alert(1)</script>',
          lists: [{ text: 'Perks <script> & "More"', content: '<li>Health</li>' }],
        },
        spotifyRef
      )!;

      expect(job.descriptionHtml).not.toContain('<script');
      expect(job.descriptionHtml).toContain('<h3>Perks &lt;script&gt; &amp; &quot;More&quot;</h3>');
      expect(job.descriptionHtml).toContain('<ul><li>Health</li></ul>');
    });

    it('computes deterministic contentHash and rebuilds metadata identically', () => {
      const posting = readJsonFixture<LeverPosting[]>('outreach.json')[0];
      const norm1 = normalizeLeverJob(posting, outreachRef)!;
      const norm2 = normalizeLeverJob(posting, outreachRef)!;

      const hashOf = (n: typeof norm1) =>
        computeJobContentHash({
          title: n.title,
          location: n.location || null,
          department: n.department || null,
          salary: n.salary,
          isRemote: n.isRemote,
          workplaceType: n.workplaceType || null,
          employmentType: n.employmentType || null,
          publishedAt: n.publishedAt || null,
          applyUrl: n.applyUrl,
          isListed: n.isListed,
          country: n.country || null,
          region: n.region || null,
          city: n.city || null,
          descriptionHtml: n.descriptionHtml || '',
          descriptionPlain: n.descriptionPlain || '',
          team: n.team ?? null,
          secondaryLocations: n.secondaryLocations ?? [],
        });

      expect(hashOf(norm1)).toBe(hashOf(norm2));
    });

    it('builds fallback jobUrl and applyUrl from atsToken when hostedUrl/applyUrl are missing or unsafe', () => {
      const ref: BoardRef = { slug: 'lv--1840-company', source: 'lever', atsToken: '1840&Company' };
      const norm = normalizeLeverJob(
        { id: 'job-99', text: 'Consultant', hostedUrl: 'javascript:alert(1)', applyUrl: '' },
        ref
      )!;
      expect(norm.jobUrl).toBe('https://jobs.lever.co/1840%26Company/job-99');
      expect(norm.applyUrl).toBe('https://jobs.lever.co/1840%26Company/job-99/apply');
    });
  });

  describe('LeverClient HTTP, pacing, validation & metadata', () => {
    it('requests case-sensitive and URL-encoded tokens with BROWSER_HEADERS and dedupes duplicate posting IDs', async () => {
      const client = new LeverClient({ minIntervalMs: 0 });
      const postings = readJsonFixture<LeverPosting[]>('spotify.json');
      const duplicated = [postings[0], { ...postings[0] }];

      mockedAxios.get.mockResolvedValueOnce({ status: 200, data: duplicated });
      const resAIFund = await client.fetchBoard(aiFundRef);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://api.lever.co/v0/postings/AIFund?mode=json',
        expect.objectContaining({ headers: BROWSER_HEADERS })
      );
      expect(resAIFund.jobs).toHaveLength(1);
      expect(resAIFund.validationIssues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'id', action: 'filtered', reason: expect.stringContaining('Duplicate') }),
        ])
      );

      mockedAxios.get.mockResolvedValueOnce({ status: 200, data: postings });
      const companyRef: BoardRef = { slug: 'lv--1840-company', source: 'lever', atsToken: '1840&Company' };
      await client.fetchBoard(companyRef);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://api.lever.co/v0/postings/1840%26Company?mode=json',
        expect.objectContaining({ headers: BROWSER_HEADERS })
      );
    });

    it('handles 404, empty board, unexpected_body 200, 429 Retry-After cap at 10s, and 5xx exhaustion', async () => {
      const client = new LeverClient({ minIntervalMs: 0 });

      // 404 -> notFound
      mockedAxios.get.mockRejectedValueOnce({
        isAxiosError: true,
        response: { status: 404, data: readJsonFixture('notfound.json') },
      });
      const r404 = await client.fetchBoard(spotifyRef);
      expect(r404.notFound).toBe(true);
      expect(r404.rateLimited).toBe(false);
      expect(r404.fetchMode).toBe('none');

      // 200 [] -> empty board
      mockedAxios.get.mockResolvedValueOnce({ status: 200, data: readJsonFixture('empty.json') });
      const rEmpty = await client.fetchBoard(spotifyRef);
      expect(rEmpty.notFound).toBe(false);
      expect(rEmpty.fetchMode).toBe('primary');
      expect(rEmpty.jobs).toEqual([]);

      // 200 non-array -> unexpected_body
      mockedAxios.get.mockResolvedValueOnce({ status: 200, data: { ok: true } });
      const rUnexpected = await client.fetchBoard(spotifyRef);
      expect(rUnexpected.fetchMode).toBe('none');
      expect(rUnexpected.failure).toEqual({
        kind: 'http',
        status: 200,
        code: 'unexpected_body',
        attempts: 1,
      });

      // 5xx retry exhaustion -> failure, rateLimited=false
      mockedAxios.get.mockRejectedValue({ isAxiosError: true, response: { status: 503 } });
      const r5xx = await client.fetchBoard(spotifyRef, { maxRetries: 2, baseDelayMs: 1 });
      expect(r5xx.rateLimited).toBe(false);
      expect(r5xx.failure).toEqual({ kind: 'http', status: 503, code: 'http/503/3', attempts: 3 });
      mockedAxios.get.mockReset();
      mockedAxios.isAxiosError.mockImplementation((e: unknown) =>
        Boolean(e && typeof e === 'object' && 'isAxiosError' in e)
      );

      // 429 Retry-After: 30 -> capped at 10s
      const timeoutSpy = jest.spyOn(global, 'setTimeout');
      mockedAxios.get
        .mockRejectedValueOnce({
          isAxiosError: true,
          response: { status: 429, headers: { 'retry-after': '30' } },
        })
        .mockResolvedValueOnce({ status: 200, data: [] });

      // Replace setTimeout temporarily for instant resolution while inspecting requested delay
      timeoutSpy.mockImplementation(((cb: (...args: unknown[]) => void, _ms?: number) => {
        cb();
        return 0 as unknown as NodeJS.Timeout;
      }) as typeof setTimeout);
      try {
        const r429 = await client.fetchBoard(spotifyRef, { maxRetries: 1, baseDelayMs: 100 });
        expect(r429.rateLimited).toBe(true);
        expect(timeoutSpy).toHaveBeenCalledWith(expect.any(Function), 10000);
      } finally {
        timeoutSpy.mockRestore();
      }
    });

    it('validateSite distinguishes live, empty, not_found, and dead_board', async () => {
      const client = new LeverClient({ minIntervalMs: 0 });
      const postings = readJsonFixture<LeverPosting[]>('spotify.json');

      // live
      mockedAxios.get
        .mockResolvedValueOnce({ status: 200, data: postings })
        .mockResolvedValueOnce({ status: 200, data: readTextFixture('board-spotify.html') });
      expect(await client.validateSite('spotify')).toBe('live');

      // empty
      mockedAxios.get.mockResolvedValueOnce({ status: 200, data: [] });
      expect(await client.validateSite('whoop')).toBe('empty');

      // not_found
      mockedAxios.get.mockRejectedValueOnce({ isAxiosError: true, response: { status: 404 } });
      expect(await client.validateSite('unknown-site')).toBe('not_found');

      // dead_board (API returns postings, hosted page returns 404)
      mockedAxios.get
        .mockResolvedValueOnce({ status: 200, data: postings })
        .mockRejectedValueOnce({ isAxiosError: true, response: { status: 404 } });
      expect(await client.validateSite('AIFund')).toBe('dead_board');
    });

    it('extracts company name and logo from hosted HTML on both S3 hosts, never og:image, and sends HTML Accept header', async () => {
      const client = new LeverClient({ minIntervalMs: 0 });

      // Regional S3 host (us-west-2) + default no-options fetchCompanyMetadata(ref) returns logo
      mockedAxios.get.mockResolvedValueOnce({ status: 200, data: readTextFixture('board-spotify.html') });
      const metaSpotify = await client.fetchCompanyMetadata(spotifyRef);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://jobs.lever.co/spotify',
        expect.objectContaining({
          headers: expect.objectContaining({
            Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
          }),
        })
      );
      expect(metaSpotify).toEqual({
        status: 'ok',
        name: 'Spotify',
        logoUrl: 'https://lever-client-logos.s3.us-west-2.amazonaws.com/spotify-header-logo.png',
      });

      // Regionless S3 host (lever-client-logos.s3.amazonaws.com) + title entity decoding
      mockedAxios.get.mockResolvedValueOnce({ status: 200, data: readTextFixture('board-arcteryx.html') });
      const metaArc = await client.fetchCompanyMetadata({
        slug: 'lv--arcteryx-com',
        source: 'lever',
        atsToken: 'arcteryx.com',
      });
      expect(metaArc).toEqual({
        status: 'ok',
        name: "Arc'teryx & Co",
        logoUrl: 'https://lever-client-logos.s3.amazonaws.com/arcteryx-logo.png',
      });

      // Banner-only page (only og:image on same S3 host) -> logoUrl is undefined
      const bannerOnlyHtml = `
        <html><head><title>BannerCo</title>
        <meta property="og:image" content="https://lever-client-logos.s3.us-west-2.amazonaws.com/banner.png" />
        </head><body></body></html>
      `;
      expect(extractLeverLogo(bannerOnlyHtml)).toBeUndefined();

      // includeLogo: false skips logo extraction
      mockedAxios.get.mockResolvedValueOnce({ status: 200, data: readTextFixture('board-spotify.html') });
      const metaNoLogo = await client.fetchCompanyMetadata(spotifyRef, { includeLogo: false });
      expect(metaNoLogo).toEqual({ status: 'ok', name: 'Spotify', logoUrl: undefined });
    });

    it('paces every request start (including retries) with fake timers: 1000, 3000, 5000', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(0);
      try {
        const client = new LeverClient({ minIntervalMs: 2000, initialDelayMs: 1000 });
        const startTimes: number[] = [];

        mockedAxios.get
          .mockImplementationOnce(async () => {
            startTimes.push(Date.now());
            return { status: 200, data: [] };
          })
          .mockImplementationOnce(async () => {
            startTimes.push(Date.now());
            throw { isAxiosError: true, response: { status: 503 } };
          })
          .mockImplementationOnce(async () => {
            startTimes.push(Date.now());
            return { status: 200, data: [] };
          });

        const p1 = client.fetchBoard(spotifyRef, { maxRetries: 0 });
        const p2 = client.fetchBoard(palantirRef, { maxRetries: 1, baseDelayMs: 50 });

        await jest.advanceTimersByTimeAsync(1000);
        await p1;
        expect(startTimes).toEqual([1000]);

        await jest.advanceTimersByTimeAsync(2000);
        expect(startTimes).toEqual([1000, 3000]);

        await jest.advanceTimersByTimeAsync(2000);
        await p2;
        expect(startTimes).toEqual([1000, 3000, 5000]);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('Scraper deadline, deactivation safety, selectCompanies & seedLever', () => {
    it('stops starting new Lever boards after leverDeadlineMs, leaving unstarted rows untouched and counting skippedByDeadline', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(0);
      try {
        const factory = createStatefulPrisma({
          companies: [
            { slug: 'lv--spotify', source: 'LEVER', atsToken: 'spotify', status: 'ACTIVE' },
            { slug: 'lv--palantir', source: 'LEVER', atsToken: 'palantir', status: 'ACTIVE' },
            { slug: 'lv--zoox', source: 'LEVER', atsToken: 'zoox', status: 'ACTIVE' },
          ],
        });

        let fetchedCount = 0;
        const stubClient = {
          source: 'lever' as const,
          fetchBoard: jest.fn(async (ref: BoardRef) => {
            fetchedCount++;
            // Simulate elapsed time advancing past the 1500ms deadline during the first board
            await new Promise((r) => setTimeout(r, 2000));
            return {
              slug: ref.slug,
              source: 'lever' as const,
              jobs: [],
              notFound: false,
              fetchMode: 'primary' as const,
            };
          }),
          fetchCompanyMetadata: jest.fn(),
          canonicalUrls: jest.fn(),
        };

        const scraper = new AshbyScraper({
          prisma: factory as unknown as PrismaClient,
          clients: new Map([['lever', stubClient]]),
          leverDeadlineMs: 1500,
        });

        const runPromise = scraper.runAll({
          sources: ['lever'],
          publish: false,
          saveTelemetry: false,
        });

        await jest.advanceTimersByTimeAsync(2500);
        const report = await runPromise;

        expect(fetchedCount).toBe(1);
        expect(stubClient.fetchBoard).toHaveBeenCalledTimes(1);
        // Only the 1 started board should have updated lastCheckedAt
        expect(factory._calls.company.update).toHaveLength(1);
        expect(report.summary.bySource?.lever?.companiesAttempted).toBe(1);
        expect(report.summary.bySource?.lever?.skippedByDeadline).toBe(2);
      } finally {
        jest.useRealTimers();
      }
    });

    it('uses lever:<uuid> legacyKeys in deactivateStaleJobs and never deactivates present Lever jobs', async () => {
      const postings = readJsonFixture<LeverPosting[]>('palantir.json');
      const factory = createStatefulPrisma({
        companies: [{ slug: 'lv--palantir', source: 'LEVER', atsToken: 'palantir', status: 'ACTIVE' }],
        jobs: [
          {
            id: 'j-keep',
            ashbyId: 'lever:11111111-1111-4111-8111-111111111111',
            externalId: '11111111-1111-4111-8111-111111111111',
            source: 'LEVER',
            title: 'Software Engineer Intern',
            companySlug: 'lv--palantir',
            applyUrl: 'https://jobs.lever.co/palantir/11111111-1111-4111-8111-111111111111/apply',
            active: true,
            metadata: {},
            contentHash: 'old',
          },
          {
            id: 'j-stale',
            ashbyId: 'lever:99999999-9999-4999-8999-999999999999',
            externalId: '99999999-9999-4999-8999-999999999999',
            source: 'LEVER',
            title: 'Closed Role',
            companySlug: 'lv--palantir',
            applyUrl: 'https://jobs.lever.co/palantir/99999999-9999-4999-8999-999999999999/apply',
            active: true,
            metadata: {},
            contentHash: 'stale',
          },
        ],
      });

      mockedAxios.get.mockResolvedValueOnce({ status: 200, data: postings });
      const leverClient = new LeverClient({ minIntervalMs: 0 });
      const scraper = new AshbyScraper({
        prisma: factory as unknown as PrismaClient,
        clients: new Map([['lever', leverClient]]),
      });

      await scraper.runAll({
        sources: ['lever'],
        publish: false,
        saveTelemetry: false,
      });

      const activeSet = new Set(
        Array.from(factory._data.jobs.values())
          .filter((j) => j.active)
          .map((j) => j.ashbyId)
      );
      expect(activeSet.has('lever:11111111-1111-4111-8111-111111111111')).toBe(true);
      expect(activeSet.has('lever:11111111-1111-4111-8111-111111111112')).toBe(true);
      expect(activeSet.has('lever:99999999-9999-4999-8999-999999999999')).toBe(false);
    });

    it('selectCompanies caps Lever to oldest lastCheckedAt (nulls first), ignores cap with --slugs, and leaves Ashby unchanged', async () => {
      const factory = createStatefulPrisma({
        companies: [
          { slug: 'openai', source: 'ASHBY', atsToken: 'openai', status: 'ACTIVE', lastCheckedAt: new Date('2026-11-01T00:00:00Z') },
          { slug: 'lv--oldest', source: 'LEVER', atsToken: 'oldest', status: 'ACTIVE', lastCheckedAt: new Date('2026-10-01T00:00:00Z') },
          { slug: 'lv--null1', source: 'LEVER', atsToken: 'null1', status: 'ACTIVE', lastCheckedAt: null },
          { slug: 'lv--newer', source: 'LEVER', atsToken: 'newer', status: 'ACTIVE', lastCheckedAt: new Date('2026-11-10T00:00:00Z') },
          { slug: 'lv--null2', source: 'LEVER', atsToken: 'null2', status: 'ACTIVE', lastCheckedAt: null },
          { slug: 'lv--mid', source: 'LEVER', atsToken: 'mid', status: 'ACTIVE', lastCheckedAt: new Date('2026-10-15T00:00:00Z') },
        ],
      });

      // Cap 2 picks the two null lastCheckedAt rows first, and Ashby is untouched
      const capped = await selectCompanies(factory as unknown as PrismaClient, {
        sources: ['ashby', 'lever'],
        statusFilter: 'ACTIVE',
        leverMaxBoards: 2,
        select: { slug: true, source: true },
      });

      expect(capped.leverAvailable).toBe(5);
      expect(capped.leverCap).toBe(2);
      expect(capped.companies.map((c) => c.slug)).toEqual(['openai', 'lv--null1', 'lv--null2']);

      // Explicit --slugs skips the cap
      const explicit = await selectCompanies(factory as unknown as PrismaClient, {
        sources: ['lever'],
        statusFilter: 'ACTIVE',
        explicitSlugs: ['lv--oldest', 'lv--newer', 'lv--mid'],
        leverMaxBoards: 1,
        select: { slug: true, source: true },
      });
      expect(explicit.companies).toHaveLength(3);
    });

    it('ClusterScraper passes workerCount in worker IPC message', async () => {
      class MockChild extends EventEmitter {
        public pid = 4242;
        public send = jest.fn(() => {
          setImmediate(() => {
            this.emit('message', {
              type: 'worker_done',
              workerId: 2,
              report: {
                schemaVersion: '2.0',
                run: { runId: 'r1', mode: 'cluster' },
                summary: {
                  runId: 'r1',
                  mode: 'db_scrape',
                  startedAt: new Date().toISOString(),
                  completedAt: new Date().toISOString(),
                  durationSeconds: 1,
                  companiesAttempted: 1,
                  companiesWithJobs: 0,
                  companiesNotFound: 0,
                  companiesFailed: 0,
                  graphqlFallbacksUsed: 0,
                  rateLimitsEncountered: 0,
                  jobsCollected: 0,
                  jobsSanitized: 0,
                  jobsFilteredOut: 0,
                  dbErrors: 0,
                },
                events: [],
              },
            });
            this.emit('exit', 0, null);
          });
          return true;
        });
        public kill = jest.fn();
      }

      const mockChild = new MockChild();
      (childProcess.fork as jest.Mock).mockReturnValueOnce(mockChild);

      await runWorkerShard(2, ['lv--spotify'], 5, {
        sources: ['lever'],
        workerCount: 4,
      });

      expect(mockChild.send).toHaveBeenCalledWith(
        expect.objectContaining({
          workerId: 2,
          workerCount: 4,
          slugs: ['lv--spotify'],
          sources: ['lever'],
        })
      );
    });

    it('seedLever validates live sites, skips non-live/invalid tokens, and upserts by (source, atsToken)', async () => {
      const client = new LeverClient({ minIntervalMs: 0 });
      const postings = readJsonFixture<LeverPosting[]>('spotify.json');

      // 1. spotify -> live (postings 200, html 200, metadata html 200)
      // 2. AIFund -> dead_board (postings 200, html 404)
      // 3. whoop -> empty (postings [])
      mockedAxios.get
        .mockResolvedValueOnce({ status: 200, data: postings })
        .mockResolvedValueOnce({ status: 200, data: readTextFixture('board-spotify.html') })
        .mockResolvedValueOnce({ status: 200, data: readTextFixture('board-spotify.html') })
        .mockResolvedValueOnce({ status: 200, data: postings })
        .mockRejectedValueOnce({ isAxiosError: true, response: { status: 404 } })
        .mockResolvedValueOnce({ status: 200, data: [] });

      mockCompany.findUnique.mockResolvedValue(null);
      mockCompany.upsert.mockResolvedValue({});

      const result = await seedLever({
        tokens: ['spotify,AIFund,whoop,-badtoken'],
        client,
        prismaClient: {
          company: mockCompany,
          job: mockJob,
          department: mockDepartment,
          location: mockLocation,
        } as unknown as PrismaClient,
      });

      expect(result).toEqual({
        requested: 4,
        seeded: 1,
        skippedInvalid: 1,
        skippedNotLive: 2,
        failed: 0,
      });
      expect(mockCompany.upsert).toHaveBeenCalledTimes(1);
      expect(mockCompany.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { source_atsToken: { source: 'LEVER', atsToken: 'spotify' } },
          create: expect.objectContaining({
            slug: 'lv--spotify',
            source: 'LEVER',
            atsToken: 'spotify',
            name: 'Spotify',
            logoUrl: 'https://lever-client-logos.s3.us-west-2.amazonaws.com/spotify-header-logo.png',
          }),
        })
      );
    });

    it('caps lever limiter concurrency at 1 regardless of global concurrency', () => {
      const scraper = new AshbyScraper();
      expect(scraper.getLimiter('lever', 15).getConcurrency()).toBe(1);
    });
  });
});
