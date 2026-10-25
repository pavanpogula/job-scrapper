/**
 * @file API Type Definitions for Ashby Job Scraper UI
 * @summary Single source of truth for UI API contract, aligned with backend/docs/api.md
 */

export type WorkplaceType = 'Remote' | 'OnSite' | 'Hybrid';
export type EmploymentType = 'FullTime' | 'PartTime' | 'Contract' | 'Intern' | 'Temporary';
export type SalaryInterval = '1 YEAR' | '1 HOUR' | '1 MONTH' | '1 WEEK' | '1 DAY';

export interface PostalAddress {
  addressCountry?: string;
  addressRegion?: string;
  addressLocality?: string;
  postalCode?: string;
  streetAddress?: string;
}

export interface CompanySummary {
  slug: string;
  name: string;
  logoUrl?: string | null;
  jobCount?: number;
}

export interface CompaniesResponse {
  data: CompanySummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiMeta {
  activeJobs: number;
  hiringCompanies: number;
  withSalary: number;
  lastScrapeAt: string | null;
  generation?: string;
}

export interface JobListItem {
  id: string;
  ashbyId: string;
  title: string;
  applyUrl: string;
  companySlug: string;
  companyName: string;
  companyLogoUrl?: string | null;
  department?: string | null;
  location?: string | null;
  country?: string | null;
  region?: string | null;
  city?: string | null;
  isRemote: boolean;
  workplaceType?: WorkplaceType | null;
  employmentType?: EmploymentType | null;
  publishedAt?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  salaryInterval?: SalaryInterval | null;
  isListed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface JobDetail extends JobListItem {
  jobUrl: string;
  active: boolean;
  team?: string | null;
  descriptionHtml?: string | null;
  descriptionPlain?: string | null;
  postalAddress?: PostalAddress | null;
  secondaryLocations?: string[];
  company: CompanySummary;
}

export interface FacetCount {
  value: string;
  label?: string;
  count: number;
}

export interface FacetsData {
  workplaceTypes: FacetCount[];
  employmentTypes: FacetCount[];
  countries: FacetCount[];
  departments: FacetCount[];
  hasSalary: { yes: number; no: number };
}

export interface PaginationMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface JobsResponse {
  data: JobListItem[];
  meta: PaginationMeta;
  facets?: FacetsData;
}

export interface JobsQueryParams {
  search?: string;
  company?: string;
  department?: string;
  location?: string;
  country?: string;
  city?: string;
  workplaceType?: WorkplaceType | '';
  employmentType?: EmploymentType | '';
  isRemote?: boolean;
  hasSalary?: boolean;
  salaryMin?: number;
  salaryInterval?: SalaryInterval;
  sortBy?: 'publishedAt' | 'salary' | 'title' | 'company';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}
