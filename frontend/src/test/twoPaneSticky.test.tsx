/**
 * @file twoPaneSticky.test.tsx
 * @summary Guards the desktop two-pane layout: the right detail panel must sit in a grid cell that stretches to the full height of the list, otherwise its sticky positioning has no room and it scrolls away with the page
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest';
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

const mockJob = {
  id: '00000000-0000-4000-8000-000000000001',
  ashbyId: 'ashby-1',
  source: 'ashby',
  externalId: 'ashby-1',
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
  team: null,
  descriptionHtml: '<p>Build next-generation models</p>',
  descriptionPlain: 'Build next-generation models',
  secondaryLocations: [],
  companyJobCount: 1,
  company: null,
};

const server = setupServer(
  http.get('*/v1/facets', () =>
    HttpResponse.json({ workplaceTypes: [], employmentTypes: [], departments: [], countries: [] })
  ),
  http.get('*/v1/jobs/:id', () => HttpResponse.json(mockJob)),
  http.get('*/v1/jobs', () =>
    HttpResponse.json({
      data: [mockJob],
      meta: { total: 1, page: 1, pageSize: 25, totalPages: 1, hasNext: false, hasPrev: false },
    })
  )
);

beforeAll(() => server.listen());
beforeEach(() => {
  // Pretend the viewport is desktop width so BrowsePage renders the two-pane layout
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: true,
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList
  );
});
afterEach(() => {
  server.resetHandlers();
  vi.unstubAllGlobals();
});
afterAll(() => server.close());

describe('BrowsePage desktop two-pane layout', () => {
  it('puts the sticky detail panel in a grid cell that stretches to the full list height', async () => {
    const store = configureStore({
      reducer: { [jobsApi.reducerPath]: jobsApi.reducer, filters: filterReducer, theme: themeReducer },
      middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(jobsApi.middleware),
    });
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/']}>
          <BrowsePage />
        </MemoryRouter>
      </Provider>
    );

    const detailHeading = await screen.findByRole('heading', { level: 2, name: /Staff AI Engineer/i });
    const panel = detailHeading.closest('.MuiPaper-root') as HTMLElement;
    expect(panel).not.toBeNull();
    expect(getComputedStyle(panel).position).toBe('sticky');

    // The panel's direct wrapper is the grid cell. With the grid's align-items: start it would be only as tall as the
    // panel and the sticky panel could never stay in view while the list scrolls.
    const cell = panel.parentElement as HTMLElement;
    expect(getComputedStyle(cell).alignSelf).toBe('stretch');
  });
});
