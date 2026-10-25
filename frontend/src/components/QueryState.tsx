/**
 * @file QueryState.tsx
 * @summary Shared error, loading, and rate-limiting wrapper handling 404, 429 countdown auto-refetch, and 5xx retries
 */

import React, { useEffect, useState } from 'react';
import { Box, Typography, Button, CircularProgress, Alert, Paper } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import TimerIcon from '@mui/icons-material/Timer';
import ErrorOutlinedIcon from '@mui/icons-material/ErrorOutlined';

interface QueryStateProps {
  isLoading?: boolean;
  isFetching?: boolean;
  error?: any;
  onRetry?: () => void;
  children: React.ReactNode;
  empty?: boolean;
  emptyMessage?: string;
  emptyAction?: React.ReactNode;
}

export const QueryState: React.FC<QueryStateProps> = ({
  isLoading,
  error,
  onRetry,
  children,
  empty,
  emptyMessage = 'No records found matching your criteria.',
  emptyAction,
}) => {
  const [countdown, setCountdown] = useState<number | null>(null);

  // Parse 429 retry seconds
  useEffect(() => {
    if (!error) {
      setCountdown(null);
      return;
    }

    const status = error?.status;
    if (status === 429) {
      const retryAfterHeader = error?.headers?.get?.('retry-after') || error?.headers?.['retry-after'];
      const retrySec = Number(retryAfterHeader) || Number(error?.data?.retryAfterSeconds) || 5;
      setCountdown(Math.max(1, Math.ceil(retrySec)));
    } else {
      setCountdown(null);
    }
  }, [error]);

  // Countdown timer for 429 auto-refetch
  useEffect(() => {
    if (countdown === null || countdown <= 0) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          onRetry?.();
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [countdown, onRetry]);

  if (isLoading) {
    return (
      <Box
        role="status"
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          py: 8,
          minHeight: '200px',
        }}
      >
        <CircularProgress size={36} />
      </Box>
    );
  }

  if (error) {
    const status = error?.status;
    const is404 = status === 404;
    const is429 = status === 429;

    if (is429) {
      return (
        <Paper elevation={0} sx={{ p: 4, my: 4, textAlign: 'center', border: '1px solid', borderColor: 'warning.light', borderRadius: 2 }}>
          <TimerIcon color="warning" sx={{ fontSize: 48, mb: 1 }} />
          <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
            Rate Limit Active
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {countdown !== null && countdown > 0
              ? `Too many requests. Automatically retrying in ${countdown} second${countdown === 1 ? '' : 's'}...`
              : 'Too many requests. Please wait before retrying.'}
          </Typography>
          {onRetry && (
            <Button
              variant="outlined"
              color="warning"
              onClick={onRetry}
              startIcon={<RefreshIcon />}
              size="small"
              disabled={countdown !== null && countdown > 0}
            >
              Retry Now
            </Button>
          )}
        </Paper>
      );
    }

    if (is404) {
      return (
        <Paper elevation={0} sx={{ p: 4, my: 4, textAlign: 'center', border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
          <ErrorOutlinedIcon color="action" sx={{ fontSize: 48, mb: 1 }} />
          <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
            Resource Not Found
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            The job posting or company you requested could not be found or has been unlisted.
          </Typography>
          {onRetry && (
            <Button variant="outlined" onClick={onRetry} startIcon={<RefreshIcon />} size="small">
              Try Again
            </Button>
          )}
        </Paper>
      );
    }

    return (
      <Alert
        severity="error"
        action={
          onRetry && (
            <Button color="inherit" size="small" onClick={onRetry} startIcon={<RefreshIcon />}>
              Retry
            </Button>
          )
        }
        sx={{ my: 3 }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Unable to Load Data
        </Typography>
        <Typography variant="body2">
          {error?.data?.error || error?.data?.message || 'A network or server error occurred. Please try again.'}
        </Typography>
      </Alert>
    );
  }

  if (empty) {
    return (
      <Paper elevation={0} sx={{ p: 6, my: 4, textAlign: 'center', border: '1px dashed', borderColor: 'divider', borderRadius: 2 }}>
        <Typography variant="h6" color="text.secondary" gutterBottom sx={{ fontWeight: 500 }}>
          {emptyMessage}
        </Typography>
        {emptyAction && <Box sx={{ mt: 2 }}>{emptyAction}</Box>}
      </Paper>
    );
  }

  return <>{children}</>;
};

export default QueryState;
