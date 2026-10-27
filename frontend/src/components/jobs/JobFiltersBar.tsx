/**
 * @file JobFiltersBar.tsx
 * @summary Top search and filter pills bar with mobile drawer support
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  TextField,
  InputAdornment,
  IconButton,
  Button,
  Chip,
  Menu,
  MenuItem,
  Stack,
  Drawer,
  Typography,
  Divider,
  Select,
  FormControl,
  InputLabel,
  Badge,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import TuneIcon from '@mui/icons-material/Tune';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import CheckIcon from '@mui/icons-material/Check';
import { JobsQueryParams, WorkplaceType, EmploymentType, FacetsData } from '../../types/api';
import { formatCountryOption, formatWorkplace, formatEmployment } from '../../lib/labels';

export interface JobFiltersBarProps {
  filters: JobsQueryParams;
  facets?: FacetsData;
  onUpdateFilters: (updates: Partial<JobsQueryParams>) => void;
  onClearFilters: () => void;
}

export const JobFiltersBar: React.FC<JobFiltersBarProps> = ({
  filters,
  facets,
  onUpdateFilters,
  onClearFilters,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  // Local state for search text input
  const [searchTerm, setSearchTerm] = useState(filters.search || '');

  // Keep input in sync with incoming filters (e.g. Back button or external change)
  useEffect(() => {
    setSearchTerm(filters.search || '');
  }, [filters.search]);

  // Drawer state for mobile
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Menu anchor states for desktop filter pills
  const [sourceAnchor, setSourceAnchor] = useState<null | HTMLElement>(null);
  const [dateAnchor, setDateAnchor] = useState<null | HTMLElement>(null);
  const [workplaceAnchor, setWorkplaceAnchor] = useState<null | HTMLElement>(null);
  const [employmentAnchor, setEmploymentAnchor] = useState<null | HTMLElement>(null);
  const [sortAnchor, setSortAnchor] = useState<null | HTMLElement>(null);

  const handleSearchSubmit = () => {
    const trimmed = searchTerm.trim();
    onUpdateFilters({ search: trimmed, page: 1 });
  };

  const handleClearSearch = () => {
    setSearchTerm('');
    onUpdateFilters({ search: '', page: 1 });
  };

  // Active filter count (excluding default page/pageSize/publishedAt desc sort)
  const activeFilterCount = [
    Boolean(filters.source),
    Boolean(filters.country),
    Boolean(filters.workplaceType),
    Boolean(filters.employmentType),
    Boolean(filters.postedWithin),
    Boolean(filters.isRemote),
    Boolean(filters.hasSalary),
    Boolean(filters.company),
    Boolean(filters.sortBy && filters.sortBy !== 'publishedAt'),
  ].filter(Boolean).length;

  return (
    <Box sx={{ mb: 3 }}>
      {/* Primary Search & Country Row */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr auto', md: '1fr 240px auto' },
          gap: 1.5,
          alignItems: 'center',
          mb: 1.5,
        }}
      >
        <TextField
          fullWidth
          size="small"
          placeholder="Search by job title, company or location (all words must match)"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleSearchSubmit();
            }
          }}
          slotProps={{
            htmlInput: {
              'aria-label': 'Search jobs by title, company or location',
            },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                </InputAdornment>
              ),
              endAdornment: searchTerm ? (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    aria-label="Clear search input"
                    onClick={handleClearSearch}
                  >
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : null,
            },
          }}
        />

        {/* Country Selector (Desktop) */}
        {!isMobile && (
          <FormControl size="small" fullWidth>
            <InputLabel id="country-select-label">Country</InputLabel>
            <Select
              labelId="country-select-label"
              id="country-select"
              value={filters.country || ''}
              label="Country"
              onChange={(e) => onUpdateFilters({ country: e.target.value, page: 1 })}
            >
              <MenuItem value="">
                <em>All Countries</em>
              </MenuItem>
              {facets?.countries.map((c) => (
                <MenuItem key={c.value} value={c.value}>
                  {formatCountryOption(c.value)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        {/* Desktop Search Button */}
        {!isMobile && (
          <Button
            variant="contained"
            color="primary"
            size="small"
            onClick={handleSearchSubmit}
            sx={{ height: 40, px: 3, fontWeight: 700 }}
          >
            Search
          </Button>
        )}

        {/* Mobile Filter Drawer Trigger */}
        {isMobile && (
          <IconButton
            color="primary"
            aria-label="Open filter options"
            onClick={() => setDrawerOpen(true)}
            sx={{
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 1.5,
              height: 40,
              width: 40,
            }}
          >
            <Badge badgeContent={activeFilterCount} color="primary">
              <TuneIcon fontSize="small" />
            </Badge>
          </IconButton>
        )}
      </Box>

      {/* Desktop Filter Pills */}
      {!isMobile && (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
          {/* Date Posted Pill */}
          <Chip
            label={
              filters.postedWithin === '1d'
                ? 'Past 24h'
                : filters.postedWithin === '7d'
                ? 'Past week'
                : filters.postedWithin === '30d'
                ? 'Past month'
                : 'Date posted'
            }
            onClick={(e) => setDateAnchor(e.currentTarget)}
            onDelete={filters.postedWithin ? () => onUpdateFilters({ postedWithin: undefined, page: 1 }) : undefined}
            deleteIcon={<ClearIcon fontSize="small" />}
            color={filters.postedWithin ? 'primary' : 'default'}
            variant={filters.postedWithin ? 'filled' : 'outlined'}
            icon={<ArrowDropDownIcon />}
            sx={{ fontWeight: 600, fontSize: '0.8rem' }}
          />
          <Menu
            anchorEl={dateAnchor}
            open={Boolean(dateAnchor)}
            onClose={() => setDateAnchor(null)}
          >
            <MenuItem
              selected={!filters.postedWithin}
              onClick={() => {
                onUpdateFilters({ postedWithin: undefined, page: 1 });
                setDateAnchor(null);
              }}
            >
              Any time
            </MenuItem>
            <MenuItem
              selected={filters.postedWithin === '1d'}
              onClick={() => {
                onUpdateFilters({ postedWithin: '1d', page: 1 });
                setDateAnchor(null);
              }}
            >
              Past 24 hours
            </MenuItem>
            <MenuItem
              selected={filters.postedWithin === '7d'}
              onClick={() => {
                onUpdateFilters({ postedWithin: '7d', page: 1 });
                setDateAnchor(null);
              }}
            >
              Past week
            </MenuItem>
            <MenuItem
              selected={filters.postedWithin === '30d'}
              onClick={() => {
                onUpdateFilters({ postedWithin: '30d', page: 1 });
                setDateAnchor(null);
              }}
            >
              Past month
            </MenuItem>
          </Menu>

          {/* Workplace Pill */}
          <Chip
            label={filters.workplaceType ? formatWorkplace(filters.workplaceType) : 'Workplace'}
            onClick={(e) => setWorkplaceAnchor(e.currentTarget)}
            onDelete={filters.workplaceType ? () => onUpdateFilters({ workplaceType: '', page: 1 }) : undefined}
            deleteIcon={<ClearIcon fontSize="small" />}
            color={filters.workplaceType ? 'primary' : 'default'}
            variant={filters.workplaceType ? 'filled' : 'outlined'}
            icon={<ArrowDropDownIcon />}
            sx={{ fontWeight: 600, fontSize: '0.8rem' }}
          />
          <Menu
            anchorEl={workplaceAnchor}
            open={Boolean(workplaceAnchor)}
            onClose={() => setWorkplaceAnchor(null)}
          >
            <MenuItem
              selected={!filters.workplaceType}
              onClick={() => {
                onUpdateFilters({ workplaceType: '', page: 1 });
                setWorkplaceAnchor(null);
              }}
            >
              All Workplace Types
            </MenuItem>
            <MenuItem
              selected={filters.workplaceType === 'Remote'}
              onClick={() => {
                onUpdateFilters({ workplaceType: 'Remote', page: 1 });
                setWorkplaceAnchor(null);
              }}
            >
              Remote
            </MenuItem>
            <MenuItem
              selected={filters.workplaceType === 'OnSite'}
              onClick={() => {
                onUpdateFilters({ workplaceType: 'OnSite', page: 1 });
                setWorkplaceAnchor(null);
              }}
            >
              On-site
            </MenuItem>
            <MenuItem
              selected={filters.workplaceType === 'Hybrid'}
              onClick={() => {
                onUpdateFilters({ workplaceType: 'Hybrid', page: 1 });
                setWorkplaceAnchor(null);
              }}
            >
              Hybrid
            </MenuItem>
          </Menu>

          {/* Employment Pill */}
          <Chip
            label={filters.employmentType ? formatEmployment(filters.employmentType) : 'Employment'}
            onClick={(e) => setEmploymentAnchor(e.currentTarget)}
            onDelete={filters.employmentType ? () => onUpdateFilters({ employmentType: '', page: 1 }) : undefined}
            deleteIcon={<ClearIcon fontSize="small" />}
            color={filters.employmentType ? 'primary' : 'default'}
            variant={filters.employmentType ? 'filled' : 'outlined'}
            icon={<ArrowDropDownIcon />}
            sx={{ fontWeight: 600, fontSize: '0.8rem' }}
          />
          <Menu
            anchorEl={employmentAnchor}
            open={Boolean(employmentAnchor)}
            onClose={() => setEmploymentAnchor(null)}
          >
            <MenuItem
              selected={!filters.employmentType}
              onClick={() => {
                onUpdateFilters({ employmentType: '', page: 1 });
                setEmploymentAnchor(null);
              }}
            >
              All Employment Types
            </MenuItem>
            <MenuItem
              selected={filters.employmentType === 'FullTime'}
              onClick={() => {
                onUpdateFilters({ employmentType: 'FullTime', page: 1 });
                setEmploymentAnchor(null);
              }}
            >
              Full-time
            </MenuItem>
            <MenuItem
              selected={filters.employmentType === 'PartTime'}
              onClick={() => {
                onUpdateFilters({ employmentType: 'PartTime', page: 1 });
                setEmploymentAnchor(null);
              }}
            >
              Part-time
            </MenuItem>
            <MenuItem
              selected={filters.employmentType === 'Contract'}
              onClick={() => {
                onUpdateFilters({ employmentType: 'Contract', page: 1 });
                setEmploymentAnchor(null);
              }}
            >
              Contract
            </MenuItem>
            <MenuItem
              selected={filters.employmentType === 'Intern'}
              onClick={() => {
                onUpdateFilters({ employmentType: 'Intern', page: 1 });
                setEmploymentAnchor(null);
              }}
            >
              Internship
            </MenuItem>
          </Menu>

          {/* Source Pill */}
          <Chip
            label={
              filters.source === 'greenhouse'
                ? 'Source: Greenhouse'
                : filters.source === 'ashby'
                ? 'Source: Ashby'
                : 'Source'
            }
            onClick={(e) => setSourceAnchor(e.currentTarget)}
            onDelete={filters.source ? () => onUpdateFilters({ source: '', page: 1 }) : undefined}
            deleteIcon={<ClearIcon fontSize="small" />}
            color={filters.source ? 'primary' : 'default'}
            variant={filters.source ? 'filled' : 'outlined'}
            icon={<ArrowDropDownIcon />}
            sx={{ fontWeight: 600, fontSize: '0.8rem' }}
          />
          <Menu
            anchorEl={sourceAnchor}
            open={Boolean(sourceAnchor)}
            onClose={() => setSourceAnchor(null)}
          >
            <MenuItem
              selected={!filters.source}
              onClick={() => {
                onUpdateFilters({ source: '', page: 1 });
                setSourceAnchor(null);
              }}
            >
              All Sources
            </MenuItem>
            <MenuItem
              selected={filters.source === 'ashby'}
              onClick={() => {
                onUpdateFilters({ source: 'ashby', page: 1 });
                setSourceAnchor(null);
              }}
            >
              Ashby
            </MenuItem>
            <MenuItem
              selected={filters.source === 'greenhouse'}
              onClick={() => {
                onUpdateFilters({ source: 'greenhouse', page: 1 });
                setSourceAnchor(null);
              }}
            >
              Greenhouse
            </MenuItem>
          </Menu>

          {/* Salary Pill */}
          <Chip
            label="Has salary"
            onClick={() => onUpdateFilters({ hasSalary: !filters.hasSalary, page: 1 })}
            color={filters.hasSalary ? 'primary' : 'default'}
            variant={filters.hasSalary ? 'filled' : 'outlined'}
            icon={filters.hasSalary ? <CheckIcon fontSize="small" /> : undefined}
            sx={{ fontWeight: 600, fontSize: '0.8rem' }}
          />

          {/* Remote Only Pill */}
          <Chip
            label="Remote only"
            onClick={() => onUpdateFilters({ isRemote: !filters.isRemote, page: 1 })}
            color={filters.isRemote ? 'primary' : 'default'}
            variant={filters.isRemote ? 'filled' : 'outlined'}
            icon={filters.isRemote ? <CheckIcon fontSize="small" /> : undefined}
            sx={{ fontWeight: 600, fontSize: '0.8rem' }}
          />

          {/* Company Filter Pill (if deep linked via ?company=) */}
          {filters.company && (
            <Chip
              label={`Company: ${filters.company}`}
              onDelete={() => onUpdateFilters({ company: '', page: 1 })}
              color="primary"
              variant="filled"
              sx={{ fontWeight: 600, fontSize: '0.8rem' }}
            />
          )}

          {/* Sort Pill */}
          <Chip
            label={`Sort: ${filters.sortBy === 'salary' ? 'Salary' : filters.sortBy === 'company' ? 'Company' : 'Date'}`}
            onClick={(e) => setSortAnchor(e.currentTarget)}
            variant="outlined"
            icon={<ArrowDropDownIcon />}
            sx={{ fontWeight: 600, fontSize: '0.8rem' }}
          />
          <Menu
            anchorEl={sortAnchor}
            open={Boolean(sortAnchor)}
            onClose={() => setSortAnchor(null)}
          >
            <MenuItem
              selected={!filters.sortBy || filters.sortBy === 'publishedAt'}
              onClick={() => {
                onUpdateFilters({ sortBy: 'publishedAt', sortOrder: 'desc', page: 1 });
                setSortAnchor(null);
              }}
            >
              Most recent (default)
            </MenuItem>
            <MenuItem
              selected={filters.sortBy === 'salary'}
              onClick={() => {
                onUpdateFilters({ sortBy: 'salary', sortOrder: 'desc', page: 1 });
                setSortAnchor(null);
              }}
            >
              Highest salary
            </MenuItem>
            <MenuItem
              selected={filters.sortBy === 'company'}
              onClick={() => {
                onUpdateFilters({ sortBy: 'company', sortOrder: 'asc', page: 1 });
                setSortAnchor(null);
              }}
            >
              Company (A–Z)
            </MenuItem>
          </Menu>

          {/* Clear Filters Button */}
          {activeFilterCount > 0 && (
            <Button
              size="small"
              onClick={onClearFilters}
              sx={{
                fontSize: '0.8rem',
                textTransform: 'none',
                color: 'text.secondary',
                ml: 1,
              }}
            >
              Clear all
            </Button>
          )}
        </Stack>
      )}

      {/* Mobile Filters Drawer */}
      <Drawer
        anchor="bottom"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        slotProps={{
          paper: {
            sx: {
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              p: 3,
              maxHeight: '80vh',
            },
          },
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Filter Postings
          </Typography>
          <IconButton size="small" onClick={() => setDrawerOpen(false)} aria-label="Close filters">
            <ClearIcon fontSize="small" />
          </IconButton>
        </Box>

        <Divider sx={{ mb: 2.5 }} />

        <Stack spacing={2.5}>
          <FormControl size="small" fullWidth>
            <InputLabel id="mobile-country-select-label">Country</InputLabel>
            <Select
              labelId="mobile-country-select-label"
              value={filters.country || ''}
              label="Country"
              onChange={(e) => onUpdateFilters({ country: e.target.value, page: 1 })}
            >
              <MenuItem value="">
                <em>All Countries</em>
              </MenuItem>
              {facets?.countries.map((c) => (
                <MenuItem key={c.value} value={c.value}>
                  {formatCountryOption(c.value)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" fullWidth>
            <InputLabel id="mobile-source-label">Source</InputLabel>
            <Select
              labelId="mobile-source-label"
              value={filters.source || ''}
              label="Source"
              onChange={(e) =>
                onUpdateFilters({
                  source: (e.target.value as 'ashby' | 'greenhouse' | '') || '',
                  page: 1,
                })
              }
            >
              <MenuItem value="">All Sources</MenuItem>
              <MenuItem value="ashby">Ashby</MenuItem>
              <MenuItem value="greenhouse">Greenhouse</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small" fullWidth>
            <InputLabel id="mobile-date-label">Date Posted</InputLabel>
            <Select
              labelId="mobile-date-label"
              value={filters.postedWithin || ''}
              label="Date Posted"
              onChange={(e) =>
                onUpdateFilters({
                  postedWithin: (e.target.value as '1d' | '7d' | '30d') || undefined,
                  page: 1,
                })
              }
            >
              <MenuItem value="">Any time</MenuItem>
              <MenuItem value="1d">Past 24 hours</MenuItem>
              <MenuItem value="7d">Past week</MenuItem>
              <MenuItem value="30d">Past month</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small" fullWidth>
            <InputLabel id="mobile-workplace-label">Workplace</InputLabel>
            <Select
              labelId="mobile-workplace-label"
              value={filters.workplaceType || ''}
              label="Workplace"
              onChange={(e) =>
                onUpdateFilters({
                  workplaceType: e.target.value as WorkplaceType | '',
                  page: 1,
                })
              }
            >
              <MenuItem value="">All Workplace Types</MenuItem>
              <MenuItem value="Remote">Remote</MenuItem>
              <MenuItem value="OnSite">On-site</MenuItem>
              <MenuItem value="Hybrid">Hybrid</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small" fullWidth>
            <InputLabel id="mobile-employment-label">Employment Type</InputLabel>
            <Select
              labelId="mobile-employment-label"
              value={filters.employmentType || ''}
              label="Employment Type"
              onChange={(e) =>
                onUpdateFilters({
                  employmentType: e.target.value as EmploymentType | '',
                  page: 1,
                })
              }
            >
              <MenuItem value="">All Employment Types</MenuItem>
              <MenuItem value="FullTime">Full-time</MenuItem>
              <MenuItem value="PartTime">Part-time</MenuItem>
              <MenuItem value="Contract">Contract</MenuItem>
              <MenuItem value="Intern">Internship</MenuItem>
            </Select>
          </FormControl>

          <Stack direction="row" spacing={1}>
            <Chip
              label="Has salary"
              onClick={() => onUpdateFilters({ hasSalary: !filters.hasSalary, page: 1 })}
              color={filters.hasSalary ? 'primary' : 'default'}
              variant={filters.hasSalary ? 'filled' : 'outlined'}
            />
            <Chip
              label="Remote only"
              onClick={() => onUpdateFilters({ isRemote: !filters.isRemote, page: 1 })}
              color={filters.isRemote ? 'primary' : 'default'}
              variant={filters.isRemote ? 'filled' : 'outlined'}
            />
          </Stack>

          <Box sx={{ display: 'flex', gap: 1.5, pt: 2 }}>
            <Button
              variant="outlined"
              fullWidth
              onClick={() => {
                onClearFilters();
                setDrawerOpen(false);
              }}
            >
              Clear All
            </Button>
            <Button
              variant="contained"
              fullWidth
              onClick={() => setDrawerOpen(false)}
            >
              Apply Filters
            </Button>
          </Box>
        </Stack>
      </Drawer>
    </Box>
  );
};

export default JobFiltersBar;
