/**
 * @file Lever Discovery & Enrichment Unit Tests
 * @summary Tests extractLeverToken, Wayback CDX harvest (36 prefixes, resumeKey, 503/429 retry, 2-char split, 50% deadline), state persistence, 30-day cooldown, validation counts, and Lever logo enrichment
 * @tags Unit Test, Discovery, Lever, Wayback, Enrichment, Validation, Fixtures, ADR-0022
 */

import axios from 'axios';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { PrismaClient } from '@prisma/client';
import {
  extractLeverToken,
  harvestLeverWayback,
  LEVER_PRIMARY_PREFIXES,
  LEVER_SUBPREFIX_SUFFIXES,
  loadLeverDiscoveryState,
  parseWaybackCdxResponse,
  runLeverDiscovery,
  saveLeverDiscoveryState,
} from '../../src/discovery/LeverDiscovery';
import { fetchWithRetry, runDiscovery } from '../../src/discovery/CdxWorker';
import { LeverClient } from '../../src/lib/ats/LeverClient';
import { enrichActiveCompanies } from '../../src/utils/EnrichCompanies';
import { mockCompany } from '../../__mocks__/@prisma/client';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const FIXTURES_DIR = path.resolve(__dirname, '../fixtures/lever/discovery');
const LEVER_FIXTURES_DIR = path.resolve(__dirname, '../fixtures/lever');

function readDiscoveryFixture(name: string): unknown {
  const fullPath = path.join(FIXTURES_DIR, name);
  const raw = fs.readFileSync(fullPath, 'utf-8');
  return name.endsWith('.json') ? JSON.parse(raw) : raw;
}

function createMockDiscoveryDb(existingTokens: string[] = []) {
  const existingSet = new Set(existingTokens);
  const upserts: Array<Record<string, unknown>> = [];
  const db = {
    company: {
      findMany: jest.fn().mockImplementation(async () =>
        Array.from(existingSet).map((atsToken) => ({ atsToken }))
      ),
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockImplementation(async (args: Record<string, unknown>) => {
        upserts.push(args);
        return args;
      }),
    },
  };
  return {
    db: db as unknown as PrismaClient,
    mock: db,
    upserts,
  };
}

