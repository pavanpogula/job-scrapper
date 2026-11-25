/**
 * @file Model eval CLI (owner only)
 * @summary Scores rules vs rules+validated model on the golden set and estimates cost; needs GEMINI_API_KEY in the owner's shell, never CI
 * @tags Enrichment, Model, Eval, CLI, BF-027
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { extractAttributesByRules } from '../rules';
import { emptyCounts, PickedJob, StepRunContext } from '../step';
import type { EnrichmentInput, JobAttributes } from '../types';
import { DEFAULT_GEMINI_MODEL, GeminiClient } from './GeminiClient';
import type { ModelClient, ModelUsage } from './ModelClient';
import { ModelStep } from './modelStep';

type EvalSet = 'holdout' | 'tune' | 'all';

interface EvalArgs {
  set: EvalSet;
  limit: number;
  allJobs: boolean;
  maxCalls: number;
  priceIn: number;
  priceOut: number;
}

interface GoldenLabel {
  split: string;
  labelled: boolean;
  years: number | null;
  clearance: boolean;
}

interface ScoreMetrics {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  precision: number;
  recall: number;
}

export interface ModelEvalDeps {
  client?: ModelClient;
  out?: (line: string) => void;
  fixturesDir?: string;
}

interface UsageCapableClient extends ModelClient {
  getUsage?: () => ModelUsage;
}

const DEFAULT_FIXTURES_DIR = path.resolve(__dirname, '../../../tests/fixtures/job-attributes');

/**
 * @summary Parses an integer CLI flag value with inclusive lower bound validation
 */
function parseIntFlag(raw: string, flagName: string, min: number): number {
  if (!/^\d+$/.test(raw)) {
    throw new Error(`Invalid integer for ${flagName}: "${raw}"`);
  }
  const value = Number.parseInt(raw, 10);
  if (value < min) {
    throw new Error(`${flagName} must be >= ${min}, got ${value}`);
  }
  return value;
}

/**
 * @summary Parses a non-negative floating-point USD price flag
 */
