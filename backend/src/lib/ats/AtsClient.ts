/**
 * @file Multi-source ATS client abstractions
 * @summary Common interfaces and data models for ATS board fetching, job normalization, and company metadata retrieval
 * @tags ATS, Interface, Normalization, Multi-source, ADR-0021
 */

import { ValidationIssue } from '../Sanitizer';
import { AtsSource } from './source';

export interface BoardRef {
  slug: string;
  source: AtsSource;
  atsToken: string;
}

export interface NormalizedSalary {
  min: number | null;
  max: number | null;
  currency: string | null;
  interval: string | null;
}

export interface NormalizedPostal {
  addressCountry?: string;
  addressRegion?: string;
  addressLocality?: string;
  [key: string]: unknown;
}

export interface NormalizedJob {
  externalId: string;
  legacyKey: string; // Global identifier for Job.ashbyId
  title: string;
  department: string | null;
  location: string | null;
  employmentType?: string | null;
  applyUrl: string;
  jobUrl: string;
  isRemote: boolean;
  workplaceType?: string | null;
  isListed: boolean;
  publishedAt?: Date | null;
  sourceUpdatedAt?: Date | null;
  postal?: NormalizedPostal | null;
  salary: NormalizedSalary | null;
  descriptionHtml?: string | null;
  descriptionPlain?: string | null;
  team?: string | null;
  secondaryLocations?: Array<{ location?: string } | string> | null;
  country?: string | null;
  region?: string | null;
  city?: string | null;
  raw: Record<string, unknown>; // Sanitized metadata payload including _source
}

export interface BoardFetchResult {
  slug: string;
  source: AtsSource;
  jobs: NormalizedJob[];
  notFound: boolean;
  rateLimited?: boolean;
  fetchMode: 'primary' | 'fallback' | 'none';
  validationIssues?: ValidationIssue[];
  failure?: {
    kind: 'http' | 'timeout' | 'network';
    status?: number;
    code?: string;
    attempts: number;
  };
}

export interface CompanyMetadataResult {
  status: 'ok' | 'not_found' | 'rate_limited' | 'error';
  name?: string;
  logoUrl?: string;
  retryAfterSeconds?: number;
}

export interface CanonicalUrls {
  jobUrl: string;
  applyUrl: string;
  boardUrl: string;
}

export interface AtsClient {
  readonly source: AtsSource;
  fetchBoard(
    ref: BoardRef,
    opts?: { includeCompensation?: boolean; maxRetries?: number; baseDelayMs?: number }
  ): Promise<BoardFetchResult>;
  fetchCompanyMetadata(ref: BoardRef): Promise<CompanyMetadataResult>;
  canonicalUrls(ref: BoardRef, externalId: string): CanonicalUrls;
}
