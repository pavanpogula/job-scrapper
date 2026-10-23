import React, { useMemo } from 'react';
import { Routes, Route } from 'react-router-dom';
import { ThemeProvider, CssBaseline, Box } from '@mui/material';
import { useAppSelector } from './store';
import { getAppTheme } from './theme/theme';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { BrowsePage } from './pages/BrowsePage';
import { JobDetailPage } from './pages/JobDetailPage';
import { CompaniesPage } from './pages/CompaniesPage';
import { AboutPage } from './pages/AboutPage';

export const App: React.FC = () => {
  const currentMode = useAppSelector((state) => state.theme.theme);
  const theme = useMemo(() => getAppTheme(currentMode), [currentMode]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Header />
        <Box component="main" sx={{ flex: 1, py: { xs: 2.5, sm: 4 } }}>
          <Routes>
            <Route path="/" element={<BrowsePage />} />
            <Route path="/jobs/:id" element={<JobDetailPage />} />
            <Route path="/companies" element={<CompaniesPage />} />
            <Route path="/about" element={<AboutPage />} />
          </Routes>
        </Box>
        <Footer />
      </Box>
    </ThemeProvider>
  );
};

export default App;
