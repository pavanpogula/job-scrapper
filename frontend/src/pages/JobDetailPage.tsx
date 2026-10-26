import React, { useMemo } from 'react';
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
  Alert,
  useTheme,
  useMediaQuery,
  Link,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import BlockIcon from '@mui/icons-material/Block';
import { useGetJobByIdQuery } from '../store/api/jobsApi';
import { sanitizeHtml } from '../lib/sanitize';
import { QueryState } from '../components/QueryState';
import { formatDetailFreshness } from '../lib/formatJobFreshness';

export const JobDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { data: job, isLoading, isFetching, error, refetch } = useGetJobByIdQuery(id || '');
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const descriptionHtml = job?.descriptionHtml;
  const sanitizedDescription = useMemo(() => {
    return descriptionHtml ? sanitizeHtml(descriptionHtml) : '';
  }, [descriptionHtml]);

  const detailFreshness = formatDetailFreshness(job);

  const isClosed = job?.active === false;

  return (
    <Container maxWidth="lg" sx={{ py: 4, mb: isMobile ? 8 : 4 }}>
      <Button
        component={RouterLink}
        to="/"
        startIcon={<ArrowBackIcon />}
        sx={{ mb: 3 }}
        color="secondary"
      >
        Back to all listings
      </Button>

      <QueryState
        isLoading={isLoading}
        isFetching={isFetching}
        error={error}
        onRetry={refetch}
        empty={!job}
        emptyMessage="This listing could not be found or has expired."
      >
        {job && (
          <>
            {/* React 19 native metadata tags */}
            <title>{`${job.title} at ${job.companyName || 'Ashby Employer'}`}</title>
            <meta
              name="description"
              content={`Apply for ${job.title} at ${job.companyName}. Verified direct posting on Ashby ATS.`}
            />

            {isClosed && (
              <Alert severity="warning" icon={<BlockIcon />} sx={{ mb: 3, borderRadius: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  This job is closed
                </Typography>
                <Typography variant="body2">
                  This position is no longer active on Ashby ATS and is not accepting new applications.
                </Typography>
              </Alert>
            )}

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: '1fr 340px' },
                gap: 4,
                alignItems: 'start',
              }}
            >
              {/* Main Content Area */}
              <Box>
                {/* Header Information */}
                <Paper sx={{ p: { xs: 2.5, sm: 3.5 }, borderRadius: 2, mb: 3 }}>
                  <Stack direction="row" spacing={1.5} sx={{ mb: 2, alignItems: 'center' }}>
                    {job.companyLogoUrl && (
                      <Box
                        component="img"
                        src={job.companyLogoUrl}
                        alt={`${job.companyName} logo`}
                        loading="lazy"
                        sx={{
                          width: 44,
                          height: 44,
                          borderRadius: 1.5,
                          objectFit: 'contain',
                          bgcolor: 'background.default',
                          p: 0.5,
                          border: '1px solid',
                          borderColor: 'divider',
                        }}
                      />
                    )}
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                        {job.companyName}
                      </Typography>
                      {job.department && (
                        <Typography variant="caption" color="text.secondary">
                          {job.department}
                        </Typography>
                      )}
                    </Box>
                  </Stack>

                  <Typography variant="h4" component="h1" sx={{ fontWeight: 800, mb: 2, letterSpacing: '-0.02em' }}>
                    {job.title}
                  </Typography>

                  <Stack direction="row" spacing={1} sx={{ mb: 2.5, flexWrap: 'wrap', gap: 1 }}>
                    {job.location && (
                      <Chip
                        icon={<LocationOnOutlinedIcon />}
                        label={job.location}
                        size="small"
                        variant="outlined"
                      />
                    )}
                    {job.workplaceType && (
                      <Chip label={job.workplaceType} size="small" color="secondary" variant="outlined" />
                    )}
                    {job.employmentType && (
                      <Chip label={job.employmentType} size="small" variant="outlined" />
                    )}
                    {isClosed ? (
                      <Chip label="Closed" size="small" color="default" />
                    ) : (
                      <Chip label="Active" size="small" color="success" variant="outlined" />
                    )}
                  </Stack>

                  {detailFreshness && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      component="time"
                      dateTime={detailFreshness.dateTime}
                      sx={{ display: 'block', mb: 2 }}
                    >
                      {detailFreshness.text}
                    </Typography>
                  )}

                  {(job.salaryMin || job.salaryMax) && (
                    <Box
                      sx={{
                        p: 2,
                        borderRadius: 1.5,
                        bgcolor: (th) => (th.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'),
                        border: '1px solid',
                        borderColor: 'divider',
                      }}
                    >
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.25 }}>
                        Compensation Range
                      </Typography>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'text.primary' }}>
                        {job.salaryCurrency}{' '}
                        {job.salaryMin ? Number(job.salaryMin).toLocaleString() : ''}
                        {job.salaryMin && job.salaryMax ? ' – ' : ''}
                        {job.salaryMax ? Number(job.salaryMax).toLocaleString() : ''}
                        {job.salaryInterval ? ` / ${job.salaryInterval.toLowerCase()}` : ''}
                      </Typography>
                    </Box>
                  )}
                </Paper>

                {/* Job Description Content */}
                <Box sx={{ px: { xs: 1, sm: 2 } }}>
                  <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
                    Role Overview
                  </Typography>

                  {sanitizedDescription ? (
                    <Box
                      sx={{
                        lineHeight: 1.7,
                        color: 'text.primary',
                        fontSize: '0.95rem',
                        '& h1, & h2, & h3, & h4': {
                          fontWeight: 700,
                          mt: 3,
                          mb: 1.5,
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
                      dangerouslySetInnerHTML={{ __html: sanitizedDescription }}
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
                    href={isClosed ? undefined : job.applyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="contained"
                    color="primary"
                    fullWidth
                    size="large"
                    disabled={isClosed}
                    endIcon={isClosed ? undefined : <OpenInNewIcon fontSize="small" />}
                    sx={{ py: 1.25, fontWeight: 600 }}
                  >
                    {isClosed ? 'Position Closed' : 'Apply on Ashby'}
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
                    to="/companies"
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
                  href={isClosed ? undefined : job.applyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="contained"
                  color="primary"
                  fullWidth
                  size="large"
                  disabled={isClosed}
                  endIcon={isClosed ? undefined : <OpenInNewIcon fontSize="small" />}
                  sx={{ fontWeight: 600 }}
                >
                  {isClosed ? 'Position Closed' : 'Apply on Ashby'}
                </Button>
              </Paper>
            )}
          </>
        )}
      </QueryState>
    </Container>
  );
};

export default JobDetailPage;
