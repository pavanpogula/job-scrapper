/**
 * @file GreenhouseClient & Normalizer Unit Test Suite
 * @summary Tests Greenhouse board fetching, retry/404/429 handling, job normalization, entity decoding, deactivation safety, and seeding
 * @tags Unit Test, Greenhouse, AtsClient, Normalizer, BF-023, ADR-0021
 */

import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import {
  GreenhouseClient,
  GreenhouseRawJob,
  normalizeGreenhouseJob,
  parseGreenhousePlace,
} from '../../src/lib/ats/GreenhouseClient';
import { BoardRef } from '../../src/lib/ats/AtsClient';
import { AshbyScraper, computeJobContentHash } from '../../src/core/Scraper';
import { toJobDetail, JobWithDetailRelations } from '../../src/api/contract';
import { seedGreenhouse } from '../../src/utils/SeedGreenhouse';
import { mockCompany, mockJob, mockDepartment, mockLocation } from '../../__mocks__/@prisma/client';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const FIXTURES_DIR = path.join(__dirname, '../fixtures/greenhouse');

function readFixture<T>(filename: string): T {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, filename), 'utf8')) as T;
}

describe('GreenhouseClient & normalizeGreenhouseJob (BF-023)', () => {
  const discordRef: BoardRef = {
    slug: 'gh--discord',
    source: 'greenhouse',
    atsToken: 'discord',
  };

  const figmaRef: BoardRef = {
    slug: 'gh--figma',
    source: 'greenhouse',
    atsToken: 'figma',
  };

  const stripeRef: BoardRef = {
    slug: 'gh--stripe',
    source: 'greenhouse',
    atsToken: 'stripe',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('normalizeGreenhouseJob field mapping', () => {
    it('maps numeric id to externalId and greenhouse:<id> legacyKey, unescapes HTML entities once, and populates raw metadata without content', () => {
      const fixture = readFixture<{ jobs: GreenhouseRawJob[] }>('board-normal.json');
      const norm = normalizeGreenhouseJob(fixture.jobs[0], discordRef);

      expect(norm).not.toBeNull();
      if (!norm) throw new Error('Expected normalized job');

      expect(norm.externalId).toBe('8806482002');
      expect(norm.legacyKey).toBe('greenhouse:8806482002');
      expect(norm.title).toBe('Commercial Policy Lead');
      expect(norm.department).toBe('Policy');
      expect(norm.location).toBe('San Francisco Bay Area');
      expect(norm.isListed).toBe(true);
      expect(norm.team).toBeNull();

      // first_published -> ISO UTC Date; sourceUpdatedAt -> null in v1
      expect(norm.publishedAt).toBeInstanceOf(Date);
      expect(norm.publishedAt?.toISOString()).toBe('2026-09-15T16:52:11.000Z');
      expect(norm.sourceUpdatedAt).toBeNull();

      // HTML-entity-unescaped exactly once: &lt;div&gt; becomes <div>, &amp;amp; becomes &amp;, &#39; becomes '
      expect(norm.descriptionHtml).toContain('<div class="content-intro"><p>');
      expect(norm.descriptionHtml).toContain('&amp; millions of daily active users');
      expect(norm.descriptionHtml).toContain("('gamers' &amp; builders)");
      expect(norm.descriptionPlain).toContain('Discord has a highly engaged community & millions of daily active users');

      // raw metadata must carry contract.ts & contentHash keys and drop escaped content
      expect(norm.raw.content).toBeUndefined();
      expect(norm.raw.descriptionHtml).toBe(norm.descriptionHtml);
      expect(norm.raw.descriptionPlain).toBe(norm.descriptionPlain);
      expect(norm.raw.jobUrl).toBe('https://job-boards.greenhouse.io/discord/jobs/8806482002');
      expect(norm.raw.team).toBeNull();
      expect(norm.raw.secondaryLocations).toEqual([]);
      expect(norm.raw._source).toBe('rest');
      expect(norm.raw._ats).toBe('greenhouse');
      expect(norm.raw._normVersion).toBe(1);
      expect(norm.raw.updated_at).toBe('2026-10-20T20:27:20-04:00');
      expect(Array.isArray(norm.raw.departments)).toBe(true);
      expect(Array.isArray(norm.raw.offices)).toBe(true);
      expect(Array.isArray(norm.raw.metadata)).toBe(true);

      // Verify API mapper toJobDetail reads descriptionHtml, descriptionPlain, jobUrl, secondaryLocations from raw metadata
      const fakeDbRow: JobWithDetailRelations = {
        id: 'uuid-1',
        ashbyId: norm.legacyKey,
        source: 'GREENHOUSE',
        externalId: norm.externalId,
        title: norm.title,
        companySlug: discordRef.slug,
        departmentId: 'dept-1',
        locationId: 'loc-1',
        applyUrl: norm.applyUrl,
        salaryMin: norm.salary?.min ?? null,
        salaryMax: norm.salary?.max ?? null,
        salaryCurrency: norm.salary?.currency ?? null,
        salaryInterval: norm.salary?.interval ?? null,
        isRemote: norm.isRemote,
        workplaceType: norm.workplaceType ?? null,
        employmentType: norm.employmentType ?? null,
        publishedAt: norm.publishedAt ?? null,
        lastUpdatedAt: norm.publishedAt ?? null,
        lastUpdatedSource: 'published',
        isListed: norm.isListed,
        active: true,
        country: norm.country ?? null,
        region: norm.region ?? null,
        city: norm.city ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: norm.raw as JobWithDetailRelations['metadata'],
        company: { name: 'Discord', slug: 'gh--discord', logoUrl: null, source: 'GREENHOUSE', atsToken: 'discord', _count: { jobs: 3 } },
        department: { name: 'Policy' },
        location: { name: 'San Francisco Bay Area' },
      };
      const detailDto = toJobDetail(fakeDbRow);
      expect(detailDto.source).toBe('greenhouse');
      expect(detailDto.externalId).toBe(norm.externalId);
      expect(detailDto.company?.source).toBe('greenhouse');
      expect(detailDto.company?.boardUrl).toBe('https://job-boards.greenhouse.io/discord');
      expect(detailDto.descriptionHtml).toBe(norm.descriptionHtml);
      expect(detailDto.descriptionPlain).toBe(norm.descriptionPlain);
      expect(detailDto.jobUrl).toBe('https://job-boards.greenhouse.io/discord/jobs/8806482002');
    });

    it('decodes numeric HTML entities, strips <script> tags, and keeps company career site ?gh_jid= URLs', () => {
      const fixture = readFixture<{ jobs: GreenhouseRawJob[] }>('board-normal.json');
      const norm = normalizeGreenhouseJob(fixture.jobs[1], discordRef);

      expect(norm).not.toBeNull();
      if (!norm) throw new Error('Expected normalized job');

      // &#8211; decoded to en-dash – and <script> stripped
      expect(norm.descriptionHtml).toContain('Data Scientist – Client Platform.');
      expect(norm.descriptionHtml).not.toContain('<script>');
      expect(norm.applyUrl).toBe('https://discord.com/jobs/8840756002?gh_jid=8840756002');
      expect(norm.jobUrl).toBe('https://discord.com/jobs/8840756002?gh_jid=8840756002');

      // 3-part office location: "San Francisco, California, United States"
      expect(norm.country).toBe('US');
      expect(norm.region).toBe('California');
      expect(norm.city).toBe('San Francisco');
      expect(norm.postal).toEqual({
        addressCountry: 'US',
        addressRegion: 'California',
        addressLocality: 'San Francisco',
      });
    });

    it('extracts cents->units salary, hourly interval from title or blurb, and empty salary when absent', () => {
      const fixture = readFixture<{ jobs: GreenhouseRawJob[] }>('board-pay-ranges.json');

      const annualJob = normalizeGreenhouseJob(fixture.jobs[0], figmaRef)!;
      expect(annualJob.salary).toEqual({
        min: 185000,
        max: 240000,
        currency: 'USD',
        interval: '1 YEAR',
      });
      expect(annualJob.employmentType).toBeNull();

      const hourlyTitleJob = normalizeGreenhouseJob(fixture.jobs[1], figmaRef)!;
      expect(hourlyTitleJob.salary).toEqual({
        min: 52.5,
        max: 65,
        currency: 'USD',
        interval: '1 HOUR',
      });
      expect(hourlyTitleJob.employmentType).toBe('Intern');

      const hourlyBlurbJob = normalizeGreenhouseJob(fixture.jobs[2], figmaRef)!;
      expect(hourlyBlurbJob.salary).toEqual({
        min: 35,
        max: 45,
        currency: 'USD',
        interval: '1 HOUR',
      });
      expect(hourlyBlurbJob.employmentType).toBe('PartTime');

      const noPayJob = normalizeGreenhouseJob(fixture.jobs[3], figmaRef)!;
      expect(noPayJob.salary).toEqual({
        min: null,
        max: null,
        currency: null,
        interval: null,
      });
      expect(noPayJob.employmentType).toBe('Contract');
    });

    it('splits multi-location strings on •, ;, , or, and or; parses 2-part offices ("Lisbon, Portugal"); maps N/A to empty string', () => {
      const fixture = readFixture<{ jobs: GreenhouseRawJob[] }>('board-multi-location.json');

      // 1. Bullet-separated + Workplace Type = Hybrid. The job location ("San Francisco, CA") names a US state,
      //    so it wins over the unrelated "Lisbon, Portugal" office (offices only fill in when the text has no country).
      const j1 = normalizeGreenhouseJob(fixture.jobs[0], stripeRef)!;
      expect(j1.location).toBe('San Francisco, CA');
      expect(j1.secondaryLocations).toEqual(['New York, NY', 'Seattle, WA']);
      expect(j1.country).toBe('US');
      expect(j1.region).toBe('CA');
      expect(j1.city).toBe('San Francisco');
      expect(j1.postal).toEqual({
        addressCountry: 'US',
        addressRegion: 'CA',
        addressLocality: 'San Francisco',
      });
      expect(j1.workplaceType).toBe('Hybrid');
      expect(j1.isRemote).toBe(false);

      // 2. Semicolon + "; or " + 3-part office "Dublin, Leinster, Ireland" + Workplace Type = On-site + EU host URL
      const j2 = normalizeGreenhouseJob(fixture.jobs[1], stripeRef)!;
      expect(j2.location).toBe('Dublin, Ireland');
      expect(j2.secondaryLocations).toEqual(['London, United Kingdom', 'Berlin, Germany']);
      expect(j2.country).toBe('IE');
      expect(j2.region).toBe('Leinster');
      expect(j2.city).toBe('Dublin');
      expect(j2.workplaceType).toBe('OnSite');
      expect(j2.jobUrl).toBe('https://job-boards.eu.greenhouse.io/stripe/jobs/9100002');

      // 3. ", or " and " or " with deduplication
      const j3 = normalizeGreenhouseJob(fixture.jobs[2], stripeRef)!;
      expect(j3.location).toBe('Chicago, IL');
      expect(j3.secondaryLocations).toEqual(['New York, NY']);
      // No office: the job location "Chicago, IL" is the fallback (IL is Illinois, never Israel)
      expect(j3.postal).toEqual({ addressCountry: 'US', addressRegion: 'IL', addressLocality: 'Chicago' });
      expect(j3.country).toBe('US');
      expect(j3.department).toBe('');

      // 4. "N/A" location -> ''
      const j4 = normalizeGreenhouseJob(fixture.jobs[3], stripeRef)!;
      expect(j4.location).toBe('');
      expect(j4.secondaryLocations).toEqual([]);
    });

    it('computes deterministic contentHash and changes hash when description or salary changes', () => {
      const fixture = readFixture<{ jobs: GreenhouseRawJob[] }>('board-normal.json');
      const norm1 = normalizeGreenhouseJob(fixture.jobs[0], discordRef)!;
      const norm2 = normalizeGreenhouseJob(fixture.jobs[0], discordRef)!;

      const hashOf = (n: typeof norm1) =>
        computeJobContentHash({
          title: n.title,
          location: n.location || null,
          department: n.department || null,
          salary: n.salary,
          isRemote: n.isRemote,
          workplaceType: n.workplaceType || null,
          employmentType: n.employmentType || null,
          publishedAt: n.publishedAt ? n.publishedAt.toISOString() : null,
          applyUrl: n.applyUrl,
          isListed: n.isListed,
          country: n.country || null,
          region: n.region || null,
          city: n.city || null,
          descriptionHtml: n.descriptionHtml || '',
          descriptionPlain: n.descriptionPlain || '',
          team: n.team || null,
          secondaryLocations: n.secondaryLocations || [],
        });

      expect(hashOf(norm1)).toBe(hashOf(norm2));

      const edited = normalizeGreenhouseJob(
        { ...fixture.jobs[0], content: '&lt;p&gt;Updated description text&lt;/p&gt;' },
        discordRef
      )!;
      expect(hashOf(edited)).not.toBe(hashOf(norm1));
    });
  });

  describe('GreenhouseClient HTTP & AtsClient contract', () => {
    it('fetches board with gzip header, keeps all posts with duplicate internal_job_id, and builds canonical URLs from atsToken', async () => {
      const fixture = readFixture<{ jobs: GreenhouseRawJob[] }>('board-normal.json');
      mockedAxios.get.mockResolvedValueOnce({ status: 200, data: fixture });

      const client = new GreenhouseClient();
      const result = await client.fetchBoard(discordRef);

      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://boards-api.greenhouse.io/v1/boards/discord/jobs?content=true&pay_transparency=true',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Accept-Encoding': 'gzip',
            'User-Agent': expect.stringContaining('Mozilla/5.0'),
          }),
        })
      );

      // Both jobs 8806482002 and 8840756002 share internal_job_id 6210001002 and both must be kept
      expect(result.jobs).toHaveLength(3);
      expect(result.notFound).toBe(false);
      expect(result.fetchMode).toBe('primary');

      const urls = client.canonicalUrls(discordRef, '8806482002');
      expect(urls.jobUrl).toBe('https://job-boards.greenhouse.io/discord/jobs/8806482002');
      expect(urls.applyUrl).toBe('https://job-boards.greenhouse.io/discord/jobs/8806482002');
      expect(urls.boardUrl).toBe('https://job-boards.greenhouse.io/discord');
      expect(urls.jobUrl).not.toContain('gh--');
    });

    it('returns notFound: true on HTTP 404 for both /jobs and /v1/boards/{token} regardless of body text', async () => {
      const notFoundJobsBody = readFixture<Record<string, unknown>>('not-found-jobs.json');
      const notFoundBoardBody = readFixture<Record<string, unknown>>('not-found-board.json');

      mockedAxios.get.mockRejectedValueOnce({
        isAxiosError: true,
        response: { status: 404, data: notFoundJobsBody },
      });

      const client = new GreenhouseClient();
      const boardRes = await client.fetchBoard(discordRef);
      expect(boardRes.notFound).toBe(true);
      expect(boardRes.fetchMode).toBe('none');
      expect(boardRes.jobs).toEqual([]);

      mockedAxios.get.mockRejectedValueOnce({
        isAxiosError: true,
        response: { status: 404, data: notFoundBoardBody },
      });

      const metaRes = await client.fetchCompanyMetadata(discordRef);
      expect(metaRes.status).toBe('not_found');
    });

    it('handles empty 200 board response with notFound: false and fetchMode: primary', async () => {
      const emptyFixture = readFixture<{ jobs: GreenhouseRawJob[] }>('board-empty.json');
      mockedAxios.get.mockResolvedValueOnce({ status: 200, data: emptyFixture });

      const client = new GreenhouseClient();
      const res = await client.fetchBoard(discordRef);
      expect(res.notFound).toBe(false);
      expect(res.fetchMode).toBe('primary');
      expect(res.jobs).toEqual([]);
    });

    it('sets rateLimited: true only on HTTP 429 and caps Retry-After at 10s', async () => {
      jest.useFakeTimers();
      try {
        const emptyFixture = readFixture<{ jobs: GreenhouseRawJob[] }>('board-empty.json');

        mockedAxios.get
          .mockRejectedValueOnce({
            isAxiosError: true,
            response: { status: 429, headers: { 'retry-after': '60' } },
          })
          .mockResolvedValueOnce({ status: 200, data: emptyFixture });

        const client = new GreenhouseClient();
        const promise = client.fetchBoard(discordRef, { maxRetries: 1, baseDelayMs: 1 });

        await jest.advanceTimersByTimeAsync(9999);
        expect(mockedAxios.get).toHaveBeenCalledTimes(1);

        await jest.advanceTimersByTimeAsync(200);
        const res = await promise;

        expect(res.rateLimited).toBe(true);
        expect(res.fetchMode).toBe('primary');

        // Verify Retry-After was capped at 10s in fetchCompanyMetadata as well
        mockedAxios.get.mockRejectedValueOnce({
          isAxiosError: true,
          response: { status: 429, headers: { 'retry-after': '45' } },
        });
        const metaRes = await client.fetchCompanyMetadata(discordRef);
        expect(metaRes.status).toBe('rate_limited');
        expect(metaRes.retryAfterSeconds).toBe(10);
      } finally {
        jest.useRealTimers();
      }
    });

    it('returns structured failure after 5xx retry exhaustion without setting rateLimited', async () => {
      mockedAxios.get.mockRejectedValue({
        isAxiosError: true,
        response: { status: 503 },
      });

      const client = new GreenhouseClient();
      const res = await client.fetchBoard(discordRef, { maxRetries: 2, baseDelayMs: 1 });

      expect(res.notFound).toBe(false);
      expect(res.rateLimited).toBe(false);
      expect(res.fetchMode).toBe('none');
      expect(res.failure).toEqual({
        kind: 'http',
        status: 503,
        code: 'http/503/3',
        attempts: 3,
      });
    });
  });

  describe('Deactivation safety (legacyKey = greenhouse:<id>)', () => {
    it('passes greenhouse:<id> legacyKey values to deactivateStaleJobs and never deactivates present jobs', async () => {
      const fixture = readFixture<{ jobs: GreenhouseRawJob[] }>('board-normal.json');
      mockedAxios.get.mockResolvedValueOnce({ status: 200, data: fixture });

      mockCompany.findMany.mockResolvedValueOnce([
        {
          slug: 'gh--discord',
          source: 'GREENHOUSE',
          atsToken: 'discord',
          consecutiveNotFound: 0,
          consecutiveFailures: 0,
          pendingEmptySince: null,
        },
      ]);
      mockCompany.update.mockResolvedValue({});
      mockDepartment.findMany.mockResolvedValue([]);
      mockDepartment.upsert.mockResolvedValue({ id: 'dept-1', name: 'Policy' });
      mockLocation.findMany.mockResolvedValue([]);
      mockLocation.upsert.mockResolvedValue({ id: 'loc-1', name: 'San Francisco Bay Area' });
      mockJob.findMany
        .mockResolvedValueOnce([{ companySlug: 'gh--discord' }]) // pre-warm activeSlugs
        .mockResolvedValueOnce([]); // batchUpsertJobs existingRows
      mockJob.createMany.mockResolvedValue({ count: 3 });
      mockJob.updateMany.mockResolvedValue({ count: 0 });

      const scraper = new AshbyScraper();
      const deactivateSpy = jest.spyOn(scraper, 'deactivateStaleJobs');

      await scraper.runAll({
        sources: ['greenhouse'],
        saveTelemetry: false,
        publish: false,
      });

      expect(deactivateSpy).toHaveBeenCalledWith('gh--discord', [
        'greenhouse:8806482002',
        'greenhouse:8840756002',
        'greenhouse:8722538002',
      ]);
      expect(mockJob.updateMany).toHaveBeenCalledWith({
        where: {
          companySlug: 'gh--discord',
          active: true,
          ashbyId: {
            notIn: [
              'greenhouse:8806482002',
              'greenhouse:8840756002',
              'greenhouse:8722538002',
            ],
          },
        },
        data: { active: false },
      });
    });
  });

  describe('seedGreenhouse utility', () => {
    it('validates each token against GET /v1/boards/{token} and upserts Company with gh-- slug and source GREENHOUSE', async () => {
      const boardInfo = readFixture<{ name: string; content: string }>('board-info.json');
      mockedAxios.get
        .mockResolvedValueOnce({ status: 200, data: boardInfo })
        .mockRejectedValueOnce({ isAxiosError: true, response: { status: 404 } });
      mockCompany.upsert = jest.fn().mockResolvedValue({});

      const res = await seedGreenhouse({ tokens: ['Discord', 'nonexistent'] });

      expect(res.seeded).toBe(1);
      expect(res.skippedNotFound).toBe(1);
      expect(mockCompany.upsert).toHaveBeenCalledWith({
        where: {
          source_atsToken: {
            source: 'GREENHOUSE',
            atsToken: 'discord',
          },
        },
        create: {
          slug: 'gh--discord',
          source: 'GREENHOUSE',
          atsToken: 'discord',
          name: 'Discord',
          status: 'ACTIVE',
        },
        update: {
          name: 'Discord',
          status: 'ACTIVE',
          consecutiveNotFound: 0,
        },
      });
    });
  });
});

