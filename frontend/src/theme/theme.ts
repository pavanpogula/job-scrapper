import { createTheme, ThemeOptions } from '@mui/material/styles';

export const getAppTheme = (mode: 'light' | 'dark') => {
  const isDark = mode === 'dark';

  const themeOptions: ThemeOptions = {
    palette: {
      mode,
      primary: {
        main: isDark ? '#f0f6fc' : '#111827',
        contrastText: isDark ? '#0d1117' : '#ffffff',
      },
      secondary: {
        main: isDark ? '#58a6ff' : '#1d5fbf', // Reserved salary/highlight hue
        contrastText: '#ffffff',
      },
      background: {
        default: isDark ? '#0d1117' : '#f3f5f8', // Cool ledger ground
        paper: isDark ? '#161b22' : '#ffffff',
      },
      text: {
        primary: isDark ? '#f0f6fc' : '#111827',
        secondary: isDark ? '#8b949e' : '#4b5563',
      },
      divider: isDark ? '#21262d' : '#e5e7eb',
    },
    typography: {
      fontFamily: "'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      h1: {
        fontWeight: 700,
        letterSpacing: '-0.025em',
      },
      h2: {
        fontWeight: 700,
        letterSpacing: '-0.02em',
      },
      h3: {
        fontWeight: 600,
        letterSpacing: '-0.015em',
      },
      h6: {
        fontWeight: 600,
        letterSpacing: '-0.01em',
      },
      button: {
        textTransform: 'none',
        fontWeight: 500,
      },
      body1: {
        letterSpacing: '-0.005em',
      },
      body2: {
        letterSpacing: '-0.005em',
      },
    },
    shape: {
      borderRadius: 6,
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundColor: isDark ? '#0d1117' : '#f3f5f8',
            color: isDark ? '#f0f6fc' : '#111827',
          },
        },
      },
      MuiButton: {
        defaultProps: {
          disableElevation: true,
        },
        styleOverrides: {
          root: {
            borderRadius: 6,
            fontWeight: 500,
            padding: '6px 14px',
          },
        },
      },
      MuiPaper: {
        defaultProps: {
          elevation: 0,
        },
        styleOverrides: {
          root: {
            border: `1px solid ${isDark ? '#21262d' : '#e5e7eb'}`,
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 6,
            backgroundColor: isDark ? '#161b22' : '#ffffff',
            '& fieldset': {
              borderColor: isDark ? '#21262d' : '#e5e7eb',
            },
            '&:hover fieldset': {
              borderColor: isDark ? '#484f58' : '#9ca3af',
            },
            '&.Mui-focused fieldset': {
              borderColor: isDark ? '#58a6ff' : '#1d5fbf',
              borderWidth: '1.5px',
            },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 4,
            fontWeight: 500,
            fontSize: '0.75rem',
            height: '24px',
            border: `1px solid ${isDark ? '#21262d' : '#e5e7eb'}`,
          },
        },
      },
      MuiAppBar: {
        defaultProps: {
          elevation: 0,
        },
        styleOverrides: {
          root: {
            backgroundColor: isDark ? 'rgba(22, 27, 34, 0.95)' : 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(8px)',
            borderBottom: `1px solid ${isDark ? '#21262d' : '#e5e7eb'}`,
            color: isDark ? '#f0f6fc' : '#111827',
          },
        },
      },
    },
  };

  return createTheme(themeOptions);
};
