/**
 * @file Enrichment Step Contract & Registry
 * @summary Defines the pluggable enrichment step interface, shared counters, and default step factory registry
 * @tags enrichment, step, pipeline, registry, BF-027
 */

import { AttrsConfidence, EnrichmentInput, JobAttributes } from './types';
import { buildModelStep } from './model/modelStep';
import { createRulesStep } from './rulesStep';

export interface PickedJob extends EnrichmentInput {
  attrsConfidence: AttrsConfidence | null;
  descHash: string;
}

export interface EnrichCounts {
  picked: number;
  rulesHigh: number;
  rulesLow: number;
  modelCalls: number;
  modelAccepted: number;
  modelRejected: number;
  modelErrors: number;
  modelTokensIn: number;
  modelTokensOut: number;
  written: number;
}

export interface StepRunContext {
  counts: EnrichCounts;
  modelTried: Set<string>;
  modelMaxCalls: number;
}

export interface EnrichmentStep {
  readonly name: 'rules' | 'model';
  readonly exhausted?: boolean;
  run(
    jobs: PickedJob[],
    prior: Map<string, JobAttributes>,
    ctx?: StepRunContext
  ): Promise<Map<string, JobAttributes>>;
}

export interface StepOptions {
  modelMaxCalls: number;
  env: NodeJS.ProcessEnv;
  deadlineAt: number;
}

export type StepFactory = (opts: StepOptions) => EnrichmentStep | null;

/** Default pipeline steps run on each batch: rules first, optional Gemini model step when enabled. */
export const DEFAULT_STEP_FACTORIES: StepFactory[] = [
  () => createRulesStep(),
  (o: StepOptions) =>
    buildModelStep(o.env, { maxCalls: o.modelMaxCalls, deadlineAt: o.deadlineAt }),
];

/**
 * @summary Instantiates enabled enrichment steps in factory order, dropping disabled null entries
 */
export function buildSteps(
  opts: StepOptions,
  factories: StepFactory[] = DEFAULT_STEP_FACTORIES
): EnrichmentStep[] {
  const steps: EnrichmentStep[] = [];
  for (const factory of factories) {
    const step = factory(opts);
    if (step !== null) {
      steps.push(step);
    }
  }
  return steps;
}

/**
 * @summary Returns true when an active, non-exhausted model step should receive low-confidence rows
 */
export function isModelEnabled(steps: EnrichmentStep[]): boolean {
  return steps.some((s) => s.name === 'model' && !s.exhausted);
}

/**
 * @summary Returns true when a model step is registered, ignoring exhausted state, for remaining counts
 */
export function hasModelStep(steps: EnrichmentStep[]): boolean {
  return steps.some((s) => s.name === 'model');
}

/**
 * @summary Creates a zeroed EnrichCounts object for a new enrichment pass
 */
export function emptyCounts(): EnrichCounts {
  return {
    picked: 0,
    rulesHigh: 0,
    rulesLow: 0,
    modelCalls: 0,
    modelAccepted: 0,
    modelRejected: 0,
    modelErrors: 0,
    modelTokensIn: 0,
    modelTokensOut: 0,
    written: 0,
  };
}