describe('parseGreenhousePlace (real Greenhouse office formats)', () => {
  it.each([
    ['San Francisco, California, United States', 'US', 'California', 'San Francisco'],
    ['Lisbon, Portugal', 'PT', null, 'Lisbon'],
    ['Dublin, Dublin, Ireland', 'IE', 'Dublin', 'Dublin'],
    ['Atlanta, Georgia', 'US', 'Georgia', 'Atlanta'],
    ['Tbilisi, Tbilisi, Georgia', 'GE', 'Tbilisi', 'Tbilisi'],
    ['Austin, Texas', 'US', 'Texas', 'Austin'],
    ['Alabama', 'US', 'Alabama', null],
    ['Chicago, IL', 'US', 'IL', 'Chicago'],
    ['San Francisco, CA', 'US', 'CA', 'San Francisco'],
    ['US, Remote Zone 1', 'US', null, null],
    ['Canada, Remote', 'CA', null, null],
    ['Remote - California', 'US', 'California', null],
    ['Remote (U.S.)', 'US', null, null],
    ['Hawthorne at Friendly - 900 Hobbs Rd - Greensboro, NC - 27410', 'US', 'NC', 'Greensboro'],
    ['Village at Midtown - 320 Stanton Rd - Mobile, AL - 36617', 'US', 'AL', 'Mobile'],
    ['1114 Avenue of the Americas, NYC, NY, 10036', 'US', 'NY', 'NYC'],
    ['Austin, TX 78701', 'US', 'TX', 'Austin'],
    ['Atlanta GA', 'US', 'GA', 'Atlanta'],
    ['Denver CO', 'US', 'CO', 'Denver'],
    ['St. Louis MO', 'US', 'MO', 'St. Louis'],
    ['Toronto, ON', 'CA', 'ON', 'Toronto'],
    ['Shippingport, PA.', 'US', 'PA', 'Shippingport'],
    ['Remote, US, Georgia', 'US', 'Georgia', null],
    ['Panama City, Panama', 'PA', null, 'Panama City'],
    ['Bogotá, Colombia', 'CO', null, 'Bogotá'],
    ['Tel Aviv, Israel', 'IL', null, 'Tel Aviv'],
    ['London, United Kingdom - Deliveroo', 'GB', null, 'London'],
    ['Sao Paulo / SP / Brazil', 'BR', null, null],
    ['APAC', null, null, null],
    ['N/A', null, null, null],
  ])('%s -> %s', (text, country, region, city) => {
    const parsed = parseGreenhousePlace(text);
    expect(parsed.country).toBe(country);
    expect(parsed.region).toBe(region);
    expect(parsed.city).toBe(city);
  });
});

