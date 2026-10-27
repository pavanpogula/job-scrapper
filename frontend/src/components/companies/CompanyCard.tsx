/**
 * @file CompanyCard.tsx
 * @summary Company card displaying an uncropped logo tile, company name, open job count, and direct link to company profile
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Paper, Box, Typography, Stack, IconButton, Tooltip } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { CompanySummary } from '../../types/api';
import { CompanyAvatar } from '../common/CompanyAvatar';

export interface CompanyCardProps {
  company: CompanySummary;
}

export const CompanyCard: React.FC<CompanyCardProps> = ({ company }) => {
  const navigate = useNavigate();
  const companyName = company.name || company.slug;
  const rolesLabel = company.jobCount === 1 ? '1 open job' : `${company.jobCount} open jobs`;
  const careersUrl =
    company.boardUrl ||
    (company.source === 'greenhouse'
      ? `https://job-boards.greenhouse.io/${company.slug.startsWith('gh--') ? company.slug.slice(4) : company.slug}`
      : `https://jobs.ashbyhq.com/${company.slug}`);

  const handleCardClick = () => {
    navigate(`/companies/${company.slug}`);
  };

  return (
    <Paper
      tabIndex={0}
      role="link"
      onClick={handleCardClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleCardClick();
        }
      }}
      sx={{
        p: 2.5,
        borderRadius: 2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 2,
        cursor: 'pointer',
        border: '1px solid',
        borderColor: 'divider',
        transition: 'all 0.18s cubic-bezier(0.23, 1, 0.32, 1)',
        outline: 'none',
        '&:hover': {
          borderColor: 'primary.main',
          boxShadow: (th) =>
            th.palette.mode === 'dark'
              ? '0 4px 12px rgba(0, 0, 0, 0.4)'
              : '0 4px 12px rgba(0, 0, 0, 0.05)',
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
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', minWidth: 0, flex: 1 }}>
        <CompanyAvatar
          name={company.name}
          slug={company.slug}
          logoUrl={company.logoUrl}
          size={48}
        />

        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography
            variant="subtitle1"
            sx={{
              fontWeight: 700,
              color: 'text.primary',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              fontSize: '0.96rem',
            }}
          >
            {companyName}
          </Typography>

          <Typography
            variant="body2"
            sx={{
              color: 'text.secondary',
              fontSize: '0.82rem',
              mt: 0.25,
            }}
          >
            {rolesLabel}
          </Typography>
        </Box>
      </Stack>

      <Tooltip title="View original career board">
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            window.open(careersUrl, '_blank', 'noopener,noreferrer');
          }}
          aria-label={`Open ${companyName} careers board`}
          sx={{
            color: 'text.secondary',
            '&:hover': { color: 'primary.main' },
          }}
        >
          <OpenInNewIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Paper>
  );
};

export default CompanyCard;
