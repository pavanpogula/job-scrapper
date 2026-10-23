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
  CircularProgress,
  IconButton,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import BusinessIcon from '@mui/icons-material/Business';
import { useGetCompaniesQuery } from '../store/api/jobsApi';

export const CompaniesPage: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search input by 400ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const { data, isLoading, error } = useGetCompaniesQuery({ search: debouncedSearch });

  return (
    <Container maxWidth="lg">
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" sx={{ fontSize: { xs: '1.5rem', sm: '2rem' }, fontWeight: 700, mb: 1 }}>
          Hiring Companies Directory
        </Typography>
        <Typography variant="body2" color="text.secondary">
          1,747 active companies hosting open jobs on Ashby ATS.
        </Typography>
      </Box>

      {/* Filter Input */}
      <Box sx={{ mb: 4 }}>
        <TextField
          fullWidth
          size="medium"
          placeholder="Filter companies by name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setDebouncedSearch(searchTerm.trim());
            }
          }}
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
                      setDebouncedSearch('');
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

      {isLoading ? (
        <Box sx={{ py: 10, textAlign: 'center' }}>
          <CircularProgress size={32} sx={{ color: 'secondary.main', mb: 2 }} />
          <Typography variant="body2" color="text.secondary">
            Loading company directory...
          </Typography>
        </Box>
      ) : error ? (
        <Box sx={{ py: 8, textAlign: 'center' }}>
          <Typography variant="body2" color="error">
            Failed to load companies directory.
          </Typography>
        </Box>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' },
            gap: 2,
          }}
        >
          {data?.data.map((company) => (
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
                  alt={company.name}
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
                  {!company.logoUrl && (company.name.charAt(0) || <BusinessIcon />)}
                </Avatar>

                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {company.name}
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
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'secondary.main', fontVariantNumeric: 'tabular-nums' }}>
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
      )}
    </Container>
  );
};
