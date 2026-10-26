import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Container,
  Box,
  Typography,
  TextField,
  InputAdornment,
  Button,
  Chip,
  Paper,
  Stack,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Pagination,
  IconButton,
  Drawer,
  Badge,
  LinearProgress,
  Tooltip,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import TuneIcon from '@mui/icons-material/Tune';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import AttachMoneyOutlinedIcon from '@mui/icons-material/AttachMoneyOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { useGetJobsQuery, useGetFacetsQuery } from '../store/api/jobsApi';
import { WorkplaceType, EmploymentType, JobsQueryParams } from '../types/api';
import { useJobFilters } from '../hooks/useJobFilters';
import { QueryState } from '../components/QueryState';
import { formatJobFreshness } from '../lib/formatJobFreshness';

export function formatCountryOption(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code;
  } catch {
    return code;
  }
}

export function formatSalary(min?: number | null, max?: number | null, currency?: string | null, interval?: string | null): string | null {
  if (!min && !max) return null;
  const curr = currency || '$';
  const formatNum = (num: number) => {
    if (num >= 1000) return `${Math.round(num / 1000)}k`;
    return num.toLocaleString();
  };

  const inter = interval ? `/${interval.toLowerCase().replace('1 ', '')}` : '';

  if (min && max) {
    if (min === max) return `${curr}${formatNum(min)}${inter}`;
    return `${curr}${formatNum(min)} – ${curr}${formatNum(max)}${inter}`;
  }
  if (min) return `From ${curr}${formatNum(min)}${inter}`;
  if (max) return `Up to ${curr}${formatNum(max)}${inter}`;
  return null;
}

