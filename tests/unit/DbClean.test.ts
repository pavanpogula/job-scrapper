/**
 * @file Database Clean Unit Tests
 * @summary Unit test suite for DbClean slug validation, dry-run mode, and foreign key safe deletion
 * @tags Unit Test, Database, Cleanup, Prisma, Foreign Key
 */

import { cleanDatabase } from '../../src/database/DbClean';

const mockFindMany = jest.fn();
const mockJobDeleteMany = jest.fn();
const mockCompanyDeleteMany = jest.fn();
const mockDisconnect = jest.fn();

jest.mock('@prisma/client', () => {
  return {
    PrismaClient: jest.fn().mockImplementation(() => ({
      company: {
        findMany: (...args: any[]) => mockFindMany(...args),
        deleteMany: (...args: any[]) => mockCompanyDeleteMany(...args)
      },
      job: {
        deleteMany: (...args: any[]) => mockJobDeleteMany(...args)
      },
      $disconnect: (...args: any[]) => mockDisconnect(...args)
    }))
  };
});

describe('DbClean Unit Tests', () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    jest.clearAllMocks();
    process.argv = [...originalArgv];
  });

  afterAll(() => {
    process.argv = originalArgv;
  });

  it('should identify invalid slugs in dry-run mode without deleting any records', async () => {
    process.argv = ['node', 'DbClean.ts']; // No --execute

    mockFindMany.mockResolvedValueOnce([
      { id: '1', slug: 'deel', name: 'deel' },
      { id: '2', slug: 'login', name: 'login' }, // invalid: blocklist
      { id: '3', slug: '12345', name: '12345' }, // invalid: numeric
      { id: '4', slug: '1password', name: '1password' }
    ]);

    await cleanDatabase();

    expect(mockFindMany).toHaveBeenCalled();
    expect(mockJobDeleteMany).not.toHaveBeenCalled();
    expect(mockCompanyDeleteMany).not.toHaveBeenCalled();
    expect(mockDisconnect).toHaveBeenCalled();
  });

  it('should delete dependent jobs first, then delete companies when --execute is passed', async () => {
    process.argv = ['node', 'DbClean.ts', '--execute'];

    mockFindMany.mockResolvedValueOnce([
      { id: 'c1', slug: '1password', name: '1password' },
      { id: 'c2', slug: 'invalid--slug', name: 'invalid--slug' },
      { id: 'c3', slug: 'careers', name: 'careers' }
    ]);

    const callOrder: string[] = [];
    mockJobDeleteMany.mockImplementationOnce(() => {
      callOrder.push('job.deleteMany');
      return Promise.resolve({ count: 5 });
    });
    mockCompanyDeleteMany.mockImplementationOnce(() => {
      callOrder.push('company.deleteMany');
      return Promise.resolve({ count: 2 });
    });

    await cleanDatabase();

    expect(callOrder).toEqual(['job.deleteMany', 'company.deleteMany']);
    expect(mockJobDeleteMany).toHaveBeenCalledWith({
      where: {
        companySlug: { in: ['invalid--slug', 'careers'] }
      }
    });
    expect(mockCompanyDeleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['c2', 'c3'] }
      }
    });
    expect(mockDisconnect).toHaveBeenCalled();
  });

  it('should do nothing if all companies have valid slugs', async () => {
    process.argv = ['node', 'DbClean.ts', '--execute'];

    mockFindMany.mockResolvedValueOnce([
      { id: '1', slug: '1password', name: '1password' },
      { id: '2', slug: 'abridge', name: 'abridge' }
    ]);

    await cleanDatabase();

    expect(mockJobDeleteMany).not.toHaveBeenCalled();
    expect(mockCompanyDeleteMany).not.toHaveBeenCalled();
  });
});
