/**
 * @file JobList.tsx
 * @summary Paginated list of JobCards with keyboard-accessible navigation and role="list"
 */

import React from 'react';
import { Box, Stack, Pagination } from '@mui/material';
import { JobListItem } from '../../types/api';
import { JobCard } from './JobCard';

export interface JobListProps {
  jobs: JobListItem[];
  selectedJobId?: string | null;
  onSelectJob?: (jobId: string) => void;
  page?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  linkToDetail?: boolean;
}

export const JobList: React.FC<JobListProps> = ({
  jobs,
  selectedJobId,
  onSelectJob,
  page = 1,
  totalPages = 1,
  onPageChange,
  linkToDetail = false,
}) => {
  return (
    <Box sx={{ width: '100%' }}>
      <Stack
        component="div"
        role="list"
        aria-label="Job listings"
        spacing={1.5}
        sx={{ mb: 3 }}
      >
        {jobs.map((job) => (
          <JobCard
            key={job.id}
            job={job}
            isSelected={selectedJobId === job.id}
            onSelect={onSelectJob}
            linkToDetail={linkToDetail}
          />
        ))}
      </Stack>

      {totalPages > 1 && onPageChange && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
          <Pagination
            count={totalPages}
            page={page}
            onChange={(_, p) => onPageChange(p)}
            color="primary"
            shape="rounded"
            size="medium"
            aria-label="Job results pagination"
          />
        </Box>
      )}
    </Box>
  );
};

export default JobList;
