/**
 * @file EnrichPass.test.ts
 * @summary Unit tests for enrichment step contract, rules step, run loop, reports, and CLI args (BF-027)
 * @tags unit, enrichment, pipeline, cli, report, BF-027
 */

import { PrismaClient } from '@prisma/client';
import * as stepModule from '../../src/enrichment/step';
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
import { runEnrichment, ENRICH_BATCH_SIZE } from '../../src/enrichment/run';

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

  function makeFakeJob(id: string, descriptionPlain = 'Requirements\n5+ years of experience'): PickedJob {
    return {
      id,
      title: `Engineer ${id}`,
      descriptionPlain,
      attrsConfidence: null,
      descHash: `hash-${id}`,
    };
  }

  it('processes batches in id order and passes afterId', async () => {
    const pickCalls: Array<{ limit: number; afterId?: string; modelEnabled: boolean }> = [];
    const write = jest.fn().mockImplementation(async (_p, rows) => rows.length);
    const count = jest.fn().mockResolvedValue(0);
    const pick = jest.fn().mockImplementation(async (_p, opts) => {
      pickCalls.push(opts);
      if (opts.afterId === undefined) {
        return [makeFakeJob('j1'), makeFakeJob('j2')];
      }
      if (opts.afterId === 'j2') {
        return [makeFakeJob('j3')];
      }
      return [];
    });

    const result = await runEnrichment(
      new PrismaClient(),
      { maxJobs: null, budgetMin: 10, dryRun: false, modelMaxCalls: 2000, batchSize: 2 },
      { pick, write, count, steps: [createRulesStep()], now: () => 100 }
    );

    expect(pickCalls.map((c) => c.afterId)).toEqual([undefined, 'j2', 'j3']);
    expect(result.stoppedBy).toBe('done');
    expect(result.picked).toBe(3);
    expect(result.written).toBe(3);
    expect(result.remaining).toBe(0);
  });

  it('budget stop', async () => {
    const times = [0, 0, 11 * 60_000, 11 * 60_000];
    let idx = 0;
    const now = (): number => times[idx++];

    const pick = jest.fn().mockResolvedValueOnce([makeFakeJob('j1')]);
    const write = jest.fn().mockResolvedValue(1);
    const count = jest.fn().mockResolvedValue(5);

    const result = await runEnrichment(
      new PrismaClient(),
      { maxJobs: null, budgetMin: 10, dryRun: false, modelMaxCalls: 2000 },
      { pick, write, count, steps: [createRulesStep()], now }
    );

    expect(pick).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(1);
    expect(result.stoppedBy).toBe('budget');
    expect(result.durationMs).toBe(660_000);
    expect(result.remaining).toBe(5);
  });

  it('maxJobs stop caps the last batch limit', async () => {
    const pickLimits: number[] = [];
    const pick = jest.fn().mockImplementation(async (_p, opts: { limit: number }) => {
      pickLimits.push(opts.limit);
      return Array.from({ length: opts.limit }, (_, i) => makeFakeJob(`id-${pickLimits.length}-${i}`));
    });
    const write = jest.fn().mockImplementation(async (_p, rows) => rows.length);
    const count = jest.fn().mockResolvedValue(10);

    const result = await runEnrichment(
      new PrismaClient(),
      { maxJobs: 700, budgetMin: 10, dryRun: false, modelMaxCalls: 2000 },
      { pick, write, count, steps: [createRulesStep()], now: () => 0 }
    );

    expect(ENRICH_BATCH_SIZE).toBe(500);
    expect(pickLimits).toEqual([500, 200]);
    expect(result.stoppedBy).toBe('maxJobs');
    expect(result.picked).toBe(700);
    expect(result.written).toBe(700);
  });

  it('dry run writes nothing but still advances and counts', async () => {
    const afterIds: Array<string | undefined> = [];
    const pick = jest.fn().mockImplementation(async (_p, opts: { afterId?: string }) => {
      afterIds.push(opts.afterId);
      if (opts.afterId === undefined) return [makeFakeJob('a'), makeFakeJob('b')];
      return [];
    });
    const write = jest.fn();
    const count = jest.fn().mockResolvedValue(2);

    const result = await runEnrichment(
      new PrismaClient(),
      { maxJobs: null, budgetMin: 10, dryRun: true, modelMaxCalls: 2000 },
      { pick, write, count, steps: [createRulesStep()], now: () => 0 }
    );

    expect(write).not.toHaveBeenCalled();
    expect(afterIds).toEqual([undefined, 'b']);
    expect(result.picked).toBe(2);
    expect(result.written).toBe(0);
    expect(result.remaining).toBe(2);
    expect(result.descBytes).toBeGreaterThan(0);
  });

  it('model-tried ids reach the writer', async () => {
    const fakeModelStep: EnrichmentStep = {
      name: 'model',
      async run(jobs, _prior, ctx) {
        ctx?.modelTried.add('b');
        const out = new Map();
        const jb = jobs.find((j) => j.id === 'b');
        if (jb) {
          out.set('b', {
            experienceMinYears: 4,
            clearanceRequired: false,
            confidence: 'high' as const,
            source: 'model' as const,
            evidence: { years: '4+ years' },
          });
        }
        return out;
      },
    };

    const writtenRows: Array<{ id: string; modelTried: boolean }> = [];
    const pick = jest
      .fn()
      .mockResolvedValueOnce([makeFakeJob('a'), makeFakeJob('b')])
      .mockResolvedValueOnce([]);
    const write = jest.fn().mockImplementation(async (_p, rows: Array<{ id: string; modelTried: boolean }>) => {
      writtenRows.push(...rows);
      return rows.length;
    });
    const count = jest.fn().mockResolvedValue(0);

    await runEnrichment(
      new PrismaClient(),
      { maxJobs: null, budgetMin: 10, dryRun: false, modelMaxCalls: 10 },
      { pick, write, count, steps: [createRulesStep(), fakeModelStep], now: () => 0 }
    );

    expect(writtenRows.find((r) => r.id === 'b')?.modelTried).toBe(true);
    expect(writtenRows.find((r) => r.id === 'a')?.modelTried).toBe(false);
  });

  it('default steps get deadlineAt = start + budget - 30 s', async () => {
    const spy = jest.spyOn(stepModule, 'buildSteps').mockReturnValueOnce([createRulesStep()]);
    const pick = jest.fn().mockResolvedValueOnce([]);
    const count = jest.fn().mockResolvedValue(0);

    await runEnrichment(
      new PrismaClient(),
      { maxJobs: null, budgetMin: 10, dryRun: false, modelMaxCalls: 2000 },
      { pick, count, now: () => 1_000 }
    );

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].deadlineAt).toBe(1_000 + 600_000 - 30_000);
    spy.mockRestore();
  });

  it('remaining includes untried low rows after the model step is exhausted', async () => {
    const exhaustedModel: EnrichmentStep = {
      name: 'model',
      exhausted: true,
      run: async () => new Map(),
    };

    const pick = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(0);

    const first = await runEnrichment(
      new PrismaClient(),
      { maxJobs: null, budgetMin: 10, dryRun: false, modelMaxCalls: 10 },
      { pick, count, steps: [createRulesStep(), exhaustedModel], now: () => 0 }
    );

    expect(pick).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ modelEnabled: false }));
    expect(count).toHaveBeenCalledWith(expect.anything(), { modelEnabled: true });
    expect(first.remaining).toBe(3);

    const second = await runEnrichment(
      new PrismaClient(),
      { maxJobs: null, budgetMin: 10, dryRun: false, modelMaxCalls: 10 },
      { pick, count, steps: [createRulesStep(), exhaustedModel], now: () => 0 }
    );
    expect(second.remaining).toBe(0);
  });

  it('a pick error propagates', async () => {
    await expect(
      runEnrichment(
        new PrismaClient(),
        { maxJobs: null, budgetMin: 10, dryRun: false, modelMaxCalls: 2000 },
        {
          pick: async () => {
            throw new Error('db down');
          },
          steps: [createRulesStep()],
          now: () => 0,
        }
      )
    ).rejects.toThrow('db down');
  });
});
