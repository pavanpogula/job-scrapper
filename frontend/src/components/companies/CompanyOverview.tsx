/**
 * @file CompanyOverview.tsx
 * @summary Overview tab displaying company hiring breakdown, workplace mix, salary transparency, and top departments
 */

import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  Stack,
  Button,
  LinearProgress,
  Divider,
} from '@mui/material';
import BusinessCenterOutlinedIcon from '@mui/icons-material/BusinessCenterOutlined';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import AttachMoneyOutlinedIcon from '@mui/icons-material/AttachMoneyOutlined';
import AccessTimeOutlinedIcon from '@mui/icons-material/AccessTimeOutlined';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { CompanyProfile } from '../../types/api';
import { formatWorkplace } from '../../lib/labels';

export interface CompanyOverviewProps {
  profile: CompanyProfile;
}

export const CompanyOverview: React.FC<CompanyOverviewProps> = ({ profile }) => {
  const salaryPercent =
    profile.jobCount > 0 ? Math.round((profile.withSalary / profile.jobCount) * 100) : 0;

  const latestDate = profile.latestPublishedAt
    ? new Date(profile.latestPublishedAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  return (
    <Box sx={{ py: 2 }}>
      {/* Quick Stats Grid */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr 1fr' },
          gap: 2,
          mb: 4,
        }}
      >
        <Paper sx={{ p: 2.5, borderRadius: 2 }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 1 }}>
            <BusinessCenterOutlinedIcon color="primary" />
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
              Active Postings
            </Typography>
          </Stack>
          <Typography variant="h5" sx={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
            {profile.jobCount}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            open roles tracked
          </Typography>
        </Paper>

        <Paper sx={{ p: 2.5, borderRadius: 2 }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 1 }}>
            <LocationOnOutlinedIcon color="primary" />
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
              Hiring Locations
            </Typography>
          </Stack>
          <Typography variant="h5" sx={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
            {profile.locations?.length ?? 0}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            cities & offices
          </Typography>
        </Paper>

        <Paper sx={{ p: 2.5, borderRadius: 2 }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 1 }}>
            <AttachMoneyOutlinedIcon color="success" />
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
              Salary Transparency
            </Typography>
          </Stack>
          <Typography variant="h5" sx={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
            {salaryPercent}%
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {profile.withSalary} of {profile.jobCount} with pay data
          </Typography>
        </Paper>

        <Paper sx={{ p: 2.5, borderRadius: 2 }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 1 }}>
            <AccessTimeOutlinedIcon color="primary" />
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
              Latest Posting
            </Typography>
          </Stack>
          <Typography variant="h6" sx={{ fontWeight: 800, fontSize: '1.15rem' }}>
            {latestDate || 'Recently'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            most recent role added
          </Typography>
        </Paper>
      </Box>

      {/* Breakdowns Grid */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
          gap: 3,
          mb: 4,
        }}
      >
        {/* Top Departments */}
        <Paper sx={{ p: 3, borderRadius: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
            Top Departments
          </Typography>
          {profile.departments && profile.departments.length > 0 ? (
            <Stack spacing={2}>
              {profile.departments.slice(0, 6).map((dept) => {
                const pct = profile.jobCount > 0 ? (dept.count / profile.jobCount) * 100 : 0;
                return (
                  <Box key={dept.value}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {dept.value || 'General'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {dept.count} {dept.count === 1 ? 'role' : 'roles'} ({Math.round(pct)}%)
                      </Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={pct}
                      sx={{ height: 6, borderRadius: 3 }}
                    />
                  </Box>
                );
              })}
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No department data available.
            </Typography>
          )}
        </Paper>

        {/* Workplace & Employment Types */}
        <Paper sx={{ p: 3, borderRadius: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
            Workplace Model
          </Typography>
          {profile.workplaceTypes && profile.workplaceTypes.length > 0 ? (
            <Stack spacing={2} sx={{ mb: 3 }}>
              {profile.workplaceTypes.map((wp) => {
                const pct = profile.jobCount > 0 ? (wp.count / profile.jobCount) * 100 : 0;
                return (
                  <Box key={wp.value}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {formatWorkplace(wp.value)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {wp.count} ({Math.round(pct)}%)
                      </Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={pct}
                      color="secondary"
                      sx={{ height: 6, borderRadius: 3 }}
                    />
                  </Box>
                );
              })}
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              No workplace type data.
            </Typography>
          )}

          <Divider sx={{ my: 2 }} />

          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
            Top Locations
          </Typography>
          {profile.locations && profile.locations.length > 0 ? (
            <Stack spacing={1}>
              {profile.locations.slice(0, 5).map((loc) => (
                <Box
                  key={loc.value}
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    py: 0.5,
                  }}
                >
                  <Typography variant="body2" color="text.primary">
                    {loc.value}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {loc.count}
                  </Typography>
                </Box>
              ))}
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No location data.
            </Typography>
          )}
        </Paper>
      </Box>

      {/* CTA to view jobs tab */}
      <Box sx={{ textAlign: 'center', py: 2 }}>
        <Button
          component={RouterLink}
          to={`/companies/${profile.slug}/jobs`}
          variant="contained"
          size="large"
          endIcon={<ArrowForwardIcon />}
          sx={{ fontWeight: 700, px: 4 }}
        >
          View all {profile.jobCount} open roles
        </Button>
      </Box>
    </Box>
  );
};

export default CompanyOverview;
