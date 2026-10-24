/**
 * @file Core Scraper Unit Tests
 * @summary Unit test suite for AshbyScraper class (hashing, caching, batching, error recovery)
 * @tags Unit Test, Scraper, Core, Redis, Hashing, Batch
 */

import axios from 'axios';
import { AshbyScraper } from '../../src/core/Scraper';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const mockCompanyFindMany = jest.fn();
const mockCompanyUpdate = jest.fn();
const mockDeptUpsert = jest.fn();
const mockDeptFindUnique = jest.fn();
const mockLocUpsert = jest.fn();
const mockLocFindUnique = jest.fn();
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
        upsert: (...args: any[]) => mockDeptUpsert(...args),
        findUnique: (...args: any[]) => mockDeptFindUnique(...args)
      },
      location: {
        upsert: (...args: any[]) => mockLocUpsert(...args),
        findUnique: (...args: any[]) => mockLocFindUnique(...args)
      },
      job: {
        upsert: (...args: any[]) => mockJobUpsert(...args)
      },
      $transaction: (...args: any[]) => mockTransaction(...args),
      $disconnect: (...args: any[]) => mockDisconnect(...args)
    }))
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

    it('should recover from cross-process P2002 unique constraint race via findUnique fallback', async () => {
      mockDeptUpsert.mockRejectedValueOnce(new Error('Unique constraint failed on the fields: (`name`)'));
      mockDeptFindUnique.mockResolvedValueOnce({ id: 'dept-race-ok', name: 'Platform' });

      const deptId = await (scraper as any).getOrCreateDepartment('Platform');
      expect(deptId).toBe('dept-race-ok');
      expect(mockDeptFindUnique).toHaveBeenCalledWith({ where: { name: 'Platform' } });
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

  describe('batchUpsertJobs', () => {
    it('should batch database transactions into chunks of BATCH_SIZE (100)', async () => {
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
    });

    it('should fall back to per-job upserts and isolate failing job when a batch transaction throws', async () => {
      const mockJobs = [
        {
          ashbyId: 'good-job-1',
          title: 'Good Job 1',
          companySlug: '1password',
          departmentId: 'd1',
          locationId: 'l1',
          applyUrl: 'https://jobs.ashbyhq.com/1password/good-job-1/application',
          metadata: {},
          contentHash: 'h1'
        },
        {
          ashbyId: 'corrupt-job-2',
          title: 'Corrupt Job 2',
          companySlug: '1password',
          departmentId: 'd1',
          locationId: 'l1',
          applyUrl: 'https://jobs.ashbyhq.com/1password/corrupt-job-2/application',
          metadata: {},
          contentHash: 'h2'
        }
      ];

      mockTransaction.mockRejectedValueOnce(new Error('invalid byte sequence for encoding "UTF8": 0x00'));
      // First 2 calls are inside batch.map() before $transaction; next 2 calls are in the per-job fallback loop
      mockJobUpsert
        .mockReturnValueOnce(Promise.resolve({}))
        .mockReturnValueOnce(Promise.resolve({}))
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('JSONB Unicode escape error'));

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await (scraper as any).batchUpsertJobs(mockJobs);

      expect(mockTransaction).toHaveBeenCalledTimes(1);
      // Called twice during batch map construction + twice during per-job fallback = 4
      expect(mockJobUpsert).toHaveBeenCalledTimes(4);
      expect(warnSpy).toHaveBeenCalled();
      expect(errSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
      errSpy.mockRestore();
    });
  });

  describe('three-strike NOT_FOUND quarantine', () => {
    it('should only mark company NOT_FOUND on the 3rd strike when maxStrikes is 3', async () => {
      mockCompanyUpdate.mockResolvedValue({});

      const strike1 = await scraper.recordNotFoundStrike('flaky-board', 3);
      const strike2 = await scraper.recordNotFoundStrike('flaky-board', 3);
      expect(strike1).toBe(false);
      expect(strike2).toBe(false);
      expect(mockCompanyUpdate).not.toHaveBeenCalled();

      const strike3 = await scraper.recordNotFoundStrike('flaky-board', 3);
      expect(strike3).toBe(true);
      expect(mockCompanyUpdate).toHaveBeenCalledWith({
        where: { slug: 'flaky-board' },
        data: { status: 'NOT_FOUND' }
      });
    });
  });
});
