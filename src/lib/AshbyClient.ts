/**
 * @file Ashby API Client with Browser GraphQL Fallback
 * @summary Fetches Ashby job boards with browser headers, retry/backoff, GraphQL fallback, and organization metadata extraction
 * @tags Ashby API, GraphQL, Fallback, Retry, Rate Limiting, Anti-Bot
 */

import axios from 'axios';
import { sanitizeJobBatch, ValidationIssue } from './Sanitizer';

/**
 * Browser-like HTTP headers to prevent WAF / bot-detection 403 blocks
 */
export const BROWSER_HEADERS = {
    'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9'
};

export interface AshbyCompensationComponent {
    compensationType: string;
    interval?: string;
    currencyCode?: string;
    minValue?: number | null;
    maxValue?: number | null;
}

export interface AshbyJob {
    id: string;
    title: string;
    department: string;
    location: string;
    employmentType: string;
    applyUrl: string;
    isRemote: boolean;
    workplaceType?: string;
    isListed?: boolean;
    address?: {
        postalAddress?: {
            addressLocality?: string;
            addressRegion?: string;
            addressCountry?: string;
        };
    };
    secondaryLocations?: Array<{
        location?: string;
        locationId?: string;
        locationName?: string;
        address?: {
            addressLocality?: string;
            addressRegion?: string;
            addressCountry?: string;
        };
    }>;
    team?: string;
    descriptionHtml?: string;
    descriptionPlain?: string;
    publishedAt?: string | null;
    compensationTier?: {
        min: number;
        max: number;
        currency: string;
        interval: string;
    };
    compensation?: {
        compensationTierSummary?: string | null;
        scrapeableCompensationSalarySummary?: string | null;
        summaryComponents?: AshbyCompensationComponent[];
        compensationTiers?: Array<{
            components?: AshbyCompensationComponent[];
        }>;
    };
    jobUrl: string;
}

export interface AshbyBoardFetchResult {
    slug: string;
    jobs: AshbyJob[];
    notFound: boolean;
    rateLimited?: boolean;
    source: 'rest' | 'graphql' | 'none';
    validationIssues?: ValidationIssue[];
}

export interface AshbyOrganizationMetadata {
    name?: string;
    logoUrl?: string;
}

const GRAPHQL_URL = 'https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams';

const GRAPHQL_JOB_BOARD_QUERY = `
query ApiJobBoardWithTeams($organizationHostedJobsPageName: String!) {
  jobBoard: jobBoardWithTeams(organizationHostedJobsPageName: $organizationHostedJobsPageName) {
    teams {
      id
      name
      parentTeamId
    }
    jobPostings {
      id
      title
      teamId
      locationId
      locationName
      workplaceType
      employmentType
      secondaryLocations {
        locationId
        locationName
      }
      compensationTierSummary
    }
  }
}
`;

/**
 * @summary Determines whether an Axios error is transient and should be retried
 */
export function isRetryableError(error: any): boolean {
    if (!error) return false;
    const status = error.response?.status;
    if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) {
        return true;
    }
    const code = error.code;
    if (code === 'ECONNABORTED' || code === 'ETIMEDOUT' || code === 'ECONNRESET') {
        return true;
    }
    return false;
}

/**
 * @summary Extracts normalized salary min, max, currency, and interval from Ashby compensation structures
 */
export function extractSalary(job: AshbyJob): {
    min?: number;
    max?: number;
    currency?: string;
    interval?: string;
} {
    // 1. Live Ashby Posting API shape: job.compensation.summaryComponents
    const summarySalary = job.compensation?.summaryComponents?.find(
        c => c.compensationType === 'Salary' && (c.minValue != null || c.maxValue != null)
    );
    if (summarySalary) {
        return {
            min: summarySalary.minValue ?? undefined,
            max: summarySalary.maxValue ?? undefined,
            currency: summarySalary.currencyCode ?? undefined,
            interval: summarySalary.interval ?? undefined
        };
    }

    // 2. Fallback to compensationTiers components
    if (job.compensation?.compensationTiers) {
        for (const tier of job.compensation.compensationTiers) {
            const comp = tier.components?.find(
                c => c.compensationType === 'Salary' && (c.minValue != null || c.maxValue != null)
            );
            if (comp) {
                return {
                    min: comp.minValue ?? undefined,
                    max: comp.maxValue ?? undefined,
                    currency: comp.currencyCode ?? undefined,
                    interval: comp.interval ?? undefined
                };
            }
        }
    }

    // 3. Legacy / test shape: job.compensationTier
    if (job.compensationTier) {
        return {
            min: job.compensationTier.min,
            max: job.compensationTier.max,
            currency: job.compensationTier.currency,
            interval: job.compensationTier.interval
        };
    }

    return {};
}

/**
 * @summary Queries Ashby's hosted job board GraphQL API (used by browser pages when Posting API is disabled)
 */
