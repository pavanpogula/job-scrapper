/**
 * @file FounderCredit.tsx
 * @summary "Founded by" credit: a quiet footer line and a compact LinkedIn preview card for the About page
 * @tags frontend, brand, founder, linkedin, footer, about
 */

import React from 'react';
import { Avatar, Box, Button, Link, Paper, Stack, Typography } from '@mui/material';
import type { Theme } from '@mui/material/styles';
import LinkedInIcon from '@mui/icons-material/LinkedIn';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { FOUNDER, displayLinkedInUrl } from '../../lib/site';

/** LinkedIn's brand blue, lightened in dark mode so the small icon keeps >= 3:1 contrast on dark surfaces. */
const linkedInBlue = (theme: Theme) => (theme.palette.mode === 'dark' ? '#71b7fb' : '#0a66c2');

const NEW_TAB = { target: '_blank', rel: 'noopener noreferrer' } as const;

/** Initials for the avatar, e.g. "Pavan Reddy Pogula" -> "PR". */
const initials = FOUNDER.name
  .split(/\s+/)
  .slice(0, 2)
  .map((part) => part.charAt(0).toUpperCase())
  .join('');

/**
 * @summary One-line footer credit: "Founded by <name> [in]" linking to the founder's LinkedIn profile
 */
export const FounderFooterCredit: React.FC = () => (
  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1.25 }}>
    Founded by{' '}
    <Link
      href={FOUNDER.linkedinUrl}
      {...NEW_TAB}
      underline="hover"
      color="text.primary"
      aria-label={`${FOUNDER.name} on LinkedIn (opens in a new tab)`}
      sx={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 0.5, verticalAlign: 'bottom' }}
    >
      {FOUNDER.name}
      <LinkedInIcon aria-hidden sx={{ fontSize: 15, color: linkedInBlue }} />
    </Link>
  </Typography>
);

/**
 * @summary Compact LinkedIn-style preview of the founder for the About page
 */
export const FounderCard: React.FC = () => (
  <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, maxWidth: 600 }}>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { xs: 'flex-start', sm: 'center' } }}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flex: 1, minWidth: 0 }}>
        <Avatar
          src={FOUNDER.photoUrl}
          alt={FOUNDER.name}
          slotProps={{ img: { loading: 'lazy', decoding: 'async', width: 52, height: 52 } }}
          sx={{
            width: 52,
            height: 52,
            fontWeight: 700,
            fontSize: '1.05rem',
            bgcolor: 'action.selected',
            color: 'text.primary',
          }}
        >
          {initials}
        </Avatar>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
            {FOUNDER.name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Founder · B.O.O.L.E.A.N
          </Typography>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', mt: 0.5, color: 'text.secondary' }}>
            <LinkedInIcon aria-hidden sx={{ fontSize: 16, color: linkedInBlue }} />
            <Typography variant="caption" color="text.secondary" noWrap sx={{ minWidth: 0 }}>
              {displayLinkedInUrl(FOUNDER.linkedinUrl)}
            </Typography>
          </Stack>
        </Box>
      </Stack>
      <Button
        href={FOUNDER.linkedinUrl}
        {...NEW_TAB}
        variant="outlined"
        size="small"
        startIcon={<LinkedInIcon sx={{ color: linkedInBlue }} />}
        endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
        aria-label={`View ${FOUNDER.name} on LinkedIn (opens in a new tab)`}
        sx={{ fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}
      >
        View on LinkedIn
      </Button>
    </Stack>
  </Paper>
);
