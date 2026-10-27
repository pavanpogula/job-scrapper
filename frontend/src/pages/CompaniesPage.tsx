import React, { useState, useEffect } from 'react';
import {
  Container,
  Box,
  Typography,
  TextField,
  InputAdornment,
  Paper,
  Stack,
  Avatar,
  Link,
  IconButton,
  Pagination,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import BusinessIcon from '@mui/icons-material/Business';
import { useGetCompaniesQuery } from '../store/api/jobsApi';
import { QueryState } from '../components/QueryState';

export const CompaniesPage: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);

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
  });

  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <title>Companies | Ashby Job Directory</title>
      <meta
        name="description"
        content="Browse all hiring companies hosting active job postings on Ashby ATS."
      />

      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" component="h1" sx={{ fontSize: { xs: '1.5rem', sm: '2rem' }, fontWeight: 700, mb: 1 }}>
          Hiring Companies Directory
        </Typography>
        <Typography variant="body2" color="text.secondary" role="status">
          {data ? `${total.toLocaleString()} active companies hosting open jobs on Ashby ATS.` : 'Loading active companies...'}
        </Typography>
      </Box>

      {/* Filter Input */}
      <Box sx={{ mb: 4 }}>
        <TextField
          fullWidth
          size="medium"
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
                  <SearchIcon sx={{ color: 'text.secondary' }} />
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
        />
      </Box>

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
                <Paper
                  key={company.slug}
                  sx={{
                    p: 2.5,
                    borderRadius: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 2,
                    transition: 'border-color 0.15s ease',
                    '&:hover': {
                      borderColor: 'text.secondary',
                    },
                  }}
                >
                  <Stack direction="row" spacing={2} sx={{ alignItems: 'center', minWidth: 0, flex: 1 }}>
                    <Avatar
                      src={company.logoUrl || undefined}
                      alt={`${company.name || company.slug} logo`}
                      variant="rounded"
                      sx={{
                        width: 40,
                        height: 40,
                        bgcolor: 'background.default',
                        color: 'text.primary',
                        fontSize: '1rem',
                        fontWeight: 700,
                        border: '1px solid',
                        borderColor: 'divider',
                      }}
                    >
                      {!company.logoUrl && ((company.name ? company.name.charAt(0) : company.slug.charAt(0)) || <BusinessIcon />)}
                    </Avatar>

                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography
                        variant="subtitle2"
                        sx={{
                          fontWeight: 700,
                          color: 'text.primary',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {company.name || company.slug}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{
                          fontFamily: "'Geist Mono', monospace",
                          color: 'text.secondary',
                          fontSize: '0.72rem',
                          display: 'block',
                        }}
                      >
                        {company.slug}
                      </Typography>
                    </Box>
                  </Stack>

                  <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                    <Typography
                      variant="subtitle2"
                      sx={{ fontWeight: 700, color: 'secondary.main', fontVariantNumeric: 'tabular-nums' }}
                    >
                      {company.jobCount ? `${company.jobCount} roles` : 'Openings'}
                    </Typography>
                    <Link
                      href={`https://jobs.ashbyhq.com/${company.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      underline="hover"
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25 }}
                    >
                      Board <OpenInNewIcon sx={{ fontSize: 10 }} />
                    </Link>
                  </Box>
                </Paper>
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
