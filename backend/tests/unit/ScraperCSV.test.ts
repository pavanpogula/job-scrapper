/**
 * @file CSV Scraper Unit Tests
 * @summary Unit test suite for CSV escaping, row formatting, and Ashby job board fetching
 * @tags Unit Test, CSV, Scraper, Escaping, Ashby
 */

import axios from 'axios';
import fs from 'fs';
import {
  escapeCSV,
  formatCSVRow,
  fetchJobsForCompany,
  scrapeToCSV,
  JobRecord
} from '../../src/core/ScraperCSV';
import { ErrorTracker } from '../../src/lib/ErrorTracker';
import { mockCompany } from '../../__mocks__/@prisma/client';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ScraperCSV Unit Tests', () => {
  describe('escapeCSV', () => {
    it('should return unquoted string when no special characters exist', () => {
      expect(escapeCSV('Senior Software Engineer')).toBe('Senior Software Engineer');
      expect(escapeCSV('1password')).toBe('1password');
      expect(escapeCSV('Engineering')).toBe('Engineering');
    });

    it('should quote values containing commas', () => {
      expect(escapeCSV('London, UK')).toBe('"London, UK"');
      expect(escapeCSV('San Francisco, California, USA')).toBe(
        '"San Francisco, California, USA"'
      );
    });

    it('should escape double quotes by doubling them and wrapping in quotes', () => {
      expect(escapeCSV('Lead "Staff" Engineer')).toBe('"Lead ""Staff"" Engineer"');
      expect(escapeCSV('"Already Quoted"')).toBe('"""Already Quoted"""');
    });

    it('should quote values containing newlines', () => {
      expect(escapeCSV('Line 1\nLine 2')).toBe('"Line 1\nLine 2"');
    });

    it('should handle combination of commas, quotes, and newlines', () => {
      expect(escapeCSV('Role: "Tech Lead", Team\nPlatform')).toBe(
        '"Role: ""Tech Lead"", Team\nPlatform"'
      );
    });
  });

  describe('formatCSVRow', () => {
    it('should format a JobRecord into an escaped 6-column CSV line', () => {
      const job: JobRecord = {
        company: '1password',
        title: 'Full Stack Engineer, Core',
        link: 'https://jobs.ashbyhq.com/1password/123-abc',
        publishedDate: '2026-03-20',
        location: 'Toronto, Canada',
        department: 'Product & Engineering'
      };

      const line = formatCSVRow(job);
      expect(line).toBe(
        '1password,"Full Stack Engineer, Core",https://jobs.ashbyhq.com/1password/123-abc,2026-03-20,"Toronto, Canada",Product & Engineering'
      );
    });
  });

  describe('fetchJobsForCompany', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should fetch jobs from Ashby API and map to JobRecord format', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          jobs: [
            {
              id: 'job-123',
              title: 'DevOps Architect',
              publishedAt: '2026-01-15T09:30:00.000Z',
              location: 'Remote, US',
              department: 'Infrastructure'
            },
            {
              id: 'job-456',
              title: 'Product Manager',
              publishedAt: null,
              location: null,
              department: null
            }
          ]
        }
      });

      const records = await fetchJobsForCompany('deel');

      expect(records).toHaveLength(2);
      expect(records[0]).toEqual({
        company: 'deel',
        title: 'DevOps Architect',
        link: 'https://jobs.ashbyhq.com/deel/job-123',
        publishedDate: '2026-01-15',
        location: 'Remote, US',
        department: 'Infrastructure'
      });
      expect(records[1]).toEqual({
        company: 'deel',
        title: 'Product Manager',
        link: 'https://jobs.ashbyhq.com/deel/job-456',
        publishedDate: '',
        location: '',
        department: ''
      });
    });

    it('should return empty array when Ashby API request fails (404, 500, network)', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('Network Error'));

      const records = await fetchJobsForCompany('nonexistent');
      expect(records).toEqual([]);
    });
  });

  describe('scrapeToCSV', () => {
    it('saves report after stream finish', async () => {
      const order: string[] = [];

      jest.spyOn(ErrorTracker.prototype, 'saveReport').mockImplementation(function (this: any) {
        order.push('saveReport');
        return null as any;
      });

      const mockStream: any = {
        write: jest.fn(),
        end: jest.fn((cb: any) => {
          order.push('streamFinish');
          if (cb) cb();
        })
      };
      jest.spyOn(fs, 'createWriteStream').mockReturnValue(mockStream);
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

      mockCompany.findMany.mockResolvedValueOnce([{ slug: 'acme-corp' }]);
      mockedAxios.get.mockResolvedValueOnce({
        data: { jobs: [] }
      });

      await scrapeToCSV();

      expect(order).toEqual(['streamFinish', 'saveReport']);
    });
  });
});
