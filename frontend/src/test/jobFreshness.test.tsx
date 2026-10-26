/**
 * @file jobFreshness.test.tsx
 * @summary Integration test asserting job cards render the last-updated freshness label (ADR-0018)
 * @tags frontend, freshness, BrowsePage, msw, integration
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import { BrowsePage } from '../pages/BrowsePage';
import filterReducer from '../store/slices/filterSlice';
import themeReducer from '../store/slices/themeSlice';
import { jobsApi } from '../store/api/jobsApi';

const DAY_MS = 24 * 60 * 60 * 1000;
// Relative to the real clock so the test never goes stale; +1h keeps the day count stable
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS - 60 * 60 * 1000).toISOString();

const baseJob = {
  companySlug: 'acme',
  companyName: 'Acme Corp',
  country: 'US',
  isListed: true,
  active: true,
};

const server = setupServer(
  http.get('*/v1/facets', () =>
    HttpResponse.json({ workplaceTypes: [], employmentTypes: [], departments: [], countries: [] })
  ),
  http.get('*/v1/jobs', () =>
    HttpResponse.json({
      data: [
        {
          ...baseJob,
          id: 'job-detected',
          ashbyId: 'ashby-detected',
          title: 'Edited Posting',
          publishedAt: daysAgo(10),
          lastUpdatedAt: daysAgo(2),
          lastUpdatedSource: 'detected',
        },
        {
          ...baseJob,
          id: 'job-published',
          ashbyId: 'ashby-published',
          title: 'Unchanged Posting',
          publishedAt: daysAgo(5),
          lastUpdatedAt: daysAgo(5),
          lastUpdatedSource: 'published',
        },
        {
          ...baseJob,
          id: 'job-legacy',
          ashbyId: 'ashby-legacy',
          title: 'Legacy Cache Posting',
          publishedAt: daysAgo(3),
        },
      ],
      meta: { total: 3, page: 1, pageSize: 25, totalPages: 1, hasNext: false, hasPrev: false },
    })
  )
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

/**
 * @summary Builds a store with the RTK Query API and UI slices used by BrowsePage
 */
function createTestStore() {
  return configureStore({
    reducer: {
      [jobsApi.reducerPath]: jobsApi.reducer,
      filters: filterReducer,
      theme: themeReducer,
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(jobsApi.middleware),
  });
}

describe('ADR-0018: job card freshness label', () => {
  it('shows Updated / Posted labels as <time> elements, and falls back to publishedAt for old cache bodies', async () => {
    render(
      <Provider store={createTestStore()}>
        <MemoryRouter>
          <BrowsePage />
        </MemoryRouter>
      </Provider>
    );

    const updated = await screen.findByText('Updated 2d ago');
    expect(updated.tagName).toBe('TIME');
    expect(updated.getAttribute('dateTime')).not.toBeNull();

    expect(screen.getByText('Posted 5d ago').tagName).toBe('TIME');
    // A body without the new fields (cache published before the feature) still gets a label
    expect(screen.getByText('Posted 3d ago')).toBeTruthy();
  });
});
