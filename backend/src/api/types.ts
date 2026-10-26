/**
 * @file API Data Transfer Objects (DTOs) and Contract Types
 * @summary Single source of truth for public HTTP API response contracts, request query parameters, and error types
 * @tags API, DTO, Contract, Types
 */

/**
 * Single job item in paginated job listings (/v1/jobs)
 */
export interface JobListItemDTO {
  /** Internal UUID identifier (e.g. '00000000-0000-4000-8000-000000000001') */
  id: string;
  /** Ashby ATS identifier string */
  ashbyId: string;
  /** Public job title */
  title: string;
  /** Company slug identifier */
  companySlug: string;
  /** Company display name, or null if company record is unassociated */
  companyName: string | null;
  /** Company logo URL, or null if not provided */
  companyLogoUrl: string | null;
  /** Department name, or null if unassigned */
  department: string | null;
  /** Primary location display name, or null if not specified */
  location: string | null;
  /** ISO-3166-1 alpha-2 country code (e.g. 'US', 'CA'), or null */
  country: string | null;
  /** State/province/region name, or null */
  region: string | null;
  /** City name, or null */
  city: string | null;
  /** True if the posting is designated as fully remote */
  isRemote: boolean;
  /** Workplace classification: 'Remote' | 'Hybrid' | 'OnSite', or null */
  workplaceType: string | null;
  /** Employment type: 'FullTime' | 'PartTime' | 'Contract' | 'Intern' | 'Temporary', or null */
  employmentType: string | null;
  /** Publication timestamp in ISO-8601 UTC format, or null */
  publishedAt: string | null;
  /** Last updated timestamp in ISO-8601 UTC format, or null */
  lastUpdatedAt: string | null;
  /** Provenance of the last updated timestamp: 'ashby' | 'detected' | 'published' | 'firstSeen', or null */
  lastUpdatedSource: 'ashby' | 'detected' | 'published' | 'firstSeen' | null;
  /** Minimum annual or interval salary figure in major units (e.g. 100000 for USD), or null */
  salaryMin: number | null;
  /** Maximum annual or interval salary figure in major units, or null */
  salaryMax: number | null;
  /** 3-letter currency code (e.g. 'USD', 'CAD', 'EUR'), or null */
  salaryCurrency: string | null;
  /** Salary payment frequency interval (e.g. '1 YEAR', '1 MONTH', '1 HOUR'), or null */
  salaryInterval: string | null;
  /** Direct apply URL linking to candidate application form */
  applyUrl: string;
  /** True if posting is publicly listed; false if unlisted or private */
  isListed: boolean;
  /** Record creation timestamp in ISO-8601 UTC format, or null */
  createdAt: string | null;
  /** Record update timestamp in ISO-8601 UTC format, or null */
  updatedAt: string | null;
}

/**
 * Embedded company details inside single job detail response
 */
export interface CompanyDetailDTO {
  /** Company display name, or null */
  name: string | null;
  /** Company slug identifier */
  slug: string;
  /** Company logo URL, or null */
  logoUrl: string | null;
}

/**
 * Full job details for single job endpoint (/v1/jobs/:id)
 */
export interface JobDetailDTO {
  /** Internal UUID identifier */
  id: string;
  /** Ashby ATS identifier string */
  ashbyId: string;
  /** Public job title */
  title: string;
  /** Direct apply URL linking to application form */
  applyUrl: string;
  /** Canonical Ashby job posting URL */
  jobUrl: string;
  /** Company slug identifier */
  companySlug: string;
  /** Company display name, or null */
  companyName: string | null;
  /** Company logo URL, or null */
  companyLogoUrl: string | null;
  /** Department display name, or null */
  department: string | null;
  /** Primary location display name, or null */
  location: string | null;
  /** ISO-3166-1 alpha-2 country code, or null */
  country: string | null;
  /** State/province/region name, or null */
  region: string | null;
  /** City name, or null */
  city: string | null;
  /** True if designated as fully remote */
  isRemote: boolean;
  /** Workplace classification: 'Remote' | 'Hybrid' | 'OnSite', or null */
  workplaceType: string | null;
  /** Employment type: 'FullTime' | 'PartTime' | 'Contract' | 'Intern' | 'Temporary', or null */
  employmentType: string | null;
  /** Publication timestamp in ISO-8601 UTC format, or null */
  publishedAt: string | null;
  /** Last updated timestamp in ISO-8601 UTC format, or null */
  lastUpdatedAt: string | null;
  /** Provenance of the last updated timestamp: 'ashby' | 'detected' | 'published' | 'firstSeen', or null */
  lastUpdatedSource: 'ashby' | 'detected' | 'published' | 'firstSeen' | null;
  /** Minimum salary figure in major units, or null */
  salaryMin: number | null;
  /** Maximum salary figure in major units, or null */
  salaryMax: number | null;
  /** 3-letter currency code (e.g. 'USD'), or null */
  salaryCurrency: string | null;
  /** Salary payment frequency interval (e.g. '1 YEAR'), or null */
  salaryInterval: string | null;
  /** True if posting is publicly listed */
  isListed: boolean;
  /** True if job posting is active; false if archived or closed */
  active: boolean;
  /** Full job description in HTML format */
  descriptionHtml: string;
  /** Full job description stripped to plain text */
  descriptionPlain: string;
  /** Team name within organization, or null */
  team: string | null;
  /** Secondary or alternative office location names */
  secondaryLocations: string[];
  /** Count of active jobs at this company */
  companyJobCount: number;
  /** Embedded company summary object, or null */
  company: CompanyDetailDTO | null;
}

