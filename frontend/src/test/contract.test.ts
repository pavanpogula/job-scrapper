/**
 * @file contract.test.ts
 * @summary Contract tests asserting that UI types strictly match API responses and shared fixture shapes.
 * @tags contract, types, fixtures, parity, p8a
 */

import { describe, it, expect } from 'vitest';
import jobsDefault from './fixtures/contract/jobs.default.json';
import jobsFiltered from './fixtures/contract/jobs.filtered.json';
import jobsEmpty from './fixtures/contract/jobs.empty.json';
import jobDetailFound from './fixtures/contract/job-detail.found.json';
import jobDetailNotFound from './fixtures/contract/job-detail.not-found.json';
import facetsDefault from './fixtures/contract/facets.default.json';
import companiesDefault from './fixtures/contract/companies.default.json';
import metaDefault from './fixtures/contract/meta.default.json';
import error404 from './fixtures/contract/error.404.json';

import type {
  JobsResponse,
  JobDetail,
  JobListItem,
  FacetsData,
  CompaniesResponse,
  CompanySummary,
  CompanyDetail,
  PaginationMeta,
  ApiMeta,
} from '../types/api';

interface ErrorResponse {
  error: string;
}

// Compile-time checks: fixtures satisfy frontend types without any type assertions or casts
jobsDefault satisfies JobsResponse;
jobsFiltered satisfies JobsResponse;
jobsEmpty satisfies JobsResponse;
jobDetailFound satisfies JobDetail;
facetsDefault satisfies FacetsData;
companiesDefault satisfies CompaniesResponse;
metaDefault satisfies ApiMeta;
error404 satisfies ErrorResponse;
jobDetailNotFound satisfies ErrorResponse;

// Type-level assertion helper: proves tuple contains every single key of T exactly
type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;

const JOB_LIST_ITEM_KEYS = [
  'id',
  'ashbyId',
  'title',
  'companySlug',
  'companyName',
  'companyLogoUrl',
  'department',
  'location',
  'country',
  'region',
  'city',
  'isRemote',
  'workplaceType',
  'employmentType',
  'publishedAt',
  'lastUpdatedAt',
  'lastUpdatedSource',
  'salaryMin',
  'salaryMax',
  'salaryCurrency',
  'salaryInterval',
  'applyUrl',
  'isListed',
  'createdAt',
  'updatedAt',
] as const satisfies readonly (keyof JobListItem)[];
type _AssertJobListItemKeys = Equal<typeof JOB_LIST_ITEM_KEYS[number], keyof JobListItem>;
const _checkJobListItemKeys: _AssertJobListItemKeys = true;

const JOB_DETAIL_KEYS = [
  'id',
  'ashbyId',
  'title',
  'applyUrl',
  'jobUrl',
  'companySlug',
  'companyName',
  'companyLogoUrl',
  'department',
  'location',
  'country',
  'region',
  'city',
  'isRemote',
  'workplaceType',
  'employmentType',
  'publishedAt',
  'lastUpdatedAt',
  'lastUpdatedSource',
  'salaryMin',
  'salaryMax',
  'salaryCurrency',
  'salaryInterval',
  'isListed',
  'active',
  'descriptionHtml',
  'descriptionPlain',
  'team',
  'secondaryLocations',
  'companyJobCount',
  'company',
] as const satisfies readonly (keyof JobDetail)[];
type _AssertJobDetailKeys = Equal<typeof JOB_DETAIL_KEYS[number], keyof JobDetail>;
const _checkJobDetailKeys: _AssertJobDetailKeys = true;

const PAGINATION_META_KEYS = [
  'total',
  'page',
  'pageSize',
  'totalPages',
  'hasNext',
  'hasPrev',
] as const satisfies readonly (keyof PaginationMeta)[];
type _AssertPaginationMetaKeys = Equal<typeof PAGINATION_META_KEYS[number], keyof PaginationMeta>;
const _checkPaginationMetaKeys: _AssertPaginationMetaKeys = true;