export async function fetchFromAshbyGraphQL(companySlug: string): Promise<{
    boardExists: boolean;
    jobs: AshbyJob[];
    validationIssues?: ValidationIssue[];
}> {
    try {
        const response = await axios.post(
            GRAPHQL_URL,
            {
                operationName: 'ApiJobBoardWithTeams',
                variables: { organizationHostedJobsPageName: companySlug },
                query: GRAPHQL_JOB_BOARD_QUERY
            },
            {
                timeout: 10000,
                headers: {
                    ...BROWSER_HEADERS,
                    'Content-Type': 'application/json',
                    'Origin': 'https://jobs.ashbyhq.com',
                    'Referer': `https://jobs.ashbyhq.com/${encodeURIComponent(companySlug)}`
                }
            }
        );

        const jobBoard = response?.data?.data?.jobBoard;
        if (!jobBoard || !Array.isArray(jobBoard.jobPostings)) {
            return { boardExists: false, jobs: [] };
        }

        const teamMap = new Map<string, string>();
        if (Array.isArray(jobBoard.teams)) {
            for (const team of jobBoard.teams) {
                if (team?.id && team?.name) {
                    teamMap.set(team.id, team.name);
                }
            }
        }

        const rawJobs: AshbyJob[] = jobBoard.jobPostings.map((posting: any) => ({
            id: posting.id,
            title: posting.title || '',
            department: (posting.teamId && teamMap.get(posting.teamId)) || '',
            location: posting.locationName || '',
            employmentType: posting.employmentType || '',
            applyUrl: `https://jobs.ashbyhq.com/${companySlug}/${posting.id}/application`,
            jobUrl: `https://jobs.ashbyhq.com/${companySlug}/${posting.id}`,
            isRemote: posting.workplaceType === 'Remote',
            workplaceType: posting.workplaceType || undefined,
            secondaryLocations: Array.isArray(posting.secondaryLocations) ? posting.secondaryLocations : [],
            compensation: posting.compensationTierSummary
                ? { compensationTierSummary: posting.compensationTierSummary }
                : undefined
        }));

        const { validJobs, issues } = sanitizeJobBatch(rawJobs, companySlug);
        return { boardExists: true, jobs: validJobs, validationIssues: issues };
    } catch {
        return { boardExists: false, jobs: [] };
    }
}

/**
 * @summary Extracts organization display name and logo URL from Ashby hosted page window.__appData
 */
export async function fetchOrganizationMetadata(
    companySlug: string
): Promise<AshbyOrganizationMetadata | null> {
    try {
        const response = await axios.get<string>(
            `https://jobs.ashbyhq.com/${encodeURIComponent(companySlug)}`,
            {
                timeout: 10000,
                headers: BROWSER_HEADERS
            }
        );
        const html = typeof response?.data === 'string' ? response.data : '';
        const match = html.match(/window\.__appData\s*=\s*(\{[\s\S]*?\});/);
        if (!match) return null;

        const appData = JSON.parse(match[1]);
        const org = appData?.organization;
        if (!org) return null;

        return {
            name: org.name || undefined,
            logoUrl:
                org.theme?.logoWordmarkImageUrl ||
                org.theme?.logoSquareImageUrl ||
                undefined
        };
    } catch {
        return null;
    }
}

/**
 * @summary Fetches jobs for a company using Ashby Posting API with retry/backoff and automatic GraphQL fallback
 */
export async function fetchAshbyBoardWithFallback(
    companySlug: string,
    options: { includeCompensation?: boolean; maxRetries?: number; baseDelayMs?: number } = {}
): Promise<AshbyBoardFetchResult> {
    const { includeCompensation = false, maxRetries = 2, baseDelayMs = 300 } = options;
    const query = includeCompensation ? '?includeCompensation=true' : '';
    const url = `https://api.ashbyhq.com/posting-api/job-board/${companySlug}${query}`;

    let lastError: any = null;
    let sawRateLimit = false;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const { data } = await axios.get<{ jobs: AshbyJob[] }>(url, {
                timeout: 10000,
                headers: BROWSER_HEADERS
            });
            const { validJobs, issues } = sanitizeJobBatch(data?.jobs || [], companySlug);
            return {
                slug: companySlug,
                jobs: validJobs,
                notFound: false,
                rateLimited: sawRateLimit,
                source: 'rest',
                validationIssues: issues
            };
        } catch (err: any) {
            lastError = err;
            if (err?.response?.status === 429 || err?.response?.status === 403) {
                sawRateLimit = true;
            }
            if (attempt < maxRetries && isRetryableError(err)) {
                const jitter = Math.floor(Math.random() * 100);
                const delay = baseDelayMs * Math.pow(2, attempt) + jitter;
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            break;
        }
    }

    const isAxiosErr = axios.isAxiosError(lastError) || Boolean(lastError?.isAxiosError);
    const status = isAxiosErr ? lastError?.response?.status : undefined;

    // If Posting API returned 404 or 403/400, try the browser GraphQL endpoint
    if (status === 404 || status === 403 || status === 400) {
        const gqlResult = await fetchFromAshbyGraphQL(companySlug);
        if (gqlResult.boardExists) {
            return {
                slug: companySlug,
                jobs: gqlResult.jobs,
                notFound: false,
                rateLimited: sawRateLimit,
                source: 'graphql',
                validationIssues: gqlResult.validationIssues
            };
        }

        if (status === 404) {
            return {
                slug: companySlug,
                jobs: [],
                notFound: true,
                rateLimited: sawRateLimit,
                source: 'none'
            };
        }
    }

    return {
        slug: companySlug,
        jobs: [],
        notFound: false,
        rateLimited: sawRateLimit,
        source: 'none'
    };
}
