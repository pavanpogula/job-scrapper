/**
 * @file CompanyHeader.tsx
 * @summary Company hero header with banner band, overlapping logo, meta stats, external link, and URL-synced tabs
 */

import React from 'react';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import {
  Box,
  Typography,
  Stack,
  Button,
  Tabs,
  Tab,
  Paper,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { CompanyProfile } from '../../types/api';
import { CompanyAvatar } from '../common/CompanyAvatar';
import { SourceBadge } from '../common/SourceBadge';
import { formatLocationCount } from '../../lib/labels';

export interface CompanyHeaderProps {
  profile: CompanyProfile;
}

export const CompanyHeader: React.FC<CompanyHeaderProps> = ({ profile }) => {
  const location = useLocation();
  const companyName = profile.name || profile.slug;

  const isJobsTab = location.pathname.endsWith('/jobs');
  const activeTab = isJobsTab ? 'jobs' : 'overview';

  const jobsLabel = profile.jobCount === 1 ? '1 open job' : `${profile.jobCount} open jobs`;
  const locationsLabel = formatLocationCount(profile.locations?.length ?? 0);
  const careersUrl =
    profile.boardUrl ||
    (profile.source === 'greenhouse'
      ? `https://job-boards.greenhouse.io/${profile.slug.startsWith('gh--') ? profile.slug.slice(4) : profile.slug}`
      : `https://jobs.ashbyhq.com/${profile.slug}`);

  return (
    <Box sx={{ mb: 3 }}>
      {/* Decorative Banner Band */}
      <Box
        sx={{
          height: { xs: 100, sm: 140 },
          borderRadius: 2,
          background: (th) =>
            th.palette.mode === 'dark'
              ? 'linear-gradient(135deg, rgba(29, 95, 191, 0.35) 0%, rgba(13, 17, 23, 0.9) 100%)'
              : 'linear-gradient(135deg, rgba(29, 95, 191, 0.15) 0%, rgba(243, 245, 248, 0.8) 100%)',
          border: '1px solid',
          borderColor: 'divider',
          position: 'relative',
        }}
      />

      {/* Hero Content Overlapping Banner — positioned above the (relative) banner so its tint never covers the name */}
      <Box sx={{ position: 'relative', zIndex: 1, px: { xs: 2, sm: 3 }, mt: { xs: -5, sm: -6 }, mb: 2 }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2.5}
          sx={{
            alignItems: { xs: 'flex-start', sm: 'flex-end' },
            justifyContent: 'space-between',
          }}
        >
          <Stack direction="row" spacing={2.5} sx={{ alignItems: 'flex-end' }}>
            <CompanyAvatar
              name={profile.name}
              slug={profile.slug}
              logoUrl={profile.logoUrl}
              size={80}
              borderRadius={12}
            />

            <Box sx={{ pb: 0.5 }}>
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                <Typography
                  variant="h4"
                  component="h1"
                  sx={{
                    fontWeight: 800,
                    fontSize: { xs: '1.5rem', sm: '2rem' },
                    letterSpacing: '-0.02em',
                    color: 'text.primary',
                  }}
                >
                  {companyName}
                </Typography>
                <SourceBadge source={profile.source} />
              </Stack>

              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 0.5, fontWeight: 500 }}
              >
                {jobsLabel} · {locationsLabel}
              </Typography>
            </Box>
          </Stack>

          <Button
            variant="outlined"
            size="small"
            color="secondary"
            href={careersUrl}
            target="_blank"
            rel="noopener noreferrer"
            endIcon={<OpenInNewIcon fontSize="small" />}
            sx={{ fontWeight: 600, mb: { xs: 0, sm: 0.5 } }}
          >
            View careers board ↗
          </Button>
        </Stack>
      </Box>

      {/* Tabs Navigation */}
      <Paper
        elevation={0}
        sx={{
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: 'transparent',
          position: 'sticky',
          top: 56,
          zIndex: 10,
          backdropFilter: 'blur(8px)',
        }}
      >
        <Tabs
          value={activeTab}
          textColor="primary"
          indicatorColor="primary"
          aria-label="Company profile sections"
        >
          <Tab
            label="Overview"
            value="overview"
            component={RouterLink}
            to={`/companies/${profile.slug}`}
            sx={{ fontWeight: 700, textTransform: 'none', fontSize: '0.95rem' }}
          />
          <Tab
            label={`Jobs (${profile.jobCount})`}
            value="jobs"
            component={RouterLink}
            to={`/companies/${profile.slug}/jobs`}
            sx={{ fontWeight: 700, textTransform: 'none', fontSize: '0.95rem' }}
          />
        </Tabs>
      </Paper>
    </Box>
  );
};

export default CompanyHeader;
