/**
 * @file BrowsePage.tsx
 * @summary Primary job browsing interface with desktop two-pane layout, URL-synced selection, and responsive mobile list
 */

import React, { useEffect, useMemo, useRef } from 'react';
import {
  Container,
  Box,
  Typography,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import { useGetJobsQuery, useGetFacetsQuery } from '../store/api/jobsApi';
import { useJobFilters } from '../hooks/useJobFilters';
import { QueryState } from '../components/QueryState';
import { JobFiltersBar } from '../components/jobs/JobFiltersBar';
import { JobList } from '../components/jobs/JobList';
import { JobDetailPanel } from '../components/jobs/JobDetailPanel';
import { formatCountryOption, formatSalary } from '../lib/labels';

// Re-export labels for backward compatibility with existing tests
export { formatCountryOption, formatSalary };

export const BrowsePage: React.FC = () => {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const headingRef = useRef<HTMLHeadingElement>(null);

  const { filters, selectedJobId, selectJob, updateUrl, clearAllFilters } = useJobFilters();

  // Query jobs and facets
  const { data, isLoading, isFetching, error, refetch } = useGetJobsQuery(filters);
  const { data: facetsData } = useGetFacetsQuery();

  const jobs = useMemo(() => data?.data || [], [data?.data]);
  const total = data?.meta?.total ?? 0;
  const page = data?.meta?.page ?? 1;
  const totalPages = data?.meta?.totalPages ?? 1;

  // On desktop, auto-select the first job if none is currently selected
  useEffect(() => {
    if (isDesktop && jobs.length > 0 && !selectedJobId) {
      selectJob(jobs[0].id, true);
    }
  }, [isDesktop, jobs, selectedJobId, selectJob]);

  // Handle page navigation
  const handlePageChange = (newPage: number) => {
    updateUrl({ page: newPage });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    headingRef.current?.focus();
  };

  // Build polite live-region results headline
  const resultsHeadline = useMemo(() => {
    const parts: string[] = [];
    if (filters.search && filters.search.trim()) {
      parts.push(`"${filters.search.trim()}"`);
    } else {
      parts.push('All direct jobs');
    }

    if (filters.country) {
      parts.push(`in ${formatCountryOption(filters.country)}`);
    }

    const countLabel = total === 1 ? '1 result' : `${total.toLocaleString()} results`;
    return `${parts.join(' ')} · ${countLabel}`;
  }, [filters.search, filters.country, total]);

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <title>B.O.O.L.E.A.N · Direct jobs from company career boards</title>
      <meta
        name="description"
        content="Search and apply directly to verified company career boards. No middlemen, no candidate tracking."
      />

      {/* Filter and Search Bar */}
      <JobFiltersBar
        filters={filters}
        facets={facetsData}
        onUpdateFilters={updateUrl}
        onClearFilters={clearAllFilters}
      />

      {/* Results Header (Live Region) */}
      <Box sx={{ mb: 2.5 }}>
        <Typography
          ref={headingRef}
          tabIndex={-1}
          variant="subtitle2"
          role="status"
          aria-live="polite"
          sx={{
            fontWeight: 700,
            color: 'text.secondary',
            outline: 'none',
          }}
        >
          {data ? resultsHeadline : 'Loading direct job listings...'}
        </Typography>
      </Box>

      <QueryState
        isLoading={isLoading}
        isFetching={isFetching}
        error={error}
        onRetry={refetch}
        empty={jobs.length === 0}
        emptyMessage={
          filters.search
            ? `No postings found matching "${filters.search}". Try broader keywords or clearing filters.`
            : 'No postings found matching your selected filters.'
        }
      >
        {jobs.length > 0 && (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: isDesktop ? 'minmax(380px, 460px) minmax(480px, 1fr)' : '1fr',
              gap: 3,
              alignItems: 'start',
            }}
          >
            {/* Left: Scrollable List of Job Cards */}
            <Box>
              <JobList
                jobs={jobs}
                selectedJobId={selectedJobId || (isDesktop ? jobs[0]?.id : null)}
                onSelectJob={selectJob}
                page={page}
                totalPages={totalPages}
                onPageChange={handlePageChange}
                linkToDetail={!isDesktop}
              />
            </Box>

            {/* Right: Sticky Detail Panel (Desktop only) */}
            {isDesktop && (
              <Box>
                <JobDetailPanel
                  jobId={selectedJobId || jobs[0]?.id}
                  isSticky
                  headingComponent="h2"
                />
              </Box>
            )}
          </Box>
        )}
      </QueryState>
    </Container>
  );
};

export default BrowsePage;
