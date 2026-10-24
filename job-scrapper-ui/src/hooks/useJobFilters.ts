/**
 * @file useJobFilters.ts
 * @summary Custom hook syncing job search and facet filters with URL search parameters (URL as single source of truth)
 */

import { useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../store';
import { syncFromUrl, resetFilters } from '../store/slices/filterSlice';
import { JobsQueryParams, WorkplaceType, EmploymentType } from '../types/api';

export function useJobFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const dispatch = useAppDispatch();
  const filters = useAppSelector((state) => state.filters);

  // Sync from URL params into Redux store on mount or URL change
  useEffect(() => {
    const q = searchParams.get('q') || '';
    const workplace = (searchParams.get('workplace') || '') as WorkplaceType | '';
    const employment = (searchParams.get('employment') || '') as EmploymentType | '';
    const country = searchParams.get('country') || '';
    const salary = searchParams.get('salary') === '1' || searchParams.get('salary') === 'true';
    const sort = (searchParams.get('sort') || 'publishedAt') as JobsQueryParams['sortBy'];
    const order = (searchParams.get('order') || 'desc') as 'asc' | 'desc';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);

    dispatch(
      syncFromUrl({
        search: q,
        workplaceType: workplace,
        employmentType: employment,
        country,
        hasSalary: salary,
        sortBy: sort,
        sortOrder: order,
        page,
      })
    );
  }, [searchParams, dispatch]);

  // Update URL search parameters when filters change
  const updateUrl = useCallback(
    (newFilters: Partial<JobsQueryParams>) => {
      const merged = { ...filters, ...newFilters };
      const params = new URLSearchParams();

      if (merged.search && merged.search.trim()) params.set('q', merged.search.trim());
      if (merged.workplaceType) params.set('workplace', merged.workplaceType);
      if (merged.employmentType) params.set('employment', merged.employmentType);
      if (merged.country) params.set('country', merged.country);
      if (merged.hasSalary) params.set('salary', '1');
      if (merged.sortBy && merged.sortBy !== 'publishedAt') params.set('sort', merged.sortBy);
      if (merged.sortOrder && merged.sortOrder !== 'desc') params.set('order', merged.sortOrder);
      if (merged.page && merged.page > 1) params.set('page', String(merged.page));

      setSearchParams(params, { replace: false });
    },
    [filters, setSearchParams]
  );

  const clearAllFilters = useCallback(() => {
    dispatch(resetFilters());
    setSearchParams(new URLSearchParams(), { replace: false });
  }, [dispatch, setSearchParams]);

  return {
    filters,
    updateUrl,
    clearAllFilters,
  };
}

export default useJobFilters;
