/**
 * @file ATS URL Builders Unit Tests
 * @summary Validates canonical job, board, and application URLs for Ashby, Greenhouse, and Lever
 * @tags ATS, URLs, Builders, Routing, Unit Tests, ADR-0021, ADR-0022
 */

import { jobUrl, boardUrl, applyUrl } from '../../src/lib/ats/urls';

describe('ATS URL Builders (ADR-0022)', () => {
  describe('Lever URLs', () => {
    it('builds canonical Lever board URLs preserving case and URL-encoding special characters', () => {
      expect(boardUrl('lever', 'AIFund')).toBe('https://jobs.lever.co/AIFund');
      expect(boardUrl('lever', '1840&Company')).toBe('https://jobs.lever.co/1840%26Company');
      expect(boardUrl('lever', 'arcteryx.com')).toBe('https://jobs.lever.co/arcteryx.com');
      expect(boardUrl('lever', 'spotify')).toBe('https://jobs.lever.co/spotify');
    });

    it('builds canonical Lever job URLs', () => {
      const jobId = '8b3684a0-7b3b-486a-8d76-1b3d5b2e9876';
      expect(jobUrl('lever', 'spotify', jobId)).toBe(
        `https://jobs.lever.co/spotify/${jobId}`
      );
      expect(jobUrl('lever', '1840&Company', jobId)).toBe(
        `https://jobs.lever.co/1840%26Company/${jobId}`
      );
    });

    it('builds canonical Lever direct apply URLs', () => {
      const jobId = '8b3684a0-7b3b-486a-8d76-1b3d5b2e9876';
      expect(applyUrl('lever', 'spotify', jobId)).toBe(
        `https://jobs.lever.co/spotify/${jobId}/apply`
      );
      expect(applyUrl('lever', '1840&Company', jobId)).toBe(
        `https://jobs.lever.co/1840%26Company/${jobId}/apply`
      );
    });
  });

  describe('Ashby and Greenhouse URLs (lower-cased)', () => {
    it('still lower-cases tokens for Ashby and Greenhouse', () => {
      expect(boardUrl('ashby', 'AcmeCorp')).toBe('https://jobs.ashbyhq.com/acmecorp');
      expect(boardUrl('greenhouse', 'FigmaInc')).toBe('https://job-boards.greenhouse.io/figmainc');

      expect(jobUrl('ashby', 'AcmeCorp', 'job-123')).toBe(
        'https://jobs.ashbyhq.com/acmecorp/job-123'
      );
      expect(jobUrl('greenhouse', 'FigmaInc', '456789')).toBe(
        'https://job-boards.greenhouse.io/figmainc/jobs/456789'
      );

      expect(applyUrl('ashby', 'AcmeCorp', 'job-123')).toBe(
        'https://jobs.ashbyhq.com/acmecorp/job-123/application'
      );
      expect(applyUrl('greenhouse', 'FigmaInc', '456789')).toBe(
        'https://job-boards.greenhouse.io/figmainc/jobs/456789'
      );
    });
  });
});
