/**
 * @file Discovery & Seeding Pipeline E2E Test
 * @summary End-to-end integration test of CDX parsing, memory diff seeding, and clean verification
 * @tags E2E, Pipeline, Discovery, Seed, CDX, Cleanup
 */

import * as fs from 'fs';
import axios from 'axios';
import { processRawCDXData } from '../../src/utils/ProcessCdxData';
import { seed } from '../../src/utils/Seed';
import { cleanDatabase } from '../../src/database/DbClean';
import { runDiscovery } from '../../src/discovery/CdxWorker';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const mockFindMany = jest.fn();
const mockCreateMany = jest.fn();
const mockUpsert = jest.fn();
const mockJobDeleteMany = jest.fn();
const mockCompanyDeleteMany = jest.fn();
const mockDisconnect = jest.fn();

jest.mock('@prisma/client', () => {
  return {
    PrismaClient: jest.fn().mockImplementation(() => ({
      company: {
        findMany: (...args: unknown[]) => mockFindMany(...args),
        createMany: (...args: unknown[]) => mockCreateMany(...args),
        upsert: (...args: unknown[]) => mockUpsert(...args),
        deleteMany: (...args: unknown[]) => mockCompanyDeleteMany(...args)
      },
      job: {
        deleteMany: (...args: unknown[]) => mockJobDeleteMany(...args)
      },
      $disconnect: (...args: unknown[]) => mockDisconnect(...args)
    }))
  };
});

jest.mock('../../src/config/Companies', () => ({
  TARGET_COMPANIES: ['deel', '1password', 'multiverse']
}));

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  writeFileSync: jest.fn()
}));

describe('E2E: Discovery to Seeding & Clean Pipeline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should run end-to-end: parse CDX data -> seed new companies -> verify clean database state', async () => {
    // 1. Raw CDX Response simulation
    const rawCdx = [
      ['original'],
      ['https://jobs.ashbyhq.com/1password'],
      ['https://jobs.ashbyhq.com/deel'],
      ['https://jobs.ashbyhq.com/multiverse'],
      ['https://jobs.ashbyhq.com/login'], // should be filtered
      ['https://jobs.ashbyhq.com/123456'] // should be filtered
    ];

    // Step 1: Process CDX data
    const extractedSlugs = await processRawCDXData(rawCdx);
    expect(extractedSlugs).toEqual(['1password', 'deel', 'multiverse']);

    // Step 2: Seed into database with memory diff
    // Suppose 'deel' is already in DB, '1password' and 'multiverse' are new
    mockFindMany.mockResolvedValueOnce([{ slug: 'deel' }]);
    mockCreateMany.mockResolvedValueOnce({ count: 2 });

    await seed();

    expect(mockCreateMany).toHaveBeenCalledWith({
      data: [
        { slug: '1password', name: '1password', source: 'ASHBY', atsToken: '1password', status: 'ACTIVE' },
        { slug: 'multiverse', name: 'multiverse', source: 'ASHBY', atsToken: 'multiverse', status: 'ACTIVE' }
      ],
      skipDuplicates: true
    });

    // Step 3: Run DbClean on the seeded database
    // Mock that findMany now returns all 3 seeded companies
    mockFindMany.mockResolvedValueOnce([
      { id: '1', slug: '1password', name: '1password' },
      { id: '2', slug: 'deel', name: 'deel' },
      { id: '3', slug: 'multiverse', name: 'multiverse' }
    ]);

    await cleanDatabase();

    // Verify 0 invalid companies were deleted
    expect(mockJobDeleteMany).not.toHaveBeenCalled();
    expect(mockCompanyDeleteMany).not.toHaveBeenCalled();
  });

  it('runs Greenhouse discovery pipeline with fixture: crawls Common Crawl -> validates -> seeds gh-- companies', async () => {
    // Mock DB currently has gh--existing
    mockFindMany.mockResolvedValueOnce([{ atsToken: 'existing' }]);
    mockUpsert.mockResolvedValue({});

    // Mock network responses:
    // 1. collinfo.json
    mockedAxios.get.mockResolvedValueOnce({ data: [{ id: 'CC-MAIN-2026-10' }] } as never);
    // 2. showNumPages
    mockedAxios.get.mockResolvedValueOnce({ data: { pages: 1 } } as never);
    // 3. CC page 0 with fixture URLs
    mockedAxios.get.mockResolvedValueOnce({
      data: [
        JSON.stringify({ url: 'https://job-boards.greenhouse.io/existing' }),
        JSON.stringify({ url: 'https://boards.greenhouse.io/embed/job_board?for=gitlab' }),
        JSON.stringify({ url: 'https://job-boards.greenhouse.io/jobs/12345' }),
        JSON.stringify({ url: 'https://job-boards.eu.greenhouse.io/airbnb' }),
        JSON.stringify({ url: 'https://job-boards.greenhouse.io/invalid-board' }),
      ].join('\n'),
    } as never);

    // 4. Token validation: gitlab (200), airbnb (200), invalid-board (404)
    mockedAxios.get
      .mockResolvedValueOnce({ status: 200, data: { name: 'GitLab' } } as never)
      .mockResolvedValueOnce({ status: 200, data: { name: 'Airbnb Inc' } } as never)
      .mockRejectedValueOnce({ response: { status: 404 } });

    const summary = await runDiscovery({
      source: 'greenhouse',
      hosts: ['job-boards.greenhouse.io'],
      tokenBudget: 500,
      timeBudgetMs: 30000,
    });

    expect(summary).toBeDefined();
    expect(summary?.tokensFound).toBe(4); // existing, gitlab, airbnb, invalid-board (jobs is dropped)
    expect(summary?.alreadyKnown).toBe(1); // existing
    expect(summary?.validated).toBe(3); // gitlab, airbnb, invalid-board
    expect(summary?.inserted).toBe(2); // gitlab, airbnb

    expect(mockUpsert).toHaveBeenCalledWith({
      where: { source_atsToken: { source: 'GREENHOUSE', atsToken: 'gitlab' } },
      create: {
        slug: 'gh--gitlab',
        source: 'GREENHOUSE',
        atsToken: 'gitlab',
        name: 'GitLab',
        status: 'ACTIVE',
      },
      update: {
        name: 'GitLab',
        status: 'ACTIVE',
      },
    });

    expect(mockUpsert).toHaveBeenCalledWith({
      where: { source_atsToken: { source: 'GREENHOUSE', atsToken: 'airbnb' } },
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
});
