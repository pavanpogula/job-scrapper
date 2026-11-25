/**
 * @file EnrichPass.test.ts
 * @summary Unit tests for enrichment step contract, rules step, run loop, reports, and CLI args (BF-027)
 * @tags unit, enrichment, pipeline, cli, report, BF-027
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { ModelAnswer, ModelCallError, ModelClient } from '../../src/enrichment/model/ModelClient';
import { ModelStep } from '../../src/enrichment/model/modelStep';
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
import { EnrichReport, writeEnrichReport, formatEnrichSummary } from '../../src/enrichment/report';
import { parseEnrichArgs } from '../../src/enrichment/EnrichCli';
import { generateRunId } from '../../src/lib/ErrorTracker';
import { ATTRS_VERSION } from '../../src/enrichment/version';

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

  function sampleReport(startedAt = '2026-11-23T05:00:00.000Z', remaining = 42): EnrichReport {
    return {
      schemaVersion: 'enrich-1',
      run: {
        runId: '20261123T050000Z-enrich-abc1234',
        startedAt,
        finishedAt: '2026-11-23T05:01:00.000Z',
        dryRun: false,
        attrsVersion: ATTRS_VERSION,
        modelEnabled: false,
        flags: { maxJobs: 20000, budgetMin: 10, modelMaxCalls: 2000 },
      },
      counts: {
        picked: 500,
        rulesHigh: 410,
        rulesLow: 90,
        modelCalls: 0,
        modelAccepted: 0,
        modelRejected: 0,
        modelErrors: 0,
        modelStoppedBy: null,
        modelTokensIn: 0,
        modelTokensOut: 0,
        written: 500,
        remaining,
        durationMs: 61234,
        stoppedBy: 'budget',
        descBytes: 2_516_582,
      },
    };
  }

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
    expect(formatEnrichSummary(sampleReport('2026-11-23T05:00:00.000Z', first.remaining))).toContain(
      'Backfill complete: no'
    );

    const second = await runEnrichment(
      new PrismaClient(),
      { maxJobs: null, budgetMin: 10, dryRun: false, modelMaxCalls: 10 },
      { pick, count, steps: [createRulesStep(), exhaustedModel], now: () => 0 }
    );
    expect(second.remaining).toBe(0);
    expect(formatEnrichSummary(sampleReport('2026-11-23T05:00:00.000Z', second.remaining))).toContain(
      'Backfill complete: yes'
    );
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

  it('parseEnrichArgs defaults', () => {
    expect(parseEnrichArgs([])).toEqual({
      maxJobs: 20000,
      budgetMin: 10,
      dryRun: false,
      modelMaxCalls: 2000,
    });
  });

  it('parseEnrichArgs --all removes the cap', () => {
    expect(parseEnrichArgs(['--all', '--budget-min=120'])).toEqual({
      maxJobs: null,
      budgetMin: 120,
      dryRun: false,
      modelMaxCalls: 2000,
    });
  });

  it.each([
    [['--budget-min=0']],
    [['--budget-min=131']],
    [['--budget-min=abc']],
    [['--max-jobs=0']],
    [['--model-max-calls=-1']],
    [['--all', '--max-jobs=5']],
    [['--nope']],
  ])('parseEnrichArgs rejects %j', (args) => {
    expect(() => parseEnrichArgs(args)).toThrow();
  });

  it('writeEnrichReport writes the month report and latest-enrich.json only', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'enrich-'));
    try {
      const report = sampleReport('2026-11-23T05:00:00.000Z', 42);
      const { reportPath, latestPath } = writeEnrichReport(report, dir);
      expect(reportPath).toBe(path.join(dir, 'reports', '2026-11', `enrich-${report.run.runId}.json`));
      expect(latestPath).toBe(path.join(dir, 'latest-enrich.json'));
      expect(fs.existsSync(path.join(dir, 'latest-error-report.json'))).toBe(false);
      expect(JSON.parse(fs.readFileSync(latestPath, 'utf8')).counts.remaining).toBe(42);
      expect(JSON.parse(fs.readFileSync(reportPath, 'utf8')).schemaVersion).toBe('enrich-1');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('generateRunId accepts enrich', () => {
    expect(generateRunId('enrich', Date.UTC(2026, 10, 23, 5))).toMatch(/^20261123T050000Z-enrich-/);
  });

  it('formatEnrichSummary prints remaining and the completion line', () => {
    expect(formatEnrichSummary(sampleReport('2026-11-23T05:00:00.000Z', 0))).toContain('Backfill complete: yes');
    expect(formatEnrichSummary(sampleReport('2026-11-23T05:00:00.000Z', 7))).toMatch(
      /\| 7 \|.*\| (done|budget|maxJobs) \|/
    );
  });

  it('marks attrsModelVersion when tried', async () => {
    const lowA = makeFakeJob('low-a', 'Preferred: 2+ years of experience with Spark.');
    const lowB = makeFakeJob('low-b', 'Preferred: 3+ years of experience with Go.');
    const highC = makeFakeJob('high-c', 'Requirements\n5+ years of experience required.');

    const classify = jest
      .fn<Promise<ModelAnswer>, [unknown]>()
      .mockImplementation(async (input: unknown) => {
        const job = input as { id: string };
        if (job.id === 'low-a') {
          return {
            minYears: 9,
            clearanceRequired: false,
            yearsEvidence: '9+ years hallucinated',
            clearanceEvidence: null,
          };
        }
        throw new ModelCallError('timeout', undefined, 4);
      });

    const modelStep = new ModelStep({ client: { classify }, maxCalls: 10 });
    const writtenRows: Array<{ id: string; modelTried: boolean }> = [];
    const pick = jest
      .fn()
      .mockResolvedValueOnce([lowA, lowB, highC])
      .mockResolvedValueOnce([]);
    const write = jest
      .fn()
      .mockImplementation(async (_p, rows: Array<{ id: string; modelTried: boolean }>) => {
        writtenRows.push(...rows);
        return rows.length;
      });
    const count = jest.fn().mockResolvedValue(0);

    await runEnrichment(
      new PrismaClient(),
      { maxJobs: null, budgetMin: 10, dryRun: false, modelMaxCalls: 10 },
      { pick, write, count, steps: [createRulesStep(), modelStep], now: () => 0 }
    );

    expect(writtenRows.find((r) => r.id === 'low-a')?.modelTried).toBe(true);
    expect(writtenRows.find((r) => r.id === 'low-b')?.modelTried).toBe(false);
    expect(writtenRows.find((r) => r.id === 'high-c')?.modelTried).toBe(false);
  });

  it('picker stops asking for model rows once the model step is exhausted', async () => {
    const pickCalls: Array<{ modelEnabled: boolean }> = [];
    const pick = jest.fn().mockImplementation(async (_p, opts: { modelEnabled: boolean; afterId?: string }) => {
      pickCalls.push({ modelEnabled: opts.modelEnabled });
      if (opts.afterId === undefined) {
        return [makeFakeJob('low-1', 'Preferred: 2+ years of experience.')];
      }
      if (opts.afterId === 'low-1') {
        return [makeFakeJob('low-2', 'Preferred: 3+ years of experience.')];
      }
      return [];
    });
    const write = jest.fn().mockImplementation(async (_p, rows) => rows.length);
    const count = jest.fn().mockResolvedValue(1);
    const classify = jest.fn<Promise<ModelAnswer>, [unknown]>().mockResolvedValue({
      minYears: null,
      clearanceRequired: false,
      yearsEvidence: null,
      clearanceEvidence: null,
    });
    const modelStep = new ModelStep({ client: { classify }, maxCalls: 1 });

    await runEnrichment(
      new PrismaClient(),
      { maxJobs: null, budgetMin: 10, dryRun: false, modelMaxCalls: 1, batchSize: 1 },
      { pick, write, count, steps: [createRulesStep(), modelStep], now: () => 0 }
    );

    expect(pickCalls[0].modelEnabled).toBe(true);
    expect(pickCalls[1].modelEnabled).toBe(false);
    expect(count).toHaveBeenCalledWith(expect.anything(), { modelEnabled: true });
    expect(classify).toHaveBeenCalledTimes(1);
  });

  it('chunk stopped by the model cap is not backfill complete', async () => {
    const batch = [
      makeFakeJob('low-1', 'Preferred: 2+ years of experience.'),
      makeFakeJob('low-2', 'Preferred: 3+ years of experience.'),
    ];
    const pick = jest.fn().mockResolvedValueOnce(batch).mockResolvedValueOnce([]);
    const write = jest.fn().mockImplementation(async (_p, rows) => rows.length);
    const count = jest.fn().mockImplementation(async (_p, opts: { modelEnabled: boolean }) =>
      opts.modelEnabled ? 3 : 0
    );
    const classify = jest.fn<Promise<ModelAnswer>, [unknown]>().mockResolvedValue({
      minYears: null,
      clearanceRequired: false,
      yearsEvidence: null,
      clearanceEvidence: null,
    });
    const modelStep = new ModelStep({ client: { classify }, maxCalls: 1 });

    const result = await runEnrichment(
      new PrismaClient(),
      { maxJobs: null, budgetMin: 10, dryRun: false, modelMaxCalls: 1 },
      { pick, write, count, steps: [createRulesStep(), modelStep], now: () => 0 }
    );

    expect(result.remaining).toBe(3);
    expect(result.modelStoppedBy).toBe('maxCalls');

    const report: EnrichReport = {
      ...sampleReport('2026-11-23T05:00:00.000Z', result.remaining),
      counts: {
        ...sampleReport('2026-11-23T05:00:00.000Z', result.remaining).counts,
        modelStoppedBy: result.modelStoppedBy,
      },
    };
    expect(formatEnrichSummary(report)).not.toContain('Backfill complete: yes');
  });

  it('default steps include the model step only with flag and key', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      expect(
        buildSteps({
          modelMaxCalls: 5,
          env: { GEMINI_ENABLED: 'true', GEMINI_API_KEY: 'k' },
          deadlineAt: 0,
        }).map((s) => s.name)
      ).toEqual(['rules', 'model']);
      expect(buildSteps({ modelMaxCalls: 5, env: {}, deadlineAt: 0 }).map((s) => s.name)).toEqual([
        'rules',
      ]);
    } finally {
      spy.mockRestore();
    }
  });

  it('model errors never fail the pass', async () => {
    const lowJobs = [
      makeFakeJob('low-1', 'Preferred: 2+ years of experience.'),
      makeFakeJob('low-2', 'Preferred: 4+ years of experience.'),
    ];
    const classify = jest
      .fn<Promise<ModelAnswer>, [unknown]>()
      .mockRejectedValue(new ModelCallError('http', 503, 4));
    const modelStep = new ModelStep({ client: { classify }, maxCalls: 10 });
    const pick = jest.fn().mockResolvedValueOnce(lowJobs).mockResolvedValueOnce([]);
    const write = jest.fn().mockImplementation(async (_p, rows) => rows.length);
    const count = jest.fn().mockResolvedValue(0);

    const result = await runEnrichment(
      new PrismaClient(),
      { maxJobs: null, budgetMin: 10, dryRun: false, modelMaxCalls: 10 },
      { pick, write, count, steps: [createRulesStep(), modelStep], now: () => 0 }
    );

    expect(result.modelErrors).toBe(lowJobs.length);
    expect(result.stoppedBy).toBe('done');
  });

  it('model counts and tokens reach the result', async () => {
    const desc = 'Preferred: 5+ years of experience with distributed systems.';
    const lowJob = makeFakeJob('low-1', desc);
    const client: ModelClient = {
      classify: async () => ({
        minYears: null,
        clearanceRequired: false,
        yearsEvidence: null,
        clearanceEvidence: null,
      }),
    };
    const modelStep = new ModelStep({
      client,
      maxCalls: 10,
      usage: () => ({ calls: 1, promptTokens: 2100, outputTokens: 150 }),
    });
    const pick = jest.fn().mockResolvedValueOnce([lowJob]).mockResolvedValueOnce([]);
    const write = jest.fn().mockImplementation(async (_p, rows) => rows.length);
    const count = jest.fn().mockResolvedValue(0);

    const result = await runEnrichment(
      new PrismaClient(),
      { maxJobs: null, budgetMin: 10, dryRun: false, modelMaxCalls: 10 },
      { pick, write, count, steps: [createRulesStep(), modelStep], now: () => 0 }
    );

    expect(result.modelCalls).toBe(1);
    expect(result.modelAccepted).toBe(1);
    expect(result.modelTokensIn).toBe(2100);
    expect(result.modelTokensOut).toBe(150);
    expect(result.modelStoppedBy).toBe('done');
  });

  it('formatEnrichSummary prints model rows', () => {
    const base = sampleReport('2026-11-23T05:00:00.000Z', 0);
    const summary = formatEnrichSummary({
      ...base,
      counts: {
        ...base.counts,
        modelStoppedBy: 'done',
        modelTokensIn: 2100,
        modelTokensOut: 150,
      },
    });
    expect(summary).toContain('Model stopped by');
    expect(summary).toContain('Model tokens in');
  });
});
