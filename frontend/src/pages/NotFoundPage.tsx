/**
 * @file NotFoundPage.tsx
 * @summary 404 Not Found fallback route for unmatched URLs
 */

import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Container, Typography, Button, Paper } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SearchOffIcon from '@mui/icons-material/SearchOff';

export const NotFoundPage: React.FC = () => {
  return (
    <Container maxWidth="sm" sx={{ py: 12, textAlign: 'center' }}>
      <title>Page Not Found | B.O.O.L.E.A.N</title>
      <meta name="description" content="The requested page could not be found." />

      <Paper elevation={0} sx={{ p: 6, border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
        <SearchOffIcon color="action" sx={{ fontSize: 56, mb: 2 }} />
        <Typography variant="h4" component="h1" gutterBottom sx={{ fontWeight: 800 }}>
          Page Not Found
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
          The page or route you requested does not exist or may have been relocated.
        </Typography>
        <Button
          component={RouterLink}
          to="/"
          variant="contained"
          color="primary"
          startIcon={<ArrowBackIcon />}
          sx={{ minHeight: 44, px: 3, fontWeight: 600 }}
        >
          Back to Job Index
        </Button>
      </Paper>
    </Container>
  );
};

export default NotFoundPage;
