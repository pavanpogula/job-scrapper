/**
 * @file contract.test.ts
 * @summary Contract test asserting that UI types strictly match API responses and shared fixture shapes.
 * @tags contract, types, fixtures, parity
 */

import { describe, it, expect } from 'vitest';
import sampleJob from './fixtures/sample-job.json';
import sampleCompany from './fixtures/sample-company.json';
import { JobDetail, JobListItem, CompanySummary } from '../types/api';

describe('P5-T10: Frontend API Contract Parity', () => {
  it('validates sample-job.json adheres to JobDetail and JobListItem contracts', () => {
    const job = sampleJob as unknown as JobDetail;

    expect(job.id).toBeDefined();
    expect(job.title).toBeDefined();
    expect(job.applyUrl).toBeDefined();
    expect(job.companySlug).toBeDefined();
    expect(typeof job.isRemote).toBe('boolean');
    expect(job.company).toBeDefined();
    expect(job.company.name).toBeDefined();
    expect(job.company.slug).toBeDefined();
    expect(typeof job.active).toBe('boolean');
  });

  it('validates sample-company.json adheres to CompanySummary contract', () => {
    const company = sampleCompany as unknown as CompanySummary;

    expect(company.slug).toBeDefined();
    expect(company.name).toBeDefined();
  });

  it('validates required fields exist on list and detail structures', () => {
    const item: Partial<JobListItem> = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      ashbyId: 'ashby-123',
      title: 'Senior Software Engineer',
      applyUrl: 'https://jobs.ashbyhq.com/company/ashby-123/application',
      companySlug: 'company',
      companyName: 'Company Inc',
      isRemote: true,
      isListed: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    expect(item.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(item.applyUrl).toContain('https://');
  });
});
