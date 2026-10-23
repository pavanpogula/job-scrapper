/**
 * @file Scraper Pipeline E2E Test
 * @summary End-to-end integration test of scraping, CSV generation, and Markdown table output
 * @tags E2E, Pipeline, Scraper, CSV, Markdown, Hashing
 */

import axios from 'axios';
import {
  fetchJobsForCompany,
  formatCSVRow,
  JobRecord
} from '../../src/core/ScraperCSV';
import { parseCSV, generateMarkdownTable } from '../../scripts/generate-readme';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('E2E: Scraper to CSV to Markdown Pipeline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should execute end-to-end flow: fetch from Ashby -> format CSV -> parse CSV -> render JOBS.md table', async () => {
    // 1. Mock Ashby API returning job postings
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        jobs: [
          {
            id: 'job-uuid-1',
            title: 'Staff Security Engineer',
            publishedAt: '2026-03-01T10:00:00.000Z',
            location: 'Toronto, ON',
            department: 'Security'
          },
          {
            id: 'job-uuid-2',
            title: 'Senior Frontend Developer, Core Web',
            publishedAt: '2026-03-02T15:30:00.000Z',
            location: 'Remote - US',
            department: 'Frontend Engineering'
          }
        ]
      }
    });

    // Step 1: Scraper fetches and structures records
    const jobs: JobRecord[] = await fetchJobsForCompany('1password');
    expect(jobs).toHaveLength(2);

    // Step 2: Stream/format into CSV text
    const csvHeader = 'Company,Job Title,Job Link,Published Date,Location,Department\n';
    const csvRows = jobs.map(formatCSVRow).join('\n');
    const fullCsvContent = csvHeader + csvRows;

    expect(fullCsvContent).toContain('1password,Staff Security Engineer,https://jobs.ashbyhq.com/1password/job-uuid-1,2026-03-01,"Toronto, ON",Security');
    expect(fullCsvContent).toContain('1password,"Senior Frontend Developer, Core Web",https://jobs.ashbyhq.com/1password/job-uuid-2,2026-03-02,Remote - US,Frontend Engineering');

    // Step 3: Markdown table generator parses CSV
    const parsedRows = parseCSV(fullCsvContent);
    expect(parsedRows).toHaveLength(2);
    expect(parsedRows[0].title).toBe('Staff Security Engineer');
    expect(parsedRows[1].title).toBe('Senior Frontend Developer, Core Web');

    // Step 4: Generate Markdown table
    const markdown = generateMarkdownTable(parsedRows);

    expect(markdown).toContain('# 🔍 Job Listings');
    expect(markdown).toContain('**Total Jobs: 2**');
    expect(markdown).toContain('| # | Company | Job Title | Location | Department | Posted | Apply |');
    expect(markdown).toContain('| 1 | 1password | Staff Security Engineer | Toronto, ON | Security | 2026-03-01 | [Apply →](https://jobs.ashbyhq.com/1password/job-uuid-1) |');
    expect(markdown).toContain('| 2 | 1password | Senior Frontend Developer, Core Web | Remote - US | Frontend Eng... | 2026-03-02 | [Apply →](https://jobs.ashbyhq.com/1password/job-uuid-2) |');
  });
});
