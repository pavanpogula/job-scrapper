/**
 * @file SourceBadge.tsx
 * @summary Small, quiet indicator displaying the source ATS ("via Ashby" / "via Greenhouse") without brand logos
 * @tags UI, ATS, Badge, ADR-0021
 */

import React from 'react';
import { Box, type SxProps, type Theme } from '@mui/material';
import type { JobSource } from '../../types/api';

export interface SourceBadgeProps {
  source?: JobSource | string | null;
  size?: 'small' | 'medium';
  sx?: SxProps<Theme>;
}

export const SourceBadge: React.FC<SourceBadgeProps> = ({ source, size = 'small', sx }) => {
  const isGreenhouse = (source || '').toLowerCase() === 'greenhouse';
  const label = isGreenhouse ? 'via Greenhouse' : 'via Ashby';

  return (
    <Box
      component="span"
      data-testid="source-badge"
      data-source={isGreenhouse ? 'greenhouse' : 'ashby'}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        px: size === 'small' ? 0.75 : 1,
        py: size === 'small' ? 0.25 : 0.5,
        borderRadius: '4px',
        fontSize: size === 'small' ? '0.7rem' : '0.75rem',
        fontWeight: 500,
        lineHeight: 1.2,
        color: 'text.secondary',
        bgcolor: (theme) =>
          theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
        border: '1px solid',
        borderColor: 'divider',
        letterSpacing: '0.01em',
        userSelect: 'none',
        ...sx,
      }}
    >
      {label}
    </Box>
  );
};

export default SourceBadge;
