/**
 * @file Greenhouse Discovery Unit Tests
 * @summary Unit tests for Greenhouse token extractor, paged Common Crawl client, token validator, and discovery pipeline
 * @tags Unit Test, Discovery, Greenhouse, CommonCrawl, Validation, Token, Extractor
 */

import axios from 'axios';
import {
  extractCompanySlug,
  extractGreenhouseToken,
  fetchLatestCrawlId,
  isValidGreenhouseToken,
  isValidSlug,
  parseTimeBudgetMs,
  parseTokenBudget,
  runDiscovery,
  validateAndSeedGreenhouseTokens,
} from '../../src/discovery/CdxWorker';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Greenhouse Discovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Token Extractor & Validation', () => {
    it('accepts valid Greenhouse tokens and rejects invalid formats or reserved segments', () => {
      expect(isValidGreenhouseToken('airbnb')).toBe(true);
      expect(isValidGreenhouseToken('stripe')).toBe(true);
      expect(isValidGreenhouseToken('acme-corp')).toBe(true);
      expect(isValidGreenhouseToken('foo_bar_123')).toBe(true);

      // Reserved segments
      expect(isValidGreenhouseToken('jobs')).toBe(false);
      expect(isValidGreenhouseToken('embed')).toBe(false);
      expect(isValidGreenhouseToken('v1')).toBe(false);
      expect(isValidGreenhouseToken('api')).toBe(false);
      expect(isValidGreenhouseToken('status')).toBe(false);

      // Regex bounds
      expect(isValidGreenhouseToken('')).toBe(false);
      expect(isValidGreenhouseToken('a')).toBe(false); // min length 2
      expect(isValidGreenhouseToken('-leading-dash')).toBe(false);
      expect(isValidGreenhouseToken('_leading-underscore')).toBe(false);
      expect(isValidGreenhouseToken('a'.repeat(61))).toBe(false);
      expect(isValidGreenhouseToken('a'.repeat(60))).toBe(true);
    });

    it('extracts tokens from standard Greenhouse career board URLs across all 4 hosts', () => {
      expect(extractGreenhouseToken('https://job-boards.greenhouse.io/airbnb')).toBe('airbnb');
      expect(extractGreenhouseToken('https://boards.greenhouse.io/stripe')).toBe('stripe');
      expect(extractGreenhouseToken('https://job-boards.eu.greenhouse.io/acme-eu/jobs/12345')).toBe('acme-eu');
      expect(extractGreenhouseToken('https://boards.eu.greenhouse.io/my_company')).toBe('my_company');
    });

    it('normalizes uppercase tokens to lowercase', () => {
      expect(extractGreenhouseToken('https://job-boards.greenhouse.io/AirBnb')).toBe('airbnb');
      expect(extractGreenhouseToken('https://boards.greenhouse.io/STRIPE/jobs/999')).toBe('stripe');
    });

    it('extracts tokens from embed/job_board?for=<token> URLs', () => {
      expect(extractGreenhouseToken('https://boards.greenhouse.io/embed/job_board?for=gitlab')).toBe('gitlab');
      expect(extractGreenhouseToken('https://job-boards.greenhouse.io/embed/job_board?for=Figma')).toBe('figma');
      expect(extractGreenhouseToken('https://boards.eu.greenhouse.io/embed/job_board?for=acme_eu')).toBe('acme_eu');
    });

    it('rejects URLs from untrusted hosts or without valid tokens', () => {
      expect(extractGreenhouseToken('https://jobs.ashbyhq.com/deel')).toBeNull();
      expect(extractGreenhouseToken('https://example.com/airbnb')).toBeNull();
      expect(extractGreenhouseToken('https://job-boards.greenhouse.io/jobs/123')).toBeNull(); // 'jobs' is reserved
      expect(extractGreenhouseToken('https://job-boards.greenhouse.io/embed/job_board')).toBeNull(); // no for param
      expect(extractGreenhouseToken('https://job-boards.greenhouse.io/')).toBeNull();
      expect(extractGreenhouseToken('not-a-valid-url')).toBeNull();
    });

    it('preserves Ashby extractor behavior and invariants', () => {
      expect(extractCompanySlug('https://jobs.ashbyhq.com/deel')).toBe('deel');
      expect(extractCompanySlug('https://jobs.ashbyhq.com/1password/jobs')).toBe('1password');
      expect(extractCompanySlug('https://jobs.ashbyhq.com/gh--stripe')).toBeNull(); // -- rejected
      expect(isValidSlug('deel')).toBe(true);
      expect(isValidSlug('gh--stripe')).toBe(false);
      expect(isValidSlug('jobs')).toBe(false);
      expect(isValidSlug('12345')).toBe(false);
    });
  });

  describe('Common Crawl Crawl ID & Client', () => {
    it('fetches latest crawl ID from collinfo.json and falls back on error', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: [{ id: 'CC-MAIN-2026-10' }, { id: 'CC-MAIN-2026-05' }],
      } as never);

      const crawlId = await fetchLatestCrawlId();
      expect(crawlId).toBe('CC-MAIN-2026-10');

      // Network error -> fallback
      mockedAxios.get.mockRejectedValueOnce(new Error('Network error'));
      const fallbackId = await fetchLatestCrawlId('CC-MAIN-2024-51');
      expect(fallbackId).toBe('CC-MAIN-2024-51');
    });
  });

  describe('Token Validation & Seeding', () => {
    it('validates tokens with GET /v1/boards/{token}: 200 keeps with name, 404 drops, 429 backs off', async () => {
      const mockDb = {
        company: {
          upsert: jest.fn().mockResolvedValue({}),
          update: jest.fn().mockResolvedValue({}),
        },
      } as unknown as import('@prisma/client').PrismaClient;

      // Mock 3 tokens:
      // 1. 'airbnb': 200 OK -> upserted
      // 2. 'throttled': 429 Rate limited with Retry-After: 1 -> backed off
      // 3. 'nonexistent': 404 Not Found -> dropped
      mockedAxios.get
        .mockResolvedValueOnce({ status: 200, data: { name: 'Airbnb Inc' } } as never)
        .mockRejectedValueOnce({
          response: { status: 429, headers: { 'retry-after': '1' } },
        })
        .mockRejectedValueOnce({
          response: { status: 404 },
        });

      const result = await validateAndSeedGreenhouseTokens(
        ['airbnb', 'throttled', 'nonexistent'],
        {
          deadline: Date.now() + 10000,
          prismaClient: mockDb,
        }
      );

      expect(result.validated).toBe(3);
      expect(result.inserted).toBe(1);
      expect(mockDb.company.upsert).toHaveBeenCalledTimes(1);
      expect(mockDb.company.upsert).toHaveBeenCalledWith({
        where: {
          source_atsToken: {
            source: 'GREENHOUSE',
            atsToken: 'airbnb',
          },
        },
        create: {
          slug: 'gh--airbnb',
          source: 'GREENHOUSE',
          atsToken: 'airbnb',
          name: 'Airbnb Inc',
          status: 'ACTIVE',
        },
        update: {
          name: 'Airbnb Inc',
          status: 'ACTIVE',
        },
      });
    });

    it('halts cleanly when deadline is reached and records timedOutCount', async () => {
      const mockDb = {
        company: {
          upsert: jest.fn().mockResolvedValue({}),
        },
      } as unknown as import('@prisma/client').PrismaClient;

      // Passed already-expired deadline
      const result = await validateAndSeedGreenhouseTokens(['token1', 'token2', 'token3'], {
        deadline: Date.now() - 1000,
        prismaClient: mockDb,
      });

      expect(result.validated).toBe(0);
      expect(result.inserted).toBe(0);
      expect(result.timedOutCount).toBe(3);
      expect(mockDb.company.upsert).not.toHaveBeenCalled();
    });
  });

  describe('runDiscovery Dispatch', () => {
    it('runs Greenhouse discovery: filters known DB tokens, respects budget cap, and returns summary', async () => {
      const mockDb = {
        company: {
          findMany: jest.fn().mockResolvedValue([
            { atsToken: 'existing-board' },
          ]),
          upsert: jest.fn().mockResolvedValue({}),
          update: jest.fn().mockResolvedValue({}),
        },
      } as unknown as import('@prisma/client').PrismaClient;

      // Mock crawl collinfo and index responses
      mockedAxios.get
        // fetchLatestCrawlId
        .mockResolvedValueOnce({ data: [{ id: 'CC-MAIN-2026-10' }] } as never)
        // showNumPages for job-boards.greenhouse.io
        .mockResolvedValueOnce({ data: { pages: 1 } } as never)
        // fetchCommonCrawlPage page 0
        .mockResolvedValueOnce({
          data: [
            JSON.stringify({ url: 'https://job-boards.greenhouse.io/existing-board' }),
            JSON.stringify({ url: 'https://job-boards.greenhouse.io/new-corp' }),
            JSON.stringify({ url: 'https://job-boards.greenhouse.io/another-corp' }),
          ].join('\n'),
        } as never)
        // Validation calls: new-corp (200), another-corp (404)
        .mockResolvedValueOnce({ status: 200, data: { name: 'New Corp' } } as never)
        .mockRejectedValueOnce({ response: { status: 404 } });

      const summary = await runDiscovery({
        source: 'greenhouse',
        hosts: ['job-boards.greenhouse.io'],
        tokenBudget: 500,
        timeBudgetMs: 30000,
        prismaClient: mockDb,
      });

      expect(summary).toBeDefined();
      expect(summary?.source).toBe('greenhouse');
      expect(summary?.tokensFound).toBe(3);
      expect(summary?.alreadyKnown).toBe(1);
      expect(summary?.validated).toBe(2);
      expect(summary?.inserted).toBe(1);
      expect(summary?.skippedByBudget).toBe(0);
      expect(mockDb.company.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { source_atsToken: { source: 'GREENHOUSE', atsToken: 'new-corp' } },
        })
      );
    });
  });
});

