import React from 'react';
import { Container, Box, Typography, Paper, Stack } from '@mui/material';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';

export const AboutPage: React.FC = () => {
  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <title>About | Ashby Job Index</title>
      <meta
        name="description"
        content="About the open public index of direct Ashby ATS job postings."
      />
      <Box sx={{ mb: 5 }}>
        <Typography variant="h4" component="h1" sx={{ fontSize: { xs: '1.75rem', sm: '2.25rem' }, fontWeight: 700, mb: 1.5 }}>
          About the Ashby Job Index
        </Typography>
        <Typography variant="body1" color="text.secondary">
          A high-performance, open public index of direct applicant tracking postings.
        </Typography>
      </Box>

      <Stack spacing={4}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
            1. Why We Built This
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7, mb: 1.5 }}>
            Traditional job boards insert themselves as monetization intermediaries: requiring candidates to register accounts, harvesting user resumes, selling sponsored listings, and injecting delay.
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
            The Ashby Job Index solves this by tracking public ATS boards directly. Every role is verified and linked straight to the employer's official Ashby careers page with zero tracking or interference.
          </Typography>
        </Box>

        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
            2. Core Architectural Principles
          </Typography>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
              gap: 2,
            }}
          >
            <Paper sx={{ p: 2.5, borderRadius: 2 }}>
              <Stack direction="row" spacing={1.5} sx={{ mb: 1, alignItems: 'center' }}>
                <ShieldOutlinedIcon color="success" />
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  Zero Tracking & No Accounts
                </Typography>
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.6, display: 'block' }}>
                No signups, user profiles, tracking pixels, cookies, or candidate data storage.
              </Typography>
            </Paper>

            <Paper sx={{ p: 2.5, borderRadius: 2 }}>
              <Stack direction="row" spacing={1.5} sx={{ mb: 1, alignItems: 'center' }}>
                <BoltOutlinedIcon color="secondary" />
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  Direct Outbound Apply
                </Typography>
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.6, display: 'block' }}>
                Every click opens the employer's genuine application form on Ashby in a fresh tab.
              </Typography>
            </Paper>

            <Paper sx={{ p: 2.5, borderRadius: 2 }}>
              <Stack direction="row" spacing={1.5} sx={{ mb: 1, alignItems: 'center' }}>
                <StorageOutlinedIcon color="primary" />
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  Comprehensive Verified Listings
                </Typography>
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.6, display: 'block' }}>
                Extensive coverage of open roles carrying full descriptions, published dates, and structured compensation.
              </Typography>
            </Paper>

            <Paper sx={{ p: 2.5, borderRadius: 2 }}>
              <Stack direction="row" spacing={1.5} sx={{ mb: 1, alignItems: 'center' }}>
                <AutoAwesomeOutlinedIcon color="warning" />
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  Achromatic Ledger Aesthetics
                </Typography>
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.6, display: 'block' }}>
                Minimalist typography, clean tabular salary figures, and quiet high-density scanning.
              </Typography>
            </Paper>
          </Box>
        </Box>

        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
            3. Data Sources & Integrity
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
            Listings are collected via Ashby's Public Job Posting API with automatic hosted GraphQL fallback. Closed positions are detected through change detection hashes and deactivated automatically.
          </Typography>
        </Box>
      </Stack>
    </Container>
  );
};

export default AboutPage;
