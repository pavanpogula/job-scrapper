/**
 * @file useJobFilters.ts
 * @summary Custom hook syncing job search and facet filters with URL search parameters (URL as single source of truth)
 */

import { useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../store';
import { syncFromUrl, resetFilters } from '../store/slices/filterSlice';
import { JobsQueryParams, WorkplaceType, EmploymentType } from '../types/api';

type SortBy = NonNullable<JobsQueryParams['sortBy']>;
type SortOrder = NonNullable<JobsQueryParams['sortOrder']>;

const SUPPORTED_SORTS: readonly SortBy[] = ['publishedAt', 'salary', 'company'];

/**
 * @summary Parses the `sort` URL param, falling back to publishedAt for unsupported values (e.g. old ?sort=title bookmarks)
 */
export function parseSortParam(raw: string | null): SortBy {
  return SUPPORTED_SORTS.find((s) => s === raw) ?? 'publishedAt';
}

/**
 * @summary Parses the `order` URL param, falling back to desc for anything but asc/desc
 */
export function parseOrderParam(raw: string | null): SortOrder {
  return raw === 'asc' ? 'asc' : 'desc';
}

export function useJobFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const dispatch = useAppDispatch();
  const filters = useAppSelector((state) => state.filters);

  // Sync from URL params into Redux store on mount or URL change
  useEffect(() => {
    const rawSource = searchParams.get('source') || '';
    const source = rawSource === 'ashby' || rawSource === 'greenhouse' ? rawSource : '';
    const q = searchParams.get('q') || '';
    const workplace = (searchParams.get('workplace') || '') as WorkplaceType | '';
    const employment = (searchParams.get('employment') || '') as EmploymentType | '';
    const country = searchParams.get('country') || '';
    const company = searchParams.get('company') || '';
    const rawPosted = searchParams.get('postedWithin');
    const postedWithin = rawPosted === '1d' || rawPosted === '7d' || rawPosted === '30d' ? rawPosted : undefined;
    const remote = searchParams.get('remote') === '1' || searchParams.get('remote') === 'true' || searchParams.get('isRemote') === 'true';
    const salary = searchParams.get('salary') === '1' || searchParams.get('salary') === 'true';
    const sort = parseSortParam(searchParams.get('sort'));
    const order = parseOrderParam(searchParams.get('order'));
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);

    dispatch(
      syncFromUrl({
        source,
        search: q,
        workplaceType: workplace,
        employmentType: employment,
        country,
        company,
        postedWithin,
        isRemote: remote,
        hasSalary: salary,
        sortBy: sort,
        sortOrder: order,
        page,
      })
    );
  }, [searchParams, dispatch]);

  const selectedJobId = searchParams.get('jobId') || null;

  const selectJob = useCallback(
    (jobId: string | null, replace = false) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (jobId) {
            next.set('jobId', jobId);
          } else {
            next.delete('jobId');
          }
          return next;
        },
        { replace }
      );
    },
    [setSearchParams]
  );

  // Update URL search parameters when filters change
  const updateUrl = useCallback(
    (newFilters: Partial<JobsQueryParams>, options?: { preserveJobId?: boolean; replace?: boolean }) => {
      const merged = { ...filters, ...newFilters };
      const params = new URLSearchParams();

      if (merged.source) params.set('source', merged.source);
      if (merged.search && merged.search.trim()) params.set('q', merged.search.trim());
      if (merged.workplaceType) params.set('workplace', merged.workplaceType);
      if (merged.employmentType) params.set('employment', merged.employmentType);
      if (merged.country) params.set('country', merged.country);
      if (merged.company && merged.company.trim()) params.set('company', merged.company.trim());
      if (merged.postedWithin) params.set('postedWithin', merged.postedWithin);
      if (merged.isRemote) params.set('remote', '1');
      if (merged.hasSalary) params.set('salary', '1');
      if (merged.sortBy && merged.sortBy !== 'publishedAt') params.set('sort', merged.sortBy);
      if (merged.sortOrder && merged.sortOrder !== 'desc') params.set('order', merged.sortOrder);
      if (merged.page && merged.page > 1) params.set('page', String(merged.page));

      if (options?.preserveJobId && searchParams.get('jobId')) {
        params.set('jobId', searchParams.get('jobId')!);
      }

      setSearchParams(params, { replace: options?.replace ?? false });
    },
    [filters, searchParams, setSearchParams]
  );

  const clearAllFilters = useCallback(() => {
    dispatch(resetFilters());
    setSearchParams(new URLSearchParams(), { replace: false });
  }, [dispatch, setSearchParams]);

  return {
    filters,
    selectedJobId,
    selectJob,
    updateUrl,
    clearAllFilters,
  };
}

export default useJobFilters;
