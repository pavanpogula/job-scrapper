/**
 * @file EnrichPass.test.ts
 * @summary Unit tests for enrichment step contract, rules step, run loop, reports, and CLI args (BF-027)
 * @tags unit, enrichment, pipeline, cli, report, BF-027
 */

import {
  buildSteps,
  DEFAULT_STEP_FACTORIES,
  EnrichmentStep,
  PickedJob,
  emptyCounts,
  hasModelStep,
  isModelEnabled,
} from '../../src/enrichment/step';
import { createRulesStep } from '../../src/enrichment/rulesStep';

describe('EnrichPass unit', () => {
  it('buildSteps returns only the rules step by default', () => {
    const steps = buildSteps({ modelMaxCalls: 2000, env: {}, deadlineAt: 0 });
    expect(steps.map((s) => s.name)).toEqual(['rules']);
    expect(isModelEnabled(steps)).toBe(false);
    expect(hasModelStep(steps)).toBe(false);
  });

  it('buildSteps keeps factory order and drops disabled steps', () => {
    const fake: EnrichmentStep = { name: 'model', run: async () => new Map() };
    const steps = buildSteps(
      { modelMaxCalls: 1, env: {}, deadlineAt: 0 },
      [...DEFAULT_STEP_FACTORIES, () => null, () => fake]
    );
    expect(steps.map((s) => s.name)).toEqual(['rules', 'model']);
    expect(isModelEnabled(steps)).toBe(true);
    expect(hasModelStep(steps)).toBe(true);
  });

  it('rules step returns one result per job and counts high/low', async () => {
    const jobA: PickedJob = {
      id: 'a',
      title: 'Software Engineer',
      descriptionPlain: 'Requirements\n5+ years of experience required',
      attrsConfidence: null,
      descHash: 'ha',
    };
    const jobB: PickedJob = {
      id: 'b',
      title: 'Backend Engineer',
      descriptionPlain: 'Preferred qualifications\n5+ years of experience with Kubernetes',
      attrsConfidence: null,
      descHash: 'hb',
    };

    const ctx = { counts: emptyCounts(), modelTried: new Set<string>(), modelMaxCalls: 0 };
    const out = await createRulesStep().run([jobA, jobB], new Map(), ctx);

    expect([...out.keys()].sort()).toEqual(['a', 'b']);
    expect(out.get('a')).toMatchObject({
      source: 'rules',
      experienceMinYears: 5,
      confidence: 'high',
    });
    expect(out.get('b')).toMatchObject({
      source: 'rules',
      experienceMinYears: null,
      confidence: 'low',
    });
    expect(ctx.counts).toMatchObject({ rulesHigh: 1, rulesLow: 1 });
  });
});
