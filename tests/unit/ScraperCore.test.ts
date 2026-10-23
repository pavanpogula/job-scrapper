/**
 * @file Core Scraper Unit Tests
 * @summary Unit test suite for AshbyScraper class (hashing, caching, batching, error recovery)
 * @tags Unit Test, Scraper, Core, Redis, Hashing, Batch
 */

import axios from 'axios';
import { AshbyScraper } from '../../src/core/Scraper';
import { redis } from '../../src/lib/Redis';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const mockCompanyFindMany = jest.fn();
const mockCompanyUpdate = jest.fn();
const mockDeptUpsert = jest.fn();
const mockLocUpsert = jest.fn();
const mockJobUpsert = jest.fn();
const mockTransaction = jest.fn();
const mockDisconnect = jest.fn();

jest.mock('@prisma/client', () => {
  return {
    PrismaClient: jest.fn().mockImplementation(() => ({
      company: {
        findMany: (...args: any[]) => mockCompanyFindMany(...args),
        update: (...args: any[]) => mockCompanyUpdate(...args)
      },
      department: {
        upsert: (...args: any[]) => mockDeptUpsert(...args)
      },
      location: {
        upsert: (...args: any[]) => mockLocUpsert(...args)
      },
      job: {
        upsert: (...args: any[]) => mockJobUpsert(...args)
      },
      $transaction: (...args: any[]) => mockTransaction(...args),
      $disconnect: (...args: any[]) => mockDisconnect(...args)
    }))
  };
});

jest.mock('../../src/lib/Redis', () => {
  return {
    redis: {
      status: 'ready',
      connect: jest.fn().mockResolvedValue(undefined),
      get: jest.fn(),
      pipeline: jest.fn().mockReturnValue({
        set: jest.fn(),
        exec: jest.fn().mockResolvedValue([])
      }),
      quit: jest.fn().mockResolvedValue(undefined)
    }
  };
});

describe('AshbyScraper Unit Tests', () => {
  let scraper: AshbyScraper;

  beforeEach(() => {
    jest.clearAllMocks();
    scraper = new AshbyScraper();
  });

  describe('fetchJobs error handling', () => {
    it('should mark company status as NOT_FOUND when Ashby returns HTTP 404', async () => {
      mockedAxios.get.mockRejectedValueOnce({
        isAxiosError: true,
        response: { status: 404 }
      });
      mockedAxios.isAxiosError.mockReturnValueOnce(true);
      mockCompanyUpdate.mockResolvedValueOnce({});

      // Access private method via any
      const result = await (scraper as any).fetchJobs('dead-slug');

      expect(result).toEqual({ slug: 'dead-slug', jobs: [] });
      expect(mockCompanyUpdate).toHaveBeenCalledWith({
        where: { slug: 'dead-slug' },
        data: { status: 'NOT_FOUND' }
      });
    });

    it('should return empty jobs array on general network failure without altering company status', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('Connection timeout'));
      mockedAxios.isAxiosError.mockReturnValueOnce(false);

      const result = await (scraper as any).fetchJobs('timeout-slug');

      expect(result).toEqual({ slug: 'timeout-slug', jobs: [] });
      expect(mockCompanyUpdate).not.toHaveBeenCalled();
    });
  });

  describe('getOrCreateDepartment and getOrCreateLocation in-memory caching', () => {
    it('should query Prisma on first department lookup, then hit memory cache on second', async () => {
      mockDeptUpsert.mockResolvedValueOnce({ id: 'dept-123', name: 'Engineering' });

      const id1 = await (scraper as any).getOrCreateDepartment('Engineering');
      const id2 = await (scraper as any).getOrCreateDepartment('Engineering');

      expect(id1).toBe('dept-123');
      expect(id2).toBe('dept-123');
      expect(mockDeptUpsert).toHaveBeenCalledTimes(1);
    });

    it('should return null if department or location name is empty or undefined', async () => {
      const deptId = await (scraper as any).getOrCreateDepartment('');
      const locId = await (scraper as any).getOrCreateLocation('');

      expect(deptId).toBeNull();
      expect(locId).toBeNull();
      expect(mockDeptUpsert).not.toHaveBeenCalled();
      expect(mockLocUpsert).not.toHaveBeenCalled();
    });
  });

  describe('generateHash', () => {
    it('should generate consistent md5 hash for identical job payloads', () => {
      const job1 = {
        title: 'Software Engineer',
        location: 'Remote',
        department: 'Tech',
        compensationTier: { min: 100, max: 150, currency: 'USD', interval: 'YEAR' }
      };
      const job2 = { ...job1 };

      const hash1 = (scraper as any).generateHash(job1);
      const hash2 = (scraper as any).generateHash(job2);

      expect(hash1).toBe(hash2);
      expect(typeof hash1).toBe('string');
      expect(hash1).toHaveLength(32); // MD5 hex length
    });
  });

  describe('filterChangedJobs', () => {
    it('should skip job when hash matches Redis cache', async () => {
      (scraper as any).isRedisConnected = true;
      const job = {
        id: 'job-1',
        title: 'Engineer',
        location: 'Remote',
        department: 'IT'
      };
      const expectedHash = (scraper as any).generateHash(job);

      (redis.get as jest.Mock).mockResolvedValueOnce(expectedHash);

      const changed = await (scraper as any).filterChangedJobs([job]);
      expect(changed).toHaveLength(0);
    });

    it('should include job when hash differs from Redis cache', async () => {
      (scraper as any).isRedisConnected = true;
      const job = {
        id: 'job-2',
        title: 'Engineer 2',
        location: 'Remote',
        department: 'IT'
      };

      (redis.get as jest.Mock).mockResolvedValueOnce('old-outdated-hash');

      const changed = await (scraper as any).filterChangedJobs([job]);
      expect(changed).toHaveLength(1);
      expect(changed[0].job.id).toBe('job-2');
    });

    it('should retain all jobs when Redis is disabled', async () => {
      (scraper as any).isRedisConnected = false;
      const jobs = [
        { id: 'job-1', title: 'A', location: 'X', department: 'Y' },
        { id: 'job-2', title: 'B', location: 'X', department: 'Y' }
      ];

      const changed = await (scraper as any).filterChangedJobs(jobs);
      expect(changed).toHaveLength(2);
      expect(redis.get).not.toHaveBeenCalled();
    });
  });

  describe('batchUpsertJobs', () => {
    it('should batch database transactions into chunks of BATCH_SIZE (100) and update Redis pipeline', async () => {
      (scraper as any).isRedisConnected = true;
      const mockJobs = Array.from({ length: 150 }, (_, i) => ({
        ashbyId: `job-${i}`,
        title: `Job ${i}`,
        companySlug: '1password',
        departmentId: 'd1',
        locationId: 'l1',
        applyUrl: `https://jobs.ashbyhq.com/1password/${i}`,
        metadata: {},
        contentHash: `hash-${i}`
      }));

      mockTransaction.mockResolvedValue([]);

      await (scraper as any).batchUpsertJobs(mockJobs);

      // 150 jobs with BATCH_SIZE 100 -> 2 batches
      expect(mockTransaction).toHaveBeenCalledTimes(2);
      expect(redis.pipeline).toHaveBeenCalledTimes(2);
    });
  });
});
