/**
 * @file Enrichment Pass Runner
 * @summary Batched sequential enrichment loop with keyset pagination, budget enforcement, max-jobs cap, dry run, and remaining count (BF-027)
 * @tags enrichment, runner, batching, budget, BF-027
 */

import { PrismaClient } from '@prisma/client';
import { pickJobsForEnrichment, countPickable } from './picker';
import * as stepModule from './step';
import type { EnrichCounts, EnrichmentStep, StepRunContext } from './step';
import type { JobAttributes } from './types';
import { writeAttributes, AttributeWrite } from './writer';

export const ENRICH_BATCH_SIZE = 500;

export type StopReason = 'done' | 'budget' | 'maxJobs';

export interface EnrichOptions {
  maxJobs: number | null;
  budgetMin: number;
  dryRun: boolean;
  modelMaxCalls: number;
  batchSize?: number;
}

export interface EnrichDeps {
  pick: typeof pickJobsForEnrichment;
  write: typeof writeAttributes;
  count: typeof countPickable;
  steps: EnrichmentStep[];
  now: () => number;
}

export interface EnrichResult extends EnrichCounts {
  remaining: number;
  durationMs: number;
  stoppedBy: StopReason;
  descBytes: number;
}

/**
 * @summary Runs sequential keyset batches of job attribute enrichment until exhausted, capped, or budget expires
 */
export async function runEnrichment(
  prisma: PrismaClient,
  opts: EnrichOptions,
  deps?: Partial<EnrichDeps>
): Promise<EnrichResult> {
  const now = deps?.now ?? Date.now;
  const start = now();
  const budgetMs = opts.budgetMin * 60_000;
  const batchSize = opts.batchSize ?? ENRICH_BATCH_SIZE;

  const pick = deps?.pick ?? pickJobsForEnrichment;
  const write = deps?.write ?? writeAttributes;
  const count = deps?.count ?? countPickable;
  const steps =
    deps?.steps ??
    stepModule.buildSteps({
      modelMaxCalls: opts.modelMaxCalls,
      env: process.env,
      deadlineAt: start + budgetMs - 30_000,
    });

  const counts = stepModule.emptyCounts();
  let descBytes = 0;
  let afterId: string | undefined;
  let stoppedBy: StopReason = 'done';

  for (;;) {
    if (now() - start >= budgetMs) {
      stoppedBy = 'budget';
      break;
    }
    if (opts.maxJobs !== null && counts.picked >= opts.maxJobs) {
      stoppedBy = 'maxJobs';
      break;
    }

    const limit =
      opts.maxJobs === null ? batchSize : Math.min(batchSize, opts.maxJobs - counts.picked);
    const batch = await pick(prisma, {
      limit,
      afterId,
      modelEnabled: stepModule.isModelEnabled(steps),
    });

    if (batch.length === 0) {
      stoppedBy = 'done';
      break;
    }

    counts.picked += batch.length;
    for (const job of batch) {
      descBytes += Buffer.byteLength(job.descriptionPlain, 'utf8');
    }

    const ctx: StepRunContext = {
      counts,
      modelTried: new Set<string>(),
      modelMaxCalls: opts.modelMaxCalls,
    };
    const prior = new Map<string, JobAttributes>();

    for (const step of steps) {
      const stepResults = await step.run(batch, prior, ctx);
      for (const [id, attrs] of stepResults) {
        prior.set(id, attrs);
      }
    }

    const rows: AttributeWrite[] = batch.map((job) => {
      const attrs = prior.get(job.id);
      if (!attrs) {
        throw new Error(`Enrichment pipeline produced no attributes for job ${job.id}`);
      }
      return {
        id: job.id,
        attrs,
        descHash: job.descHash,
        modelTried: ctx.modelTried.has(job.id),
      };
    });

    if (!opts.dryRun) {
      counts.written += await write(prisma, rows);
    }

    afterId = batch[batch.length - 1].id;
  }

  const remaining = await count(prisma, {
    modelEnabled: stepModule.hasModelStep(steps),
  });
  const durationMs = Math.max(0, now() - start);

  return {
    ...counts,
    remaining,
    durationMs,
    stoppedBy,
    descBytes,
  };
}
