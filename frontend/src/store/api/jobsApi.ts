/**
 * @file RTK Query API slice for Ashby Job Scraper
 * @summary Redux Toolkit data fetching and caching with read-through cache support
 */

import { 
  createApi, 
  fetchBaseQuery, 
} from '@reduxjs/toolkit/query/react';
import { 
  JobsResponse, 
  JobsQueryParams, 
  JobDetail, 
  FacetsData, 
  CompaniesResponse,
  CompanyProfile,
  CompanyQueryParams,
  ApiMeta
} from '../../types/api';

const apiHost = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const baseUrl = apiHost ? (apiHost.endsWith('/v1') ? apiHost : `${apiHost}/v1`) : '/v1';

const rawBaseQuery = fetchBaseQuery({ 
  baseUrl,
  prepareHeaders: (headers) => {
    headers.set('Accept', 'application/json');
    return headers;
  }
});

export function buildJobsQueryParams(params: JobsQueryParams): string {
  const queryParams = new URLSearchParams();
  Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([key, value]) => {
      if (value !== undefined && value !== null && (value as unknown) !== '' && (value as unknown) !== false) {
        if (key === 'salaryInterval' && (params.salaryMin === undefined || params.salaryMin === null || isNaN(Number(params.salaryMin)))) {
          return;
        }
        queryParams.append(key, String(value));
      }
    });
  return queryParams.toString();
}

export const jobsApi = createApi({
  reducerPath: 'jobsApi',
  // Keep unused cache entries in the Redux store for 10 minutes (600 seconds)
  keepUnusedDataFor: 600,
  refetchOnFocus: false,
  refetchOnReconnect: false,
  refetchOnMountOrArgChange: false,
  baseQuery: rawBaseQuery,
  tagTypes: ['Jobs', 'JobDetail', 'Companies', 'Facets', 'Meta'],
  endpoints: (builder) => ({
    getJobs: builder.query<JobsResponse, JobsQueryParams>({
      keepUnusedDataFor: 600,
      query: (params) => `jobs?${buildJobsQueryParams(params)}`,
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

    getCompanies: builder.query<CompaniesResponse, CompanyQueryParams>({
      keepUnusedDataFor: 600,
      query: (params) => {
        const queryParams = new URLSearchParams();
        if (params.search && params.search.trim()) queryParams.append('search', params.search.trim());
        if (params.page) queryParams.append('page', String(params.page));
        if (params.pageSize) queryParams.append('pageSize', String(params.pageSize));
        if (params.sort) queryParams.append('sort', params.sort);
        return `companies?${queryParams.toString()}`;
      },
      providesTags: ['Companies'],
    }),

    getCompanyProfile: builder.query<CompanyProfile, string>({
      keepUnusedDataFor: 600,
      query: (slug) => `companies/${encodeURIComponent(slug)}`,
      providesTags: (_result, _error, slug) => [{ type: 'Companies', id: slug }],
    }),

    getMeta: builder.query<ApiMeta, void>({
      keepUnusedDataFor: 300,
      query: () => 'meta',
      providesTags: ['Meta'],
    }),
  }),
});

export const {
  useGetJobsQuery,
  useGetJobByIdQuery,
  useGetFacetsQuery,
  useGetCompaniesQuery,
  useGetCompanyProfileQuery,
  useGetMetaQuery,
  usePrefetch,
} = jobsApi;
