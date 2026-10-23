/**
 * @file RTK Query API slice for Ashby Job Scraper
 * @summary Redux Toolkit data fetching and caching with Redux-driven rate limiting
 */

import { 
  createApi, 
  fetchBaseQuery, 
  BaseQueryFn, 
  FetchArgs, 
  FetchBaseQueryError 
} from '@reduxjs/toolkit/query/react';
import { 
  JobsResponse, 
  JobsQueryParams, 
  JobDetail, 
  FacetsData, 
  CompanySummary 
} from '../../types/api';
import { recordRequestTimestamp } from '../slices/rateLimitSlice';

const apiHost = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const baseUrl = apiHost ? (apiHost.endsWith('/v1') ? apiHost : `${apiHost}/v1`) : '/v1';

const rawBaseQuery = fetchBaseQuery({ 
  baseUrl,
  prepareHeaders: (headers) => {
    headers.set('Accept', 'application/json');
    return headers;
  }
});

// Custom baseQuery that enforces 10 requests per 1 minute window using Redux state
const baseQueryWithRateLimit: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  api,
  extraOptions
) => {
  const state = api.getState() as any;
  const now = Date.now();
  const windowMs = state.rateLimit?.windowMs || 60000;
  const maxRequests = state.rateLimit?.maxRequests || 10;
  const timestamps: number[] = state.rateLimit?.timestamps || [];

  const recent = timestamps.filter((t) => now - t < windowMs);
  if (recent.length >= maxRequests) {
    const oldest = recent[0];
    const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    return {
      error: {
        status: 429,
        data: {
          message: `Client rate limit active: maximum 10 requests per 1 minute allowed. Please wait ${retryAfterSec}s. Data is cached in Redux.`,
          retryAfterSec,
        },
      },
    };
  }

  // Record this request in the Redux store
  api.dispatch(recordRequestTimestamp(now));

  // Perform network call
  return rawBaseQuery(args, api, extraOptions);
};

export const jobsApi = createApi({
  reducerPath: 'jobsApi',
  // Keep unused cache entries in the Redux store for 10 minutes (600 seconds)
  keepUnusedDataFor: 600,
  refetchOnFocus: false,
  refetchOnReconnect: false,
  refetchOnMountOrArgChange: false,
  baseQuery: baseQueryWithRateLimit,
  tagTypes: ['Jobs', 'JobDetail', 'Companies', 'Facets'],
  endpoints: (builder) => ({
    getJobs: builder.query<JobsResponse, JobsQueryParams>({
      keepUnusedDataFor: 600,
      query: (params) => {
        const queryParams = new URLSearchParams();
        Object.entries(params)
          .sort(([a], [b]) => a.localeCompare(b))
          .forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '' && value !== false) {
              queryParams.append(key, String(value));
            }
          });
        return `jobs?${queryParams.toString()}`;
      },
      providesTags: ['Jobs'],
    }),

    getJobById: builder.query<JobDetail, string>({
      keepUnusedDataFor: 600,
      query: (id) => `jobs/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'JobDetail', id }],
    }),

    getFacets: builder.query<FacetsData, void>({
      keepUnusedDataFor: 600,
      query: () => 'facets',
      providesTags: ['Facets'],
    }),

    getCompanies: builder.query<{ data: CompanySummary[]; total: number }, { search?: string; page?: number; pageSize?: number }>({
      keepUnusedDataFor: 600,
      query: (params) => {
        const queryParams = new URLSearchParams();
        if (params.search && params.search.trim()) queryParams.append('search', params.search.trim());
        if (params.page) queryParams.append('page', String(params.page));
        if (params.pageSize) queryParams.append('pageSize', String(params.pageSize));
        return `companies?${queryParams.toString()}`;
      },
      providesTags: ['Companies'],
    }),
  }),
});

export const {
  useGetJobsQuery,
  useGetJobByIdQuery,
  useGetFacetsQuery,
  useGetCompaniesQuery,
} = jobsApi;
