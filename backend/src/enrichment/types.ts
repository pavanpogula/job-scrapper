/**
 * @file Job Attribute Enrichment Types
 * @summary Shared TypeScript interfaces and types for pure job attribute extraction
 * @tags enrichment, types, job-attributes, ADR-0023
 */

export type AttrsConfidence = 'high' | 'low';
export type AttrsSource = 'rules' | 'model';

export interface EnrichmentInput {
  id: string;
  title: string;
  descriptionPlain: string;
}

export interface JobAttributes {
  experienceMinYears: number | null;
  clearanceRequired: boolean;
  confidence: AttrsConfidence;
  source: AttrsSource;
  evidence: {
    years?: string;
    clearance?: string;
  };
}
