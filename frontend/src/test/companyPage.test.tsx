/**
 * @file companyPage.test.tsx
 * @summary Integration tests for CompanyPage overview, jobs tab, and 404 state
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { CompanyPage } from '../pages/CompanyPage';
import filterReducer from '../store/slices/filterSlice';
import themeReducer from '../store/slices/themeSlice';
import { jobsApi } from '../store/api/jobsApi';

const mockCompanyProfile = {
  slug: 'openai',
  name: 'OpenAI',
  logoUrl: 'https://example.com/openai.png',
  jobCount: 42,
  withSalary: 30,
  latestPublishedAt: '2026-10-25T12:00:00Z',
  workplaceTypes: [
    { value: 'OnSite', count: 35 },
    { value: 'Hybrid', count: 7 },
  ],
  employmentTypes: [{ value: 'FullTime', count: 42 }],
  departments: [
    { value: 'Applied AI', count: 20 },
    { value: 'Research', count: 15 },
    { value: 'Security', count: 7 },
  ],
  locations: [{ value: 'San Francisco, CA', count: 42 }],
};

let capturedCompanyQuery: string | null = null;

const server = setupServer(
  http.get('*/v1/companies/:slug', ({ params }) => {
    if (params.slug === 'openai') {
      return HttpResponse.json(mockCompanyProfile);
    }
    return new HttpResponse(JSON.stringify({ error: 'Company not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }),
  http.get('*/v1/jobs', ({ request }) => {
    const url = new URL(request.url);
    capturedCompanyQuery = url.searchParams.get('company');
    return HttpResponse.json({
      data: [
        {
          id: 'job-1',
          ashbyId: 'ashby-1',
          title: 'Research Scientist',
          companySlug: 'openai',
          companyName: 'OpenAI',
          department: 'Research',
          location: 'San Francisco, CA',
          country: 'US',
          isRemote: false,
          workplaceType: 'OnSite',
          employmentType: 'FullTime',
          publishedAt: '2026-10-25T12:00:00Z',
          applyUrl: 'https://jobs.ashbyhq.com/openai/1/apply',
          jobUrl: 'https://jobs.ashbyhq.com/openai/1',
          isListed: true,
          active: true,
        },
      ],
      meta: { total: 1, page: 1, pageSize: 100, totalPages: 1, hasNext: false, hasPrev: false },
    });
  })
);

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  capturedCompanyQuery = null;
});
afterAll(() => server.close());

function renderCompanyPageAt(path: string) {
  const store = configureStore({
    reducer: {
      [jobsApi.reducerPath]: jobsApi.reducer,
      filters: filterReducer,
      theme: themeReducer,
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(jobsApi.middleware),
  });

  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/companies/:slug" element={<CompanyPage />} />
          <Route path="/companies/:slug/jobs" element={<CompanyPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>
  );
}

describe('CompanyPage', () => {
  it('renders Overview tab with hiring metrics and top departments', async () => {
    renderCompanyPageAt('/companies/openai');

    expect(await screen.findByRole('heading', { name: 'OpenAI', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('42 open jobs · 1 location')).toBeInTheDocument();

    // Check stats and top departments from profile
    expect(screen.getByText('Active Postings')).toBeInTheDocument();
    expect(screen.getByText('Salary Transparency')).toBeInTheDocument();
    expect(screen.getByText('Top Departments')).toBeInTheDocument();
    expect(screen.getByText('Applied AI')).toBeInTheDocument();
  });

  it('renders Jobs tab with department groups and sends company=slug to /v1/jobs', async () => {
    renderCompanyPageAt('/companies/openai/jobs');

    expect(await screen.findByRole('heading', { name: 'OpenAI', level: 1 })).toBeInTheDocument();
    const scientists = await screen.findAllByText('Research Scientist');
    expect(scientists.length).toBeGreaterThanOrEqual(1);

    await waitFor(() => {
      expect(capturedCompanyQuery).toBe('openai');
    });
  });

  it('renders friendly 404 state for unknown company', async () => {
    renderCompanyPageAt('/companies/nonexistent-org');

    expect(await screen.findByText('Company Not Found')).toBeInTheDocument();
    expect(screen.getByText(/We could not find an active career board/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse All Hiring Companies' })).toBeInTheDocument();
  });
});
