/**
 * @file Deterministic Rules Enrichment Step
 * @summary Pipeline step wrapping extractAttributesByRules for picked job batches
 * @tags enrichment, rules, step, BF-027
 */

import { extractAttributesByRules } from './rules';
import type { EnrichmentStep, PickedJob, StepRunContext } from './step';
import type { JobAttributes } from './types';

/**
 * @summary Creates the deterministic rules step that classifies every job in a picked batch
 */
export function createRulesStep(): EnrichmentStep {
  return {
    name: 'rules',
    async run(
      jobs: PickedJob[],
      _prior: Map<string, JobAttributes>,
      ctx?: StepRunContext
    ): Promise<Map<string, JobAttributes>> {
      const results = new Map<string, JobAttributes>();
      for (const job of jobs) {
        const attrs = extractAttributesByRules({
          id: job.id,
          title: job.title,
          descriptionPlain: job.descriptionPlain,
        });
        results.set(job.id, attrs);
        if (ctx) {
          if (attrs.confidence === 'high') {
            ctx.counts.rulesHigh += 1;
          } else {
            ctx.counts.rulesLow += 1;
          }
        }
      }
      return results;
    },
  };
}
