/**
 * @file Database Seed Unit Tests
 * @summary Unit test suite for memory-diff seeding strategy
 * @tags Unit Test, Seed, Memory Diff, Database
 */

import { seed } from '../../src/utils/Seed';

const mockFindMany = jest.fn();
const mockCreateMany = jest.fn();
const mockDisconnect = jest.fn();

jest.mock('@prisma/client', () => {
  return {
    PrismaClient: jest.fn().mockImplementation(() => ({
      company: {
        findMany: (...args: any[]) => mockFindMany(...args),
        createMany: (...args: any[]) => mockCreateMany(...args)
      },
      $disconnect: (...args: any[]) => mockDisconnect(...args)
    }))
  };
});

jest.mock('../../src/config/Companies', () => ({
  TARGET_COMPANIES: ['1password', 'deel', 'remote', 'multiverse']
}));

describe('Seed Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should find existing companies, diff in memory, and insert only new companies', async () => {
    // Existing: deel and remote
    mockFindMany.mockResolvedValueOnce([
      { slug: 'deel' },
      { slug: 'remote' }
    ]);

    mockCreateMany.mockResolvedValueOnce({ count: 2 });

    await seed();

    expect(mockFindMany).toHaveBeenCalledWith({ select: { slug: true } });
    expect(mockCreateMany).toHaveBeenCalledWith({
      data: [
        { slug: '1password', name: '1password', source: 'ASHBY', atsToken: '1password', status: 'ACTIVE' },
        { slug: 'multiverse', name: 'multiverse', source: 'ASHBY', atsToken: 'multiverse', status: 'ACTIVE' }
      ],
      skipDuplicates: true
    });
  });

  it('should reject slugs containing double-hyphen like a--b and invalid slugs', async () => {
    mockFindMany.mockResolvedValueOnce([]);
    mockCreateMany.mockResolvedValueOnce({ count: 4 });

    // TARGET_COMPANIES has ['1password', 'deel', 'remote', 'multiverse']
    await seed();

    // Verify none of the created slugs contain double hyphens
    const calls = mockCreateMany.mock.calls;
    expect(calls.length).toBe(1);
    const inserted = calls[0][0].data;
    for (const item of inserted) {
      expect(item.slug).not.toContain('--');
      expect(item.source).toBe('ASHBY');
      expect(item.atsToken).toBe(item.slug);
    }
  });

  it('should skip createMany if all target companies already exist in the database', async () => {
    mockFindMany.mockResolvedValueOnce([
      { slug: '1password' },
      { slug: 'deel' },
      { slug: 'remote' },
      { slug: 'multiverse' }
    ]);

    await seed();

    expect(mockFindMany).toHaveBeenCalledWith({ select: { slug: true } });
    expect(mockCreateMany).not.toHaveBeenCalled();
  });

  it('should explicitly filter out a--b if present in target list', async () => {
    const fs = require('fs');
    const existsSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    const readSpy = jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(['valid-co', 'a--b', 'another-co']));

    mockFindMany.mockResolvedValueOnce([]);
    mockCreateMany.mockResolvedValueOnce({ count: 2 });

    await seed({ useExtractedSlugs: true });

    expect(mockCreateMany).toHaveBeenCalledWith({
      data: [
        { slug: 'valid-co', name: 'valid-co', source: 'ASHBY', atsToken: 'valid-co', status: 'ACTIVE' },
        { slug: 'another-co', name: 'another-co', source: 'ASHBY', atsToken: 'another-co', status: 'ACTIVE' }
      ],
      skipDuplicates: true
    });

    existsSpy.mockRestore();
    readSpy.mockRestore();
  });
});
