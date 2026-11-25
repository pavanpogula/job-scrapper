/**
 * @file Enrichment model step
 * @summary Sends low-confidence jobs to the model within a call cap and deadline, keeps validated answers, never fails the pass
 * @tags Enrichment, Model, Step, Concurrency, BF-027
 */

import { AdaptiveLimiter, createLimiter } from '../../lib/Concurrency';
import { emptyCounts, EnrichmentStep, PickedJob, StepRunContext } from '../step';
import type { JobAttributes } from '../types';
import { DEFAULT_GEMINI_MODEL, GeminiClient } from './GeminiClient';
import { ModelCallError, ModelClient, ModelUsage } from './ModelClient';
import { validateModelAnswer } from './validate';

export const MODEL_CONCURRENCY = 4;

export type ModelStopReason = 'done' | 'maxCalls' | 'deadline' | 'fatal';

export interface ModelStepOptions {
  client: ModelClient;
  maxCalls: number;
  deadlineAt?: number;
  now?: () => number;
  log?: (line: string) => void;
  usage?: () => ModelUsage;
}

/**
 * Enrichment pipeline step that classifies only low-confidence jobs via a ModelClient,
 * validates responses with rules, and degrades cleanly to rules answers on any error.
 */
export class ModelStep implements EnrichmentStep {
  readonly name = 'model' as const;
  readonly limiter: AdaptiveLimiter;
  stoppedBy: ModelStopReason;

  private readonly client: ModelClient;
  private readonly maxCalls: number;
  private readonly deadlineAt?: number;
  private readonly nowFn: () => number;
  private readonly logFn: (line: string) => void;
  private readonly usageFn?: () => ModelUsage;
  private totalCalls = 0;
  private fatalLogged = false;

  /**
   * @summary Initializes a ModelStep with bounded concurrency, call cap, and optional wall-clock deadline
   */
  constructor(opts: ModelStepOptions) {
    this.client = opts.client;
    this.maxCalls = Math.max(0, opts.maxCalls);
    this.deadlineAt = opts.deadlineAt;
    this.nowFn = opts.now ?? Date.now;
    this.logFn = opts.log ?? ((line) => console.log(line));
    this.usageFn = opts.usage;
    this.limiter = createLimiter(MODEL_CONCURRENCY, { minConcurrency: 1 });
    this.stoppedBy = this.maxCalls <= 0 ? 'maxCalls' : 'done';
  }

  /**
   * @summary True once the model step hits its call cap, deadline, or a fatal error for the rest of the run
   */
  get exhausted(): boolean {
    return this.stoppedBy !== 'done';
  }

  /**
   * @summary Returns cumulative call and token counters from the underlying client if available
   */
  usage(): ModelUsage {
    return this.usageFn?.() ?? { calls: 0, promptTokens: 0, outputTokens: 0 };
  }

  /**
   * @summary Evaluates low-confidence jobs in prior order and returns only validated model overrides
   */
  async run(
    jobs: PickedJob[],
    prior: Map<string, JobAttributes>,
    ctx?: StepRunContext
  ): Promise<Map<string, JobAttributes>> {
    const updates = new Map<string, JobAttributes>();
    if (this.exhausted) {
      return updates;
    }

    const candidates = jobs.filter((job) => prior.get(job.id)?.confidence === 'low');
    if (candidates.length === 0) {
      return updates;
    }

    const runCtx: StepRunContext = ctx ?? {
      counts: emptyCounts(),
      modelTried: new Set<string>(),
      modelMaxCalls: this.maxCalls,
    };

    const processOne = async (job: PickedJob): Promise<void> => {
      try {
        await this.limiter(async () => {
          if (this.stoppedBy === 'fatal') {
            return;
          }
          if (this.totalCalls >= this.maxCalls) {
            if (this.stoppedBy === 'done') {
              this.stoppedBy = 'maxCalls';
            }
            return;
          }
          if (this.deadlineAt !== undefined && this.nowFn() >= this.deadlineAt) {
            if (this.stoppedBy === 'done') {
              this.stoppedBy = 'deadline';
            }
            return;
          }

          this.totalCalls += 1;
          if (this.totalCalls >= this.maxCalls && this.stoppedBy === 'done') {
            this.stoppedBy = 'maxCalls';
          }
          runCtx.counts.modelCalls += 1;

          const input = {
            id: job.id,
            title: job.title,
            descriptionPlain: job.descriptionPlain,
          };

          const answer = await this.client.classify(input);
          this.limiter.onSuccess();
          runCtx.modelTried.add(job.id);

          const validated = validateModelAnswer(input, answer);
          if (validated) {
            updates.set(job.id, validated);
            runCtx.counts.modelAccepted += 1;
          } else {
            runCtx.counts.modelRejected += 1;
          }
        });
      } catch (err) {
        runCtx.counts.modelErrors += 1;
        if (err instanceof ModelCallError) {
          if (err.responded) {
            this.limiter.onSuccess();
            runCtx.modelTried.add(job.id);
          }
          if (err.fatal) {
            this.stoppedBy = 'fatal';
            if (!this.fatalLogged) {
              this.fatalLogged = true;
              this.logFn(
                `Model step stopped: Gemini returned HTTP ${err.status}; rules answers kept for the rest of the run.`
              );
            }
          }
        }
      }
    };

    // Probe the first candidate before fanning out concurrently so fatal auth/billing errors fail in 1 call.
    if (this.totalCalls === 0) {
      await processOne(candidates[0]);
      if (this.exhausted || candidates.length === 1) {
        return updates;
      }
      await Promise.all(candidates.slice(1).map((job) => processOne(job)));
      return updates;
    }

    await Promise.all(candidates.map((job) => processOne(job)));
    return updates;
  }
}

/**
 * @summary Registers ModelStep only when GEMINI_ENABLED === 'true' and GEMINI_API_KEY is non-empty
 */
export function buildModelStep(
  env: NodeJS.ProcessEnv,
  opts: { maxCalls: number; deadlineAt?: number; log?: (line: string) => void }
): ModelStep | null {
  const log = opts.log ?? ((line) => console.log(line));
  const enabled = env.GEMINI_ENABLED === 'true';
  const apiKey = env.GEMINI_API_KEY?.trim() ?? '';

  if (!enabled || apiKey.length === 0) {
    log(
      "Model step off (GEMINI_ENABLED is not 'true' or GEMINI_API_KEY is not set); rules decide every job."
    );
    return null;
  }

  const configuredModel = env.GEMINI_MODEL?.trim() || undefined;
  const resolvedModel = configuredModel ?? DEFAULT_GEMINI_MODEL;

  let step: ModelStep | undefined;
  const client = new GeminiClient({
    apiKey,
    model: configuredModel,
    onRateLimit: () => step?.limiter.onRateLimit(),
  });
  step = new ModelStep({
    client,
    maxCalls: opts.maxCalls,
    deadlineAt: opts.deadlineAt,
    log,
    usage: () => client.getUsage(),
  });

  log(`Model step on: model ${resolvedModel}, max ${opts.maxCalls} calls.`);
  return step;
}
