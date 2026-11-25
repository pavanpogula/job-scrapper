/**
 * @file Unit tests for enrichment ModelStep and buildModelStep
 * @summary Verifies low-confidence routing, call cap, deadline, error handling, answer validation, and env gating (BF-027)
 * @tags test, unit, enrichment, model, step, BF-027
 */

import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_GEMINI_MODEL } from '../../src/enrichment/model/GeminiClient';
import { ModelAnswer, ModelCallError, ModelClient } from '../../src/enrichment/model/ModelClient';
import { buildModelStep, ModelStep } from '../../src/enrichment/model/modelStep';
import { emptyCounts, PickedJob, StepRunContext } from '../../src/enrichment/step';
import type { JobAttributes } from '../../src/enrichment/types';

const FIXTURE_PATH = path.resolve(__dirname, '../fixtures/job-attributes/model-step.json');
const FIXTURE_JOBS = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8')) as PickedJob[];

const VALID_LOW_A_ANSWER: ModelAnswer = {
  minYears: 7,
  clearanceRequired: true,
  yearsEvidence: 'You have 7+ years of software engineering experience.',
  clearanceEvidence: 'Must be able to obtain a Secret clearance.',
};

const VALID_LOW_B_ANSWER: ModelAnswer = {
  minYears: null,
  clearanceRequired: false,
  yearsEvidence: null,
  clearanceEvidence: null,
};

function makePrior(jobs: PickedJob[]): Map<string, JobAttributes> {
  const prior = new Map<string, JobAttributes>();
  for (const job of jobs) {
    prior.set(job.id, {
      experienceMinYears: job.id === 'high-c' ? 5 : null,
      clearanceRequired: false,
      confidence: job.attrsConfidence === 'high' ? 'high' : 'low',
      source: 'rules',
      evidence: {},
    });
  }
  return prior;
}

function makeCtx(modelMaxCalls = 2000): StepRunContext {
  return {
    counts: emptyCounts(),
    modelTried: new Set<string>(),
    modelMaxCalls,
  };
}

