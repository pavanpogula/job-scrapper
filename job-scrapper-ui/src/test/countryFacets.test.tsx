import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import { BrowsePage, formatCountryOption } from '../pages/BrowsePage';
import filterReducer from '../store/slices/filterSlice';
import themeReducer from '../store/slices/themeSlice';
import { jobsApi } from '../store/api/jobsApi';

const server = setupServer(
  http.get('*/v1/facets', () => {
    return HttpResponse.json({
      workplaceTypes: [],
      employmentTypes: [],
      departments: [],
      countries: [
        { value: 'JP', count: 42 },
        { value: 'FR', count: 20 },
        { value: 'United States', count: 5 }, // legacy unnormalized value
      ],
    });
  }),
  http.get('*/v1/jobs', ({ request }) => {
    const url = new URL(request.url);
    const country = url.searchParams.get('country');
    return HttpResponse.json({
      data: [
        {
          id: 'test-job-1',
          ashbyId: 'ashby-1',
          title: 'Software Engineer',
          companySlug: 'acme',
          companyName: 'Acme Corp',
          publishedAt: '2026-10-20T12:00:00Z',
          country: country || 'JP',
          isListed: true,
          active: true,
        },
      ],
      meta: {
        total: 1,
        page: 1,
        pageSize: 25,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
      },
    });
  })
);

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => server.close());

function createTestStore() {
  return configureStore({
    reducer: {
      [jobsApi.reducerPath]: jobsApi.reducer,
      filters: filterReducer,
      theme: themeReducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(jobsApi.middleware),
  });
}

describe('P1-T21: Country options from facets with Intl.DisplayNames', () => {
  describe('formatCountryOption', () => {
    it('formats ISO-2 code using Intl.DisplayNames', () => {
      expect(formatCountryOption('US')).toBe('United States');
      expect(formatCountryOption('GB')).toBe('United Kingdom');
      expect(formatCountryOption('JP')).toBe('Japan');
      expect(formatCountryOption('FR')).toBe('France');
    });

    it('falls back to raw value for malformed region codes without crashing', () => {
      expect(formatCountryOption('United States')).toBe('United States');
      expect(formatCountryOption('Somewhere Invalid')).toBe('Somewhere Invalid');
      expect(formatCountryOption('')).toBe('');
    });
  });

  describe('BrowsePage Country Filter Integration with MSW', () => {
    it('renders facet options formatted with display names and dispatches country selection', async () => {
      const store = createTestStore();
      const user = userEvent.setup();

      // Pre-fetch facets so the cache is immediately ready for BrowsePage
      await store.dispatch(jobsApi.endpoints.getFacets.initiate());

      render(
        <Provider store={store}>
          <MemoryRouter>
            <BrowsePage />
          </MemoryRouter>
        </Provider>
      );

      // Open the country select via its combobox role
      const countryCombobox = await screen.findByRole('combobox', { name: /Country/i });
      await user.click(countryCombobox);

      // Verify that 'Japan' (formatted from 'JP') is rendered
      const japanOption = await screen.findByRole('option', { name: 'Japan' });
      expect(japanOption).toBeInTheDocument();

      // Verify that unnormalized 'United States' is rendered without crashing
      const unnormalizedOption = await screen.findByRole('option', { name: 'United States' });
      expect(unnormalizedOption).toBeInTheDocument();

      // Select Japan
      await user.click(japanOption);

      // Verify Redux state updated to 'JP'
      await waitFor(() => {
        expect(store.getState().filters.country).toBe('JP');
      });
    });
  });
});
