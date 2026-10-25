/**
 * @file CDX Worker Tests
 * @summary Unit tests for company slug validation and Wayback Machine CDX URL discovery
 * @tags Unit Test, Discovery, Validation, CDX, Regex, Blocklist
 */

import axios from 'axios';
import { isValidSlug, runDiscovery } from '../../src/discovery/CdxWorker';

// Mock dependencies
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const mockUpsert = jest.fn();

jest.mock('@prisma/client', () => {
  return {
    PrismaClient: jest.fn().mockImplementation(() => ({
      company: {
        upsert: (...args: any[]) => mockUpsert(...args)
      },
      $disconnect: jest.fn().mockResolvedValue(undefined)
    }))
  };
});

describe('CdxWorker', () => {
  describe('isValidSlug', () => {
    it('should accept valid company slugs', () => {
      expect(isValidSlug('deel')).toBe(true);
      expect(isValidSlug('1password')).toBe(true);
      expect(isValidSlug('remote-team')).toBe(true);
      expect(isValidSlug('hashicorp-cloud')).toBe(true);
      expect(isValidSlug('abridge')).toBe(true);
      expect(isValidSlug('multiverse')).toBe(true);
    });

    it('should reject slugs that are too short or too long', () => {
      expect(isValidSlug('')).toBe(false);
      expect(isValidSlug('a')).toBe(false);
      expect(isValidSlug('a'.repeat(51))).toBe(false);
      expect(isValidSlug('a'.repeat(50))).toBe(true);
    });

    it('should reject slugs violating regex pattern', () => {
      expect(isValidSlug('-leading-dash')).toBe(false);
      expect(isValidSlug('trailing-dash-')).toBe(false);
      expect(isValidSlug('double--dash')).toBe(false);
      expect(isValidSlug('under_score')).toBe(false);
      expect(isValidSlug('with.dot')).toBe(false);
      expect(isValidSlug('with spaces')).toBe(false);
      expect(isValidSlug('UppercaseSlug')).toBe(false);
      expect(isValidSlug('slug@special')).toBe(false);
    });

    it('should reject blocklisted keywords', () => {
      const blocklisted = [
        'login',
        'api',
        'feed',
        'jobs',
        'careers',
        'admin',
        'dashboard',
        'search',
        'assets',
        'static',
        'fonts',
        'css',
        'js',
        'favicon',
        'robots.txt',
        'null',
        'undefined',
        'true',
        'false',
        '0x',
        '100vh',
        '500ms',
        'void'
      ];

      for (const word of blocklisted) {
        expect(isValidSlug(word)).toBe(false);
      }
    });

    it('should reject purely numeric strings', () => {
      expect(isValidSlug('123')).toBe(false);
      expect(isValidSlug('0000')).toBe(false);
      expect(isValidSlug('999999999')).toBe(false);
      expect(isValidSlug('123-abc')).toBe(true); // contains alphanumeric
    });
  });

  describe('runDiscovery', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should fetch CDX URLs, extract valid slugs, and upsert each slug into Prisma', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: [
          ['original'],
          ['https://jobs.ashbyhq.com/1password'],
          ['https://jobs.ashbyhq.com/1password/senior-backend-engineer'],
          ['https://jobs.ashbyhq.com/abridge/staff-ml-engineer'],
          ['https://jobs.ashbyhq.com/login'],
          ['https://jobs.ashbyhq.com/123456']
        ]
      });

      mockUpsert.mockResolvedValue({});

      await runDiscovery();

      // Only '1password' and 'abridge' should be upserted (deduplicated, login & numeric filtered)
      expect(mockUpsert).toHaveBeenCalledTimes(2);
      expect(mockUpsert).toHaveBeenCalledWith({
        where: { slug: '1password' },
        update: {},
        create: { slug: '1password', name: '1password' }
      });
      expect(mockUpsert).toHaveBeenCalledWith({
        where: { slug: 'abridge' },
        update: {},
        create: { slug: 'abridge', name: 'abridge' }
      });
    });

    it('should handle CDX API network failures gracefully without crashing', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('CDX Gateway Timeout'));

      await expect(runDiscovery()).resolves.toBeUndefined();
      expect(mockUpsert).not.toHaveBeenCalled();
    });
  });
});
