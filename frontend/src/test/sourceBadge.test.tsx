/**
 * @file sourceBadge.test.tsx
 * @summary Unit and integration tests for SourceBadge, source filtering, board URLs, and neutralized copy (ADR-0021)
 * @tags UI, SourceBadge, ATS, MultiSource, Filter, ADR-0021
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { SourceBadge } from '../components/common/SourceBadge';
import { JobCard } from '../components/jobs/JobCard';
import { JobDetailPanel } from '../components/jobs/JobDetailPanel';
import { CompanyHeader } from '../components/companies/CompanyHeader';
import { CompanyCard } from '../components/companies/CompanyCard';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { JobFiltersBar } from '../components/jobs/JobFiltersBar';
import { filterSlice } from '../store/slices/filterSlice';
import { themeSlice } from '../store/slices/themeSlice';
import { jobsApi } from '../store/api/jobsApi';
import { MOCK_JOBS, MOCK_GREENHOUSE_JOB_DETAIL } from '../mocks/mockData';
import type { CompanyProfile, CompanySummary } from '../types/api';

function createTestStore() {
  return configureStore({
    reducer: {
      filters: filterSlice.reducer,
      theme: themeSlice.reducer,
      [jobsApi.reducerPath]: jobsApi.reducer,
    },
    middleware: (getDefault) => getDefault().concat(jobsApi.middleware),
  });
}

describe('SourceBadge Component', () => {
  it('renders "via Ashby" for ashby source, null, or undefined', () => {
    const { rerender } = render(<SourceBadge source="ashby" />);
    expect(screen.getByTestId('source-badge')).toHaveTextContent('via Ashby');

    rerender(<SourceBadge source={null} />);
    expect(screen.getByTestId('source-badge')).toHaveTextContent('via Ashby');

    rerender(<SourceBadge source={undefined} />);
    expect(screen.getByTestId('source-badge')).toHaveTextContent('via Ashby');
  });

  it('renders "via Greenhouse" for greenhouse source', () => {
    render(<SourceBadge source="greenhouse" />);
    expect(screen.getByTestId('source-badge')).toHaveTextContent('via Greenhouse');
  });
});

describe('Source Badge in Job Components & Company Header', () => {
  it('renders SourceBadge on JobCard for Ashby and Greenhouse jobs', () => {
    const store = createTestStore();
    const ashbyJob = MOCK_JOBS[0]; // Deel (ashby)
    const ghJob = MOCK_JOBS[5]; // Figma (greenhouse)

    const { rerender } = render(
      <Provider store={store}>
        <MemoryRouter>
          <JobCard job={ashbyJob} />
        </MemoryRouter>
      </Provider>
    );
    expect(screen.getByText('via Ashby')).toBeInTheDocument();

    rerender(
      <Provider store={store}>
        <MemoryRouter>
          <JobCard job={ghJob} />
        </MemoryRouter>
      </Provider>
    );
    expect(screen.getByText('via Greenhouse')).toBeInTheDocument();
  });

  it('renders SourceBadge in JobDetailPanel header', () => {
    const store = createTestStore();
    render(
      <Provider store={store}>
        <MemoryRouter>
          <JobDetailPanel initialJob={MOCK_GREENHOUSE_JOB_DETAIL} jobId={MOCK_GREENHOUSE_JOB_DETAIL.id} />
        </MemoryRouter>
      </Provider>
    );
    expect(screen.getByText('via Greenhouse')).toBeInTheDocument();
  });

  it('renders SourceBadge and "View careers board ↗" in CompanyHeader', () => {
    const ghProfile: CompanyProfile = {
      slug: 'gh--figma',
      name: 'Figma',
      logoUrl: null,
      jobCount: 18,
      withSalary: 12,
      source: 'greenhouse',
      boardUrl: 'https://job-boards.greenhouse.io/figma',
      latestPublishedAt: '2026-03-01T12:00:00.000Z',
      workplaceTypes: [],
      employmentTypes: [],
      departments: [],
      locations: [],
    };

    render(
      <MemoryRouter>
        <CompanyHeader profile={ghProfile} />
      </MemoryRouter>
    );

    expect(screen.getByText('via Greenhouse')).toBeInTheDocument();
    const linkBtn = screen.getByRole('link', { name: /View careers board/i });
    expect(linkBtn).toBeInTheDocument();
    expect(linkBtn).toHaveAttribute('href', 'https://job-boards.greenhouse.io/figma');
  });

  it('renders careers board link on CompanyCard using boardUrl', () => {
    const company: CompanySummary = {
      slug: 'gh--figma',
      name: 'Figma',
      logoUrl: null,
      jobCount: 18,
      source: 'greenhouse',
      boardUrl: 'https://job-boards.greenhouse.io/figma',
    };

    render(
      <MemoryRouter>
        <CompanyCard company={company} />
      </MemoryRouter>
    );

    const iconButton = screen.getByLabelText(/Open Figma careers board/i);
    expect(iconButton).toBeInTheDocument();
  });
});

describe('Source Filter in JobFiltersBar', () => {
  it('allows selecting Ashby and Greenhouse sources via the Source pill', () => {
    const onUpdateFilters = vi.fn();
    const onClearFilters = vi.fn();

    render(
      <JobFiltersBar
        filters={{ source: '' }}
        onUpdateFilters={onUpdateFilters}
        onClearFilters={onClearFilters}
      />
    );

    // Click Source chip
    const sourceChip = screen.getByText('Source');
    fireEvent.click(sourceChip);

    // Select Greenhouse from menu
    const ghMenuItem = screen.getByText('Greenhouse');
    fireEvent.click(ghMenuItem);

    expect(onUpdateFilters).toHaveBeenCalledWith({ source: 'greenhouse', page: 1 });
  });

  it('displays active source filter chip with delete icon', () => {
    const onUpdateFilters = vi.fn();
    const onClearFilters = vi.fn();

    render(
      <JobFiltersBar
        filters={{ source: 'greenhouse' }}
        onUpdateFilters={onUpdateFilters}
        onClearFilters={onClearFilters}
      />
    );

    expect(screen.getByText('Source: Greenhouse')).toBeInTheDocument();
  });
});

describe('Neutralized Copy Assertions', () => {
  it('Header renders source-neutral fallback copy without "Ashby ATS"', () => {
    const store = createTestStore();
    render(
      <Provider store={store}>
        <MemoryRouter>
          <Header />
        </MemoryRouter>
      </Provider>
    );

    expect(screen.queryByText(/Ashby ATS/i)).not.toBeInTheDocument();
  });

  it('Footer renders multi-source link copy', () => {
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>
    );

    expect(screen.getByText(/Ashby & Greenhouse public job APIs/i)).toBeInTheDocument();
  });
});
