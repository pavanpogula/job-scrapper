/**
 * @file Enrichment model client contract
 * @summary ModelAnswer, ModelClient, ModelUsage and ModelCallError shared by the Gemini client and the model step
 * @tags Enrichment, Model, Errors, BF-027
 */

import type { EnrichmentInput } from '../types';

/** Structured answer returned by a model classifier before rule validation. */
export interface ModelAnswer {
  minYears: number | null;
  clearanceRequired: boolean;
  yearsEvidence: string | null;
  clearanceEvidence: string | null;
}

/** Contract implemented by LLM backends for low-confidence job enrichment. */
export interface ModelClient {
  /**
   * @summary Classifies one job posting into structured years and clearance evidence
   */
  classify(input: EnrichmentInput): Promise<ModelAnswer>;
}

/** Token and call counters reported by a ModelClient instance. */
export interface ModelUsage {
  calls: number;
  promptTokens: number;
  outputTokens: number;
}

/** Normalized failure categories produced by ModelClient implementations. */
export type ModelErrorKind = 'http' | 'timeout' | 'network' | 'bad_json' | 'blocked';

const FATAL_HTTP_STATUSES: ReadonlySet<number> = new Set([400, 401, 402, 403, 404]);

/**
 * Safe error wrapper thrown by GeminiClient without attaching headers, keys, query params, or request payloads.
 */
export class ModelCallError extends Error {
  /**
   * @summary Builds a redacted ModelCallError with kind, optional HTTP status, and attempt count
   */
  constructor(
    readonly kind: ModelErrorKind,
    readonly status: number | undefined,
    readonly attempts: number
  ) {
    super(`Gemini ${kind}${status ? ' ' + status : ''} after ${attempts} attempt(s)`);
    this.name = 'ModelCallError';
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * @summary True when an HTTP 200 response arrived (bad_json, blocked) so the row counts as tried
   */
  get responded(): boolean {
    return this.kind === 'bad_json' || this.kind === 'blocked';
  }

  /**
   * @summary True for non-retryable auth/billing/model errors (400/401/402/403/404) that stop the step
   */
  get fatal(): boolean {
    return this.status !== undefined && FATAL_HTTP_STATUSES.has(this.status);
  }
}
