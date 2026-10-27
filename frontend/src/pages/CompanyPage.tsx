/**
 * @file CompanyPage.tsx
 * @summary Dedicated company landing page with Overview and Jobs tabs, and friendly 404 state
 */

import React from 'react';
import { useParams, useLocation, Link as RouterLink } from 'react-router-dom';
import {
  Container,
  Typography,
  Button,
  Paper,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useGetCompanyProfileQuery } from '../store/api/jobsApi';
import { CompanyHeader } from '../components/companies/CompanyHeader';
import { CompanyOverview } from '../components/companies/CompanyOverview';
import { DepartmentGroups } from '../components/companies/DepartmentGroups';
import { QueryState } from '../components/QueryState';

export const CompanyPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();

  const { data: profile, isLoading, isFetching, error, refetch } = useGetCompanyProfileQuery(
    slug || '',
    { skip: !slug }
  );

  const is404 = (error as { status?: number })?.status === 404;

  if (is404) {
    return (
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Button
          component={RouterLink}
          to="/companies"
          startIcon={<ArrowBackIcon />}
          sx={{ mb: 2.5 }}
          color="secondary"
          size="small"
        >
          All Companies
        </Button>
        <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 2 }}>
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
            Company Not Found
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            We could not find an active career board for "{slug}". The company may not be actively hiring on Ashby.
          </Typography>
          <Button
            component={RouterLink}
            to="/companies"
            variant="contained"
            color="primary"
          >
            Browse All Hiring Companies
          </Button>
        </Paper>
      </Container>
    );
  }

  const isJobsTab = location.pathname.endsWith('/jobs');
  const companyName = profile ? (profile.name || profile.slug) : (slug || 'Company');

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Button
        component={RouterLink}
        to="/companies"
        startIcon={<ArrowBackIcon />}
        sx={{ mb: 2.5 }}
        color="secondary"
        size="small"
      >
        All Companies
      </Button>

      <QueryState
        isLoading={isLoading}
        isFetching={isFetching}
        error={error}
        onRetry={refetch}
        empty={!profile}
        emptyMessage={`Company "${slug}" not found in our directory.`}
      >
        {profile ? (
          <>
            <title>{`${companyName} Careers · Open Jobs & Hiring Insights`}</title>
            <meta
              name="description"
              content={`Explore open jobs, department breakdowns, and salary transparency at ${companyName}.`}
            />

            <CompanyHeader profile={profile} />

            {isJobsTab ? (
              <DepartmentGroups
                companySlug={profile.slug}
                companyName={companyName}
              />
            ) : (
              <CompanyOverview profile={profile} />
            )}
          </>
        ) : (
          <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 2 }}>
            <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
              Company Not Found
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              We could not find an active career board for "{slug}". The company may not be actively hiring on Ashby.
            </Typography>
            <Button
              component={RouterLink}
              to="/companies"
              variant="contained"
              color="primary"
            >
              Browse All Hiring Companies
            </Button>
          </Paper>
        )}
      </QueryState>
    </Container>
  );
};

export default CompanyPage;
