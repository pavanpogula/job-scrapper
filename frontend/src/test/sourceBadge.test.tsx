/**
 * @file sourceBadge.test.tsx
 * @summary Unit and integration tests for SourceBadge, source filtering, board URLs, and neutralized copy (ADR-0021)
 * @tags UI, SourceBadge, ATS, MultiSource, Filter, ADR-0021
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { SourceBadge } from '../components/common/SourceBadge';
import { JobCard } from '../components/jobs/JobCard';
import { JobDetailPanel } from '../components/jobs/JobDetailPanel';
import { CompanyHeader } from '../components/companies/CompanyHeader';
import { CompanyCard } from '../components/companies/CompanyCard';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { AboutPage } from '../pages/AboutPage';
import { JobFiltersBar } from '../components/jobs/JobFiltersBar';
import { filterSlice } from '../store/slices/filterSlice';
import { themeSlice } from '../store/slices/themeSlice';
import { jobsApi } from '../store/api/jobsApi';
import {
  MOCK_JOBS,
  MOCK_GREENHOUSE_JOB_DETAIL,
  MOCK_LEVER_JOB_DETAIL,
  MOCK_LEVER_COMPANY_PROFILE,
} from '../mocks/mockData';
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
    expect(screen.getByTestId('source-badge')).toHaveAttribute('data-source', 'greenhouse');
  });

  it('renders "via Lever" for lever source', () => {
    render(<SourceBadge source="lever" />);
    expect(screen.getByTestId('source-badge')).toHaveTextContent('via Lever');
    expect(screen.getByTestId('source-badge')).toHaveAttribute('data-source', 'lever');
  });

  it('renders "via Ashby" with data-source="ashby" for unknown or null source', () => {
    const { rerender } = render(<SourceBadge source="unknown_ats" />);
    expect(screen.getByTestId('source-badge')).toHaveTextContent('via Ashby');
    expect(screen.getByTestId('source-badge')).toHaveAttribute('data-source', 'ashby');

    rerender(<SourceBadge source={null} />);
    expect(screen.getByTestId('source-badge')).toHaveTextContent('via Ashby');
    expect(screen.getByTestId('source-badge')).toHaveAttribute('data-source', 'ashby');

    rerender(<SourceBadge source="constructor" />);
    expect(screen.getByTestId('source-badge')).toHaveTextContent('via Ashby');
    expect(screen.getByTestId('source-badge')).toHaveAttribute('data-source', 'ashby');
  });
});

describe('Source Badge in Job Components & Company Header', () => {
  it('renders SourceBadge on JobCard for Ashby, Greenhouse, and Lever jobs', () => {
    const store = createTestStore();
    const ashbyJob = MOCK_JOBS[0]; // Deel (ashby)
    const ghJob = MOCK_JOBS[5]; // Figma (greenhouse)
    const leverJob = MOCK_JOBS[6]; // Acme (lever)

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

    rerender(
      <Provider store={store}>
        <MemoryRouter>
          <JobCard job={leverJob} />
        </MemoryRouter>
      </Provider>
    );
    expect(screen.getByText('via Lever')).toBeInTheDocument();
  });

  it('renders SourceBadge in JobDetailPanel header for Greenhouse and Lever jobs', () => {
    const store = createTestStore();
    const { rerender } = render(
      <Provider store={store}>
        <MemoryRouter>
          <JobDetailPanel initialJob={MOCK_GREENHOUSE_JOB_DETAIL} jobId={MOCK_GREENHOUSE_JOB_DETAIL.id} />
        </MemoryRouter>
      </Provider>
    );
    expect(screen.getByText('via Greenhouse')).toBeInTheDocument();

    rerender(
      <Provider store={store}>
        <MemoryRouter>
          <JobDetailPanel initialJob={MOCK_LEVER_JOB_DETAIL} jobId={MOCK_LEVER_JOB_DETAIL.id} />
        </MemoryRouter>
      </Provider>
    );
    expect(screen.getByText('via Lever')).toBeInTheDocument();
  });

  it('renders SourceBadge and "View careers board ↗" in CompanyHeader for Greenhouse and Lever', () => {
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

    const { rerender } = render(
      <MemoryRouter>
        <CompanyHeader profile={ghProfile} />
      </MemoryRouter>
    );

    expect(screen.getByText('via Greenhouse')).toBeInTheDocument();
    const ghLinkBtn = screen.getByRole('link', { name: /View careers board/i });
    expect(ghLinkBtn).toBeInTheDocument();
    expect(ghLinkBtn).toHaveAttribute('href', 'https://job-boards.greenhouse.io/figma');

    rerender(
      <MemoryRouter>
        <CompanyHeader profile={MOCK_LEVER_COMPANY_PROFILE} />
      </MemoryRouter>
    );

    expect(screen.getByText('via Lever')).toBeInTheDocument();
    const lvLinkBtn = screen.getByRole('link', { name: /View careers board/i });
    expect(lvLinkBtn).toBeInTheDocument();
    expect(lvLinkBtn).toHaveAttribute('href', 'https://jobs.lever.co/acme');
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

  it('omits careers board button in CompanyHeader when boardUrl is absent', () => {
    const profileNoBoard: CompanyProfile = {
      slug: 'acme-corp',
      name: 'Acme',
      logoUrl: null,
      jobCount: 5,
      withSalary: 2,
      source: 'ashby',
      boardUrl: undefined,
      latestPublishedAt: null,
      workplaceTypes: [],
      employmentTypes: [],
      departments: [],
      locations: [],
    };
    render(
      <MemoryRouter>
        <CompanyHeader profile={profileNoBoard} />
      </MemoryRouter>
    );
    expect(screen.queryByRole('link', { name: /View careers board/i })).toBeNull();
  });

  it('omits careers board button on CompanyCard when boardUrl is absent', () => {
    const companyNoBoard: CompanySummary = {
      slug: 'acme-corp',
      name: 'Acme',
      logoUrl: null,
      jobCount: 5,
      source: 'ashby',
      boardUrl: undefined,
    };
    render(
      <MemoryRouter>
        <CompanyCard company={companyNoBoard} />
      </MemoryRouter>
    );
    expect(screen.queryByLabelText(/Open Acme careers board/i)).toBeNull();
  });
});

describe('Source Filter in JobFiltersBar', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists All Sources, Ashby, Greenhouse, and Lever in desktop menu and selects Lever', () => {
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

    const menu = screen.getByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'All Sources' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Ashby' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Greenhouse' })).toBeInTheDocument();
    const leverItem = within(menu).getByRole('menuitem', { name: 'Lever' });
    expect(leverItem).toBeInTheDocument();

    fireEvent.click(leverItem);
    expect(onUpdateFilters).toHaveBeenCalledWith({ source: 'lever', page: 1 });
  });

  it('lists all four options in mobile drawer Select (390px) and selects Lever', () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn((query: string) => ({
      matches: query.includes('max-width'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;

    try {
      const onUpdateFilters = vi.fn();
      const onClearFilters = vi.fn();

      render(
        <ThemeProvider theme={createTheme()}>
          <JobFiltersBar
            filters={{ source: '' }}
            onUpdateFilters={onUpdateFilters}
            onClearFilters={onClearFilters}
          />
        </ThemeProvider>
      );

      fireEvent.click(screen.getByRole('button', { name: /open filter options/i }));

      const sourceSelect = screen.getByLabelText('Source');
      fireEvent.mouseDown(sourceSelect);

      const listbox = screen.getByRole('listbox');
      expect(within(listbox).getByRole('option', { name: 'All Sources' })).toBeInTheDocument();
      expect(within(listbox).getByRole('option', { name: 'Ashby' })).toBeInTheDocument();
      expect(within(listbox).getByRole('option', { name: 'Greenhouse' })).toBeInTheDocument();
      const leverOption = within(listbox).getByRole('option', { name: 'Lever' });
      expect(leverOption).toBeInTheDocument();

      fireEvent.click(leverOption);
      expect(onUpdateFilters).toHaveBeenCalledWith({ source: 'lever', page: 1 });
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it('displays active source filter chip with delete icon for Greenhouse and Lever', () => {
    const onUpdateFilters = vi.fn();
    const onClearFilters = vi.fn();

    const { rerender } = render(
      <JobFiltersBar
        filters={{ source: 'greenhouse' }}
        onUpdateFilters={onUpdateFilters}
        onClearFilters={onClearFilters}
      />
    );

    expect(screen.getByText('Source: Greenhouse')).toBeInTheDocument();

    rerender(
      <JobFiltersBar
        filters={{ source: 'lever' }}
        onUpdateFilters={onUpdateFilters}
        onClearFilters={onClearFilters}
      />
    );

    expect(screen.getByText('Source: Lever')).toBeInTheDocument();
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

  it('Footer renders Ashby, Greenhouse, and Lever API link copy', () => {
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>
    );

    const ashbyLink = screen.getByRole('link', { name: /Ashby public job API/i });
    const greenhouseLink = screen.getByRole('link', { name: /Greenhouse job board API/i });
    const leverLink = screen.getByRole('link', { name: /Lever postings API/i });
    expect(ashbyLink).toHaveAttribute('href', expect.stringContaining('ashbyhq.com'));
    expect(greenhouseLink).toHaveAttribute('href', expect.stringContaining('greenhouse.io'));
    expect(leverLink).toHaveAttribute('href', 'https://github.com/lever/postings-api');
  });

  it('AboutPage references Ashby, Greenhouse & Lever data sources', () => {
    render(
      <MemoryRouter>
        <AboutPage />
      </MemoryRouter>
    );

    expect(screen.getByText(/\(Ashby, Greenhouse & Lever\)/i)).toBeInTheDocument();
  });
});