describe('Lever Discovery (L4)', () => {
  let tempDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lever-discovery-test-'));
  });

  afterEach(() => {
    jest.useRealTimers();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('extractLeverToken', () => {
    it('extracts valid case-sensitive, dotted, ampersand, and alphanumeric-led tokens', () => {
      expect(extractLeverToken('https://jobs.lever.co/spotify/abc')).toBe('spotify');
      expect(extractLeverToken('jobs.lever.co/spotify')).toBe('spotify');
      expect(extractLeverToken('jobs.lever.co/AIFund/x')).toBe('AIFund');
      expect(extractLeverToken('jobs.lever.co/arcteryx.com/x')).toBe('arcteryx.com');
      expect(extractLeverToken('jobs.lever.co/1840%26Company')).toBe('1840&Company');
      expect(extractLeverToken('https://jobs.lever.co/100ms')).toBe('100ms');
      expect(extractLeverToken('http://JOBS.LEVER.CO/Kyverna/role-1?source=cdx')).toBe('Kyverna');
    });

    it('rejects malformed tokens, bad encodings, reserved segments, EU host, and other hosts', () => {
      // Malformed / disallowed token characters
      expect(extractLeverToken('https://jobs.lever.co/*')).toBeNull();
      expect(extractLeverToken('https://jobs.lever.co/%2a')).toBeNull();
      expect(extractLeverToken('https://jobs.lever.co/%E0%A4%A')).toBeNull();
      expect(extractLeverToken('https://jobs.lever.co/"spotify"')).toBeNull();
      expect(extractLeverToken('https://jobs.lever.co/bad<tag')).toBeNull();
      expect(extractLeverToken('https://jobs.lever.co/white space')).toBeNull();
      expect(extractLeverToken('https://jobs.lever.co/white%20space')).toBeNull();
      expect(extractLeverToken('https://jobs.lever.co/.leading-dot')).toBeNull();
      expect(extractLeverToken('https://jobs.lever.co/-leading-dash')).toBeNull();
      expect(extractLeverToken('https://jobs.lever.co/')).toBeNull();
      expect(extractLeverToken('')).toBeNull();

      // Reserved segments (case-insensitive)
      for (const seg of [
        'img',
        'IMG',
        'css',
        'js',
        'assets',
        'static',
        'favicon.ico',
        'robots.txt',
        'sitemap.xml',
        'v0',
        'api',
        'search',
        'embed',
      ]) {
        expect(extractLeverToken(`https://jobs.lever.co/${seg}/x`)).toBeNull();
      }

      // Out-of-scope EU host & other hosts
      expect(extractLeverToken('https://jobs.eu.lever.co/engelvoelkers/123')).toBeNull();
      expect(extractLeverToken('https://jobs.ashbyhq.com/spotify')).toBeNull();
      expect(extractLeverToken('https://example.com/jobs.lever.co/spotify')).toBeNull();
      expect(extractLeverToken('ftp://jobs.lever.co/spotify')).toBeNull();
    });
  });

  describe('parseWaybackCdxResponse', () => {
    it('parses recorded JSON CDX pages with and without resumeKey as well as plain text responses', () => {
      const page1 = readDiscoveryFixture('cdx-prefix-a-page1.json');
      expect(parseWaybackCdxResponse(page1)).toEqual({
        urls: [
          'https://jobs.lever.co/AIFund/11111111-1111-4111-8111-111111111111',
          'https://jobs.lever.co/arcteryx.com/22222222-2222-4222-8222-222222222222',
          'https://jobs.lever.co/assembly/33333333-3333-4333-8333-333333333333',
          'https://jobs.lever.co/Assembly/44444444-4444-4444-8444-444444444444',
        ],
        resumeKey: 'resume_a_page2',
      });

      const plainText = [
        'https://jobs.lever.co/spotify/1',
        'https://jobs.lever.co/zoox/2',
        '',
        '!%2Fco%2Flever%2Frk2',
        '',
      ].join('\n');
      expect(parseWaybackCdxResponse(plainText)).toEqual({
        urls: ['https://jobs.lever.co/spotify/1', 'https://jobs.lever.co/zoox/2'],
        resumeKey: '!%2Fco%2Flever%2Frk2',
      });
    });
  });

  describe('fetchWithRetry & Wayback harvest', () => {
    it('iterates all 36 primary prefixes (a..z, 0..9), follows resumeKey, and deduplicates tokens case-sensitively', async () => {
      const page1 = readDiscoveryFixture('cdx-prefix-a-page1.json');
      const page2 = readDiscoveryFixture('cdx-prefix-a-page2.json');
      const prefixS = readDiscoveryFixture('cdx-prefix-s.json');
      const prefix1 = readDiscoveryFixture('cdx-prefix-1.json');

      const calledUrls: string[] = [];
      mockedAxios.get.mockImplementation((async (url: string) => {
        calledUrls.push(url);
        if (url.includes('url=jobs.lever.co/a&') && !url.includes('resumeKey=')) {
          return { data: page1 };
        }
        if (url.includes('url=jobs.lever.co/a&') && url.includes('resumeKey=resume_a_page2')) {
          return { data: page2 };
        }
        if (url.includes('url=jobs.lever.co/s&')) {
          return { data: prefixS };
        }
        if (url.includes('url=jobs.lever.co/1&')) {
          return { data: prefix1 };
        }
        return { data: [['original']] };
      }) as never);

      const state = loadLeverDiscoveryState(path.join(tempDir, 'state.json'));
      const currentYear = new Date().getUTCFullYear();
      const result = await harvestLeverWayback(state, {
        harvestDeadline: Date.now() + 60_000,
        waybackMinIntervalMs: 0,
        waybackRetries: 3,
        waybackRetryDelayMs: 0,
      });

      expect(result.harvestComplete).toBe(true);
      expect(result.prefixesQueried).toBe(36);
      expect(result.prefixesFailed).toBe(0);
      expect(result.waybackRowsRead).toBe(10);
      expect(state.harvest.nextPrefix).toBeNull();
      expect(state.harvest.completedAt).toEqual(expect.any(String));

      // Verify all 36 prefixes requested with from=<currentYear-2>
      for (const prefix of LEVER_PRIMARY_PREFIXES) {
        expect(
          calledUrls.some(
            (u) =>
              u.includes(`url=jobs.lever.co/${prefix}&`) &&
              u.includes(`from=${currentYear - 2}`) &&
              u.includes('showResumeKey=true')
          )
        ).toBe(true);
      }

      // Case-sensitive tokens preserved (`assembly` and `Assembly` both stored; EU & reserved dropped)
      const tokens = Object.keys(state.tokens).sort();
      expect(tokens).toEqual(
        ['100ms', '1840&Company', 'AIFund', 'Assembly', 'acme', 'arcteryx.com', 'assembly', 'spotify'].sort()
      );
    });

    it('retries 503 with 30-60s backoff and honors 429 Retry-After', async () => {
      jest.useFakeTimers();
      const fn503 = jest
        .fn()
        .mockRejectedValueOnce({ response: { status: 503 } })
        .mockRejectedValueOnce({ response: { status: 504 } })
        .mockResolvedValueOnce('recovered');

      const promise503 = fetchWithRetry(fn503, 3, {
        retryOn5xxDelayMs: 30_000,
        honorRetryAfter: true,
        maxRetryAfterMs: 60_000,
      });

      await jest.advanceTimersByTimeAsync(29_999);
      expect(fn503).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1);
      expect(fn503).toHaveBeenCalledTimes(2);
      await jest.advanceTimersByTimeAsync(60_000);
      await expect(promise503).resolves.toBe('recovered');
      expect(fn503).toHaveBeenCalledTimes(3);

      const fn429 = jest
        .fn()
        .mockRejectedValueOnce({ response: { status: 429, headers: { 'retry-after': '12' } } })
        .mockResolvedValueOnce('ok-after-429');

      const promise429 = fetchWithRetry(fn429, 3, {
        honorRetryAfter: true,
        maxRetryAfterMs: 60_000,
        retryOn5xxDelayMs: 30_000,
      });

      await jest.advanceTimersByTimeAsync(11_999);
      expect(fn429).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1);
      await expect(promise429).resolves.toBe('ok-after-429');
      expect(fn429).toHaveBeenCalledTimes(2);
    });

    it('splits a primary prefix that fails all 3 retries into 40 two-character prefixes including a%26 and a-, counting only finally failed subprefixes', async () => {
      const requestedUrls: string[] = [];
      mockedAxios.get.mockImplementation((async (url: string) => {
        requestedUrls.push(url);
        if (url.includes('url=jobs.lever.co/a&')) {
          throw { response: { status: 503 } };
        }
        if (url.includes('url=jobs.lever.co/a-&') || url.includes('url=jobs.lever.co/a%26&')) {
          throw { response: { status: 503 } };
        }
        if (url.includes('url=jobs.lever.co/aa&')) {
          return { data: [['original'], ['https://jobs.lever.co/aardvark/1']] };
        }
        return { data: [['original']] };
      }) as never);

      const state = loadLeverDiscoveryState(path.join(tempDir, 'state.json'));
      const res = await harvestLeverWayback(state, {
        prefixes: ['a', 'b'],
        harvestDeadline: Date.now() + 60_000,
        waybackMinIntervalMs: 0,
        waybackRetries: 3,
        waybackRetryDelayMs: 0,
      });

      // 1 (primary 'a' attempted 4x) -> 40 subprefixes + 1 ('b') = 43 queried prefixes; 2 subprefixes failed (a-, a%26)
      expect(res.harvestComplete).toBe(true);
      expect(res.prefixesQueried).toBe(2 + LEVER_SUBPREFIX_SUFFIXES.length);
      expect(res.prefixesFailed).toBe(2);
      expect(Object.keys(state.tokens)).toContain('aardvark');

      // Check a- and un-double-encoded a%26 were queried directly
      expect(requestedUrls.some((u) => u.includes('url=jobs.lever.co/a-&'))).toBe(true);
      expect(requestedUrls.some((u) => u.includes('url=jobs.lever.co/a%26&'))).toBe(true);
      expect(requestedUrls.some((u) => u.includes('a%2526'))).toBe(false);
    });

    it('stops harvest at 50% of timeBudgetMs using fake timers and leaves the remaining 50% for validation', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-11-17T00:00:00.000Z'));

      const stateFilePath = path.join(tempDir, 'state.json');
      const { db } = createMockDiscoveryDb();
      const waybackPrefixesCalled: string[] = [];

      mockedAxios.get.mockImplementation((async (url: string) => {
        const match = url.match(/url=jobs\.lever\.co\/([^&]+)/);
        if (match) {
          waybackPrefixesCalled.push(match[1]);
          return { data: [['original'], [`https://jobs.lever.co/${match[1]}corp/1`]] };
        }
        if (url.startsWith('https://api.lever.co/v0/postings/')) {
          return { status: 200, data: [{ id: '1', text: 'Eng' }] };
        }
        return { status: 200, data: '<html><title>Corp</title></html>' };
      }) as never);

      const leverClient = new LeverClient({ minIntervalMs: 0 });
      const runPromise = runLeverDiscovery({
        stateFilePath,
        prismaClient: db,
        leverClient,
        timeBudgetMs: 10_000, // 5,000 ms for harvest (calls at t=0, 1000, 2000, 3000, 4000 => 5 prefixes)
        waybackMinIntervalMs: 1000,
        tokenBudget: 10,
      });

      await jest.advanceTimersByTimeAsync(10_500);
      const summary = await runPromise;

      expect(waybackPrefixesCalled).toEqual(['a', 'b', 'c', 'd', 'e']);
      expect(summary.harvestComplete).toBe(false);
      expect(summary.nextPrefix).toBe('f');
      expect(summary.validated).toBe(5);
      expect(summary.live).toBe(5);
    });
  });

  describe('Persistent state, resume, and 30-day cooldown', () => {
    it('handles corrupt/missing state files cleanly and resumes from saved nextPrefix/resumeKey across cycles', async () => {
      const stateFilePath = path.join(tempDir, 'corrupt-state.json');
      fs.writeFileSync(stateFilePath, '{not valid json', 'utf-8');
      const recovered = loadLeverDiscoveryState(stateFilePath);
      expect(recovered).toEqual({
        version: 1,
        harvest: { nextPrefix: 'a', resumeKey: null, completedAt: null },
        tokens: {},
      });

      // Seed saved mid-harvest state at nextPrefix='b', resumeKey='rk_b2'
      saveLeverDiscoveryState(
        {
          version: 1,
          harvest: { nextPrefix: 'b', resumeKey: 'rk_b2', completedAt: null },
          tokens: { alpha: { firstSeen: '2026-11-01T00:00:00.000Z' } },
        },
        stateFilePath
      );

      const { db } = createMockDiscoveryDb();
      const queries: string[] = [];
      mockedAxios.get.mockImplementation((async (url: string) => {
        if (url.startsWith('http://web.archive.org')) {
          queries.push(url);
          return { data: [['original'], ['https://jobs.lever.co/beta/1']] };
        }
        return { status: 200, data: [{ id: '1', text: 'Role' }] };
      }) as never);

      const leverClient = new LeverClient({ minIntervalMs: 0 });
      const run1 = await runLeverDiscovery({
        stateFilePath,
        prismaClient: db,
        leverClient,
        prefixes: ['a', 'b', 'c'],
        waybackMinIntervalMs: 0,
        timeBudgetMs: 60_000,
      });

      // 'a' skipped; 'b' resumed with resumeKey=rk_b2; then 'c' ran; harvest completed
      expect(queries[0]).toContain('url=jobs.lever.co/b&');
      expect(queries[0]).toContain('resumeKey=rk_b2');
      expect(queries[1]).toContain('url=jobs.lever.co/c&');
      expect(run1.harvestComplete).toBe(true);
      expect(run1.nextPrefix).toBeNull();

      // Next run starts the new cycle at 'a'
      queries.length = 0;
      const run2 = await runLeverDiscovery({
        stateFilePath,
        prismaClient: db,
        leverClient,
        prefixes: ['a', 'b', 'c'],
        waybackMinIntervalMs: 0,
        timeBudgetMs: 60_000,
      });
      expect(queries[0]).toContain('url=jobs.lever.co/a&');
      expect(queries[0]).not.toContain('resumeKey=');
      expect(run2.harvestComplete).toBe(true);
    });

    it('skips 500 tokens rejected last week and validates 500 different tokens; re-checks >30d rejections oldest first', async () => {
      const stateFilePath = path.join(tempDir, 'cooldown-state.json');
      const now = Date.now();
      const sevenDaysAgoIso = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
      const fortyDaysAgoIso = new Date(now - 40 * 24 * 60 * 60 * 1000).toISOString();
      const thirtyFiveDaysAgoIso = new Date(now - 35 * 24 * 60 * 60 * 1000).toISOString();

      const tokens: Record<
        string,
        { firstSeen: string; outcome?: 'empty' | 'not_found' | 'dead_board' | 'error'; checkedAt?: string }
      > = {};

      for (let i = 0; i < 500; i++) {
        tokens[`recent-rej-${i}`] = {
          firstSeen: fortyDaysAgoIso,
          outcome: 'not_found',
          checkedAt: sevenDaysAgoIso,
        };
      }
      tokens['stale-second'] = {
        firstSeen: fortyDaysAgoIso,
        outcome: 'dead_board',
        checkedAt: thirtyFiveDaysAgoIso,
      };
      tokens['stale-oldest'] = {
        firstSeen: fortyDaysAgoIso,
        outcome: 'empty',
        checkedAt: fortyDaysAgoIso,
      };
      for (let i = 0; i < 498; i++) {
        tokens[`fresh-${i}`] = { firstSeen: sevenDaysAgoIso };
      }

      saveLeverDiscoveryState(
        {
          version: 1,
          harvest: { nextPrefix: 'a', resumeKey: null, completedAt: null },
          tokens,
        },
        stateFilePath
      );

      mockedAxios.get.mockResolvedValue({ data: [['original']] } as never);
      const validatedOrder: string[] = [];
      const fakeClient = {
        validateSite: jest.fn().mockImplementation(async (token: string) => {
          validatedOrder.push(token);
          return 'empty' as const;
        }),
      } as unknown as LeverClient;

      const { db } = createMockDiscoveryDb();
      const summary = await runLeverDiscovery({
        stateFilePath,
        prismaClient: db,
        leverClient: fakeClient,
        prefixes: ['a'],
        waybackMinIntervalMs: 0,
        tokenBudget: 500,
        timeBudgetMs: 60_000,
      });

      expect(summary.validated).toBe(500);
      expect(summary.leftByBudget).toBe(0);
      // No recently rejected token re-checked
      expect(validatedOrder.some((t) => t.startsWith('recent-rej-'))).toBe(false);
      // Never-checked tokens come first (498), followed by >30d stale rejections oldest-first
      expect(validatedOrder.slice(0, 498)).toEqual(Array.from({ length: 498 }, (_, i) => `fresh-${i}`));
      expect(validatedOrder.slice(498)).toEqual(['stale-oldest', 'stale-second']);
    });
  });

  describe('Validation counts, pacer, upsert, budget & step summary', () => {
    it('counts live/empty/not_found/dead_board/error separately, seeds only live, enforces 1 req/s pacer and budget cap, and writes GITHUB_STEP_SUMMARY', async () => {
      const stateFilePath = path.join(tempDir, 'val-state.json');
      const summaryFilePath = path.join(tempDir, 'step-summary.md');
      process.env.GITHUB_STEP_SUMMARY = summaryFilePath;

      try {
        saveLeverDiscoveryState(
          {
            version: 1,
            harvest: { nextPrefix: 'a', resumeKey: null, completedAt: null },
            tokens: {
              liveCo: { firstSeen: '2026-11-10T00:00:00.000Z' },
              emptyCo: { firstSeen: '2026-11-10T00:00:00.000Z' },
              missingCo: { firstSeen: '2026-11-10T00:00:00.000Z' },
              deadCo: { firstSeen: '2026-11-10T00:00:00.000Z' },
              errCo: { firstSeen: '2026-11-10T00:00:00.000Z' },
              extraLeft: { firstSeen: '2026-11-10T00:00:00.000Z' },
              knownCo: { firstSeen: '2026-11-10T00:00:00.000Z' },
            },
          },
          stateFilePath
        );

        jest.useFakeTimers();
        jest.setSystemTime(new Date('2026-11-17T01:00:00.000Z'));

        const callTimestamps: number[] = [];
        mockedAxios.get.mockImplementation((async (url: string) => {
          if (url.startsWith('http://web.archive.org')) {
            return { data: [['original']] };
          }
          callTimestamps.push(Date.now());
          if (url.includes('/v0/postings/liveCo')) return { status: 200, data: [{ id: '1', text: 'Eng' }] };
          if (url.includes('jobs.lever.co/liveCo')) {
            return { status: 200, data: fs.readFileSync(path.join(LEVER_FIXTURES_DIR, 'board-spotify.html'), 'utf-8') };
          }
          if (url.includes('/v0/postings/emptyCo')) return { status: 200, data: [] };
          if (url.includes('/v0/postings/missingCo')) throw { response: { status: 404 } };
          if (url.includes('/v0/postings/deadCo')) return { status: 200, data: [{ id: '2', text: 'Old' }] };
          if (url.includes('jobs.lever.co/deadCo')) throw { response: { status: 404 } };
          if (url.includes('/v0/postings/errCo')) throw { response: { status: 500 } };
          return { status: 200, data: [] };
        }) as never);

        const { db, upserts } = createMockDiscoveryDb(['knownCo']);
        const realPacedClient = new LeverClient({ minIntervalMs: 1000 });

        const runPromise = runLeverDiscovery({
          stateFilePath,
          prismaClient: db,
          leverClient: realPacedClient,
          prefixes: ['a'],
          waybackMinIntervalMs: 0,
          tokenBudget: 5, // skips extraLeft
          timeBudgetMs: 120_000,
          enrichMetadata: true,
        });

        await jest.advanceTimersByTimeAsync(20_000);
        const summary = await runPromise;

        expect(summary.alreadyKnown).toBe(1);
        expect(summary.validated).toBe(5);
        expect(summary.live).toBe(1);
        expect(summary.inserted).toBe(1);
        expect(summary.empty).toBe(1);
        expect(summary.notFound).toBe(1);
        expect(summary.deadBoard).toBe(1);
        expect(summary.errors).toBe(1);
        expect(summary.leftByBudget).toBe(1);

        // Only liveCo was upserted
        expect(upserts).toHaveLength(1);
        expect(upserts[0]).toMatchObject({
          where: { source_atsToken: { source: 'LEVER', atsToken: 'liveCo' } },
          create: expect.objectContaining({
            slug: 'lv--liveco',
            source: 'LEVER',
            atsToken: 'liveCo',
            name: 'Spotify',
            logoUrl: 'https://lever-client-logos.s3.us-west-2.amazonaws.com/spotify-header-logo.png',
          }),
        });

        // Verify >= 1000ms spacing between every Lever HTTP call start
        for (let i = 1; i < callTimestamps.length; i++) {
          expect(callTimestamps[i] - callTimestamps[i - 1]).toBeGreaterThanOrEqual(1000);
        }

        const stepSummary = fs.readFileSync(summaryFilePath, 'utf-8');
        expect(stepSummary).toContain('Lever Discovery Summary');
        expect(stepSummary).toContain('Harvest complete');
        expect(stepSummary).toContain('Unique tokens found');
        expect(stepSummary).toContain('Live (inserted)');
        expect(stepSummary).toContain('Dead board');
        expect(stepSummary).toContain('Left by budget/time');
      } finally {
        delete process.env.GITHUB_STEP_SUMMARY;
      }
    });

    it('dispatches CdxWorker.runDiscovery({ source: "lever" }) directly without throwing', async () => {
      mockedAxios.get.mockResolvedValue({ data: [['original']] } as never);
      const { db } = createMockDiscoveryDb();
      const leverClient = new LeverClient({ minIntervalMs: 0 });
      const res = await runDiscovery({
        source: 'lever',
        prismaClient: db,
        tokenBudget: 10,
        timeBudgetMs: 10_000,
        ...( {
          stateFilePath: path.join(tempDir, 'dispatch-state.json'),
          leverClient,
          prefixes: ['a'],
          waybackMinIntervalMs: 0,
        } as Record<string, unknown> ),
      } as never);

      expect(res).toBeDefined();
      expect(res?.source).toBe('lever');
    });
  });

  describe('Lever enrichment in EnrichCompanies', () => {
    it('enriches Lever logos from regional and regionless header img, ignores banner og:image, writes lastEnrichedAt on hit/miss, and leaves Greenhouse untouched', async () => {
      const regionlessHtml = readDiscoveryFixture('board-regionless-logo.html') as string;
      const bannerOnlyHtml = readDiscoveryFixture('board-banner-only.html') as string;
      const regionalHtml = fs.readFileSync(path.join(LEVER_FIXTURES_DIR, 'board-spotify.html'), 'utf-8');

      mockCompany.findMany.mockImplementation(async (args: { where: Record<string, unknown> }) => {
        if (args.where.source === 'GREENHOUSE') {
          return [
            { slug: 'gh--acme', source: 'GREENHOUSE', atsToken: 'acme', name: 'Acme GH', logoUrl: null },
          ];
        }
        if (args.where.source === 'LEVER') {
          return [
            { slug: 'lv--spotify', source: 'LEVER', atsToken: 'spotify', name: null, logoUrl: null },
            { slug: 'lv--regionless', source: 'LEVER', atsToken: 'regionless', name: null, logoUrl: null },
            { slug: 'lv--banneronly', source: 'LEVER', atsToken: 'banneronly', name: 'Banner Only Co', logoUrl: null },
          ];
        }
        return [];
      });
      mockCompany.update.mockResolvedValue({});

      mockedAxios.get.mockImplementation((async (url: string) => {
        if (url === 'https://boards-api.greenhouse.io/v1/boards/acme') {
          return { status: 200, data: { name: 'Acme GH' } };
        }
        if (url === 'https://job-boards.greenhouse.io/acme') {
          return {
            status: 200,
            data: '<meta property="og:image" content="https://s2-recruiting.cdn.greenhouse.io/external_greenhouse_job_boards/logos/400/1/original/acme.png">',
          };
        }
        if (url === 'https://jobs.lever.co/spotify') {
          return { status: 200, data: regionalHtml };
        }
        if (url === 'https://jobs.lever.co/regionless') {
          return { status: 200, data: regionlessHtml };
        }
        if (url === 'https://jobs.lever.co/banneronly') {
          return { status: 200, data: bannerOnlyHtml };
        }
        throw { response: { status: 404 } };
      }) as never);

      // Speed up LeverClient pacer for unit test
      const leverClient = new LeverClient({ minIntervalMs: 0 });
      const clients = new Map<
        'ashby' | 'greenhouse' | 'lever',
        import('../../src/lib/ats/AtsClient').AtsClient
      >([
        ['lever', leverClient],
      ]);

      // 1. Test Lever enrichment with injected 0-delay LeverClient
      const leverRes = await enrichActiveCompanies({
        sources: ['lever'],
        clients,
        limit: 500, // verifies 200-cap passed to take
      });

      expect(leverRes.totalTargeted).toBe(3);
      expect(leverRes.enrichedCount).toBe(3); // banneronly has name 'Banner Only Co' so meta.name is truthy

      // Prisma findMany queried LEVER with lastEnrichedAt 7-day filter and 200 cap
      expect(mockCompany.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            source: 'LEVER',
            status: 'ACTIVE',
            AND: expect.arrayContaining([
              expect.objectContaining({
                OR: expect.arrayContaining([
                  { lastEnrichedAt: null },
                  expect.objectContaining({ lastEnrichedAt: expect.any(Object) }),
                ]),
              }),
            ]),
          }),
          take: 200,
        })
      );

      expect(mockCompany.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { slug: 'lv--spotify' },
          data: expect.objectContaining({
            lastEnrichedAt: expect.any(Date),
            name: 'Spotify',
            logoUrl: 'https://lever-client-logos.s3.us-west-2.amazonaws.com/spotify-header-logo.png',
          }),
        })
      );

      expect(mockCompany.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { slug: 'lv--regionless' },
          data: expect.objectContaining({
            lastEnrichedAt: expect.any(Date),
            name: 'Regionless Co',
            logoUrl: 'https://lever-client-logos.s3.amazonaws.com/regionless-header-logo.png',
          }),
        })
      );

      // Banner og:image must NOT be saved as logoUrl, but lastEnrichedAt IS written
      const bannerUpdate = mockCompany.update.mock.calls.find(
        ([arg]) => (arg as { where?: { slug?: string } }).where?.slug === 'lv--banneronly'
      )?.[0] as { data?: Record<string, unknown> };
      expect(bannerUpdate?.data?.logoUrl).toBeUndefined();
      expect(bannerUpdate?.data?.lastEnrichedAt).toBeInstanceOf(Date);

      // 2. When enrichment returns not_found on Lever, lastEnrichedAt is still stamped (7-day retry guard)
      mockCompany.update.mockClear();
      mockCompany.findMany.mockResolvedValueOnce([
        { slug: 'lv--missing-meta', source: 'LEVER', atsToken: 'missing-meta', name: null, logoUrl: null },
      ]);
      const failRes = await enrichActiveCompanies({ sources: ['lever'], clients });
      expect(failRes.failedCount).toBe(1);
      expect(mockCompany.update).toHaveBeenCalledWith({
        where: { slug: 'lv--missing-meta' },
        data: { lastEnrichedAt: expect.any(Date) },
      });

      // 3. Greenhouse path remains unchanged
      mockCompany.update.mockClear();
      const ghRes = await enrichActiveCompanies({ sources: ['greenhouse'] });
      expect(ghRes.enrichedCount).toBe(1);
      expect(mockCompany.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { slug: 'gh--acme' },
          data: expect.objectContaining({
            lastEnrichedAt: expect.any(Date),
            logoUrl: 'https://s2-recruiting.cdn.greenhouse.io/external_greenhouse_job_boards/logos/400/1/original/acme.png',
          }),
        })
      );
    });
  });
});
