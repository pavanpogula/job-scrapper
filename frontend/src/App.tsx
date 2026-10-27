import React, { useMemo, Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import { ThemeProvider, CssBaseline, Box, CircularProgress } from '@mui/material';
import { useAppSelector } from './store';
import { getAppTheme } from './theme/theme';
import { Header } from './components/Header';
import { Footer } from './components/Footer';

// React.lazy route chunking (P5-T08)
const BrowsePage = lazy(() => import('./pages/BrowsePage'));
const JobDetailPage = lazy(() => import('./pages/JobDetailPage'));
const CompaniesPage = lazy(() => import('./pages/CompaniesPage'));
const CompanyPage = lazy(() => import('./pages/CompanyPage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

export const App: React.FC = () => {
  const currentMode = useAppSelector((state) => state.theme.theme);
  const theme = useMemo(() => getAppTheme(currentMode), [currentMode]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Header />
        <Box component="main" sx={{ flex: 1, py: { xs: 2.5, sm: 4 } }}>
          <Suspense
            fallback={
              <Box
                role="status"
                sx={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  py: 12,
                }}
              >
                <CircularProgress size={32} />
              </Box>
            }
          >
            <Routes>
              <Route path="/" element={<BrowsePage />} />
              <Route path="/jobs/:id" element={<JobDetailPage />} />
              <Route path="/companies" element={<CompaniesPage />} />
              <Route path="/companies/:slug" element={<CompanyPage />} />
              <Route path="/companies/:slug/jobs" element={<CompanyPage />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </Box>
        <Footer />
      </Box>
    </ThemeProvider>
  );
};

export default App;
