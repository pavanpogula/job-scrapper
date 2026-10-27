import React from 'react';
import { Container, Box, Typography, Link, Stack } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { BrandMark } from './brand/BrandMark';
import { FounderFooterCredit } from './brand/FounderCredit';

export const Footer: React.FC = () => {
  return (
    <Box
      component="footer"
      sx={{
        mt: 'auto',
        borderTop: '1px solid',
        borderColor: 'divider',
        py: 4,
        bgcolor: 'background.paper',
      }}
    >
      <Container maxWidth="lg">
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          sx={{
            justifyContent: 'space-between',
            alignItems: { xs: 'flex-start', sm: 'center' },
          }}
        >
          <Box>
            <BrandMark size="small" />
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1 }}>
              Direct listings collected straight from verified company career boards. No accounts, no candidate data retention, no middlemen.
            </Typography>
            <FounderFooterCredit />
          </Box>

          <Stack
            direction="row"
            spacing={1.5}
            sx={{
              alignItems: 'center',
              fontFamily: "'Geist Mono', monospace",
              fontSize: '0.75rem',
            }}
          >
            <Link
              href="https://developers.ashbyhq.com/docs/public-job-posting-api"
              target="_blank"
              rel="noopener noreferrer"
              color="text.secondary"
              underline="hover"
              sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
            >
              Ashby Public API <OpenInNewIcon sx={{ fontSize: 12 }} />
            </Link>
            <Typography variant="caption" color="text.secondary">·</Typography>
            <Typography variant="caption" color="text.secondary">
              Updated Daily
            </Typography>
          </Stack>
        </Stack>
      </Container>
    </Box>
  );
};
