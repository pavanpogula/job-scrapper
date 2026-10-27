/**
 * @file companiesDirectory.test.tsx
 * @summary Integration tests for CompaniesPage directory, sorting, and B.O.O.L.E.A.N header brand mark
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import { CompaniesPage } from '../pages/CompaniesPage';
import { Header } from '../components/Header';
import filterReducer from '../store/slices/filterSlice';
import themeReducer from '../store/slices/themeSlice';
import { jobsApi } from '../store/api/jobsApi';

let capturedSortQuery: string | null = null;

const server = setupServer(
  http.get('*/v1/meta', () =>
    HttpResponse.json({
      activeJobs: 1500,
      hiringCompanies: 120,
      withSalary: 800,
      lastScrapeAt: null,
      generation: 'test',
    })
  ),
  http.get('*/v1/companies', ({ request }) => {
    const url = new URL(request.url);
    capturedSortQuery = url.searchParams.get('sort');
    return HttpResponse.json({
      data: [
        {
          slug: 'openai',
          name: 'OpenAI',
          logoUrl: 'https://example.com/openai.png',
          jobCount: 42,
        },
        {
          slug: 'stripe',
          name: 'Stripe',
          logoUrl: null,
          jobCount: 35,
        },
      ],
      total: 2,
      page: 1,
      pageSize: 30,
      totalPages: 1,
    });
  })
);

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  capturedSortQuery = null;
});
afterAll(() => server.close());

function renderWithStore(ui: React.ReactElement) {
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
      <MemoryRouter>
        {ui}
      </MemoryRouter>
    </Provider>
  );
}

describe('Companies directory and brand mark', () => {
  it('renders B.O.O.L.E.A.N brand in Header', async () => {
    renderWithStore(<Header />);
    expect(screen.getByText('B.O.O.L.E.A.N')).toBeInTheDocument();
  });

  it('renders company cards and sends sort=jobs by default', async () => {
    renderWithStore(<CompaniesPage />);

    expect(await screen.findByText('OpenAI')).toBeInTheDocument();
    expect(screen.getByText('42 open jobs')).toBeInTheDocument();
    expect(screen.getByText('Stripe')).toBeInTheDocument();

    await waitFor(() => {
      expect(capturedSortQuery).toBe('jobs');
    });
  });

  it('switches sort toggle to A-Z and sends sort=name', async () => {
    const user = userEvent.setup();
    renderWithStore(<CompaniesPage />);

    const azButton = await screen.findByRole('button', { name: /A to Z/i });
    await user.click(azButton);

    await waitFor(() => {
      expect(capturedSortQuery).toBe('name');
    });
  });
});
