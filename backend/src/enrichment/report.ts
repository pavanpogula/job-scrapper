/**
 * @file Enrichment Report Writer & Summary Formatter
 * @summary Persists enrich-<runId>.json and latest-enrich.json without touching scrape telemetry, and formats GitHub step summaries (BF-027)
 * @tags enrichment, report, summary, artifacts, BF-027
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ModelStopReason } from './model/modelStep';
import type { StopReason } from './run';

export interface EnrichReport {
  schemaVersion: 'enrich-1';
  run: {
    runId: string;
    startedAt: string;
    finishedAt: string;
    dryRun: boolean;
    attrsVersion: number;
    modelEnabled: boolean;
    flags: {
      maxJobs: number | null;
      budgetMin: number;
      modelMaxCalls: number;
    };
  };
  counts: {
    picked: number;
    rulesHigh: number;
    rulesLow: number;
    modelCalls: number;
    modelAccepted: number;
    modelRejected: number;
    modelErrors: number;
    modelStoppedBy: ModelStopReason | null;
    modelTokensIn: number;
    modelTokensOut: number;
    written: number;
    remaining: number;
    durationMs: number;
    stoppedBy: StopReason;
    descBytes: number;
  };
}

/**
 * @summary Writes the monthly archive enrich report and latest-enrich.json, never touching latest-error-report.json
 */
export function writeEnrichReport(
  report: EnrichReport,
  baseDir?: string
): { reportPath: string; latestPath: string } {
  const outDir = baseDir ?? path.join(process.cwd(), 'output');
  const date = new Date(report.run.startedAt);
  const yyyyMm = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  const reportsDir = path.join(outDir, 'reports', yyyyMm);
  fs.mkdirSync(reportsDir, { recursive: true });

  const reportPath = path.join(reportsDir, `enrich-${report.run.runId}.json`);
  const latestPath = path.join(outDir, 'latest-enrich.json');
  const serialized = JSON.stringify(report, null, 2);

  fs.writeFileSync(reportPath, serialized, 'utf8');
  fs.writeFileSync(latestPath, serialized, 'utf8');

  return { reportPath, latestPath };
}

/**
 * @summary Formats the pinned Markdown summary table and backfill completion line for stdout and GitHub step summaries
 */
export function formatEnrichSummary(report: EnrichReport): string {
  const c = report.counts;
  const complete = c.remaining === 0 ? 'yes' : 'no';
  const dry = report.run.dryRun ? 'yes' : 'no';
  const mb = (c.descBytes / (1024 * 1024)).toFixed(1);

  return [
    '### Job attribute enrichment',
    '| picked | rulesHigh | rulesLow | modelCalls | modelAccepted | modelRejected | modelErrors | written | remaining | durationMs | stoppedBy |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
    `| ${c.picked} | ${c.rulesHigh} | ${c.rulesLow} | ${c.modelCalls} | ${c.modelAccepted} | ${c.modelRejected} | ${c.modelErrors} | ${c.written} | ${c.remaining} | ${c.durationMs} | ${c.stoppedBy} |`,
    '',
    '| Metric | Value |',
    '|---|---|',
    `| Model stopped by | ${c.modelStoppedBy ?? 'off'} |`,
    `| Model tokens in | ${c.modelTokensIn} |`,
    `| Model tokens out | ${c.modelTokensOut} |`,
    '',
    `Backfill complete: ${complete} (\`remaining\` = ${c.remaining}). Dry run: ${dry}. Description bytes read: ${mb} MB.`,
  ].join('\n');
}
