/**
 * @file DepartmentGroups.tsx
 * @summary Company jobs tab featuring a newest-10 carousel, API-paged and API-searched department groups, and two-pane master/detail
 */

import React, { useState, useMemo, useRef } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import {
  Box,
  Typography,
  Stack,
  Button,
  TextField,
  InputAdornment,
  IconButton,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  useTheme,
  useMediaQuery,
  Pagination,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { JobListItem } from '../../types/api';
import { useGetJobsQuery } from '../../store/api/jobsApi';
import { JobCard } from '../jobs/JobCard';
import { JobDetailPanel } from '../jobs/JobDetailPanel';
import { QueryState } from '../QueryState';

/** Jobs per page in the company list (API-paged). */
const PAGE_SIZE = 50;
/** Jobs in the "Recently posted" carousel. */
const CAROUSEL_SIZE = 10;

export interface DepartmentGroupsProps {
  companySlug: string;
  companyName: string;
}

export const DepartmentGroups: React.FC<DepartmentGroupsProps> = ({
  companySlug,
  companyName,
}) => {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const [searchParams, setSearchParams] = useSearchParams();

  // Draft text in the box; the committed search is what the API receives (Enter to search, like the main jobs page)
  const [searchTerm, setSearchTerm] = useState('');
  const [committedSearch, setCommittedSearch] = useState('');
  const [page, setPage] = useState(1);
  const carouselRef = useRef<HTMLDivElement>(null);

  // Selected job from URL or first item
  const selectedJobId = searchParams.get('jobId') || null;

  // Newest 10 for the carousel; its meta.total is the company's full open-job count
  const { data: newestData } = useGetJobsQuery({
    company: companySlug,
    page: 1,
    pageSize: CAROUSEL_SIZE,
    sortBy: 'publishedAt',
    sortOrder: 'desc',
  });
  const newestJobs = useMemo(() => newestData?.data || [], [newestData?.data]);
  const companyTotal = newestData?.meta.total;

  // The full list is paged and searched by the API, so every job is reachable (not just one loaded page)
  const { data, isLoading, isFetching, error, refetch } = useGetJobsQuery({
    company: companySlug,
    ...(committedSearch ? { search: committedSearch } : {}),
    page,
    pageSize: PAGE_SIZE,
    sortBy: 'publishedAt',
    sortOrder: 'desc',
  });

  const pageJobs = useMemo(() => data?.data || [], [data?.data]);
  const total = data?.meta.total ?? 0;
  const totalPages = data?.meta.totalPages ?? 1;
  const firstShown = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastShown = Math.min(page * PAGE_SIZE, total);

  const commitSearch = (text: string) => {
    setCommittedSearch(text.trim());
    setPage(1);
  };

  // Group this page's jobs by department
  const departmentGroups = useMemo(() => {
    const groups: Record<string, JobListItem[]> = {};
    pageJobs.forEach((job) => {
      const dept = job.department || 'General';
      if (!groups[dept]) groups[dept] = [];
      groups[dept].push(job);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [pageJobs]);

  // Auto-select first job on desktop if none selected
  const activeSelectedId =
    selectedJobId || (isDesktop && pageJobs.length > 0 ? pageJobs[0].id : null);

  const handleSelectJob = (id: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('jobId', id);
        return next;
      },
      { replace: false }
    );
  };

  const handleScrollCarousel = (direction: 'left' | 'right') => {
    if (carouselRef.current) {
      const offset = direction === 'left' ? -320 : 320;
      carouselRef.current.scrollBy({ left: offset, behavior: 'smooth' });
    }
  };

  return (
    <Box sx={{ py: 2 }}>
      {/* Search and "See all in search" toolbar */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          gap: 2,
          justifyContent: 'space-between',
          alignItems: { xs: 'stretch', sm: 'center' },
          mb: 3,
        }}
      >
        <TextField
          size="small"
          placeholder={companyTotal !== undefined ? `Search ${companyTotal.toLocaleString()} roles at ${companyName}...` : `Search roles at ${companyName}...`}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitSearch(searchTerm);
          }}
          slotProps={{
            htmlInput: {
              'aria-label': `Search roles at ${companyName}`,
            },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                </InputAdornment>
              ),
              endAdornment: searchTerm ? (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    aria-label="Clear job filter"
                    onClick={() => {
                      setSearchTerm('');
                      commitSearch('');
                    }}
                  >
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : null,
            },
          }}
          sx={{ maxWidth: { xs: '100%', sm: 380 } }}
        />

        <Button
          component={RouterLink}
          to={`/?company=${encodeURIComponent(companySlug)}`}
          variant="outlined"
          size="small"
          endIcon={<OpenInNewIcon fontSize="small" />}
          sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}
        >
          See all in search
        </Button>
      </Box>

      <QueryState
        isLoading={isLoading}
        isFetching={isFetching}
        error={error}
        onRetry={refetch}
        empty={total === 0}
        emptyMessage={
          committedSearch
            ? `No ${companyName} roles match "${committedSearch}".`
            : `No active postings found for ${companyName}.`
        }
      >
        {/* Recently Posted Carousel */}
        {newestJobs.length > 0 && !committedSearch && page === 1 && (
          <Box sx={{ mb: 4 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Recently Posted
              </Typography>
              <Stack direction="row" spacing={0.5}>
                <IconButton
                  size="small"
                  aria-label="Previous jobs"
                  onClick={() => handleScrollCarousel('left')}
                  sx={{ border: '1px solid', borderColor: 'divider' }}
                >
                  <ChevronLeftIcon fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  aria-label="Next jobs"
                  onClick={() => handleScrollCarousel('right')}
                  sx={{ border: '1px solid', borderColor: 'divider' }}
                >
                  <ChevronRightIcon fontSize="small" />
                </IconButton>
              </Stack>
            </Box>

            <Box
              ref={carouselRef}
              sx={{
                display: 'flex',
                gap: 2,
                overflowX: 'auto',
                pb: 1.5,
                scrollSnapType: 'x mandatory',
                '&::-webkit-scrollbar': { height: 6 },
                '&::-webkit-scrollbar-thumb': {
                  backgroundColor: 'divider',
                  borderRadius: 3,
                },
              }}
            >
              {newestJobs.map((job) => (
                <Box
                  key={job.id}
                  sx={{
                    minWidth: { xs: 260, sm: 300 },
                    maxWidth: 320,
                    flexShrink: 0,
                    scrollSnapAlign: 'start',
                  }}
                >
                  <JobCard
                    job={job}
                    isSelected={activeSelectedId === job.id}
                    onSelect={handleSelectJob}
                    linkToDetail={!isDesktop}
                  />
                </Box>
              ))}
            </Box>
          </Box>
        )}

        {/* Department Grouped Listings + Two Pane */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: isDesktop ? '1fr 1fr' : '1fr',
            gap: 3,
            alignItems: 'start',
          }}
        >
          {/* Left Column: Department Accordions for this page */}
          <Box component="section" aria-label="Open positions">
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 1, mb: 1.5 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                {committedSearch ? `Roles matching "${committedSearch}"` : 'All open positions by department'}
              </Typography>
              <Typography variant="caption" color="text.secondary" aria-live="polite" sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                {`Showing ${firstShown}–${lastShown} of ${total.toLocaleString()}`}
              </Typography>
            </Box>

            {departmentGroups.map(([department, jobs], idx) => (
              <Accordion
                key={department}
                defaultExpanded={idx === 0 || departmentGroups.length <= 3}
                disableGutters
                elevation={0}
                sx={{
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1.5,
                  mb: 1.5,
                  '&:before': { display: 'none' },
                  overflow: 'hidden',
                }}
              >
                <AccordionSummary
                  expandIcon={<ExpandMoreIcon />}
                  sx={{
                    bgcolor: (th) =>
                      th.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.01)',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%', pr: 1 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, flex: 1 }}>
                      {department}
                    </Typography>
                    <Chip
                      label={jobs.length}
                      size="small"
                      sx={{
                        fontVariantNumeric: 'tabular-nums',
                        fontWeight: 600,
                        height: 20,
                      }}
                    />
                  </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ p: 1.5 }}>
                  <Stack spacing={1}>
                    {jobs.map((job) => (
                      <JobCard
                        key={job.id}
                        job={job}
                        isSelected={activeSelectedId === job.id}
                        onSelect={handleSelectJob}
                        linkToDetail={!isDesktop}
                      />
                    ))}
                  </Stack>
                </AccordionDetails>
              </Accordion>
            ))}

            {totalPages > 1 && (
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
                <Pagination
                  count={totalPages}
                  page={page}
                  onChange={(_, value) => setPage(value)}
                  shape="rounded"
                  siblingCount={isDesktop ? 1 : 0}
                />
              </Box>
            )}
          </Box>

          {/* Right Column: Sticky Detail Panel (Desktop only) */}
          {isDesktop && (
            <Box>
              <JobDetailPanel
                jobId={activeSelectedId}
                isSticky
                headingComponent="h2"
              />
            </Box>
          )}
        </Box>
      </QueryState>
    </Box>
  );
};

export default DepartmentGroups;
