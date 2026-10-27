/**
 * @file searchBox.test.tsx
 * @summary Guards the search box round trip: Enter sends the trimmed text intact, resets to page 1, clear and back work (BF-020)
 * @tags frontend, search, msw, integration, BF-020
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { useEffect } from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, useLocation, useNavigate, type NavigateFunction } from 'react-router-dom';
import { BrowsePage } from '../pages/BrowsePage';
import filterReducer from '../store/slices/filterSlice';
import themeReducer from '../store/slices/themeSlice';
import { jobsApi } from '../store/api/jobsApi';

const requests: URLSearchParams[] = [];

const server = setupServer(
  http.get('*/v1/facets', () =>
    HttpResponse.json({ workplaceTypes: [], employmentTypes: [], departments: [], countries: [] })
  ),
  http.get('*/v1/jobs', ({ request }) => {
    requests.push(new URL(request.url).searchParams);
    return HttpResponse.json({
      data: [],
      meta: { total: 0, page: 1, pageSize: 25, totalPages: 1, hasNext: false, hasPrev: false },
    });
  })
);

beforeAll(() => server.listen());
beforeEach(() => {
  requests.length = 0;
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const router: { navigate: NavigateFunction | null; search: string } = { navigate: null, search: '' };

/** Captures the router's navigate (to press "Back") and the current URL query string. */
function recordRouter(navigate: NavigateFunction, search: string) {
  router.navigate = navigate;
  router.search = search;
}

/** Reports router state to the test after each render. */
function NavigateProbe({ onRender }: { onRender: (navigate: NavigateFunction, search: string) => void }) {
  const navigate = useNavigate();
  const { search } = useLocation();
  useEffect(() => {
    onRender(navigate, search);
  });
  return null;
}

/**
 * @summary Renders BrowsePage with a fresh store at the given URL
 */
function renderAt(url: string) {
  const store = configureStore({
    reducer: {
      [jobsApi.reducerPath]: jobsApi.reducer,
      filters: filterReducer,
      theme: themeReducer,
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(jobsApi.middleware),
  });
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        <NavigateProbe onRender={recordRouter} />
        <BrowsePage />
      </MemoryRouter>
    </Provider>
  );
}

const lastRequest = () => requests[requests.length - 1];
const searchBox = () => screen.getByRole('textbox', { name: /search jobs/i });

describe('BF-020: search box', () => {
  it('describes what it searches', () => {
    renderAt('/');
    expect(searchBox().getAttribute('placeholder')).toMatch(/title, company or location/i);
  });

  it('sends the trimmed text on Enter and resets to page 1', async () => {
    const user = userEvent.setup();
    renderAt('/?page=3');
    await waitFor(() => expect(lastRequest()?.get('page')).toBe('3'));

    await user.type(searchBox(), '  senior engineer  {Enter}');

    await waitFor(() => expect(lastRequest()?.get('search')).toBe('senior engineer'));
    expect(lastRequest()?.get('page')).toBe('1');
  });

  it.each(['c++', 'c#', 'r&d', '100%', 'node.js'])('keeps %j intact through the URL', async (text) => {
    const user = userEvent.setup();
    renderAt('/');
    await user.type(searchBox(), `${text}{Enter}`);
    await waitFor(() => expect(lastRequest()?.get('search')).toBe(text));
  });

  it('clearing removes the search from the URL and shows the unfiltered list', async () => {
    const user = userEvent.setup();
    renderAt('/?q=engineer');
    await waitFor(() => expect(lastRequest()?.get('search')).toBe('engineer'));

    await user.click(screen.getByRole('button', { name: /clear search input/i }));

    // The unfiltered list was already fetched on first render, so RTK Query serves it from its cache
    // instead of sending a new request; the URL is the source of truth for what is shown.
    await waitFor(() => expect(new URLSearchParams(router.search).has('q')).toBe(false));
    expect(requests.some((r) => !r.has('search'))).toBe(true);
    expect(searchBox()).toHaveProperty('value', '');
  });

  it('browser Back restores the previous search in the box', async () => {
    const user = userEvent.setup();
    renderAt('/');
    await user.type(searchBox(), 'senior engineer{Enter}');
    await waitFor(() => expect(lastRequest()?.get('search')).toBe('senior engineer'));
    await user.clear(searchBox());
    await user.type(searchBox(), 'sf{Enter}');
    await waitFor(() => expect(lastRequest()?.get('search')).toBe('sf'));

    act(() => router.navigate?.(-1));

    await waitFor(() => expect(searchBox()).toHaveProperty('value', 'senior engineer'));
  });
});
