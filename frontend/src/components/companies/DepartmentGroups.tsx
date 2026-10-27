/**
 * @file DepartmentGroups.tsx
 * @summary Company jobs tab featuring a newest-10 carousel, collapsible department groups, and two-pane master/detail
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

  const [searchTerm, setSearchTerm] = useState('');
  const carouselRef = useRef<HTMLDivElement>(null);

  // Selected job from URL or first item
  const selectedJobId = searchParams.get('jobId') || null;

  const { data, isLoading, isFetching, error, refetch } = useGetJobsQuery({
    company: companySlug,
    pageSize: 100,
    sortBy: 'publishedAt',
    sortOrder: 'desc',
  });

  const allJobs = useMemo(() => data?.data || [], [data?.data]);

  // Carousel of newest 10 jobs
  const newestJobs = useMemo(() => allJobs.slice(0, 10), [allJobs]);

  // Filter jobs by in-page search term
  const filteredJobs = useMemo(() => {
    if (!searchTerm.trim()) return allJobs;
    const lower = searchTerm.toLowerCase();
    return allJobs.filter(
      (j) =>
        j.title.toLowerCase().includes(lower) ||
        (j.department && j.department.toLowerCase().includes(lower)) ||
        (j.location && j.location.toLowerCase().includes(lower))
    );
  }, [allJobs, searchTerm]);

  // Group filtered jobs by department
  const departmentGroups = useMemo(() => {
    const groups: Record<string, JobListItem[]> = {};
    filteredJobs.forEach((job) => {
      const dept = job.department || 'General';
      if (!groups[dept]) groups[dept] = [];
      groups[dept].push(job);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredJobs]);

  // Auto-select first job on desktop if none selected
  const activeSelectedId =
    selectedJobId || (isDesktop && filteredJobs.length > 0 ? filteredJobs[0].id : null);

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
          placeholder={`Search ${allJobs.length} roles at ${companyName}...`}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
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
                    onClick={() => setSearchTerm('')}
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
        empty={allJobs.length === 0}
        emptyMessage={`No active postings found for ${companyName}.`}
      >
        {/* Recently Posted Carousel */}
        {newestJobs.length > 0 && !searchTerm && (
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
          {/* Left Column: Department Accordions */}
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
              All Open Positions by Department ({filteredJobs.length})
            </Typography>

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
