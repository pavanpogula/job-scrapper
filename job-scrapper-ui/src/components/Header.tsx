import React, { useState } from 'react';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import {
  AppBar,
  Toolbar,
  Container,
  Box,
  Typography,
  Button,
  IconButton,
  Chip,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Divider,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import CloseIcon from '@mui/icons-material/Close';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import { useAppDispatch } from '../store';
import { toggleTheme } from '../store/slices/themeSlice';

export const Header: React.FC = () => {
  const dispatch = useAppDispatch();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isActive = (path: string) => {
    if (path === '/' && location.pathname === '/') return true;
    if (path !== '/' && location.pathname.startsWith(path)) return true;
    return false;
  };

  const navItems = [
    { label: 'Browse', path: '/', icon: <SearchOutlinedIcon fontSize="small" /> },
    { label: 'Companies', path: '/companies', icon: <BusinessOutlinedIcon fontSize="small" /> },
    { label: 'About', path: '/about', icon: <InfoOutlinedIcon fontSize="small" /> },
  ];

  return (
    <AppBar position="sticky" sx={{ zIndex: (th) => th.zIndex.drawer + 1 }}>
      <Container maxWidth="lg">
        <Toolbar disableGutters sx={{ height: 56, minHeight: '56px !important', justifyContent: 'space-between' }}>
          {/* Brand & Stats */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box
              component={RouterLink}
              to="/"
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.25,
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <Box
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: '6px',
                  bgcolor: 'text.primary',
                  color: 'background.default',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                }}
              >
                A
              </Box>
              <Typography
                variant="h6"
                sx={{
                  fontSize: '1rem',
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                }}
              >
                Ashby Index
              </Typography>
            </Box>

            {/* Desktop Stats Pill */}
            {!isMobile && (
              <Chip
                label="34,037 live jobs · 1,747 companies"
                size="small"
                variant="outlined"
                sx={{
                  fontFamily: "'Geist Mono', monospace",
                  fontSize: '0.7rem',
                  height: 24,
                  bgcolor: 'background.default',
                }}
              />
            )}
          </Box>

          {/* Desktop Navigation */}
          {!isMobile && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {navItems.map((item) => {
                const active = isActive(item.path);
                return (
                  <Button
                    key={item.path}
                    component={RouterLink}
                    to={item.path}
                    size="small"
                    sx={{
                      color: active ? 'text.primary' : 'text.secondary',
                      bgcolor: active ? 'action.selected' : 'transparent',
                      fontWeight: active ? 600 : 500,
                      '&:hover': {
                        bgcolor: 'action.hover',
                        color: 'text.primary',
                      },
                    }}
                  >
                    {item.label}
                  </Button>
                );
              })}

              <Divider orientation="vertical" flexItem sx={{ mx: 1, my: 1.5 }} />

              <IconButton
                onClick={() => dispatch(toggleTheme())}
                size="small"
                color="inherit"
                aria-label="Toggle light/dark theme"
                sx={{ p: 0.75 }}
              >
                {theme.palette.mode === 'dark' ? (
                  <LightModeOutlinedIcon fontSize="small" />
                ) : (
                  <DarkModeOutlinedIcon fontSize="small" />
                )}
              </IconButton>
            </Box>
          )}

          {/* Mobile Actions */}
          {isMobile && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <IconButton
                onClick={() => dispatch(toggleTheme())}
                size="small"
                color="inherit"
                aria-label="Toggle light/dark theme"
              >
                {theme.palette.mode === 'dark' ? (
                  <LightModeOutlinedIcon fontSize="small" />
                ) : (
                  <DarkModeOutlinedIcon fontSize="small" />
                )}
              </IconButton>

              <IconButton
                onClick={() => setDrawerOpen(!drawerOpen)}
                size="small"
                color="inherit"
                aria-label="Open mobile navigation menu"
              >
                {drawerOpen ? <CloseIcon /> : <MenuIcon />}
              </IconButton>
            </Box>
          )}
        </Toolbar>
      </Container>

      {/* Mobile Drawer */}
      <Drawer
        anchor="top"
        open={isMobile && drawerOpen}
        onClose={() => setDrawerOpen(false)}
        ModalProps={{ keepMounted: true }}
        slotProps={{
          paper: {
            sx: {
              top: 56,
              bgcolor: 'background.paper',
              borderBottom: '1px solid',
              borderColor: 'divider',
              p: 2,
            },
          },
        }}
      >
        <List disablePadding>
          {navItems.map((item) => (
            <ListItem key={item.path} disablePadding sx={{ mb: 0.5 }}>
              <ListItemButton
                component={RouterLink}
                to={item.path}
                onClick={() => setDrawerOpen(false)}
                selected={isActive(item.path)}
                sx={{ borderRadius: 1 }}
              >
                <Box sx={{ mr: 1.5, display: 'flex', color: 'text.secondary' }}>
                  {item.icon}
                </Box>
                <ListItemText
                  primary={
                    <Typography sx={{ fontSize: '0.9rem', fontWeight: isActive(item.path) ? 600 : 500 }}>
                      {item.label}
                    </Typography>
                  }
                />
              </ListItemButton>
            </ListItem>
          ))}
        </List>

        <Divider sx={{ my: 1.5 }} />

        <Box sx={{ px: 2, py: 1 }}>
          <Typography variant="caption" sx={{ fontFamily: "'Geist Mono', monospace", color: 'text.secondary' }}>
            34,037 live jobs · 1,747 hiring companies
          </Typography>
        </Box>
      </Drawer>
    </AppBar>
  );
};
