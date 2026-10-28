/**
 * @file detailPanelScroll.test.tsx
 * @summary Guards the two-pane scroll behaviour: picking a job must not scroll the page to the top, and each job opens at the top of the detail panel
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { JobDetailPanel } from '../components/jobs/JobDetailPanel';
import { jobsApi } from '../store/api/jobsApi';
import filterReducer from '../store/slices/filterSlice';
import themeReducer from '../store/slices/themeSlice';
import { JobDetail } from '../types/api';

function createStore() {
  return configureStore({
    reducer: {
      [jobsApi.reducerPath]: jobsApi.reducer,
      filters: filterReducer,
      theme: themeReducer,
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(jobsApi.middleware),
  });
}

function makeJob(n: number): JobDetail {
  return {
    id: `00000000-0000-4000-8000-00000000000${n}`,
    ashbyId: `ashby-${n}`,
    source: 'ashby',
    externalId: `ashby-${n}`,
    title: `Engineer ${n}`,
    companySlug: 'acme-corp',
    companyName: 'Acme Corporation',
    companyLogoUrl: null,
    department: 'Engineering',
    location: 'San Francisco, CA',
    country: 'US',
    region: 'CA',
    city: 'San Francisco',
    isRemote: false,
    workplaceType: 'OnSite',
    employmentType: 'FullTime',
    publishedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    lastUpdatedAt: null,
    lastUpdatedSource: null,
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    salaryInterval: null,
    applyUrl: `https://jobs.ashbyhq.com/acme-corp/${n}/apply`,
    jobUrl: `https://jobs.ashbyhq.com/acme-corp/${n}`,
    isListed: true,
    active: true,
    team: null,
    descriptionHtml: '<p>A long description</p>',
    descriptionPlain: 'A long description',
    secondaryLocations: [],
    companyJobCount: 3,
    company: null,
  } as unknown as JobDetail;
}

function renderPanel(job: JobDetail, isSticky = true) {
  return (
    <Provider store={createStore()}>
      <MemoryRouter>
        <JobDetailPanel jobId={job.id} initialJob={job} isSticky={isSticky} headingComponent="h2" />
      </MemoryRouter>
    </Provider>
  );
}

describe('JobDetailPanel scroll behaviour (two-pane)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // Remove the scrollTop override installed by a test
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollTop;
  });

  it('moves focus to the heading without scrolling the page (preventScroll)', () => {
    const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus');
    const first = makeJob(1);
    const second = makeJob(2);

    const { rerender } = render(renderPanel(first));
    rerender(renderPanel(second));

    expect(focusSpy).toHaveBeenCalled();
    // Every focus call made by the panel must opt out of scrolling: a plain focus() scrolls the page to the top
    for (const call of focusSpy.mock.calls) {
      expect(call[0]).toEqual({ preventScroll: true });
    }
  });

  it('full-page mode (phones, /jobs/:id) keeps the default focus scroll so the title is brought into view', () => {
    const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus');
    render(renderPanel(makeJob(1), false));

    expect(focusSpy).toHaveBeenCalled();
    for (const call of focusSpy.mock.calls) {
      expect(call[0]).toEqual({ preventScroll: false });
    }
  });

  it('resets the detail panel to the top whenever a different job is shown', () => {
    const scrollTopWrites: number[] = [];
    Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
      configurable: true,
      get: () => 0,
      set: (value: number) => {
        scrollTopWrites.push(value);
      },
    });

    const { rerender } = render(renderPanel(makeJob(1)));
    const writesAfterFirstJob = scrollTopWrites.length;
    expect(writesAfterFirstJob).toBeGreaterThan(0);
    expect(scrollTopWrites.every((v) => v === 0)).toBe(true);

    rerender(renderPanel(makeJob(2)));
    expect(scrollTopWrites.length).toBeGreaterThan(writesAfterFirstJob);
    expect(scrollTopWrites.every((v) => v === 0)).toBe(true);
  });

  it('does not reset the scroll position when the same job re-renders', () => {
    const scrollTopWrites: number[] = [];
    Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
      configurable: true,
      get: () => 0,
      set: (value: number) => {
        scrollTopWrites.push(value);
      },
    });

    const job = makeJob(1);
    const { rerender } = render(renderPanel(job));
    const writes = scrollTopWrites.length;
    rerender(renderPanel(job));
    expect(scrollTopWrites.length).toBe(writes);
  });
});
