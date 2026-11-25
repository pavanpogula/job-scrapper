/**
 * @file Job Attribute Enrichment CLI
 * @summary CLI entry point for npm run enrich:jobs with flag validation, report writing, and GitHub step summary output (BF-027)
 * @tags enrichment, cli, report, prisma, BF-027
 */

import * as fs from 'node:fs';
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import { generateRunId } from '../lib/ErrorTracker';
import { EnrichReport, formatEnrichSummary, writeEnrichReport } from './report';
import { runEnrichment } from './run';
import { buildSteps, hasModelStep } from './step';
import { ATTRS_VERSION } from './version';

export interface EnrichCliArgs {
  maxJobs: number | null;
  budgetMin: number;
  dryRun: boolean;
  modelMaxCalls: number;
}

const DEFAULT_MAX_JOBS = 20000;
const DEFAULT_BUDGET_MIN = 10;
const DEFAULT_MODEL_MAX_CALLS = 2000;

/**
 * @summary Parses an exact non-negative base-10 integer string or throws a validation error
 */
function parseStrictInt(raw: string, flagName: string, min: number, max?: number): number {
  if (!/^\d+$/.test(raw)) {
    throw new Error(`Invalid integer for ${flagName}: "${raw}"`);
  }
  const value = Number.parseInt(raw, 10);
  if (value < min || (max !== undefined && value > max)) {
    const bound = max !== undefined ? `${min}..${max}` : `>= ${min}`;
    throw new Error(`${flagName} must be within ${bound}, got ${value}`);
  }
  return value;
}

/**
 * @summary Parses and validates CLI flags for enrich:jobs
 */
export function parseEnrichArgs(argv: string[]): EnrichCliArgs {
  let maxJobs: number | null = DEFAULT_MAX_JOBS;
  let sawMaxJobs = false;
  let sawAll = false;
  let budgetMin = DEFAULT_BUDGET_MIN;
  let dryRun = false;
  let modelMaxCalls = DEFAULT_MODEL_MAX_CALLS;

  for (const arg of argv) {
    if (arg === '--all') {
      sawAll = true;
      maxJobs = null;
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg.startsWith('--max-jobs=')) {
      sawMaxJobs = true;
      maxJobs = parseStrictInt(arg.slice('--max-jobs='.length), '--max-jobs', 1);
    } else if (arg.startsWith('--budget-min=')) {
      budgetMin = parseStrictInt(arg.slice('--budget-min='.length), '--budget-min', 1, 130);
    } else if (arg.startsWith('--model-max-calls=')) {
      modelMaxCalls = parseStrictInt(
        arg.slice('--model-max-calls='.length),
        '--model-max-calls',
        0,
        100000
      );
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (sawAll && sawMaxJobs) {
    throw new Error('--all cannot be combined with --max-jobs');
  }

  return { maxJobs, budgetMin, dryRun, modelMaxCalls };
}

/**
 * @summary Redacts potential Postgres connection strings from CLI error messages before logging
 */
function sanitizeErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.replace(/postgres(?:ql)?:\/\/[^\s'"]+/gi, '<redacted-db-url>');
}

/**
 * @summary Executes the enrichment CLI pass, writes JSON reports, prints the summary, and appends GitHub step summary
 */
export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  dotenv.config({ quiet: true });
  const args = parseEnrichArgs(argv);
  const startTime = Date.now();
  const startedAt = new Date(startTime).toISOString();
  const prisma = new PrismaClient();

  try {
    const steps = buildSteps({
      modelMaxCalls: args.modelMaxCalls,
      env: process.env,
      deadlineAt: startTime + args.budgetMin * 60_000 - 30_000,
    });
    const result = await runEnrichment(prisma, args, {
      steps,
      now: () => Date.now(),
    });
    const finishedAt = new Date().toISOString();

    const report: EnrichReport = {
      schemaVersion: 'enrich-1',
      run: {
        runId: generateRunId('enrich', startTime),
        startedAt,
        finishedAt,
        dryRun: args.dryRun,
        attrsVersion: ATTRS_VERSION,
        modelEnabled: hasModelStep(steps),
        flags: {
          maxJobs: args.maxJobs,
          budgetMin: args.budgetMin,
          modelMaxCalls: args.modelMaxCalls,
        },
      },
      counts: {
        picked: result.picked,
        rulesHigh: result.rulesHigh,
        rulesLow: result.rulesLow,
        modelCalls: result.modelCalls,
        modelAccepted: result.modelAccepted,
        modelRejected: result.modelRejected,
        modelErrors: result.modelErrors,
        modelStoppedBy: result.modelStoppedBy,
        modelTokensIn: result.modelTokensIn,
        modelTokensOut: result.modelTokensOut,
        written: result.written,
        remaining: result.remaining,
        durationMs: result.durationMs,
        stoppedBy: result.stoppedBy,
        descBytes: result.descBytes,
      },
    };

    writeEnrichReport(report);
    const summary = formatEnrichSummary(report);
    console.log(summary);

    const stepSummaryPath = process.env.GITHUB_STEP_SUMMARY;
    if (stepSummaryPath) {
      try {
        fs.appendFileSync(stepSummaryPath, `${summary}\n`, 'utf8');
      } catch {
        // Ignore step summary write errors
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main()
    .then(() => {
      process.exit(0);
    })
    .catch((err: unknown) => {
      console.error(`❌ ${sanitizeErrorMessage(err)}`);
      process.exit(1);
    });
}
