/**
 * @file BrandMark.tsx
 * @summary B.O.O.L.E.A.N brand wordmark and logo component
 */

import React from 'react';
import { Box, Typography } from '@mui/material';

export interface BrandMarkProps {
  size?: 'small' | 'medium' | 'large';
  showTagline?: boolean;
}

export const BrandMark: React.FC<BrandMarkProps> = ({ size = 'medium', showTagline = false }) => {
  const iconSize = size === 'small' ? 24 : size === 'large' ? 36 : 28;
  const fontSize = size === 'small' ? '0.9rem' : size === 'large' ? '1.25rem' : '1.05rem';

  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.25, userSelect: 'none' }}>
      <Box
        sx={{
          width: iconSize,
          height: iconSize,
          borderRadius: size === 'large' ? 2 : 1.25,
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 900,
          fontSize: size === 'small' ? '0.8rem' : size === 'large' ? '1.15rem' : '0.95rem',
          fontFamily: "'Geist Mono', monospace",
          letterSpacing: '-0.04em',
          boxShadow: (th) =>
            th.palette.mode === 'dark'
              ? '0 2px 8px rgba(0, 0, 0, 0.4)'
              : '0 2px 8px rgba(29, 95, 191, 0.25)',
          flexShrink: 0,
        }}
        aria-hidden="true"
      >
        B
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
        <Typography
          component="span"
          sx={{
            fontFamily: "'Geist Mono', -apple-system, BlinkMacSystemFont, monospace",
            fontWeight: 800,
            fontSize,
            letterSpacing: '0.12em',
            lineHeight: 1.1,
            color: 'text.primary',
            textTransform: 'uppercase',
          }}
        >
          B.O.O.L.E.A.N
        </Typography>
        {showTagline && (
          <Typography
            component="span"
            variant="caption"
            sx={{
              fontSize: '0.68rem',
              color: 'text.secondary',
              letterSpacing: '0.02em',
              fontWeight: 500,
            }}
          >
            Direct jobs from company career boards
          </Typography>
        )}
      </Box>
    </Box>
  );
};

export default BrandMark;
