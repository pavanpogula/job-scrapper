/**
 * @file jobCard.test.tsx
 * @summary Unit and component tests for JobCard layout, labels, salary formatting, and invariants
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { JobCard } from '../components/jobs/JobCard';
import { jobsApi } from '../store/api/jobsApi';
import filterReducer from '../store/slices/filterSlice';
import themeReducer from '../store/slices/themeSlice';
import { JobListItem } from '../types/api';

function createStore() {
  return configureStore({
    reducer: {
      [jobsApi.reducerPath]: jobsApi.reducer,
      filters: filterReducer,
      theme: themeReducer,
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(jobsApi.middleware),
  });
}

const mockJob: JobListItem = {
  id: '00000000-0000-4000-8000-000000000001',
  ashbyId: 'ashby-1',
  title: 'Senior Frontend Engineer',
  companySlug: 'acme-corp',
  companyName: 'Acme Corporation',
  companyLogoUrl: 'https://example.com/logo.png',
  department: 'Engineering',
  location: 'San Francisco, CA',
  country: 'US',
  region: 'CA',
  city: 'San Francisco',
  isRemote: false,
  workplaceType: 'OnSite',
  employmentType: 'FullTime',
  publishedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  lastUpdatedAt: null,
  lastUpdatedSource: null,
  salaryMin: 140000,
  salaryMax: 180000,
  salaryCurrency: '$',
  salaryInterval: '1 YEAR',
  applyUrl: 'https://jobs.ashbyhq.com/acme-corp/1/apply',
  isListed: true,
  createdAt: null,
  updatedAt: null,
};

describe('JobCard component', () => {
  it('renders job title, company link, humanized labels, salary, and freshness', () => {
    render(
      <Provider store={createStore()}>
        <MemoryRouter>
          <JobCard job={mockJob} />
        </MemoryRouter>
      </Provider>
    );

    expect(screen.getByText('Senior Frontend Engineer')).toBeInTheDocument();

    const companyLink = screen.getByRole('link', { name: 'Acme Corporation' });
    expect(companyLink).toHaveAttribute('href', '/companies/acme-corp');

    // Humanized workplace label "On-site" instead of raw enum "OnSite"
    expect(screen.getByText(/San Francisco · On-site/i)).toBeInTheDocument();

    // Formatted salary range
    expect(screen.getByText('$140k – $180k/yr')).toBeInTheDocument();

    // Freshness tag
    const timeEl = screen.getByText('Posted 2d ago');
    expect(timeEl.tagName).toBe('TIME');
    expect(timeEl).toHaveAttribute('dateTime');

    // Invariant: Card row must NOT contain an "Apply Direct" button
    expect(screen.queryByRole('button', { name: /apply/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /apply/i })).toBeNull();
  });

  it('renders initials fallback when company logo is not provided', () => {
    const jobWithoutLogo = { ...mockJob, companyLogoUrl: null, companyName: 'Stripe' };
    render(
      <Provider store={createStore()}>
        <MemoryRouter>
          <JobCard job={jobWithoutLogo} />
        </MemoryRouter>
      </Provider>
    );

    // Initial "S" rendered in avatar
    expect(screen.getByText('S')).toBeInTheDocument();
  });
});