export const BrowsePage: React.FC = () => {
  const theme = useTheme();
  const isTablet = useMediaQuery(theme.breakpoints.down('md'));
  const headingRef = useRef<HTMLHeadingElement>(null);

  const { filters, updateUrl, clearAllFilters } = useJobFilters();
  const [searchTerm, setSearchTerm] = useState(filters.search || '');
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  // Local draft for mobile drawer (applies once on submit)
  const [draftFilters, setDraftFilters] = useState<Partial<JobsQueryParams>>(filters);

  // Sync search input state when URL filter changes
  useEffect(() => {
    setSearchTerm(filters.search || '');
  }, [filters.search]);

  // Query jobs and facets
  const { data, isLoading, isFetching, error, refetch } = useGetJobsQuery(filters);
  const { data: facetsData } = useGetFacetsQuery();

  // Scroll to top and focus heading on page change
  const handlePageChange = (_: React.ChangeEvent<unknown>, value: number) => {
    updateUrl({ page: value });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    headingRef.current?.focus();
  };

  const handleOpenDrawer = () => {
    setDraftFilters({ ...filters });
    setMobileFilterOpen(true);
  };

  const handleApplyDraft = () => {
    updateUrl({ ...draftFilters, page: 1 });
    setMobileFilterOpen(false);
  };

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.workplaceType) count++;
    if (filters.employmentType) count++;
    if (filters.country) count++;
    if (filters.hasSalary) count++;
    return count;
  }, [filters]);

  const renderFilterControls = (isDraft = false) => {
    const activeState = isDraft ? draftFilters : filters;
    const setDraftOrUrl = (key: keyof JobsQueryParams, val: any) => {
      if (isDraft) {
        setDraftFilters((prev) => ({ ...prev, [key]: val }));
      } else {
        updateUrl({ [key]: val, page: 1 });
      }
    };

    return (
      <Stack
        direction={isDraft ? 'column' : 'row'}
        spacing={isDraft ? 2.5 : 1.5}
        sx={{ alignItems: isDraft ? 'stretch' : 'center', flexWrap: 'wrap', gap: 1 }}
      >
        {/* Workplace Type */}
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel id="workplace-select-label">Workplace</InputLabel>
          <Select
            labelId="workplace-select-label"
            value={activeState.workplaceType || ''}
            label="Workplace"
            onChange={(e) => setDraftOrUrl('workplaceType', e.target.value as WorkplaceType | '')}
          >
            <MenuItem value="">All Workplaces</MenuItem>
            <MenuItem value="Remote">Remote</MenuItem>
            <MenuItem value="OnSite">On-Site</MenuItem>
            <MenuItem value="Hybrid">Hybrid</MenuItem>
          </Select>
        </FormControl>

        {/* Employment Type */}
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel id="employment-select-label">Commitment</InputLabel>
          <Select
            labelId="employment-select-label"
            value={activeState.employmentType || ''}
            label="Commitment"
            onChange={(e) => setDraftOrUrl('employmentType', e.target.value as EmploymentType | '')}
          >
            <MenuItem value="">All Types</MenuItem>
            <MenuItem value="FullTime">Full Time</MenuItem>
            <MenuItem value="PartTime">Part Time</MenuItem>
            <MenuItem value="Contract">Contract</MenuItem>
            <MenuItem value="Intern">Internship</MenuItem>
          </Select>
        </FormControl>

        {/* Country */}
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel id="country-select-label">Country</InputLabel>
          <Select
            labelId="country-select-label"
            value={activeState.country || ''}
            label="Country"
            onChange={(e) => setDraftOrUrl('country', e.target.value)}
          >
            <MenuItem value="">All Countries</MenuItem>
            {activeState.country && !facetsData?.countries?.some((c) => c.value === activeState.country) && (
              <MenuItem value={activeState.country}>
                {formatCountryOption(activeState.country)}
              </MenuItem>
            )}
            {facetsData?.countries?.map((c) => (
              <MenuItem key={c.value} value={c.value}>
                {formatCountryOption(c.value)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Sort Select */}
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel id="sort-select-label">Sort By</InputLabel>
          <Select
            labelId="sort-select-label"
            value={`${activeState.sortBy || 'publishedAt'}-${activeState.sortOrder || 'desc'}`}
            label="Sort By"
            onChange={(e) => {
              const [sortBy, sortOrder] = e.target.value.split('-') as [JobsQueryParams['sortBy'], 'asc' | 'desc'];
              if (isDraft) {
                setDraftFilters((prev) => ({ ...prev, sortBy, sortOrder }));
              } else {
                updateUrl({ sortBy, sortOrder, page: 1 });
              }
            }}
          >
            <MenuItem value="publishedAt-desc">Most Recent</MenuItem>
            <MenuItem value="salary-desc">Highest Salary</MenuItem>
            <MenuItem value="title-asc">Job Title (A-Z)</MenuItem>
            <MenuItem value="company-asc">Company (A-Z)</MenuItem>
          </Select>
        </FormControl>

        {/* Published Salary Toggle */}
        <Button
          variant={activeState.hasSalary ? 'contained' : 'outlined'}
          color={activeState.hasSalary ? 'secondary' : 'inherit'}
          size="small"
          aria-pressed={Boolean(activeState.hasSalary)}
          startIcon={<AttachMoneyOutlinedIcon fontSize="small" />}
          onClick={() => setDraftOrUrl('hasSalary', !activeState.hasSalary)}
          sx={{
            whiteSpace: 'nowrap',
            borderColor: activeState.hasSalary ? 'transparent' : 'divider',
            minHeight: { xs: 44, sm: 36 },
          }}
        >
          Disclosed Salary
        </Button>

        {/* Reset / Clear */}
        {!isDraft && (filters.search || filters.workplaceType || filters.employmentType || filters.country || filters.hasSalary) && (
          <Button
            variant="text"
            color="inherit"
            size="small"
            startIcon={<RestartAltIcon fontSize="small" />}
            onClick={clearAllFilters}
            sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}
          >
            Clear
          </Button>
        )}
      </Stack>
    );
  };

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      {/* React 19 Document Metadata */}
      <title>Browse Jobs | Ashby Direct ATS Directory</title>
      <meta
        name="description"
        content="Search and filter verified direct applicant tracking jobs across hundreds of companies on Ashby ATS."
      />

      {/* Screen-reader H1 */}
      <Typography
        ref={headingRef}
        component="h1"
        variant="h4"
        tabIndex={-1}
        sx={{
          fontSize: { xs: '1.5rem', sm: '2rem' },
          fontWeight: 800,
          mb: 2,
          letterSpacing: '-0.02em',
          outline: 'none',
        }}
      >
        Verified Ashby Job Postings
      </Typography>

      {/* Search Header */}
      <Box sx={{ mb: 3 }}>
        <Stack spacing={2}>
          {/* Main Search Input */}
          <TextField
            fullWidth
            size="medium"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                updateUrl({ search: searchTerm.trim(), page: 1 });
              }
            }}
            placeholder="Search verified jobs by title, company, or keywords..."
            slotProps={{
              htmlInput: {
                'aria-label': 'Search jobs by title or company',
              },
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: 'text.secondary' }} />
                  </InputAdornment>
                ),
                endAdornment: searchTerm ? (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      aria-label="Clear search input"
                      onClick={() => {
                        setSearchTerm('');
                        updateUrl({ search: '', page: 1 });
                      }}
                    >
                      <ClearIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ) : null,
              },
            }}
          />

          {/* Responsive Filters Area */}
          {isTablet ? (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
              <Stack direction="row" spacing={1} sx={{ overflowX: 'auto', py: 0.5 }}>
                <Chip
                  label="Remote"
                  clickable
                  variant={filters.workplaceType === 'Remote' ? 'filled' : 'outlined'}
                  color={filters.workplaceType === 'Remote' ? 'secondary' : 'default'}
                  size="small"
                  onClick={() => updateUrl({ workplaceType: filters.workplaceType === 'Remote' ? '' : 'Remote', page: 1 })}
                  sx={{ minHeight: 36 }}
                />
                <Chip
                  label="Salary"
                  clickable
                  variant={filters.hasSalary ? 'filled' : 'outlined'}
                  color={filters.hasSalary ? 'secondary' : 'default'}
                  size="small"
                  onClick={() => updateUrl({ hasSalary: !filters.hasSalary, page: 1 })}
                  sx={{ minHeight: 36 }}
                />
                <Chip
                  label="Full-time"
                  clickable
                  variant={filters.employmentType === 'FullTime' ? 'filled' : 'outlined'}
                  color={filters.employmentType === 'FullTime' ? 'secondary' : 'default'}
                  size="small"
                  onClick={() => updateUrl({ employmentType: filters.employmentType === 'FullTime' ? '' : 'FullTime', page: 1 })}
                  sx={{ minHeight: 36 }}
                />
              </Stack>

              <Button
                variant="outlined"
                color="inherit"
                size="small"
                aria-expanded={mobileFilterOpen}
                startIcon={
                  <Badge badgeContent={activeFilterCount} color="secondary">
                    <TuneIcon fontSize="small" />
                  </Badge>
                }
                onClick={handleOpenDrawer}
                sx={{ shrink: 0, borderColor: 'divider', minHeight: 44 }}
              >
                Filters
              </Button>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              {renderFilterControls(false)}
            </Box>
          )}
        </Stack>
      </Box>

      {/* Fetching Progress Bar */}
      {isFetching && <LinearProgress sx={{ height: 2, mb: 1, borderRadius: 1 }} />}

      {/* Ledger Count Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          pb: 1.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Typography variant="caption" role="status" sx={{ color: 'text.secondary', fontWeight: 500 }}>
          Showing <strong>{data?.meta?.total?.toLocaleString() ?? 0}</strong> roles
        </Typography>
        <Typography variant="caption" sx={{ fontFamily: "'Geist Mono', monospace", color: 'text.secondary' }}>
          Page {data?.meta?.page ?? 1} of {data?.meta?.totalPages ?? 1}
        </Typography>
      </Box>

      {/* Query State wrapper handling error, 429 countdown/refetch, and loading */}
      <QueryState
        isLoading={isLoading}
        isFetching={isFetching}
        error={error}
        onRetry={refetch}
        empty={data?.data?.length === 0}
        emptyMessage="No job postings match your active search and filter criteria."
        emptyAction={
          <Button variant="outlined" color="secondary" size="small" onClick={clearAllFilters}>
            Reset All Filters
          </Button>
        }
      >
        {data && data.data.length > 0 && (
          <Paper sx={{ borderTop: 0, borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
            {data.data.map((job, idx) => {
              const salary = formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency, job.salaryInterval);
              const freshness = formatJobFreshness(job);
              return (
                <Box
                  key={job.id}
                  sx={{
                    p: { xs: 2, sm: 2.5 },
                    borderTop: idx > 0 ? '1px solid' : 'none',
                    borderColor: 'divider',
                    transition: 'background-color 0.15s ease',
                    '&:hover': {
                      bgcolor: (th) => (th.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.015)'),
                    },
                  }}
                >
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={{ xs: 1.5, sm: 2 }}
                    sx={{
                      alignItems: { xs: 'flex-start', sm: 'center' },
                      justifyContent: 'space-between',
                    }}
                  >
                    {/* Left Column: Role Details */}
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Stack direction="row" spacing={1} sx={{ mb: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                          {job.companyName}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">·</Typography>
                        <Typography
                          variant="caption"
                          sx={{
                            fontFamily: "'Geist Mono', monospace",
                            color: 'text.secondary',
                            fontSize: '0.72rem',
                          }}
                        >
                          jobs.ashbyhq.com/{job.companySlug}
                        </Typography>
                        {freshness && (
                          <>
                            <Typography variant="caption" color="text.secondary">·</Typography>
                            {freshness.tooltip ? (
                              <Tooltip title={freshness.tooltip} arrow>
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                  component="time"
                                  dateTime={freshness.dateTime}
                                  sx={{ cursor: 'help' }}
                                >
                                  {freshness.label}
                                </Typography>
                              </Tooltip>
                            ) : (
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                component="time"
                                dateTime={freshness.dateTime}
                              >
                                {freshness.label}
                              </Typography>
                            )}
                          </>
                        )}
                      </Stack>

                      <Typography
                        component={RouterLink}
                        to={`/jobs/${job.id}`}
                        variant="h6"
                        sx={{
                          fontSize: { xs: '0.95rem', sm: '1.05rem' },
                          fontWeight: 600,
                          color: 'text.primary',
                          textDecoration: 'none',
                          display: 'block',
                          lineHeight: 1.35,
                          '&:hover': {
                            color: 'secondary.main',
                          },
                        }}
                      >
                        {job.title}
                      </Typography>

                      <Stack direction="row" spacing={1.25} sx={{ mt: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary', fontSize: '0.75rem' }}>
                          <LocationOnOutlinedIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                          <span>{job.location || 'Not specified'}</span>
                        </Box>

                        {job.workplaceType && (
                          <Chip
                            label={job.workplaceType}
                            size="small"
                            variant="outlined"
                            sx={{ height: 20, fontSize: '0.7rem' }}
                          />
                        )}

                        {job.employmentType && (
                          <Chip
                            label={job.employmentType}
                            size="small"
                            variant="outlined"
                            sx={{ height: 20, fontSize: '0.7rem' }}
                          />
                        )}
                      </Stack>
                    </Box>

                    {/* Right Column: Salary & Outbound Action */}
                    <Stack
                      direction={{ xs: 'row', sm: 'column' }}
                      spacing={{ xs: 2, sm: 1 }}
                      sx={{
                        alignItems: { xs: 'center', sm: 'flex-end' },
                        justifyContent: 'space-between',
                        width: { xs: '100%', sm: 'auto' },
                        flexShrink: 0,
                      }}
                    >
                      {salary && (
                        <Typography
                          variant="subtitle2"
                          sx={{
                            fontFamily: "'Geist Mono', monospace",
                            fontWeight: 600,
                            color: 'secondary.main',
                            fontSize: '0.85rem',
                          }}
                        >
                          {salary}
                        </Typography>
                      )}

                      <Button
                        component="a"
                        href={job.applyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        size="small"
                        variant="outlined"
                        endIcon={<OpenInNewIcon sx={{ fontSize: 13 }} />}
                        sx={{
                          textTransform: 'none',
                          fontWeight: 600,
                          fontSize: '0.75rem',
                          borderColor: 'divider',
                          minHeight: { xs: 44, sm: 32 },
                        }}
                      >
                        Apply Direct
                      </Button>
                    </Stack>
                  </Stack>
                </Box>
              );
            })}
          </Paper>
        )}

        {/* Pagination */}
        {data && data.meta.totalPages > 1 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4, mb: 2 }}>
            <Pagination
              count={data.meta.totalPages}
              page={data.meta.page}
              onChange={handlePageChange}
              color="primary"
              shape="rounded"
              size={isTablet ? 'medium' : 'large'}
              aria-label="Job postings pagination"
            />
          </Box>
        )}
      </QueryState>

      {/* Mobile Drawer Filter Dialog */}
      <Drawer
        anchor="bottom"
        open={mobileFilterOpen}
        onClose={() => setMobileFilterOpen(false)}
        slotProps={{
          paper: {
            sx: {
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              p: 3,
              maxHeight: '85vh',
            },
          },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Filter Postings
          </Typography>
          <IconButton size="small" onClick={() => setMobileFilterOpen(false)} aria-label="Close filters drawer">
            <ClearIcon fontSize="small" />
          </IconButton>
        </Box>

        <Box sx={{ my: 2 }}>{renderFilterControls(true)}</Box>

        <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
          <Button
            variant="outlined"
            color="inherit"
            fullWidth
            onClick={() => {
              setDraftFilters({
                workplaceType: '',
                employmentType: '',
                country: '',
                hasSalary: false,
                sortBy: 'publishedAt',
                sortOrder: 'desc',
              });
            }}
            sx={{ minHeight: 44 }}
          >
            Reset
          </Button>
          <Button
            variant="contained"
            color="primary"
            fullWidth
            onClick={handleApplyDraft}
            sx={{ minHeight: 44, fontWeight: 600 }}
          >
            Apply Filters
          </Button>
        </Stack>
      </Drawer>
    </Container>
  );
};

export default BrowsePage;
