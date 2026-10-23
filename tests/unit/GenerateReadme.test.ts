/**
 * @file Generate Readme Tests
 * @summary Unit test suite for CSV parsing, string truncation, and Markdown table generation
 * @tags Unit Test, Markdown, CSV Parsing, Table Generator
 */

import { parseCSV, generateMarkdownTable, JobRow } from '../../scripts/generate-readme';

describe('GenerateReadme Unit Tests', () => {
  describe('parseCSV', () => {
    it('should parse standard CSV content into structured JobRow objects', () => {
      const csv = `Company,Job Title,Job Link,Published Date,Location,Department
1password,Backend Developer,https://jobs.ashbyhq.com/1password/1,2026-01-01,Toronto,Engineering
deel,Frontend Engineer,https://jobs.ashbyhq.com/deel/2,2026-01-02,Remote,Product`;

      const rows = parseCSV(csv);

      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual({
        company: '1password',
        title: 'Backend Developer',
        link: 'https://jobs.ashbyhq.com/1password/1',
        publishedDate: '2026-01-01',
        location: 'Toronto',
        department: 'Engineering'
      });
      expect(rows[1]).toEqual({
        company: 'deel',
        title: 'Frontend Engineer',
        link: 'https://jobs.ashbyhq.com/deel/2',
        publishedDate: '2026-01-02',
        location: 'Remote',
        department: 'Product'
      });
    });

    it('should correctly handle commas inside quoted field values', () => {
      const csv = `Company,Job Title,Job Link,Published Date,Location,Department
"Acme, Inc.","Staff Engineer, Core & Cloud",https://jobs.ashbyhq.com/acme/3,2026-01-03,"San Francisco, CA","Platform, Infrastructure"`;

      const rows = parseCSV(csv);

      expect(rows).toHaveLength(1);
      expect(rows[0].company).toBe('Acme, Inc.');
      expect(rows[0].title).toBe('Staff Engineer, Core & Cloud');
      expect(rows[0].location).toBe('San Francisco, CA');
      expect(rows[0].department).toBe('Platform, Infrastructure');
    });

    it('should ignore empty lines in CSV', () => {
      const csv = `Company,Job Title,Job Link,Published Date,Location,Department
1password,Engineer,https://jobs.ashbyhq.com/1password/1,2026-01-01,Remote,Eng

`;
      const rows = parseCSV(csv);
      expect(rows).toHaveLength(1);
    });
  });

  describe('generateMarkdownTable', () => {
    it('should generate markdown table with total count and apply links', () => {
      const jobs: JobRow[] = [
        {
          company: 'Stripe',
          title: 'Software Engineer',
          link: 'https://jobs.ashbyhq.com/stripe/123',
          publishedDate: '2026-02-01',
          location: 'San Francisco',
          department: 'Payments'
        }
      ];

      const md = generateMarkdownTable(jobs);

      expect(md).toContain('# 🔍 Job Listings');
      expect(md).toContain('**Total Jobs: 1**');
      expect(md).toContain('| # | Company | Job Title | Location | Department | Posted | Apply |');
      expect(md).toContain('| 1 | Stripe | Software Engineer | San Francisco | Payments | 2026-02-01 | [Apply →](https://jobs.ashbyhq.com/stripe/123) |');
    });

    it('should truncate fields exceeding column character limits', () => {
      const jobs: JobRow[] = [
        {
          company: 'A-Very-Long-Company-Name-That-Exceeds-Twenty-Characters',
          title: 'Principal Software Engineer - High Performance Computing & Distributed Systems',
          link: 'https://jobs.ashbyhq.com/long/1',
          publishedDate: '2026-02-01',
          location: 'London, Greater London, United Kingdom',
          department: 'Product Platform Operations'
        }
      ];

      const md = generateMarkdownTable(jobs);

      // Company > 20 -> 17 + '...'
      expect(md).toContain('A-Very-Long-Compa...');
      // Title > 40 -> 37 + '...'
      expect(md).toContain('Principal Software Engineer - High Pe...');
      // Location > 20 -> 17 + '...'
      expect(md).toContain('London, Greater L...');
      // Department > 15 -> 12 + '...'
      expect(md).toContain('Product Plat...');
    });
  });
});