const JOBS_RESPONSE_KEYS = [
  'data',
  'meta',
] as const satisfies readonly (keyof JobsResponse)[];
type _AssertJobsResponseKeys = Equal<typeof JOBS_RESPONSE_KEYS[number], keyof JobsResponse>;
const _checkJobsResponseKeys: _AssertJobsResponseKeys = true;

const FACETS_DATA_KEYS = [
  'workplaceTypes',
  'employmentTypes',
  'countries',
  'departments',
  'hasSalary',
] as const satisfies readonly (keyof FacetsData)[];
type _AssertFacetsDataKeys = Equal<typeof FACETS_DATA_KEYS[number], keyof FacetsData>;
const _checkFacetsDataKeys: _AssertFacetsDataKeys = true;

const COMPANIES_RESPONSE_KEYS = [
  'data',
  'total',
  'page',
  'pageSize',
  'totalPages',
] as const satisfies readonly (keyof CompaniesResponse)[];
type _AssertCompaniesResponseKeys = Equal<typeof COMPANIES_RESPONSE_KEYS[number], keyof CompaniesResponse>;
const _checkCompaniesResponseKeys: _AssertCompaniesResponseKeys = true;

const COMPANY_SUMMARY_KEYS = [
  'slug',
  'name',
  'logoUrl',
  'jobCount',
] as const satisfies readonly (keyof CompanySummary)[];
type _AssertCompanySummaryKeys = Equal<typeof COMPANY_SUMMARY_KEYS[number], keyof CompanySummary>;
const _checkCompanySummaryKeys: _AssertCompanySummaryKeys = true;

const COMPANY_DETAIL_KEYS = [
  'name',
  'slug',
  'logoUrl',
] as const satisfies readonly (keyof CompanyDetail)[];
type _AssertCompanyDetailKeys = Equal<typeof COMPANY_DETAIL_KEYS[number], keyof CompanyDetail>;
const _checkCompanyDetailKeys: _AssertCompanyDetailKeys = true;

const API_META_KEYS = [
  'activeJobs',
  'hiringCompanies',
  'withSalary',
  'lastScrapeAt',
  'generation',
] as const satisfies readonly (keyof ApiMeta)[];
type _AssertApiMetaKeys = Equal<typeof API_META_KEYS[number], keyof ApiMeta>;
const _checkApiMetaKeys: _AssertApiMetaKeys = true;

const ERROR_RESPONSE_KEYS = [
  'error',
] as const satisfies readonly (keyof ErrorResponse)[];
type _AssertErrorResponseKeys = Equal<typeof ERROR_RESPONSE_KEYS[number], keyof ErrorResponse>;
const _checkErrorResponseKeys: _AssertErrorResponseKeys = true;

