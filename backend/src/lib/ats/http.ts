/**
 * @file Shared ATS HTTP Retry, Rate-Limit, and Failure Classification Helpers
 * @summary Provides retryable error detection, Retry-After header parsing (10s cap), backoff calculation, and structured failure classification for ATS clients
 * @tags ATS, HTTP, Retry, Rate Limiting, Backoff, BF-015, BF-023
 */

import axios from 'axios';

export interface FetchFailureInfo {
  kind: 'http' | 'timeout' | 'network';
  status?: number;
  code?: string;
  attempts: number;
}

interface ErrorWithResponseAndCode {
  isAxiosError?: boolean;
  code?: string;
  message?: string;
  response?: {
    status?: number;
    headers?: Record<string, unknown>;
  };
}

/**
 * @summary Narrows an unknown caught value to an error object shape with optional response/code fields
 */
function asErrorObject(error: unknown): ErrorWithResponseAndCode | null {
  if (!error || typeof error !== 'object') return null;
  return error as ErrorWithResponseAndCode;
}

/**
 * @summary Extracts the HTTP status code from an Axios or mock error if present
 */
export function getHttpStatus(error: unknown): number | undefined {
  const errObj = asErrorObject(error);
  if (!errObj) return undefined;
  const status = errObj.response?.status;
  return typeof status === 'number' ? status : undefined;
}

/**
 * @summary Extracts response headers from an Axios or mock error if present
 */
export function getErrorHeaders(error: unknown): Record<string, unknown> | undefined {
  const errObj = asErrorObject(error);
  if (!errObj || !errObj.response?.headers || typeof errObj.response.headers !== 'object') {
    return undefined;
  }
  return errObj.response.headers;
}

/**
 * @summary Determines whether an HTTP/network error is transient and should be retried
 */
export function isRetryableError(error: unknown): boolean {
  const errObj = asErrorObject(error);
  if (!errObj) return false;
  const status = errObj.response?.status;
  if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) {
    return true;
  }
  const code = errObj.code;
  if (code === 'ECONNABORTED' || code === 'ETIMEDOUT' || code === 'ECONNRESET') {
    return true;
  }
  return false;
}

/**
 * @summary Parses Retry-After header in seconds, capped at maxSeconds (default 10s per BF-015)
 */
export function parseRetryAfterSeconds(
  headers: Record<string, unknown> | undefined,
  maxSeconds = 10
): number | undefined {
  if (!headers) return undefined;
  const raw = headers['retry-after'] ?? headers['Retry-After'];
  if (raw === undefined || raw === null) return undefined;
  const parsed = parseInt(String(raw), 10);
  if (!Number.isNaN(parsed) && parsed > 0) {
    return Math.min(parsed, maxSeconds);
  }
  return undefined;
}

/**
 * @summary Computes backoff delay in milliseconds, honoring Retry-After on HTTP 429 (capped at 10s)
 */
export function computeRetryDelayMs(
  attempt: number,
  baseDelayMs: number,
  status?: number,
  headers?: Record<string, unknown>
): number {
  let delay = baseDelayMs * Math.pow(2, attempt) + Math.floor(Math.random() * 100);
  if (status === 429) {
    const retryAfterSec = parseRetryAfterSeconds(headers, 10);
    if (retryAfterSec !== undefined) {
      delay = retryAfterSec * 1000;
    }
  }
  return delay;
}

/**
 * @summary Classifies an exhausted fetch error into http, timeout, or network failure metadata
 */
export function classifyFetchFailure(
  lastError: unknown,
  attemptsCount: number
): FetchFailureInfo {
  const errObj = asErrorObject(lastError);
  const isAxiosErr = axios.isAxiosError(lastError) || Boolean(errObj?.isAxiosError);
  const status = isAxiosErr ? getHttpStatus(lastError) : undefined;

  let failureKind: 'http' | 'timeout' | 'network' = 'http';
  let failureCode: string | undefined;

  if (status) {
    failureKind = 'http';
    failureCode = `http/${status}/${attemptsCount}`;
  } else if (
    errObj?.code === 'ECONNABORTED' ||
    errObj?.code === 'ETIMEDOUT' ||
    (typeof errObj?.message === 'string' && errObj.message.toLowerCase().includes('timeout'))
  ) {
    failureKind = 'timeout';
    failureCode = 'timeout';
  } else {
    failureKind = 'network';
    failureCode = errObj?.code || 'network';
  }

  return {
    kind: failureKind,
    status,
    code: failureCode,
    attempts: attemptsCount,
  };
}
