/**
 * @file JobDetailPanel.tsx
 * @summary Full job details panel used both as the sticky right pane on desktop and the full-page view
 */

import React, { useMemo, useEffect, useRef } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  Chip,
  Paper,
  Stack,
  Divider,
  Alert,
  Link,
  CircularProgress,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import BlockIcon from '@mui/icons-material/Block';
import { JobDetail } from '../../types/api';
import { useGetJobByIdQuery } from '../../store/api/jobsApi';
import { sanitizeHtml } from '../../lib/sanitize';
import { formatDetailFreshness } from '../../lib/formatJobFreshness';
import { formatWorkplace, formatEmployment, formatSalary } from '../../lib/labels';
import { CompanyAvatar } from '../common/CompanyAvatar';
import { SourceBadge } from '../common/SourceBadge';

export interface JobDetailPanelProps {
  jobId?: string | null;
  initialJob?: JobDetail | null;
  headingComponent?: 'h1' | 'h2';
  isSticky?: boolean;
  onJobLoaded?: (job: JobDetail) => void;
}

export const JobDetailPanel: React.FC<JobDetailPanelProps> = ({
  jobId,
  initialJob,
  headingComponent = 'h2',
  isSticky = false,
  onJobLoaded,
}) => {
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Fetch job details if jobId provided and not already matched in initialJob
  const shouldFetch = Boolean(jobId && (!initialJob || initialJob.id !== jobId));
  const { data: fetchedJob, isLoading, isError } = useGetJobByIdQuery(jobId || '', {
    skip: !shouldFetch,
  });

  const job = (initialJob && initialJob.id === jobId ? initialJob : fetchedJob) || initialJob;

  useEffect(() => {
    if (job) {
      onJobLoaded?.(job);
    }
  }, [job, onJobLoaded]);

  // Focus detail heading when switching selected jobs in two-pane mode
  useEffect(() => {
    if (jobId && headingRef.current) {
      headingRef.current.focus();
    }
  }, [jobId]);

  const descriptionHtml = job?.descriptionHtml;
  const sanitizedDescription = useMemo(() => {
    return descriptionHtml ? sanitizeHtml(descriptionHtml) : '';
  }, [descriptionHtml]);

  const detailFreshness = job ? formatDetailFreshness(job) : null;
  const isClosed = job?.active === false;
  const companyName = job ? (job.company?.name || job.companyName || job.companySlug || 'Employer') : '';
  const salaryText = job ? formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency, job.salaryInterval) : null;

  if (isLoading && !job) {
    return (
      <Paper
        sx={{
          p: 4,
          borderRadius: 2,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 380,
        }}
      >
        <CircularProgress size={32} />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          Loading job details...
        </Typography>
      </Paper>
    );
  }

  if (isError || (!job && !isLoading)) {
    return (
      <Paper
        sx={{
          p: 4,
          borderRadius: 2,
          textAlign: 'center',
          minHeight: 280,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
          Select a job to view details
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Choose a posting from the list to preview the full description and apply directly.
        </Typography>
      </Paper>
    );
  }

  if (!job) return null;

  return (
    <Paper
      sx={{
        p: { xs: 2.5, sm: 3.5 },
        borderRadius: 2,
        maxHeight: isSticky ? 'calc(100vh - 88px)' : undefined,
        overflowY: isSticky ? 'auto' : undefined,
        position: isSticky ? 'sticky' : undefined,
        top: isSticky ? 76 : undefined,
      }}
    >
      {isClosed && (
        <Alert severity="warning" icon={<BlockIcon />} sx={{ mb: 3, borderRadius: 1.5 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            This job is closed
          </Typography>
          <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>
            This position is no longer active on the company's career board and is not accepting new applications.
          </Typography>
        </Alert>
      )}

      {/* Header with Company Logo & Name */}
      <Stack direction="row" spacing={1.75} sx={{ mb: 2, alignItems: 'center' }}>
        <CompanyAvatar
          name={job.companyName}
          slug={job.companySlug}
          logoUrl={job.companyLogoUrl}
          size={44}
        />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Link
            component={RouterLink}
            to={`/companies/${job.companySlug}`}
            underline="hover"
            sx={{
              fontWeight: 700,
              fontSize: '1rem',
              color: 'text.primary',
              display: 'inline-block',
            }}
          >
            {companyName}
          </Link>
          {job.department && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              {job.department}
            </Typography>
          )}
        </Box>
        <SourceBadge source={job.source} />
      </Stack>

      {/* Job Title */}
      <Typography
        ref={headingRef}
        tabIndex={-1}
        variant="h5"
        component={headingComponent}
        sx={{
          fontWeight: 800,
          mb: 1.5,
          fontSize: { xs: '1.35rem', sm: '1.65rem' },
          letterSpacing: '-0.02em',
          outline: 'none',
        }}
      >
        {job.title}
      </Typography>

      {/* Meta Line: Location · Freshness */}
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', mb: 2, gap: 0.5 }}>
        {job.location && (
          <Typography variant="body2" color="text.secondary" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
            <LocationOnOutlinedIcon sx={{ fontSize: 16 }} />
            {job.location}
          </Typography>
        )}
        {job.location && detailFreshness && (
          <Typography variant="body2" color="text.secondary">
            ·
          </Typography>
        )}
        {detailFreshness && (
          <Typography
            variant="body2"
            color="text.secondary"
            component="time"
            dateTime={detailFreshness.dateTime}
          >
            {detailFreshness.text}
          </Typography>
        )}
      </Stack>

      {/* Outlined Chips */}
      <Stack direction="row" spacing={1} sx={{ mb: 3, flexWrap: 'wrap', gap: 1 }}>
        {job.workplaceType && (
          <Chip
            label={formatWorkplace(job.workplaceType)}
            size="small"
            variant="outlined"
            color="primary"
          />
        )}
        {job.employmentType && (
          <Chip
            label={formatEmployment(job.employmentType)}
            size="small"
            variant="outlined"
          />
        )}
        {isClosed ? (
          <Chip label="Closed" size="small" color="default" />
        ) : (
          <Chip label="Active" size="small" color="success" variant="outlined" />
        )}
      </Stack>

      {/* Actions: Apply Direct & View Original Posting */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 3 }}>
        <Button
          variant="contained"
          color="primary"
          size="medium"
          href={job.applyUrl}
          target="_blank"
          rel="noopener noreferrer"
          disabled={isClosed}
          endIcon={<OpenInNewIcon fontSize="small" />}
          sx={{
            fontWeight: 700,
            px: 3,
            py: 1,
            boxShadow: 'none',
          }}
        >
          Apply Direct
        </Button>

        {job.jobUrl && (
          <Button
            variant="outlined"
            color="secondary"
            size="medium"
            href={job.jobUrl}
            target="_blank"
            rel="noopener noreferrer"
            endIcon={<OpenInNewIcon fontSize="small" />}
            sx={{ fontWeight: 600 }}
          >
            View original posting
          </Button>
        )}
      </Stack>

      {/* Compensation Box */}
      {salaryText && (
        <Box
          sx={{
            p: 2,
            borderRadius: 1.5,
            bgcolor: (th) => (th.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.02)'),
            border: '1px solid',
            borderColor: 'divider',
            mb: 3,
          }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.25 }}>
            Compensation
          </Typography>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'text.primary', fontVariantNumeric: 'tabular-nums' }}>
            {salaryText}
          </Typography>
        </Box>
      )}

      <Divider sx={{ my: 3 }} />

      {/* Role Overview */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
          Role Overview
        </Typography>

        {sanitizedDescription ? (
          <Box
            sx={{
              lineHeight: 1.7,
              color: 'text.primary',
              fontSize: '0.94rem',
              '& h1, & h2, & h3, & h4': {
                fontWeight: 700,
                mt: 2.5,
                mb: 1,
                letterSpacing: '-0.01em',
              },
              '& h1': { fontSize: '1.25rem' },
              '& h2': { fontSize: '1.15rem' },
              '& h3': { fontSize: '1.05rem' },
              '& p': { mb: 1.5 },
              '& ul, & ol': { pl: 3, mb: 1.5 },
              '& li': { mb: 0.5 },
              '& a': {
                color: 'primary.main',
                textDecoration: 'underline',
              },
              '& pre, & code': {
                fontFamily: "'Geist Mono', monospace",
                bgcolor: (th) => (th.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)'),
                p: 0.25,
                borderRadius: 0.5,
                fontSize: '0.85em',
              },
            }}
            dangerouslySetInnerHTML={{ __html: sanitizedDescription }}
          />
        ) : (
          <Typography variant="body2" color="text.secondary">
            No description provided.
          </Typography>
        )}
      </Box>

      <Divider sx={{ my: 3 }} />

      {/* About Company Card */}
      <Paper
        variant="outlined"
        sx={{
          p: 2.5,
          borderRadius: 2,
          bgcolor: (th) => (th.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.01)'),
        }}
      >
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 1.5 }}>
          <CompanyAvatar
            name={job.companyName}
            slug={job.companySlug}
            logoUrl={job.companyLogoUrl}
            size={40}
          />
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              About {companyName}
            </Typography>
            {job.companyJobCount !== undefined && (
              <Typography variant="caption" color="text.secondary">
                {job.companyJobCount} open {job.companyJobCount === 1 ? 'position' : 'positions'}
              </Typography>
            )}
          </Box>
        </Stack>

        <Button
          component={RouterLink}
          to={`/companies/${job.companySlug}`}
          variant="outlined"
          size="small"
          fullWidth
          sx={{ fontWeight: 600, mt: 1 }}
        >
          View Company Profile & All Roles
        </Button>
      </Paper>
    </Paper>
  );
};

export default JobDetailPanel;
