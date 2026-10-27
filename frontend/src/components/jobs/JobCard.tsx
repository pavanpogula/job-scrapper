/**
 * @file JobCard.tsx
 * @summary Compact job listing card following LinkedIn-style master/detail ergonomics
 */

import React from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { Box, Typography, Stack, Link } from '@mui/material';
import { JobListItem } from '../../types/api';
import { CompanyAvatar } from '../common/CompanyAvatar';
import { SourceBadge } from '../common/SourceBadge';
import { formatWorkplace, formatSalary } from '../../lib/labels';
import { formatJobFreshness } from '../../lib/formatJobFreshness';
import { usePrefetch } from '../../store/api/jobsApi';

export interface JobCardProps {
  job: JobListItem;
  isSelected?: boolean;
  onSelect?: (jobId: string) => void;
  /** When true, card click acts as router link to /jobs/:id (for mobile list mode) */
  linkToDetail?: boolean;
}

export const JobCard: React.FC<JobCardProps> = ({
  job,
  isSelected = false,
  onSelect,
  linkToDetail = false,
}) => {
  const navigate = useNavigate();
  const prefetchJob = usePrefetch('getJobById');
  const freshness = formatJobFreshness(job);
  const salaryText = formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency, job.salaryInterval);

  const workplaceLabel = formatWorkplace(job.workplaceType);
  const locationParts = [job.city || job.location, workplaceLabel].filter(Boolean);
  const locationLine = locationParts.join(' · ');

  const handlePrefetch = () => {
    prefetchJob(job.id);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (linkToDetail) {
      navigate(`/jobs/${job.id}`);
      return;
    }
    e.preventDefault();
    onSelect?.(job.id);
  };

  const companyName = job.companyName || job.companySlug;

  return (
    <Box
      role="listitem"
      aria-current={isSelected ? 'true' : undefined}
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (linkToDetail) {
            navigate(`/jobs/${job.id}`);
          } else {
            onSelect?.(job.id);
          }
        }
      }}
      onMouseEnter={handlePrefetch}
      onFocus={handlePrefetch}
      sx={{
        display: 'block',
        textDecoration: 'none',
        color: 'inherit',
        p: 2,
        borderRadius: 1.5,
        border: '1px solid',
        borderColor: isSelected ? 'primary.main' : 'divider',
        borderLeft: '3px solid',
        borderLeftColor: isSelected ? 'primary.main' : 'transparent',
        bgcolor: (th) => {
          if (isSelected) {
            return th.palette.mode === 'dark' ? 'rgba(29, 95, 191, 0.14)' : 'rgba(29, 95, 191, 0.05)';
          }
          return 'background.paper';
        },
        cursor: 'pointer',
        transition: 'all 0.18s cubic-bezier(0.23, 1, 0.32, 1)',
        outline: 'none',
        '&:hover': {
          borderColor: isSelected ? 'primary.main' : 'text.secondary',
          bgcolor: (th) => {
            if (isSelected) {
              return th.palette.mode === 'dark' ? 'rgba(29, 95, 191, 0.18)' : 'rgba(29, 95, 191, 0.08)';
            }
            return th.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)';
          },
        },
        '&:focus-visible': {
          outline: '2px solid',
          outlineColor: 'primary.main',
          outlineOffset: 2,
        },
        '@media (prefers-reduced-motion: reduce)': {
          transition: 'none',
        },
      }}
    >
      <Stack direction="row" spacing={1.75} sx={{ alignItems: 'flex-start' }}>
        <CompanyAvatar
          name={job.companyName}
          slug={job.companySlug}
          logoUrl={job.companyLogoUrl}
          size={48}
        />

        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography
            variant="subtitle1"
            sx={{
              fontWeight: 700,
              color: 'primary.main',
              lineHeight: 1.3,
              mb: 0.5,
              fontSize: '0.98rem',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {job.title}
          </Typography>

          <Box sx={{ mb: 0.5 }}>
            <Link
              component={RouterLink}
              to={`/companies/${job.companySlug}`}
              onClick={(e) => e.stopPropagation()}
              underline="hover"
              sx={{
                fontWeight: 600,
                color: 'text.primary',
                fontSize: '0.88rem',
                display: 'inline-block',
                maxWidth: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {companyName}
            </Link>
          </Box>

          {locationLine && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                fontSize: '0.82rem',
                mb: 0.5,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {locationLine}
            </Typography>
          )}

          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 0.5, mt: 0.75 }}>
            {salaryText && (
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 700,
                  color: 'success.main',
                  fontSize: '0.78rem',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {salaryText}
              </Typography>
            )}

            {freshness && (
              <Typography
                variant="caption"
                component="time"
                dateTime={freshness.dateTime}
                sx={{
                  color: 'text.secondary',
                  fontSize: '0.75rem',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {freshness.label}
              </Typography>
            )}

            <SourceBadge source={job.source} size="small" />
          </Stack>
        </Box>
      </Stack>
    </Box>
  );
};

export default JobCard;
