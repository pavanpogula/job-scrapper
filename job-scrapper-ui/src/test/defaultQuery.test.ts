import { describe, it, expect } from 'vitest';
import filterReducer from '../store/slices/filterSlice';
import { buildJobsQueryParams } from '../store/api/jobsApi';

describe('P1-T20: Default Query String', () => {
  it('generates exactly page=1&pageSize=25&sortBy=publishedAt&sortOrder=desc for default filter state', () => {
    const initialState = filterReducer(undefined, { type: '@@INIT' });
    const queryString = buildJobsQueryParams(initialState);
    expect(queryString).toBe('page=1&pageSize=25&sortBy=publishedAt&sortOrder=desc');
  });

  it('omits salaryInterval when salaryMin is absent even if salaryInterval is set', () => {
    const params = {
      salaryInterval: '1 YEAR' as const,
      sortBy: 'publishedAt' as const,
      sortOrder: 'desc' as const,
      page: 1,
      pageSize: 25,
    };
    const queryString = buildJobsQueryParams(params);
    expect(queryString).toBe('page=1&pageSize=25&sortBy=publishedAt&sortOrder=desc');
  });

  it('includes salaryInterval when salaryMin is present', () => {
    const params = {
      salaryMin: 100000,
      salaryInterval: '1 YEAR' as const,
      sortBy: 'publishedAt' as const,
      sortOrder: 'desc' as const,
      page: 1,
      pageSize: 25,
    };
    const queryString = buildJobsQueryParams(params);
    expect(queryString).toBe('page=1&pageSize=25&salaryInterval=1+YEAR&salaryMin=100000&sortBy=publishedAt&sortOrder=desc');
  });
});
