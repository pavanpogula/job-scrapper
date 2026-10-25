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
        { slug: '1password', name: '1password', status: 'ACTIVE' },
        { slug: 'multiverse', name: 'multiverse', status: 'ACTIVE' }
      ],
      skipDuplicates: true
    });
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
});
