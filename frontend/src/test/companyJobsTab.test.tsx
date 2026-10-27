/**
 * @file companyJobsTab.test.tsx
 * @summary Guards that a company's Jobs tab reaches EVERY job (API paging + API search) and that location counts are not capped silently
 * @tags frontend, company, pagination, search, msw, ADR-0020
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { CompanyPage } from '../pages/CompanyPage';
import filterReducer from '../store/slices/filterSlice';
import themeReducer from '../store/slices/themeSlice';
import { jobsApi } from '../store/api/jobsApi';

const TOTAL = 120;
const DEPARTMENTS = ['Applied AI', 'Research', 'Security'];

const profile = {
  slug: 'bigco',
  name: 'BigCo',
  logoUrl: null,
  jobCount: TOTAL,
  withSalary: 60,
  latestPublishedAt: '2026-10-25T12:00:00Z',
  workplaceTypes: [{ value: 'OnSite', count: TOTAL }],
  employmentTypes: [{ value: 'FullTime', count: TOTAL }],
  departments: DEPARTMENTS.map((value) => ({ value, count: TOTAL / 3 })),
  // The API caps this list at 10; the company really has more locations.
  locations: Array.from({ length: 10 }, (_, i) => ({ value: `City ${i}`, count: 12 - i })),
};

/** Builds job n (1-based) of BigCo; titles are unique so tests can find them. */
function job(n: number) {
  return {
    id: `job-${n}`,
    ashbyId: `ashby-${n}`,
    title: `Role ${n}`,
    companySlug: 'bigco',
    companyName: 'BigCo',
    companyLogoUrl: null,
    department: DEPARTMENTS[n % 3],
    location: 'Remote',
    country: 'US',
    region: null,
    city: null,
    isRemote: true,
    workplaceType: 'Remote',
    employmentType: 'FullTime',
    publishedAt: '2026-10-25T12:00:00Z',
    lastUpdatedAt: '2026-10-25T12:00:00Z',
    lastUpdatedSource: 'published',
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    salaryInterval: null,
    applyUrl: `https://jobs.ashbyhq.com/bigco/${n}/apply`,
    isListed: true,
    createdAt: null,
    updatedAt: null,
  };
}

const requests: URLSearchParams[] = [];

const server = setupServer(
  http.get('*/v1/companies/:slug', () => HttpResponse.json(profile)),
  http.get('*/v1/jobs/:id', () => HttpResponse.json({ error: 'Job not found' }, { status: 404 })),
  http.get('*/v1/jobs', ({ request }) => {
    const params = new URL(request.url).searchParams;
    requests.push(params);
    const search = params.get('search');
    const all = Array.from({ length: TOTAL }, (_, i) => job(i + 1)).filter(
      (j) => !search || j.title.toLowerCase().includes(search.toLowerCase())
    );
    const page = Number(params.get('page') || '1');
    const pageSize = Number(params.get('pageSize') || '25');
    const totalPages = Math.max(1, Math.ceil(all.length / pageSize));
    return HttpResponse.json({
      data: all.slice((page - 1) * pageSize, page * pageSize),
      meta: { total: all.length, page, pageSize, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
    });
  })
);

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  requests.length = 0;
});
afterAll(() => server.close());

/**
 * @summary Renders the company page at a path with a fresh store
 */
function renderAt(path: string) {
  const store = configureStore({
    reducer: { [jobsApi.reducerPath]: jobsApi.reducer, filters: filterReducer, theme: themeReducer },
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

const listRequests = () => requests.filter((r) => r.get('pageSize') !== '10');

describe('ADR-0020: company Jobs tab reaches every job', () => {
  it('shows the real total and pages through all jobs via the API', async () => {
    const user = userEvent.setup();
    renderAt('/companies/bigco/jobs');

    expect(await screen.findByText(`Showing 1–50 of ${TOTAL}`)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /search roles at bigco/i }).getAttribute('placeholder')).toContain(`${TOTAL}`);

    await user.click(screen.getByRole('button', { name: 'Go to page 3' }));
    expect(await screen.findByText(`Showing 101–${TOTAL} of ${TOTAL}`)).toBeInTheDocument();
    expect((await screen.findAllByText(`Role ${TOTAL}`)).length).toBeGreaterThan(0);
    await waitFor(() => expect(listRequests().some((r) => r.get('page') === '3' && r.get('company') === 'bigco')).toBe(true));
  });

  it('searches through the API (company + search), not only loaded rows, and resets to page 1', async () => {
    const user = userEvent.setup();
    renderAt('/companies/bigco/jobs');
    await screen.findByText(`Showing 1–50 of ${TOTAL}`);

    // "Role 119" is on page 3, never loaded on page 1 — an in-browser filter could not find it.
    await user.type(screen.getByRole('textbox', { name: /search roles at bigco/i }), 'Role 119{Enter}');

    await waitFor(() => {
      const last = listRequests()[listRequests().length - 1];
      expect(last?.get('search')).toBe('Role 119');
      expect(last?.get('company')).toBe('bigco');
      expect(last?.get('page')).toBe('1');
    });
    const list = await screen.findByRole('region', { name: /open positions/i });
    expect(within(list).getAllByText('Role 119').length).toBeGreaterThan(0);
  });

  it('does not present the capped top-10 locations list as the total', async () => {
    renderAt('/companies/bigco');
    expect(await screen.findByText(`${TOTAL} open jobs · 10+ locations`)).toBeInTheDocument();
  });
});
