/**
 * @file Discovery & Seeding Pipeline E2E Test
 * @summary End-to-end integration test of CDX parsing, memory diff seeding, and clean verification
 * @tags E2E, Pipeline, Discovery, Seed, CDX, Cleanup
 */

import * as fs from 'fs';
import { processRawCDXData } from '../../src/utils/ProcessCdxData';
import { seed } from '../../src/utils/Seed';
import { cleanDatabase } from '../../src/database/DbClean';

const mockFindMany = jest.fn();
const mockCreateMany = jest.fn();
const mockJobDeleteMany = jest.fn();
const mockCompanyDeleteMany = jest.fn();
const mockDisconnect = jest.fn();

jest.mock('@prisma/client', () => {
  return {
    PrismaClient: jest.fn().mockImplementation(() => ({
      company: {
        findMany: (...args: any[]) => mockFindMany(...args),
        createMany: (...args: any[]) => mockCreateMany(...args),
        deleteMany: (...args: any[]) => mockCompanyDeleteMany(...args)
      },
      job: {
        deleteMany: (...args: any[]) => mockJobDeleteMany(...args)
      },
      $disconnect: (...args: any[]) => mockDisconnect(...args)
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
        { slug: '1password', name: '1password', status: 'ACTIVE' },
        { slug: 'multiverse', name: 'multiverse', status: 'ACTIVE' }
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
});