/**
 * Company summary item in /v1/companies listing
 */
export interface CompanySummaryDTO {
  /** Unique company slug identifier */
  slug: string;
  /** Company display name, or null */
  name: string | null;
  /** Company logo URL, or null */
  logoUrl: string | null;
  /** Total count of active, listed jobs currently open at this company */
  jobCount: number;
}

/**
 * Paginated companies response (/v1/companies)
 */
export interface CompaniesResponseDTO {
  /** Array of active company summaries */
  data: CompanySummaryDTO[];
  /** Total number of active companies matching query */
  total: number;
  /** Current 1-based page number */
  page: number;
  /** Maximum number of records per page (default 30, max 100) */
  pageSize: number;
  /** Total number of pages available */
  totalPages: number;
}

/**
 * Pagination metadata envelope for list endpoints
 */
export interface PaginationMetaDTO {
  /** Total count of matching records across all pages */
  total: number;
  /** Current 1-based page number */
  page: number;
  /** Page size limit applied to query */
  pageSize: number;
  /** Total number of pages available (minimum 1) */
  totalPages: number;
  /** True if next page exists */
  hasNext: boolean;
  /** True if previous page exists */
  hasPrev: boolean;
}

/**
 * Paginated jobs response envelope (/v1/jobs)
 */
export interface JobsResponseDTO {
  /** Array of job listing items */
  data: JobListItemDTO[];
  /** Pagination metadata */
  meta: PaginationMetaDTO;
}

/**
 * Single facet item containing a category value and its match count
 */
export interface FacetCountDTO {
  /** Facet value string (e.g. 'Remote', 'US', 'Engineering') */
  value: string;
  /** Count of active postings with this value */
  count: number;
}

/**
 * Aggregated facets response (/v1/facets)
 */
export interface FacetsResponseDTO {
  /** Breakdown by workplace type ('Remote', 'Hybrid', 'OnSite') */
  workplaceTypes: FacetCountDTO[];
  /** Breakdown by employment type ('FullTime', 'Contract', etc.) */
  employmentTypes: FacetCountDTO[];
  /** Top country codes sorted by frequency */
  countries: FacetCountDTO[];
  /** Top departments sorted by frequency */
  departments: FacetCountDTO[];
  /** Counts of jobs with and without specified compensation */
  hasSalary: {
    /** Number of active jobs with salaryMin or salaryMax */
    yes: number;
    /** Number of active jobs without salary data */
    no: number;
  };
}

/**
 * Overall system metadata response (/v1/meta)
 */
export interface MetaResponseDTO {
  /** Total count of currently active and listed jobs in the system */
  activeJobs: number;
  /** Total count of active companies with at least one active listed job */
  hiringCompanies: number;
  /** Total count of active jobs that include salary compensation data */
  withSalary: number;
  /** Timestamp of most recent successful scrape in ISO-8601 UTC format, or null */
  lastScrapeAt: string | null;
  /** Active cache generation identifier string (e.g. 'g20260301T120000Z-c5a0' or 'live_db') */
  generation: string;
}

/**
 * Health check endpoint response (/health)
 */
