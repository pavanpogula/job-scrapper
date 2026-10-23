import React, { useState, useEffect } from 'react';
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
  CircularProgress,
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
import { useAppDispatch, useAppSelector } from '../store';
import {
  setSearch,
  setWorkplaceType,
  setEmploymentType,
  setCountry,
  setHasSalary,
  setPage,
  resetFilters,
} from '../store/slices/filterSlice';
import { useGetJobsQuery } from '../store/api/jobsApi';
import { WorkplaceType, EmploymentType } from '../types/api';

export const BrowsePage: React.FC = () => {
  const dispatch = useAppDispatch();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isTablet = useMediaQuery(theme.breakpoints.down('md'));

  const filters = useAppSelector((state) => state.filters);
  const { data, isLoading, isFetching, error } = useGetJobsQuery(filters);

  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState(filters.search || '');

  // Keep local search in sync with external filter resets
  useEffect(() => {
    setSearchTerm(filters.search || '');
  }, [filters.search]);

  // Debounce search dispatch by 400ms to avoid firing requests on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchTerm !== (filters.search || '')) {
        dispatch(setSearch(searchTerm));
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [searchTerm, filters.search, dispatch]);

  // Active filter count for badge
  const activeFilterCount = [
    Boolean(filters.workplaceType),
    Boolean(filters.employmentType),
    Boolean(filters.country),
    Boolean(filters.hasSalary),
  ].filter(Boolean).length;

  const formatSalary = (min?: number | null, max?: number | null, currency?: string | null, interval?: string | null) => {
    if (!min && !max) return null;
    const curr = currency || 'USD';
    const sym = curr === 'USD' ? '$' : curr === 'EUR' ? '€' : curr === 'GBP' ? '£' : `${curr} `;
    const intLabel = interval === '1 HOUR' ? '/hr' : interval === '1 MONTH' ? '/mo' : '/yr';

    if (min && max) {
      if (min === max) return `${sym}${min.toLocaleString()}${intLabel}`;
      return `${sym}${min.toLocaleString()} – ${sym}${max.toLocaleString()}${intLabel}`;
    }
    if (min) return `From ${sym}${min.toLocaleString()}${intLabel}`;
    return `Up to ${sym}${max!.toLocaleString()}${intLabel}`;
  };

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return 'Recently';
    const date = new Date(isoString);
    const diffMs = Date.now() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 30) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const renderFilterControls = () => (
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ alignItems: 'stretch' }}>
      {/* Workplace Type */}
      <FormControl size="small" sx={{ minWidth: 150 }}>
        <InputLabel id="workplace-select-label">Workplace</InputLabel>
        <Select
          labelId="workplace-select-label"
          value={filters.workplaceType || ''}
          label="Workplace"
          onChange={(e) => dispatch(setWorkplaceType(e.target.value as WorkplaceType | ''))}
        >
          <MenuItem value="">All Workplaces</MenuItem>
          <MenuItem value="Remote">Remote only</MenuItem>
          <MenuItem value="Hybrid">Hybrid</MenuItem>
          <MenuItem value="OnSite">On-site</MenuItem>
        </Select>
      </FormControl>

      {/* Employment Type */}
      <FormControl size="small" sx={{ minWidth: 150 }}>
        <InputLabel id="employment-select-label">Employment</InputLabel>
        <Select
          labelId="employment-select-label"
          value={filters.employmentType || ''}
          label="Employment"
          onChange={(e) => dispatch(setEmploymentType(e.target.value as EmploymentType | ''))}
        >
          <MenuItem value="">All Employments</MenuItem>
          <MenuItem value="FullTime">Full-time</MenuItem>
          <MenuItem value="Contract">Contract</MenuItem>
          <MenuItem value="PartTime">Part-time</MenuItem>
          <MenuItem value="Intern">Internship</MenuItem>
        </Select>
      </FormControl>

      {/* Country */}
      <FormControl size="small" sx={{ minWidth: 140 }}>
        <InputLabel id="country-select-label">Country</InputLabel>
        <Select
          labelId="country-select-label"
          value={filters.country || ''}
          label="Country"
          onChange={(e) => dispatch(setCountry(e.target.value))}
        >
          <MenuItem value="">All Countries</MenuItem>
          <MenuItem value="US">United States (US)</MenuItem>
          <MenuItem value="GB">United Kingdom (GB)</MenuItem>
          <MenuItem value="CA">Canada (CA)</MenuItem>
          <MenuItem value="DE">Germany (DE)</MenuItem>
          <MenuItem value="FR">France (FR)</MenuItem>
        </Select>
      </FormControl>

      {/* Salary Filter Toggle */}
      <Button
        variant={filters.hasSalary ? 'contained' : 'outlined'}
        color={filters.hasSalary ? 'secondary' : 'inherit'}
        size="small"
        startIcon={<AttachMoneyOutlinedIcon fontSize="small" />}
        onClick={() => dispatch(setHasSalary(!filters.hasSalary))}
        sx={{
          whiteSpace: 'nowrap',
          borderColor: filters.hasSalary ? 'transparent' : 'divider',
          color: filters.hasSalary ? '#fff' : 'text.primary',
        }}
      >
        Published Salary
      </Button>

      {/* Reset Filters */}
      {(filters.search || filters.workplaceType || filters.employmentType || filters.country || filters.hasSalary) && (
        <Button
          variant="text"
          color="inherit"
          size="small"
          startIcon={<RestartAltIcon fontSize="small" />}
          onClick={() => dispatch(resetFilters())}
          sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}
        >
          Clear
        </Button>
      )}
    </Stack>
  );

  return (
    <Container maxWidth="lg">
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
                dispatch(setSearch(searchTerm));
              }
            }}
            placeholder="Search 34,000+ jobs by title, company, or keywords..."
            slotProps={{
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
                      onClick={() => {
                        setSearchTerm('');
                        dispatch(setSearch(''));
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
            /* Mobile / Tablet Filter Controls */
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
              {/* Quick Filter Chips */}
              <Stack direction="row" spacing={1} sx={{ overflowX: 'auto', py: 0.5 }}>
                <Chip
                  label="Remote"
                  clickable
                  variant={filters.workplaceType === 'Remote' ? 'filled' : 'outlined'}
                  color={filters.workplaceType === 'Remote' ? 'secondary' : 'default'}
                  size="small"
                  onClick={() => dispatch(setWorkplaceType(filters.workplaceType === 'Remote' ? '' : 'Remote'))}
                />
                <Chip
                  label="Salary"
                  clickable
                  variant={filters.hasSalary ? 'filled' : 'outlined'}
                  color={filters.hasSalary ? 'secondary' : 'default'}
                  size="small"
                  onClick={() => dispatch(setHasSalary(!filters.hasSalary))}
                />
                <Chip
                  label="Full-time"
                  clickable
                  variant={filters.employmentType === 'FullTime' ? 'filled' : 'outlined'}
                  color={filters.employmentType === 'FullTime' ? 'secondary' : 'default'}
                  size="small"
                  onClick={() => dispatch(setEmploymentType(filters.employmentType === 'FullTime' ? '' : 'FullTime'))}
                />
              </Stack>

              {/* All Filters Button */}
              <Button
                variant="outlined"
                color="inherit"
                size="small"
                startIcon={
                  <Badge badgeContent={activeFilterCount} color="secondary">
                    <TuneIcon fontSize="small" />
                  </Badge>
                }
                onClick={() => setMobileFilterOpen(true)}
                sx={{ shrink: 0, borderColor: 'divider' }}
              >
                Filters
              </Button>
            </Box>
          ) : (
            /* Desktop Filters Bar */
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              {renderFilterControls()}
              {isFetching && (
                <Typography variant="caption" sx={{ fontFamily: "'Geist Mono', monospace", color: 'text.secondary' }}>
                  Updating...
                </Typography>
              )}
            </Box>
          )}
        </Stack>
      </Box>

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
        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500 }}>
          Showing <strong>{data?.meta?.total ?? 0}</strong> roles
        </Typography>
        <Typography variant="caption" sx={{ fontFamily: "'Geist Mono', monospace", color: 'text.secondary' }}>
          Page {data?.meta?.page ?? 1} of {data?.meta?.totalPages ?? 1}
        </Typography>
      </Box>

      {/* Jobs List (Ledger Rows) */}
      <Paper sx={{ borderTop: 0, borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
        {isLoading ? (
          <Box sx={{ py: 10, textAlign: 'center' }}>
            <CircularProgress size={28} sx={{ color: 'secondary.main', mb: 1.5 }} />
            <Typography variant="body2" color="text.secondary">
              Querying database ledger...
            </Typography>
          </Box>
        ) : error ? (
          <Box sx={{ py: 8, textAlign: 'center', px: 2 }}>
            <Typography
              variant="body2"
              sx={{
                color: (error as any)?.status === 429 ? 'warning.main' : 'error.main',
                fontWeight: 500,
              }}
            >
              {(error as any)?.status === 429
                ? ((error as any)?.data?.message || 'Rate limit active: maximum 10 requests per 1 minute. Data is cached locally.')
                : 'Unable to retrieve listings. Please verify connection or API mode.'}
            </Typography>
            {(error as any)?.status === 429 && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                Cached pages and previously viewed listings remain available immediately.
              </Typography>
            )}
          </Box>
        ) : data?.data?.length === 0 ? (
          <Box sx={{ py: 8, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              No matching listings found.
            </Typography>
            <Button
              variant="text"
              color="secondary"
              size="small"
              onClick={() => dispatch(resetFilters())}
              sx={{ mt: 1 }}
            >
              Reset all filters
            </Button>
          </Box>
        ) : (
          data?.data.map((job, idx) => {
            const salary = formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency, job.salaryInterval);
            return (
              <Box
                key={job.id}
                sx={{
                  p: { xs: 2, sm: 2.5 },
                  borderTop: idx > 0 ? '1px solid' : 'none',
                  borderColor: 'divider',
                  transition: 'background-color 0.15s ease',
                  '&:hover': {
                    bgcolor: (th) => th.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.015)',
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
                          sx={{
                            height: 20,
                            fontSize: '0.68rem',
                            bgcolor: 'background.default',
                          }}
                        />
                      )}

                      {job.employmentType && (
                        <Typography variant="caption" color="text.secondary">
                          {job.employmentType}
                        </Typography>
                      )}

                      {job.department && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', md: 'inline' } }}>
                          · {job.department}
                        </Typography>
                      )}
                    </Stack>
                  </Box>

                  {/* Right Column: Salary & Action */}
                  <Box
                    sx={{
                      width: { xs: '100%', sm: 'auto' },
                      textAlign: { xs: 'left', sm: 'right' },
                      display: 'flex',
                      flexDirection: { xs: 'row', sm: 'column' },
                      alignItems: { xs: 'center', sm: 'flex-end' },
                      justifyContent: 'space-between',
                      gap: 1,
                      borderTop: { xs: '1px solid', sm: 'none' },
                      borderColor: 'divider',
                      pt: { xs: 1.5, sm: 0 },
                    }}
                  >
                    {salary ? (
                      <Typography
                        variant="subtitle2"
                        sx={{
                          fontWeight: 700,
                          color: 'secondary.main',
                          fontVariantNumeric: 'tabular-nums',
                          letterSpacing: '-0.01em',
                        }}
                      >
                        {salary}
                      </Typography>
                    ) : (
                      <Typography variant="caption" color="text.secondary">
                        Salary unlisted
                      </Typography>
                    )}

                    <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
                      <Typography variant="caption" sx={{ fontFamily: "'Geist Mono', monospace", color: 'text.secondary' }}>
                        {formatDate(job.publishedAt)}
                      </Typography>

                      <Button
                        component="a"
                        href={job.applyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        variant="contained"
                        color="primary"
                        size="small"
                        endIcon={<OpenInNewIcon sx={{ fontSize: '0.85rem !important' }} />}
                        sx={{
                          fontSize: '0.75rem',
                          py: 0.5,
                          px: 1.5,
                        }}
                      >
                        Apply
                      </Button>
                    </Stack>
                  </Box>
                </Stack>
              </Box>
            );
          })
        )}
      </Paper>

      {/* Pagination Footer */}
      {data && data.meta.totalPages > 1 && (
        <Box sx={{ mt: 3, display: 'flex', justifyContent: 'center' }}>
          <Pagination
            count={data.meta.totalPages}
            page={data.meta.page}
            onChange={(_e, val) => dispatch(setPage(val))}
            size={isMobile ? 'small' : 'medium'}
            shape="rounded"
            color="primary"
          />
        </Box>
      )}

      {/* Mobile Filters Drawer */}
      <Drawer
        anchor="bottom"
        open={mobileFilterOpen}
        onClose={() => setMobileFilterOpen(false)}
        slotProps={{
          paper: {
            sx: {
              p: 3,
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              maxHeight: '80vh',
            },
          },
        }}
      >
        <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 700 }}>
            Filter Listings
          </Typography>
          <IconButton size="small" onClick={() => setMobileFilterOpen(false)}>
            <ClearIcon fontSize="small" />
          </IconButton>
        </Box>

        <Stack spacing={2.5}>
          {renderFilterControls()}

          <Button
            variant="contained"
            color="primary"
            fullWidth
            onClick={() => setMobileFilterOpen(false)}
            sx={{ mt: 1 }}
          >
            Apply Filters
          </Button>
        </Stack>
      </Drawer>
    </Container>
  );
};
