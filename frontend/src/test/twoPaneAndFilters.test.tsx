/**
 * @file twoPaneAndFilters.test.tsx
 * @summary Integration tests for desktop two-pane selection, filter pills, and company deep-linking
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { useEffect } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { BrowsePage } from '../pages/BrowsePage';
import filterReducer from '../store/slices/filterSlice';
import themeReducer from '../store/slices/themeSlice';
import { jobsApi } from '../store/api/jobsApi';

const capturedRequests: URLSearchParams[] = [];

const mockJobs = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    ashbyId: 'ashby-1',
    title: 'Staff AI Engineer',
    companySlug: 'openai',
    companyName: 'OpenAI',
    companyLogoUrl: null,
    department: 'Applied AI',
    location: 'San Francisco, CA',
    country: 'US',
    isRemote: false,
    workplaceType: 'OnSite',
    employmentType: 'FullTime',
    publishedAt: '2026-10-20T12:00:00Z',
    applyUrl: 'https://jobs.ashbyhq.com/openai/1/apply',
    jobUrl: 'https://jobs.ashbyhq.com/openai/1',
    isListed: true,
    active: true,
    descriptionHtml: '<p>Build next-generation models</p>',
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    ashbyId: 'ashby-2',
    title: 'Product Designer',
    companySlug: 'anthropic',
    companyName: 'Anthropic',
    companyLogoUrl: null,
    department: 'Design',
    location: 'San Francisco, CA',
    country: 'US',
    isRemote: true,
    workplaceType: 'Remote',
    employmentType: 'FullTime',
    publishedAt: '2026-10-21T12:00:00Z',
    applyUrl: 'https://jobs.ashbyhq.com/anthropic/2/apply',
    jobUrl: 'https://jobs.ashbyhq.com/anthropic/2',
    isListed: true,
    active: true,
    descriptionHtml: '<p>Shape delightful interfaces</p>',
  },
];

const server = setupServer(
  http.get('*/v1/facets', () =>
    HttpResponse.json({ workplaceTypes: [], employmentTypes: [], departments: [], countries: [] })
  ),
  http.get('*/v1/jobs/:id', ({ params }) => {
    const job = mockJobs.find((j) => j.id === params.id);
    if (!job) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json(job);
  }),
  http.get('*/v1/jobs', ({ request }) => {
    const url = new URL(request.url);
    capturedRequests.push(url.searchParams);
    return HttpResponse.json({
      data: mockJobs,
      meta: { total: 2, page: 1, pageSize: 25, totalPages: 1, hasNext: false, hasPrev: false },
    });
  })
);

beforeAll(() => server.listen());
beforeEach(() => {
  capturedRequests.length = 0;
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

let currentSearch = '';
function LocationRecorder() {
  const loc = useLocation();
  useEffect(() => {
    currentSearch = loc.search;
  }, [loc.search]);
  return null;
}

function renderBrowseAt(initialUrl: string) {
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
      <MemoryRouter initialEntries={[initialUrl]}>
        <LocationRecorder />
        <BrowsePage />
      </MemoryRouter>
    </Provider>
  );
}

describe('BrowsePage two-pane and filters', () => {
  it('deep links company parameter to the API request', async () => {
    renderBrowseAt('/?company=openai');
    await waitFor(() => {
      const last = capturedRequests[capturedRequests.length - 1];
      expect(last?.get('company')).toBe('openai');
    });
  });

  it('toggles salary filter pill and updates URL', async () => {
    const user = userEvent.setup();
    renderBrowseAt('/');

    const salaryPill = await screen.findByRole('button', { name: /has salary/i });
    await user.click(salaryPill);

    await waitFor(() => {
      expect(currentSearch).toContain('salary=1');
      const last = capturedRequests[capturedRequests.length - 1];
      expect(last?.get('hasSalary')).toBe('true');
    });
  });

  it('toggles remote only filter pill and updates URL', async () => {
    const user = userEvent.setup();
    renderBrowseAt('/');

    const remotePill = await screen.findByRole('button', { name: /remote only/i });
    await user.click(remotePill);

    await waitFor(() => {
      expect(currentSearch).toContain('remote=1');
      const last = capturedRequests[capturedRequests.length - 1];
      expect(last?.get('isRemote')).toBe('true');
    });
  });
});
