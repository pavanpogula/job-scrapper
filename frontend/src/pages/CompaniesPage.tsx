/**
 * @file CompaniesPage.tsx
 * @summary Directory of hiring companies with uncropped logo tiles, instant search, and "Most hiring / A–Z" sort toggle
 */

import React, { useState, useEffect } from 'react';
import {
  Container,
  Box,
  Typography,
  TextField,
  InputAdornment,
  IconButton,
  Pagination,
  ToggleButtonGroup,
  ToggleButton,
  Stack,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import SortByAlphaIcon from '@mui/icons-material/SortByAlpha';
import { useGetCompaniesQuery } from '../store/api/jobsApi';
import { CompanyCard } from '../components/companies/CompanyCard';
import { QueryState } from '../components/QueryState';

export const CompaniesPage: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<'jobs' | 'name'>('jobs');

  // Debounce search input by 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const { data, isLoading, isFetching, error, refetch } = useGetCompaniesQuery({
    search: debouncedSearch,
    page,
    pageSize: 30,
    sort,
  });

  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  const handleSortChange = (
    _: React.MouseEvent<HTMLElement>,
    nextSort: 'jobs' | 'name' | null
  ) => {
    if (nextSort !== null) {
      setSort(nextSort);
      setPage(1);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <title>Companies | B.O.O.L.E.A.N</title>
      <meta
        name="description"
        content="Browse all hiring companies hosting active job postings on official applicant tracking systems."
      />

      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" component="h1" sx={{ fontSize: { xs: '1.5rem', sm: '2rem' }, fontWeight: 700, mb: 1 }}>
          Hiring Companies Directory
        </Typography>
        <Typography variant="body2" color="text.secondary" role="status">
          {data ? `${total.toLocaleString()} active companies hosting open jobs.` : 'Loading active companies...'}
        </Typography>
      </Box>

      {/* Filter and Sort Toolbar */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        sx={{
          mb: 4,
          alignItems: { xs: 'stretch', sm: 'center' },
          justifyContent: 'space-between',
        }}
      >
        <TextField
          size="small"
          placeholder="Filter companies by name or slug..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          slotProps={{
            htmlInput: {
              'aria-label': 'Filter companies by name',
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
                    aria-label="Clear company search"
                    onClick={() => {
                      setSearchTerm('');
                      setDebouncedSearch('');
                      setPage(1);
                    }}
                  >
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : null,
            },
          }}
          sx={{ maxWidth: { xs: '100%', sm: 400 }, flex: 1 }}
        />

        {/* Sort Toggle: Most hiring / A–Z */}
        <ToggleButtonGroup
          value={sort}
          exclusive
          onChange={handleSortChange}
          size="small"
          aria-label="Sort companies by"
        >
          <ToggleButton value="jobs" aria-label="Most hiring">
            <TrendingUpIcon fontSize="small" sx={{ mr: 0.75 }} />
            Most hiring
          </ToggleButton>
          <ToggleButton value="name" aria-label="A to Z">
            <SortByAlphaIcon fontSize="small" sx={{ mr: 0.75 }} />
            A–Z
          </ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      <QueryState
        isLoading={isLoading}
        isFetching={isFetching}
        error={error}
        onRetry={refetch}
        empty={data?.data.length === 0}
        emptyMessage={`No companies found matching "${debouncedSearch}".`}
      >
        {data && data.data.length > 0 && (
          <>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' },
                gap: 2,
              }}
            >
              {data.data.map((company) => (
                <CompanyCard key={company.slug} company={company} />
              ))}
            </Box>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4, mb: 2 }}>
                <Pagination
                  count={totalPages}
                  page={page}
                  onChange={(_, p) => {
                    setPage(p);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  color="primary"
                  shape="rounded"
                  size="medium"
                  aria-label="Company directory pagination"
                />
              </Box>
            )}
          </>
        )}
      </QueryState>
    </Container>
  );
};

export default CompaniesPage;