export interface HealthResponseDTO {
  /** Overall service status: 'ok' or 'degraded' */
  status: 'ok' | 'degraded';
  /** Total count of active listed jobs */
  activeJobs: number;
  /** Deployed commit SHA or 'dev' */
  version: string;
  /** Current server timestamp in ISO-8601 UTC format */
  time: string;
  /** Cache layer telemetry */
  cache: {
    /** True if Upstash Redis credentials are configured */
    configured: boolean;
    /** Cache operational state ('ok', 'degraded', 'not_configured', 'bypass') */
    state: string;
    /** Active cache generation identifier, or null */
    generation: string | null;
    /** Generation build timestamp in ISO-8601 UTC format, or null */
    builtAt: string | null;
    /** Round-trip ping latency to Redis in milliseconds */
    latencyMs: number;
    /** Cache mode ('redis', 'mock', or null) */
    mode: string | null;
  };
  /** Data freshness indicators */
  data: {
    /** Scrape timestamp from cache manifest in ISO-8601 UTC format, or null */
    lastScrapeAt: string | null;
    /** Data age in hours since last scrape, or null */
    ageHours: number | null;
    /** True if last scrape completed within 26 hours */
    fresh: boolean;
    /** True if last scrape was more than 36 hours ago */
    stale: boolean;
  };
  /** Database probe status (populated on deep check with valid token) */
  db: {
    /** True if deep database check was executed */
    checked: boolean;
    /** Database status ('ok' or 'error'), undefined if not checked */
    status?: string;
    /** Error message if database query failed, undefined otherwise */
    error?: string;
  };
}

/**
 * Standard public API error response payload
 */
export interface ErrorResponseDTO {
  /** Human-readable error description */
  error: string;
  /** Machine-readable error code (e.g. 'UPSTREAM_UNAVAILABLE'), optional */
  code?: string;
  /** Recommended retry backoff delay in seconds, optional */
  retryAfterSeconds?: number;
}

/**
 * Parsed and sanitized query parameters for /v1/jobs endpoint
 */
export interface JobQueryParams {
  search?: string;
  workplaceType?: string;
  employmentType?: string;
  country?: string;
  isRemote?: string | boolean;
  hasSalary?: string | boolean;
  salaryMin?: string | number;
  salaryInterval?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: string | number;
  pageSize?: string | number;
}

/**
 * Parsed query parameters for /v1/companies endpoint
 */
export interface CompanyQueryParams {
  search?: string;
  page?: string | number;
  pageSize?: string | number;
}

/**
 * HTTP Error interface representing structured API errors with status codes
 */
export interface HttpError extends Error {
  status: number;
  code?: string;
  retryAfterSeconds?: number;
}

/**
 * Type guard to identify HttpError objects with numeric status codes
 */
export function isHttpError(e: unknown): e is HttpError {
  return (
    typeof e === 'object' &&
    e !== null &&
    'status' in e &&
    typeof (e as { status: unknown }).status === 'number'
  );
}

/**
 * Extracts a single string from a query parameter value
 */
function extractQueryString(val: unknown): string | undefined {
  if (typeof val === 'string') return val;
  if (Array.isArray(val) && typeof val[0] === 'string') return val[0];
  return undefined;
}

/**
 * Parses and sanitizes raw Express req.query parameters for /v1/jobs
 */
export function parseJobQueryParams(query: Record<string, unknown>): JobQueryParams {
  const params: JobQueryParams = {};
  const search = extractQueryString(query.search);
  if (search !== undefined) params.search = search;

  const workplaceType = extractQueryString(query.workplaceType);
  if (workplaceType !== undefined) params.workplaceType = workplaceType;

  const employmentType = extractQueryString(query.employmentType);
  if (employmentType !== undefined) params.employmentType = employmentType;

  const country = extractQueryString(query.country);
  if (country !== undefined) params.country = country;

  const isRemote = extractQueryString(query.isRemote);
  if (isRemote !== undefined) params.isRemote = isRemote;

  const hasSalary = extractQueryString(query.hasSalary);
  if (hasSalary !== undefined) params.hasSalary = hasSalary;

  const salaryMin = extractQueryString(query.salaryMin);
  if (salaryMin !== undefined) params.salaryMin = salaryMin;

  const salaryInterval = extractQueryString(query.salaryInterval);
  if (salaryInterval !== undefined) params.salaryInterval = salaryInterval;

  const sortBy = extractQueryString(query.sortBy);
  if (sortBy !== undefined) params.sortBy = sortBy;

  const sortOrder = extractQueryString(query.sortOrder);
  if (sortOrder === 'asc' || sortOrder === 'desc') params.sortOrder = sortOrder;

  const page = extractQueryString(query.page);
  if (page !== undefined) params.page = page;

  const pageSize = extractQueryString(query.pageSize);
  if (pageSize !== undefined) params.pageSize = pageSize;

  return params;
}

/**
 * Parses raw Express req.query parameters for /v1/companies
 */
export function parseCompanyQueryParams(query: Record<string, unknown>): CompanyQueryParams {
  const params: CompanyQueryParams = {};
  const search = extractQueryString(query.search);
  if (search !== undefined) params.search = search;

  const page = extractQueryString(query.page);
  if (page !== undefined) params.page = page;

  const pageSize = extractQueryString(query.pageSize);
  if (pageSize !== undefined) params.pageSize = pageSize;

  return params;
}
