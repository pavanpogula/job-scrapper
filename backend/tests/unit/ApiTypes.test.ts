/**
 * @file ApiTypes Type-Level and Runtime Validation Suite
 * @summary Validates public DTO types, type-level Equal<> assertions, query return signatures, and runtime error guards
 * @tags API, Types, DTO, Contracts, Tests
 */

import { toJobListItem, toJobDetail } from '../../src/api/contract';
import {
  queryJobs,
  queryJobDetail,
  computeFacets,
  queryCompanies,
} from '../../src/api/db/queries';
import {
  isHttpError,
  parseJobQueryParams,
  parseCompanyQueryParams,
} from '../../src/api/types';
import type {
  JobListItemDTO,
  JobDetailDTO,
  CompanyDetailDTO,
  CompanySummaryDTO,
  CompaniesResponseDTO,
  PaginationMetaDTO,
  JobsResponseDTO,
  FacetCountDTO,
  FacetsResponseDTO,
  MetaResponseDTO,
  HealthResponseDTO,
  ErrorResponseDTO,
  HttpError,
} from '../../src/api/types';

// ============================================================================
// Type-Level Testing Utilities (Equal & Expect)
// ============================================================================

export type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends
  (<T>() => T extends Y ? 1 : 2) ? true : false;

export type Expect<T extends true> = T;

// 1. Mapper return types match DTOs
type _TestToJobListItem = Expect<Equal<ReturnType<typeof toJobListItem>, JobListItemDTO>>;
type _TestToJobDetail = Expect<Equal<ReturnType<typeof toJobDetail>, JobDetailDTO>>;

// 2. Query function return promises match response DTOs
type _TestQueryJobs = Expect<Equal<ReturnType<typeof queryJobs>, Promise<JobsResponseDTO>>>;
type _TestQueryJobDetail = Expect<Equal<ReturnType<typeof queryJobDetail>, Promise<JobDetailDTO | null>>>;
type _TestComputeFacets = Expect<Equal<ReturnType<typeof computeFacets>, Promise<FacetsResponseDTO>>>;
type _TestQueryCompanies = Expect<Equal<ReturnType<typeof queryCompanies>, Promise<CompaniesResponseDTO>>>;

// 3. Field nullability & typing checks on JobListItemDTO
type _TestJobId = Expect<Equal<JobListItemDTO['id'], string>>;
type _TestJobTitle = Expect<Equal<JobListItemDTO['title'], string>>;
type _TestJobIsRemote = Expect<Equal<JobListItemDTO['isRemote'], boolean>>;
type _TestJobSalaryMin = Expect<Equal<JobListItemDTO['salaryMin'], number | null>>;
type _TestJobPublishedAt = Expect<Equal<JobListItemDTO['publishedAt'], string | null>>;

// 4. JobDetailDTO fields
type _TestDetailSecondaryLocs = Expect<Equal<JobDetailDTO['secondaryLocations'], string[]>>;
type _TestDetailCompany = Expect<Equal<JobDetailDTO['company'], CompanyDetailDTO | null>>;

// 5. Facet types
type _TestFacetsCountries = Expect<Equal<FacetsResponseDTO['countries'], FacetCountDTO[]>>;
type _TestFacetsHasSalary = Expect<Equal<FacetsResponseDTO['hasSalary'], { yes: number; no: number }>>;

// 6. Meta & Health
type _TestMetaActiveJobs = Expect<Equal<MetaResponseDTO['activeJobs'], number>>;
type _TestHealthStatus = Expect<Equal<HealthResponseDTO['status'], 'ok' | 'degraded'>>;

// 7. Error response
type _TestErrorMsg = Expect<Equal<ErrorResponseDTO['error'], string>>;

// 8. CompanySummary and PaginationMeta DTOs
type _TestCompanySummary = Expect<Equal<CompanySummaryDTO['name'], string | null>>;
type _TestPaginationTotal = Expect<Equal<PaginationMetaDTO['total'], number>>;
type _TestHttpError = Expect<Equal<HttpError['status'], number>>;

// ============================================================================
// Runtime Unit Tests
// ============================================================================

describe('ApiTypes Runtime Validations (P7)', () => {
  describe('isHttpError', () => {
    it('returns true for objects with a numeric status property', () => {
      const err: HttpError = Object.assign(new Error('Overloaded'), {
        status: 503,
        code: 'UPSTREAM_UNAVAILABLE',
        retryAfterSeconds: 5,
      });

      expect(isHttpError(err)).toBe(true);
      if (isHttpError(err)) {
        expect(err.status).toBe(503);
        expect(err.code).toBe('UPSTREAM_UNAVAILABLE');
        expect(err.retryAfterSeconds).toBe(5);
      }
    });

    it('returns false for generic errors without a numeric status', () => {
      expect(isHttpError(new Error('Normal error'))).toBe(false);
      expect(isHttpError({ message: 'No status' })).toBe(false);
      expect(isHttpError(null)).toBe(false);
      expect(isHttpError(undefined)).toBe(false);
      expect(isHttpError('some string')).toBe(false);
      expect(isHttpError({ status: '503' })).toBe(false);
    });
  });

  describe('parseJobQueryParams', () => {
    it('sanitizes and parses query string arguments into typed JobQueryParams', () => {
      const raw = {
        search: '  Engineer  ',
        workplaceType: 'Remote',
        employmentType: 'FullTime',
        country: 'US',
        isRemote: 'true',
        hasSalary: 'true',
        salaryMin: '100000',
        salaryInterval: '1 YEAR',
        sortBy: 'salary',
        sortOrder: 'asc',
        page: '2',
        pageSize: '50',
      };

      const parsed = parseJobQueryParams(raw);
      expect(parsed).toEqual({
        search: '  Engineer  ',
        workplaceType: 'Remote',
        employmentType: 'FullTime',
        country: 'US',
        isRemote: 'true',
        hasSalary: 'true',
        salaryMin: '100000',
        salaryInterval: '1 YEAR',
        sortBy: 'salary',
        sortOrder: 'asc',
        page: '2',
        pageSize: '50',
      });
    });

    it('handles arrays and missing properties cleanly', () => {
      const raw = {
        search: ['First', 'Second'],
        unrelated: 'ignored',
      };

      const parsed = parseJobQueryParams(raw);
      expect(parsed.search).toBe('First');
      expect((parsed as Record<string, unknown>).unrelated).toBeUndefined();
    });
  });

  describe('parseCompanyQueryParams', () => {
    it('parses company query parameters accurately', () => {
      const raw = {
        search: 'Acme',
        page: '3',
        pageSize: '10',
      };

      const parsed = parseCompanyQueryParams(raw);
      expect(parsed).toEqual({
        search: 'Acme',
        page: '3',
        pageSize: '10',
      });
    });
  });
});
