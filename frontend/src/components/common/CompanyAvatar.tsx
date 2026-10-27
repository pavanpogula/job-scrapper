/**
 * @file CompanyAvatar.tsx
 * @summary Standardized company avatar displaying uncropped logos on a neutral tile with deterministic initials fallback
 */

import React, { useState } from 'react';
import { Box } from '@mui/material';
import BusinessIcon from '@mui/icons-material/Business';

export interface CompanyAvatarProps {
  name?: string | null;
  slug?: string;
  logoUrl?: string | null;
  size?: number;
  borderRadius?: number;
}

/**
 * Returns a consistent hash-based background hue for initial avatars
 */
function getInitialColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hues = [210, 220, 230, 200, 240, 260];
  const hue = hues[Math.abs(hash) % hues.length];
  return `hsl(${hue}, 45%, 40%)`;
}

export const CompanyAvatar: React.FC<CompanyAvatarProps> = ({
  name,
  slug = '',
  logoUrl,
  size = 48,
  borderRadius = 8,
}) => {
  const [imgError, setImgError] = useState(false);
  const displayName = name || slug || '?';
  const initial = displayName.charAt(0).toUpperCase();
  const showImage = Boolean(logoUrl) && !imgError;

  return (
    <Box
      sx={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        borderRadius: `${borderRadius}px`,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: (th) =>
          th.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.06)' : '#ffffff',
        border: '1px solid',
        borderColor: 'divider',
        p: showImage ? 0.75 : 0,
        boxSizing: 'border-box',
        position: 'relative',
        flexShrink: 0,
      }}
    >
      {showImage ? (
        <Box
          component="img"
          src={logoUrl!}
          alt={`${displayName} logo`}
          loading="lazy"
          onError={() => setImgError(true)}
          sx={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            objectPosition: 'center',
            display: 'block',
          }}
        />
      ) : (
        <Box
          sx={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: getInitialColor(displayName),
            color: '#ffffff',
            fontWeight: 700,
            fontSize: size >= 48 ? '1.15rem' : '0.85rem',
            userSelect: 'none',
          }}
          aria-hidden="true"
        >
          {initial || <BusinessIcon sx={{ fontSize: size * 0.6 }} />}
        </Box>
      )}
    </Box>
  );
};

export default CompanyAvatar;
