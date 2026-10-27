/**
 * @file API Type Definitions for Ashby Job Scraper UI
 * @summary Single source of truth for UI API contract, aligned with backend/docs/api.md and contract fixtures
 */

export type WorkplaceType = 'Remote' | 'OnSite' | 'Hybrid';
export type EmploymentType = 'FullTime' | 'PartTime' | 'Contract' | 'Intern' | 'Temporary';
export type SalaryInterval = '1 YEAR' | '1 HOUR' | '1 MONTH' | '1 WEEK' | '1 DAY';
export type LastUpdatedSource = 'ashby' | 'detected' | 'published' | 'firstSeen';

export interface CompanySummary {
  slug: string;
  name: string | null;
  logoUrl?: string | null;
  jobCount?: number;
}

export interface CompanyDetail {
  name: string | null;
  slug: string;
  logoUrl: string | null;
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

export interface HealthResponse {
  status: 'ok' | 'degraded';
  activeJobs: number;
  version: string;
  time: string;
  cache: {
    configured: boolean;
    state: string;
    generation: string | null;
    builtAt: string | null;
    latencyMs: number | null;
    mode: string | null;
  };
  data: {
    lastScrapeAt: string | null;
    ageHours: number | null;
    fresh: boolean;
    stale: boolean;
  };
  db: {
    checked: boolean;
    status?: string;
    error?: string;
  };
}

export interface JobListItem {
  id: string;
  ashbyId: string;
  title: string;
  companySlug: string;
  companyName: string | null;
  companyLogoUrl: string | null;
  department: string | null;
  location: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  isRemote: boolean;
  workplaceType: WorkplaceType | string | null;
  employmentType: EmploymentType | string | null;
  publishedAt: string | null;
  lastUpdatedAt: string | null;
  lastUpdatedSource: LastUpdatedSource | string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryInterval: SalaryInterval | string | null;
  applyUrl: string;
  isListed: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface JobDetail extends Omit<JobListItem, 'createdAt' | 'updatedAt' | 'companyName' | 'companyLogoUrl'> {
  companyName: string | null;
  companyLogoUrl: string | null;
  jobUrl: string;
  active: boolean;
  team: string | null;
  descriptionHtml: string;
  descriptionPlain: string;
  secondaryLocations: string[];
  companyJobCount: number;
  company: CompanyDetail | null;
}

export interface FacetCount {
  value: string;
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
}

export interface JobsQueryParams {
  search?: string;
  country?: string;
  workplaceType?: WorkplaceType | '';
  employmentType?: EmploymentType | '';
  isRemote?: boolean;
  hasSalary?: boolean;
  salaryMin?: number;
  salaryInterval?: SalaryInterval;
  sortBy?: 'publishedAt' | 'salary' | 'company';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}