describe('P8a: Frontend API Contract Parity & Fixture Validation', () => {
  it('validates compile-time key exhaustiveness assertions', () => {
    expect(_checkJobListItemKeys).toBe(true);
    expect(_checkJobDetailKeys).toBe(true);
    expect(_checkPaginationMetaKeys).toBe(true);
    expect(_checkJobsResponseKeys).toBe(true);
    expect(_checkFacetsDataKeys).toBe(true);
    expect(_checkCompaniesResponseKeys).toBe(true);
    expect(_checkCompanySummaryKeys).toBe(true);
    expect(_checkCompanyDetailKeys).toBe(true);
    expect(_checkApiMetaKeys).toBe(true);
    expect(_checkErrorResponseKeys).toBe(true);
  });

  describe('GET /v1/jobs fixtures', () => {
    it('validates jobs.default.json matches exact response and item shape', () => {
      expect(Object.keys(jobsDefault).sort()).toEqual([...JOBS_RESPONSE_KEYS].sort());
      expect(jobsDefault.data.length).toBeGreaterThan(0);
      for (const job of jobsDefault.data) {
        expect(Object.keys(job).sort()).toEqual([...JOB_LIST_ITEM_KEYS].sort());
      }
      expect(Object.keys(jobsDefault.meta).sort()).toEqual([...PAGINATION_META_KEYS].sort());
    });

    it('validates jobs.filtered.json matches exact response and item shape', () => {
      expect(Object.keys(jobsFiltered).sort()).toEqual([...JOBS_RESPONSE_KEYS].sort());
      expect(jobsFiltered.data.length).toBeGreaterThan(0);
      for (const job of jobsFiltered.data) {
        expect(Object.keys(job).sort()).toEqual([...JOB_LIST_ITEM_KEYS].sort());
      }
      expect(Object.keys(jobsFiltered.meta).sort()).toEqual([...PAGINATION_META_KEYS].sort());
    });

    it('validates jobs.empty.json matches exact response and empty data shape', () => {
      expect(Object.keys(jobsEmpty).sort()).toEqual([...JOBS_RESPONSE_KEYS].sort());
      expect(jobsEmpty.data).toEqual([]);
      expect(Object.keys(jobsEmpty.meta).sort()).toEqual([...PAGINATION_META_KEYS].sort());
      expect(jobsEmpty.meta.total).toBe(0);
    });
  });

  describe('GET /v1/jobs/:id fixtures', () => {
    it('validates job-detail.found.json matches exact JobDetail shape', () => {
      expect(Object.keys(jobDetailFound).sort()).toEqual([...JOB_DETAIL_KEYS].sort());
      expect(jobDetailFound.company).not.toBeNull();
      expect(Object.keys(jobDetailFound.company!).sort()).toEqual([...COMPANY_DETAIL_KEYS].sort());
      // O3: JobDetail omits createdAt and updatedAt
      expect('createdAt' in jobDetailFound).toBe(false);
      expect('updatedAt' in jobDetailFound).toBe(false);
      // ADR-0018: lastUpdatedAt and lastUpdatedSource exist
      expect('lastUpdatedAt' in jobDetailFound).toBe(true);
      expect('lastUpdatedSource' in jobDetailFound).toBe(true);
    });

    it('validates job-detail.not-found.json matches error shape', () => {
      expect(Object.keys(jobDetailNotFound).sort()).toEqual([...ERROR_RESPONSE_KEYS].sort());
      expect(jobDetailNotFound.error).toBe('Job not found');
    });
  });

  describe('GET /v1/facets fixtures', () => {
    it('validates facets.default.json matches exact FacetsData shape', () => {
      expect(Object.keys(facetsDefault).sort()).toEqual([...FACETS_DATA_KEYS].sort());
      expect(Array.isArray(facetsDefault.workplaceTypes)).toBe(true);
      expect(Array.isArray(facetsDefault.countries)).toBe(true);
      expect(typeof facetsDefault.hasSalary.yes).toBe('number');
      expect(typeof facetsDefault.hasSalary.no).toBe('number');
    });
  });

  describe('GET /v1/companies fixtures', () => {
    it('validates companies.default.json matches exact CompaniesResponse shape', () => {
      expect(Object.keys(companiesDefault).sort()).toEqual([...COMPANIES_RESPONSE_KEYS].sort());
      expect(companiesDefault.data.length).toBeGreaterThan(0);
      // Exact key set for every company: a field the API stops sending (or the UI type drops) must fail here
      for (const company of companiesDefault.data) {
        expect(Object.keys(company).sort()).toEqual([...COMPANY_SUMMARY_KEYS].sort());
      }
    });
  });

  describe('GET /v1/meta fixtures', () => {
    it('validates meta.default.json matches exact ApiMeta shape', () => {
      expect(Object.keys(metaDefault).sort()).toEqual([...API_META_KEYS].sort());
      expect(typeof metaDefault.activeJobs).toBe('number');
      expect(typeof metaDefault.hiringCompanies).toBe('number');
      expect(typeof metaDefault.withSalary).toBe('number');
    });
  });

  describe('404 Error fixture', () => {
    it('validates error.404.json matches error shape', () => {
      expect(Object.keys(error404).sort()).toEqual([...ERROR_RESPONSE_KEYS].sort());
      expect(error404.error).toBe('Job not found');
    });
  });
});