describe('ModelStep and buildModelStep', () => {
  it('only low-confidence jobs are sent', async () => {
    const classify = jest.fn<Promise<ModelAnswer>, [unknown]>()
      .mockResolvedValueOnce(VALID_LOW_A_ANSWER)
      .mockResolvedValueOnce(VALID_LOW_B_ANSWER);
    const client: ModelClient = { classify };
    const step = new ModelStep({ client, maxCalls: 10 });
    const ctx = makeCtx(10);

    await step.run(FIXTURE_JOBS, makePrior(FIXTURE_JOBS), ctx);

    expect(classify).toHaveBeenCalledTimes(2);
    expect(classify.mock.calls.map((c) => (c[0] as { id: string }).id)).toEqual([
      'low-a',
      'low-b',
    ]);
  });

  it('respects model-max-calls', async () => {
    const fiveLow: PickedJob[] = [1, 2, 3, 4, 5].map((n) => ({
      id: `low-${n}`,
      title: 'Engineer',
      descriptionPlain: `Role ${n} with distributed systems.`,
      attrsConfidence: 'low',
      descHash: `h-${n}`,
    }));
    const classify = jest.fn<Promise<ModelAnswer>, [unknown]>().mockResolvedValue(VALID_LOW_B_ANSWER);
    const step = new ModelStep({ client: { classify }, maxCalls: 2 });
    const ctx = makeCtx(2);

    const updates = await step.run(fiveLow, makePrior(fiveLow), ctx);

    expect(classify).toHaveBeenCalledTimes(2);
    expect(ctx.counts.modelCalls).toBe(2);
    expect(step.stoppedBy).toBe('maxCalls');
    expect(step.exhausted).toBe(true);
    expect(updates.size).toBe(2);
    expect(updates.has('low-3')).toBe(false);
    expect(updates.has('low-4')).toBe(false);
    expect(updates.has('low-5')).toBe(false);

    const secondUpdates = await step.run(fiveLow.slice(2), makePrior(fiveLow.slice(2)), ctx);
    expect(classify).toHaveBeenCalledTimes(2);
    expect(secondUpdates.size).toBe(0);
  });

  it('maxCalls 0 makes no calls', async () => {
    const classify = jest.fn<Promise<ModelAnswer>, [unknown]>();
    const step = new ModelStep({ client: { classify }, maxCalls: 0 });
    const ctx = makeCtx(0);

    const updates = await step.run(FIXTURE_JOBS, makePrior(FIXTURE_JOBS), ctx);

    expect(classify).not.toHaveBeenCalled();
    expect(step.stoppedBy).toBe('maxCalls');
    expect(step.exhausted).toBe(true);
    expect(updates.size).toBe(0);
  });

  it('stops at deadline', async () => {
    const classify1 = jest.fn<Promise<ModelAnswer>, [unknown]>();
    const stepAtDeadline = new ModelStep({
      client: { classify: classify1 },
      maxCalls: 10,
      deadlineAt: 100_000,
      now: () => 100_000,
    });
    await stepAtDeadline.run(FIXTURE_JOBS, makePrior(FIXTURE_JOBS), makeCtx(10));
    expect(classify1).not.toHaveBeenCalled();
    expect(stepAtDeadline.stoppedBy).toBe('deadline');
    expect(stepAtDeadline.exhausted).toBe(true);

    let tick = 0;
    const classify2 = jest.fn<Promise<ModelAnswer>, [unknown]>()
      .mockResolvedValue(VALID_LOW_A_ANSWER);
    const stepBeforeDeadline = new ModelStep({
      client: { classify: classify2 },
      maxCalls: 10,
      deadlineAt: 100_000,
      now: () => {
        tick += 1;
        return tick === 1 ? 99_999 : 100_000;
      },
    });
    const lowOnly = [
      {
        id: 'low-a',
        title: FIXTURE_JOBS[0].title,
        descriptionPlain:
          'You have 7+ years of software engineering experience. 3+ years in Go preferred. Must be able to obtain a Secret clearance.',
        attrsConfidence: 'low' as const,
        descHash: 'hash-low-a',
      },
      {
        id: 'low-b',
        title: FIXTURE_JOBS[1].title,
        descriptionPlain: 'Experience with Spark. 2-4 years preferred, 5 years a plus.',
        attrsConfidence: 'low' as const,
        descHash: 'hash-low-b',
      },
    ];
    await stepBeforeDeadline.run(lowOnly, makePrior(lowOnly), makeCtx(10));
    expect(classify2).toHaveBeenCalledTimes(1);
    expect(stepBeforeDeadline.stoppedBy).toBe('deadline');
    expect(stepBeforeDeadline.exhausted).toBe(true);
  });

  it('timeout keeps rules answer', async () => {
    const classify = jest
      .fn<Promise<ModelAnswer>, [unknown]>()
      .mockRejectedValueOnce(new ModelCallError('timeout', undefined, 4));
    const singleLow: PickedJob[] = [
      {
        id: 'low-b',
        title: 'Data Engineer',
        descriptionPlain: 'Experience with Spark. 2-4 years preferred, 5 years a plus.',
        attrsConfidence: 'low',
        descHash: 'hash-low-b',
      },
    ];
    const step = new ModelStep({ client: { classify }, maxCalls: 10 });
    const ctx = makeCtx(10);

    const updates = await step.run(singleLow, makePrior(singleLow), ctx);

    expect(updates.size).toBe(0);
    expect(ctx.counts.modelErrors).toBe(1);
    expect(ctx.modelTried.size).toBe(0);
  });

  it('bad JSON keeps rules answer', async () => {
    const classify = jest
      .fn<Promise<ModelAnswer>, [unknown]>()
      .mockRejectedValueOnce(new ModelCallError('bad_json', 200, 1));
    const singleLow: PickedJob[] = [
      {
        id: 'low-b',
        title: 'Data Engineer',
        descriptionPlain: 'Experience with Spark. 2-4 years preferred, 5 years a plus.',
        attrsConfidence: 'low',
        descHash: 'hash-low-b',
      },
    ];
    const step = new ModelStep({ client: { classify }, maxCalls: 10 });
    const ctx = makeCtx(10);

    const updates = await step.run(singleLow, makePrior(singleLow), ctx);

    expect(updates.size).toBe(0);
    expect(ctx.counts.modelErrors).toBe(1);
    expect(ctx.modelTried.has('low-b')).toBe(true);
  });

  it('blocked response keeps rules answer', async () => {
    const classify = jest
      .fn<Promise<ModelAnswer>, [unknown]>()
      .mockRejectedValueOnce(new ModelCallError('blocked', 200, 1));
    const singleLow: PickedJob[] = [
      {
        id: 'low-b',
        title: 'Data Engineer',
        descriptionPlain: 'Experience with Spark. 2-4 years preferred, 5 years a plus.',
        attrsConfidence: 'low',
        descHash: 'hash-low-b',
      },
    ];
    const step = new ModelStep({ client: { classify }, maxCalls: 10 });
    const ctx = makeCtx(10);

    const updates = await step.run(singleLow, makePrior(singleLow), ctx);

    expect(updates.size).toBe(0);
    expect(ctx.counts.modelErrors).toBe(1);
    expect(ctx.modelTried.has('low-b')).toBe(true);
  });

  it('stops calling after a non-retryable error', async () => {
    const log = jest.fn();
    const classify = jest
      .fn<Promise<ModelAnswer>, [unknown]>()
      .mockRejectedValueOnce(new ModelCallError('http', 402, 1));
    const twoLow: PickedJob[] = [
      {
        id: 'low-a',
        title: 'Software Engineer',
        descriptionPlain: '7+ years experience.',
        attrsConfidence: 'low',
        descHash: 'h1',
      },
      {
        id: 'low-b',
        title: 'Data Engineer',
        descriptionPlain: '5 years experience.',
        attrsConfidence: 'low',
        descHash: 'h2',
      },
    ];
    const step = new ModelStep({ client: { classify }, maxCalls: 10, log });
    const ctx = makeCtx(10);

    const updates = await step.run(twoLow, makePrior(twoLow), ctx);

    expect(classify).toHaveBeenCalledTimes(1);
    expect(updates.size).toBe(0);
    expect(step.stoppedBy).toBe('fatal');
    expect(step.exhausted).toBe(true);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      'Model step stopped: Gemini returned HTTP 402; rules answers kept for the rest of the run.'
    );
  });

  it('accepted answer replaces rules answer', async () => {
    const lowA: PickedJob[] = [
      {
        id: 'low-a',
        title: 'Software Engineer',
        descriptionPlain:
          'You have 7+ years of software engineering experience. 3+ years in Go preferred. Must be able to obtain a Secret clearance.',
        attrsConfidence: 'low',
        descHash: 'hash-low-a',
      },
    ];

    const classifyAccepted = jest
      .fn<Promise<ModelAnswer>, [unknown]>()
      .mockResolvedValueOnce(VALID_LOW_A_ANSWER);
    const stepAccepted = new ModelStep({ client: { classify: classifyAccepted }, maxCalls: 10 });
    const ctx1 = makeCtx(10);
    const updates1 = await stepAccepted.run(lowA, makePrior(lowA), ctx1);

    expect(ctx1.counts.modelAccepted).toBe(1);
    expect(ctx1.counts.modelRejected).toBe(0);
    expect(ctx1.modelTried.has('low-a')).toBe(true);
    expect(updates1.get('low-a')).toMatchObject({
      source: 'model',
      confidence: 'high',
      experienceMinYears: 7,
      clearanceRequired: true,
    });

    const classifyRejected = jest.fn<Promise<ModelAnswer>, [unknown]>().mockResolvedValueOnce({
      ...VALID_LOW_A_ANSWER,
      minYears: 9,
      yearsEvidence: 'You have 9+ years of experience.',
    });
    const stepRejected = new ModelStep({ client: { classify: classifyRejected }, maxCalls: 10 });
    const ctx2 = makeCtx(10);
    const updates2 = await stepRejected.run(lowA, makePrior(lowA), ctx2);

    expect(ctx2.counts.modelAccepted).toBe(0);
    expect(ctx2.counts.modelRejected).toBe(1);
    expect(updates2.has('low-a')).toBe(false);
    expect(ctx2.modelTried.has('low-a')).toBe(true);
  });

  it('not registered without key', () => {
    const log1 = jest.fn();
    expect(buildModelStep({ GEMINI_ENABLED: 'true' }, { maxCalls: 1, log: log1 })).toBeNull();
    expect(log1).toHaveBeenCalledTimes(1);
    expect(log1).toHaveBeenCalledWith(
      "Model step off (GEMINI_ENABLED is not 'true' or GEMINI_API_KEY is not set); rules decide every job."
    );

    const log2 = jest.fn();
    expect(
      buildModelStep({ GEMINI_API_KEY: 'sk-test-123' }, { maxCalls: 1, log: log2 })
    ).toBeNull();
    expect(log2).toHaveBeenCalledTimes(1);
    expect(log2).toHaveBeenCalledWith(
      "Model step off (GEMINI_ENABLED is not 'true' or GEMINI_API_KEY is not set); rules decide every job."
    );
    expect(log2.mock.calls.flat().join('\n')).not.toContain('sk-test-123');
  });

  it('registered with flag and key', () => {
    const logDefault = jest.fn();
    const stepDefault = buildModelStep(
      { GEMINI_ENABLED: 'true', GEMINI_API_KEY: 'sk-test-123' },
      { maxCalls: 250, log: logDefault }
    );
    expect(stepDefault).toBeInstanceOf(ModelStep);
    expect(logDefault).toHaveBeenCalledWith(
      `Model step on: model ${DEFAULT_GEMINI_MODEL}, max 250 calls.`
    );
    expect(logDefault.mock.calls.flat().join('\n')).not.toContain('sk-test-123');

    const logCustom = jest.fn();
    const stepCustom = buildModelStep(
      {
        GEMINI_ENABLED: 'true',
        GEMINI_API_KEY: 'sk-test-456',
        GEMINI_MODEL: 'gemini-2.5-flash-lite',
      },
      { maxCalls: 100, log: logCustom }
    );
    expect(stepCustom).toBeInstanceOf(ModelStep);
    expect(logCustom).toHaveBeenCalledWith(
      'Model step on: model gemini-2.5-flash-lite, max 100 calls.'
    );
    expect(logCustom.mock.calls.flat().join('\n')).not.toContain('sk-test-456');
  });
});
