/**
 * @file Job Attribute Rules Combiner
 * @summary Pure combiner invoking years and clearance rule extractors to produce typed JobAttributes
 * @tags enrichment, rules, combiner, job-attributes, BF-026
 */

import { EnrichmentInput, JobAttributes } from '../types';
import { extractMinYears } from './years';
import { detectClearance } from './clearance';

/**
 * @summary Extracts minimum years, security clearance, confidence, and sparse evidence using deterministic rules
 */
export function extractAttributesByRules(input: EnrichmentInput): JobAttributes {
  const years = extractMinYears(input.descriptionPlain);
  const clearance = detectClearance(`${input.title}\n${input.descriptionPlain}`);

  const evidence: JobAttributes['evidence'] = {};
  if (years.evidence !== null) {
    evidence.years = years.evidence;
  }
  if (clearance.evidence !== null) {
    evidence.clearance = clearance.evidence;
  }

  return {
    experienceMinYears: years.value,
    clearanceRequired: clearance.required,
    confidence: years.ambiguous || clearance.ambiguous ? 'low' : 'high',
    source: 'rules',
    evidence,
  };
}