function parsePriceFlag(raw: string, flagName: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid price for ${flagName}: "${raw}"`);
  }
  return value;
}

/**
 * @summary Parses and validates CLI flags for enrich:model-eval
 */
function parseEvalArgs(argv: string[]): EvalArgs {
  let set: EvalSet = 'holdout';
  let limit = 50;
  let allJobs = false;
  let maxCalls = 100;
  let priceIn = 0.25;
  let priceOut = 1.5;

  for (const arg of argv) {
    if (arg.startsWith('--set=')) {
      const val = arg.slice('--set='.length);
      if (val !== 'holdout' && val !== 'tune' && val !== 'all') {
        throw new Error(`--set must be holdout, tune, or all, got "${val}"`);
      }
      set = val;
    } else if (arg.startsWith('--limit=')) {
      limit = parseIntFlag(arg.slice('--limit='.length), '--limit', 1);
    } else if (arg === '--all-jobs') {
      allJobs = true;
    } else if (arg.startsWith('--max-calls=')) {
      maxCalls = parseIntFlag(arg.slice('--max-calls='.length), '--max-calls', 0);
    } else if (arg.startsWith('--price-in=')) {
      priceIn = parsePriceFlag(arg.slice('--price-in='.length), '--price-in');
    } else if (arg.startsWith('--price-out=')) {
      priceOut = parsePriceFlag(arg.slice('--price-out='.length), '--price-out');
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { set, limit, allJobs, maxCalls, priceIn, priceOut };
}

/**
 * @summary Local precision/recall helper matching tests/helpers/goldenScore.ts scoreYears definition
 */
function scoreYears(pairs: Array<{ gold: number | null; pred: number | null }>): ScoreMetrics {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;

  for (const { gold, pred } of pairs) {
    if (gold === null && pred === null) {
      tn += 1;
    } else if (gold !== null && pred === null) {
      fn += 1;
    } else if (gold === null && pred !== null) {
      fp += 1;
    } else if (gold === pred) {
      tp += 1;
    } else {
      fp += 1;
      fn += 1;
    }
  }

  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  return { tp, fp, fn, tn, precision, recall };
}

/**
 * @summary Local precision/recall helper matching tests/helpers/goldenScore.ts scoreClearance definition
 */
function scoreClearance(pairs: Array<{ gold: boolean; pred: boolean }>): ScoreMetrics {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;

  for (const { gold, pred } of pairs) {
    if (gold && pred) {
      tp += 1;
    } else if (!gold && pred) {
      fp += 1;
    } else if (gold && !pred) {
      fn += 1;
    } else {
      tn += 1;
    }
  }

  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  return { tp, fp, fn, tn, precision, recall };
}

/**
 * @summary Formats precision and recall pair percentages concisely for stdout reporting
 */
function formatPR(metrics: ScoreMetrics): string {
  return `P=${(metrics.precision * 100).toFixed(1)}% / R=${(metrics.recall * 100).toFixed(1)}% (tp=${metrics.tp}, fp=${metrics.fp}, fn=${metrics.fn})`;
}

/**
 * @summary Runs golden-set model evaluation without DB access and prints P/R, usage, and cost estimates
 */
export async function runModelEval(
  argv: string[],
  env: NodeJS.ProcessEnv,
  deps?: ModelEvalDeps
): Promise<number> {
  const out = deps?.out ?? ((line: string) => console.log(line));

  let args: EvalArgs;
  try {
    args = parseEvalArgs(argv);
  } catch (err) {
    out(err instanceof Error ? err.message : String(err));
    return 1;
  }

  const apiKey = env.GEMINI_API_KEY?.trim() ?? '';
  if (!deps?.client && apiKey.length === 0) {
    out('GEMINI_API_KEY is not set. Export it in your own shell first; nothing was sent.');
    return 1;
  }

  const fixturesDir = deps?.fixturesDir ?? DEFAULT_FIXTURES_DIR;
  const jobs = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, 'jobs.json'), 'utf8')
  ) as EnrichmentInput[];
  const labelsDoc = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, 'labels.json'), 'utf8')
  ) as { labels: Record<string, GoldenLabel> };

  const labelledJobs = jobs.filter((job) => {
    const label = labelsDoc.labels[job.id];
    if (!label || !label.labelled) return false;
    return args.set === 'all' || label.split === args.set;
  });

  const rulesMap = new Map<string, JobAttributes>();
  for (const job of labelledJobs) {
    rulesMap.set(job.id, extractAttributesByRules(job));
  }

  const filtered = args.allJobs
    ? labelledJobs
    : labelledJobs.filter((job) => rulesMap.get(job.id)?.confidence === 'low');
  const sample = filtered.slice(0, args.limit);

  let step: ModelStep | undefined;
  let client: UsageCapableClient;
  let modelName = 'injected';

  if (deps?.client) {
    client = deps.client;
  } else {
    const configuredModel = env.GEMINI_MODEL?.trim() || undefined;
    modelName = configuredModel ?? DEFAULT_GEMINI_MODEL;
    client = new GeminiClient({
      apiKey,
      model: configuredModel,
      onRateLimit: () => step?.limiter.onRateLimit(),
    });
  }

  step = new ModelStep({
    client,
    maxCalls: args.maxCalls,
    log: out,
    usage: () => client.getUsage?.() ?? { calls: 0, promptTokens: 0, outputTokens: 0 },
  });

  const pickedJobs: PickedJob[] = sample.map((job) => {
    const rules = rulesMap.get(job.id)!;
    return {
      ...job,
      attrsConfidence: rules.confidence,
      descHash: job.id,
    };
  });

  const ctx: StepRunContext = {
    counts: emptyCounts(),
    modelTried: new Set<string>(),
    modelMaxCalls: args.maxCalls,
  };

  const modelUpdates = await step.run(pickedJobs, rulesMap, ctx);
  const combinedMap = new Map<string, JobAttributes>(rulesMap);
  for (const [id, attrs] of modelUpdates) {
    combinedMap.set(id, attrs);
  }

  const rulesYears = scoreYears(
    sample.map((j) => ({
      gold: labelsDoc.labels[j.id].years,
      pred: rulesMap.get(j.id)!.experienceMinYears,
    }))
  );
  const rulesClearance = scoreClearance(
    sample.map((j) => ({
      gold: labelsDoc.labels[j.id].clearance,
      pred: rulesMap.get(j.id)!.clearanceRequired,
    }))
  );
  const modelYears = scoreYears(
    sample.map((j) => ({
      gold: labelsDoc.labels[j.id].years,
      pred: combinedMap.get(j.id)!.experienceMinYears,
    }))
  );
  const modelClearance = scoreClearance(
    sample.map((j) => ({
      gold: labelsDoc.labels[j.id].clearance,
      pred: combinedMap.get(j.id)!.clearanceRequired,
    }))
  );

  const usage = step.usage();
  const totalCostUsd =
    (usage.promptTokens * args.priceIn + usage.outputTokens * args.priceOut) / 1_000_000;
  const effectiveCalls = ctx.counts.modelCalls > 0 ? ctx.counts.modelCalls : usage.calls;
  const costPerCall = effectiveCalls > 0 ? totalCostUsd / effectiveCalls : 0;
  const costPer2k = costPerCall * 2000;

  out(
    `Eval set=${args.set} mode=${args.allJobs ? 'all-jobs' : 'low-only'} model=${modelName} scored=${sample.length}`
  );
  out(
    `Model calls=${ctx.counts.modelCalls} accepted=${ctx.counts.modelAccepted} rejected=${ctx.counts.modelRejected} errors=${ctx.counts.modelErrors} stoppedBy=${step.stoppedBy}`
  );
  out(`Rules-only P/R:           years ${formatPR(rulesYears)} | clearance ${formatPR(rulesClearance)}`);
  out(
    `Rules+validated-model P/R: years ${formatPR(modelYears)} | clearance ${formatPR(modelClearance)}`
  );
  out(
    `Tokens in=${usage.promptTokens} out=${usage.outputTokens} | est cost/call=$${costPerCall.toFixed(5)} est 2,000 calls=$${costPer2k.toFixed(2)}`
  );

  return 0;
}

if (require.main === module) {
  runModelEval(process.argv.slice(2), process.env)
    .then((code) => {
      process.exit(code);
    })
    .catch((err: unknown) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
