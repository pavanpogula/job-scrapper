/**
 * @file JobDetailPage.tsx
 * @summary Full job posting details page with JobDetailPanel and "More jobs at <company>" section
 */

import React from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import {
  Container,
  Box,
  Typography,
  Button,
  Stack,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useGetJobByIdQuery, useGetJobsQuery } from '../store/api/jobsApi';
import { JobDetailPanel } from '../components/jobs/JobDetailPanel';
import { JobCard } from '../components/jobs/JobCard';
import { QueryState } from '../components/QueryState';

export const JobDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { data: job, isLoading, isFetching, error, refetch } = useGetJobByIdQuery(id || '');

  const companySlug = job?.companySlug;
  const companyDisplayName = job
    ? job.company?.name || job.companyName || job.companySlug || 'Company'
    : 'Company';

  // Fetch related jobs from the same company
  const { data: relatedData } = useGetJobsQuery(
    { company: companySlug, pageSize: 6 },
    { skip: !companySlug }
  );

  const moreJobs = (relatedData?.data || [])
    .filter((j) => j.id !== id)
    .slice(0, 5);

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Button
        component={RouterLink}
        to="/"
        startIcon={<ArrowBackIcon />}
        sx={{ mb: 2.5 }}
        color="secondary"
        size="small"
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
            <title>{`${job.title} at ${companyDisplayName} · B.O.O.L.E.A.N`}</title>
            <meta
              name="description"
              content={`Apply for ${job.title} at ${companyDisplayName}. Verified direct career board posting.`}
            />

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', lg: moreJobs.length > 0 ? '1fr 360px' : '1fr' },
                gap: 4,
                alignItems: 'start',
              }}
            >
              {/* Main Full-Width Detail Panel */}
              <Box sx={{ minWidth: 0 }}>
                <JobDetailPanel
                  jobId={job.id}
                  initialJob={job}
                  headingComponent="h1"
                />
              </Box>

              {/* Sidebar: More jobs at this company */}
              {moreJobs.length > 0 && (
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
                    More jobs at {companyDisplayName}
                  </Typography>

                  <Stack spacing={1.5} role="list" aria-label={`More jobs at ${companyDisplayName}`}>
                    {moreJobs.map((relatedJob) => (
                      <JobCard
                        key={relatedJob.id}
                        job={relatedJob}
                        linkToDetail
                      />
                    ))}
                  </Stack>

                  <Button
                    component={RouterLink}
                    to={`/companies/${companySlug}`}
                    variant="outlined"
                    fullWidth
                    size="small"
                    sx={{ mt: 2, fontWeight: 600 }}
                  >
                    View all {companyDisplayName} roles
                  </Button>
                </Box>
              )}
            </Box>
          </>
        )}
      </QueryState>
    </Container>
  );
};

export default JobDetailPage;