describe('Greenhouse discovery budget and concurrency', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('validates up to 5 tokens at once (never more) and still handles every token', async () => {
    const mockDb = {
      company: { upsert: jest.fn().mockResolvedValue({}), update: jest.fn().mockResolvedValue({}) },
    } as unknown as import('@prisma/client').PrismaClient;

    let inFlight = 0;
    let peak = 0;
    mockedAxios.get.mockImplementation((async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 15));
      inFlight--;
      return { status: 200, data: { name: 'Board' } };
    }) as never);

    const tokens = Array.from({ length: 30 }, (_, i) => `board${i}`);
    const result = await validateAndSeedGreenhouseTokens(tokens, { deadline: Date.now() + 10000, prismaClient: mockDb });

    expect(result.validated).toBe(30);
    expect(result.inserted).toBe(30);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(5);
  });

  it('stops starting new validations once the deadline passes and counts the rest as timed out', async () => {
    const mockDb = {
      company: { upsert: jest.fn().mockResolvedValue({}), update: jest.fn().mockResolvedValue({}) },
    } as unknown as import('@prisma/client').PrismaClient;
    mockedAxios.get.mockImplementation((async () => {
      await new Promise((r) => setTimeout(r, 20));
      return { status: 200, data: { name: 'Board' } };
    }) as never);

    const tokens = Array.from({ length: 40 }, (_, i) => `slow${i}`);
    const result = await validateAndSeedGreenhouseTokens(tokens, { deadline: Date.now() + 60, prismaClient: mockDb });

    expect(result.validated + result.timedOutCount).toBe(40);
    expect(result.timedOutCount).toBeGreaterThan(0);
    expect(result.validated).toBeGreaterThan(0);
  });

  it('parses --budget (number or "all") and --time-budget-min, rejecting bad values', () => {
    expect(parseTokenBudget('2000')).toBe(2000);
    expect(parseTokenBudget(' ALL ')).toBe(Number.MAX_SAFE_INTEGER);
    for (const bad of ['0', '-5', '1.5', 'abc', '', '10x']) {
      expect(() => parseTokenBudget(bad)).toThrow(/Invalid --budget/);
    }
    expect(parseTimeBudgetMs('20')).toBe(20 * 60 * 1000);
    for (const bad of ['0', '121', 'x', '', '2.5']) {
      expect(() => parseTimeBudgetMs(bad)).toThrow(/Invalid --time-budget-min/);
    }
  });
});