describe('normalizeGreenhouseJob country precedence (real Greenhouse data)', () => {
  const ref = { slug: 'gh--x', source: 'greenhouse' as const, atsToken: 'x' };
  const job = (location: string, offices: string[]) =>
    normalizeGreenhouseJob(
      { id: 1, title: 'Engineer', location: { name: location }, offices: offices.map((l) => ({ location: l })), content: '' },
      ref
    );

  it('the job location wins over the office list ("Dublin, Ireland" with a Berlin office stays Ireland)', () => {
    const j = job('Dublin, Ireland', ['Berlin, Germany']);
    expect(j?.country).toBe('IE');
    expect(j?.city).toBe('Dublin');
    expect(job('Remote - Ireland', ['Berlin, Germany'])?.country).toBe('IE');
  });

  it('parses a 2-part office ("Lisbon, Portugal") when the job location is just "Remote"', () => {
    const j = job('Remote', ['Lisbon, Portugal']);
    expect(j?.country).toBe('PT');
    expect(j?.city).toBe('Lisbon');
    expect(j?.postal).toEqual({ addressCountry: 'PT', addressLocality: 'Lisbon' });
  });

  it('falls back to the office list when the location text has no country', () => {
    const j = job('Denver', ['Denver, Colorado, United States']);
    expect(j?.country).toBe('US');
    expect(j?.region).toBe('Colorado');
  });

  it('prefers the office whose city matches the job city, else the first office', () => {
    expect(job('Berlin', ['Dublin, Ireland', 'Berlin, Germany'])?.country).toBe('DE');
    expect(job('Remote', ['Dublin, Ireland', 'Berlin, Germany'])?.country).toBe('IE');
  });

  it('US address-style locations with a ZIP get US, not New Caledonia or Albania', () => {
    expect(job('Brookefield - 2400 Cluette Dr - Raleigh, NC - 27615', [])?.country).toBe('US');
    expect(job('Village at Midtown - 320 Stanton Rd - Mobile, AL - 36617', [])?.country).toBe('US');
  });
});
