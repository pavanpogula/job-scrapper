import React from 'react';
import DOMPurify from 'dompurify';
import { useParams, Link as RouterLink } from 'react-router-dom';
import {
  Container,
  Box,
  Typography,
  Button,
  Chip,
  Paper,
  Stack,
  Divider,
  CircularProgress,
  useTheme,
  useMediaQuery,
  Link,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import { useGetJobByIdQuery } from '../store/api/jobsApi';

export const JobDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { data: job, isLoading, error } = useGetJobByIdQuery(id || '');
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  if (isLoading) {
    return (
      <Container maxWidth="md" sx={{ py: 12, textAlign: 'center' }}>
        <CircularProgress size={32} sx={{ color: 'secondary.main', mb: 2 }} />
        <Typography variant="body2" color="text.secondary">
          Loading role details...
        </Typography>
      </Container>
    );
  }

  if (error || !job) {
    return (
      <Container maxWidth="md" sx={{ py: 10, textAlign: 'center' }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Position not found
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          This listing may have been filled, unlisted, or expired from Ashby.
        </Typography>
        <Button
          component={RouterLink}
          to="/"
          startIcon={<ArrowBackIcon />}
          sx={{ mt: 2 }}
          color="secondary"
        >
          Back to all jobs
        </Button>
      </Container>
    );
  }

  const formatSalary = (min?: number | null, max?: number | null, currency?: string | null, interval?: string | null) => {
    if (!min && !max) return null;
    const curr = currency || 'USD';
    const sym = curr === 'USD' ? '$' : curr === 'EUR' ? '€' : curr === 'GBP' ? '£' : `${curr} `;
    const intLabel = interval === '1 HOUR' ? '/hour' : interval === '1 MONTH' ? '/month' : '/year';

    if (min && max) {
      if (min === max) return `${sym}${min.toLocaleString()} ${intLabel}`;
      return `${sym}${min.toLocaleString()} – ${sym}${max.toLocaleString()} ${intLabel}`;
    }
    if (min) return `From ${sym}${min.toLocaleString()} ${intLabel}`;
    return `Up to ${sym}${max!.toLocaleString()} ${intLabel}`;
  };

  const salaryText = formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency, job.salaryInterval);

  return (
    <Container maxWidth="lg" sx={{ pb: { xs: 10, md: 4 } }}>
      {/* Back to search */}
      <Box sx={{ mb: 3 }}>
        <Button
          component={RouterLink}
          to="/"
          startIcon={<ArrowBackIcon />}
          size="small"
          color="inherit"
          sx={{ color: 'text.secondary' }}
        >
          Back to results
        </Button>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 1fr' }, gap: 4, alignItems: 'start' }}>
        {/* Main Details Column */}
        <Box sx={{ minWidth: 0 }}>
          {/* Header Block */}
          <Box sx={{ pb: 3, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Stack direction="row" spacing={1} sx={{ mb: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary' }}>
                {job.companyName}
              </Typography>
              <Typography variant="caption" color="text.secondary">·</Typography>
              <Typography
                variant="caption"
                sx={{
                  fontFamily: "'Geist Mono', monospace",
                  color: 'text.secondary',
                  fontSize: '0.75rem',
                }}
              >
                jobs.ashbyhq.com/{job.companySlug}
              </Typography>
            </Stack>

            <Typography
              variant="h1"
              sx={{
                fontSize: { xs: '1.5rem', sm: '2rem' },
                fontWeight: 700,
                color: 'text.primary',
                lineHeight: 1.25,
                mb: 1.5,
              }}
            >
              {job.title}
            </Typography>

            {salaryText && (
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 700,
                  color: 'secondary.main',
                  fontVariantNumeric: 'tabular-nums',
                  mb: 1.5,
                }}
              >
                {salaryText}
              </Typography>
            )}

            {/* Facts Chips */}
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 0.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary', fontSize: '0.85rem' }}>
                <LocationOnOutlinedIcon sx={{ fontSize: 16 }} />
                <span>{job.location || 'Location flexible'}</span>
              </Box>

              {job.workplaceType && (
                <Chip
                  label={job.workplaceType}
                  size="small"
                  sx={{ height: 22, bgcolor: 'background.default' }}
                />
              )}

              {job.employmentType && (
                <Chip
                  label={job.employmentType}
                  size="small"
                  sx={{ height: 22, bgcolor: 'background.default' }}
                />
              )}

              {job.team && (
                <Chip
                  label={`Team: ${job.team}`}
                  size="small"
                  sx={{ height: 22, bgcolor: 'background.default' }}
                />
              )}
            </Stack>
          </Box>

          {/* Description Content */}
          <Box sx={{ pt: 4 }}>
            <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 700, mb: 2 }}>
              About the role
            </Typography>

            {job.descriptionHtml ? (
              <Box
                sx={{
                  color: 'text.primary',
                  fontSize: '0.92rem',
                  lineHeight: 1.7,
                  '& h1, & h2, & h3, & h4': {
                    fontWeight: 700,
                    mt: 3,
                    mb: 1,
                  },
                  '& ul, & ol': {
                    pl: 3,
                    mb: 2,
                  },
                  '& li': {
                    mb: 0.75,
                  },
                  '& p': {
                    mb: 2,
                  },
                  '& strong': {
                    fontWeight: 600,
                  },
                }}
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(job.descriptionHtml) }}
              />
            ) : job.descriptionPlain ? (
              <Typography variant="body2" sx={{ whiteSpace: 'pre-line', lineHeight: 1.7 }}>
                {job.descriptionPlain}
              </Typography>
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                The full role description is hosted directly on {job.companyName}'s official application page.
              </Typography>
            )}
          </Box>
        </Box>

        {/* Desktop Sidebar: Outbound Apply Card */}
        <Stack spacing={3} sx={{ position: { md: 'sticky' }, top: { md: 80 } }}>
          <Paper sx={{ p: 3, borderRadius: 2 }}>
            <Button
              component="a"
              href={job.applyUrl}
              target="_blank"
              rel="noopener noreferrer"
              variant="contained"
              color="primary"
              fullWidth
              size="large"
              endIcon={<OpenInNewIcon fontSize="small" />}
              sx={{ py: 1.25, fontWeight: 600 }}
            >
              Apply on Ashby
            </Button>

            <Box sx={{ mt: 2.5, display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
              <VerifiedUserOutlinedIcon sx={{ fontSize: 18, color: 'success.main', mt: 0.2 }} />
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.5 }}>
                Direct employer ATS apply. You will apply on {job.companyName}'s official Ashby portal. No resume harvesting or accounts required.
              </Typography>
            </Box>

            <Divider sx={{ my: 2 }} />

            <Box sx={{ fontFamily: "'Geist Mono', monospace", fontSize: '0.72rem', color: 'text.secondary', wordBreak: 'break-all' }}>
              <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, mb: 0.5 }}>
                Destination URL:
              </Typography>
              <Link href={job.applyUrl} target="_blank" rel="noopener noreferrer" color="text.primary" underline="hover">
                {job.applyUrl}
              </Link>
            </Box>
          </Paper>

          {/* Company Summary Card */}
          <Paper sx={{ p: 2.5, borderRadius: 2 }}>
            <Stack direction="row" spacing={1.5} sx={{ mb: 1, alignItems: 'center' }}>
              <BusinessOutlinedIcon fontSize="small" color="action" />
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                {job.companyName}
              </Typography>
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              Verified employer board hosted on Ashby ATS.
            </Typography>
            <Link
              component={RouterLink}
              to={`/companies`}
              variant="caption"
              color="secondary"
              sx={{ mt: 1, display: 'inline-block', fontWeight: 600 }}
            >
              Browse all hiring companies →
            </Link>
          </Paper>
        </Stack>
      </Box>

      {/* Mobile Sticky Apply Bar */}
      {isMobile && (
        <Paper
          elevation={4}
          sx={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            p: 2,
            borderTop: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
            zIndex: (th) => th.zIndex.appBar,
          }}
        >
          <Button
            component="a"
            href={job.applyUrl}
            target="_blank"
            rel="noopener noreferrer"
            variant="contained"
            color="primary"
            fullWidth
            size="large"
            endIcon={<OpenInNewIcon fontSize="small" />}
            sx={{ fontWeight: 600 }}
          >
            Apply on Ashby
          </Button>
        </Paper>
      )}
    </Container>
  );
};
