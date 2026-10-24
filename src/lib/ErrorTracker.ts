/**
 * @file Run Telemetry & Error Tracker for Bug-Fix Agent
 * @summary Collects API errors, sanitization/validation issues, DB errors, and run statistics into structured JSON reports for automated bug-fix agents
 * @tags Telemetry, Error Tracking, Bug Fix Agent, Diagnostics, Reporting
 */

import * as fs from 'fs';
import * as path from 'path';
import { ValidationIssue } from './Sanitizer';

export interface RecordedErrorEvent {
    timestamp: string;
    category:
        | 'api_error'
        | 'graphql_fallback'
        | 'validation_issue'
        | 'validation_filtered'
        | 'validation_sanitized'
        | 'db_error'
        | 'company_quarantined'
        | 'company_unreachable'
        | 'company_error'
        | 'rate_limited'
        | 'suspicious_empty_board';
    companySlug: string;
    jobId?: string;
    field?: string;
    message: string;
    actionTaken: string;
    samplePayload?: Record<string, any>;
}

export interface RunTelemetrySummary {
    runId: string;
    mode: 'db_scrape' | 'csv_scrape';
    startedAt: string;
    completedAt: string;
    durationSeconds: number;
    companiesAttempted: number;
    companiesWithJobs: number;
    companiesNotFound: number;
    graphqlFallbacksUsed: number;
    rateLimitsEncountered: number;
    jobsCollected: number;
    jobsSanitized: number;
    jobsFilteredOut: number;
    dbErrors: number;
}

export interface ErrorReportDocument {
    schemaVersion: '1.0';
    summary: RunTelemetrySummary;
    events: RecordedErrorEvent[];
}

const MAX_EVENTS_STORED = 500;

/**
 * @summary Tracks errors, fallbacks, and sanitization events during a scrape run and writes agent-readable JSON reports
 */
export class ErrorTracker {
    private mode: 'db_scrape' | 'csv_scrape';
    private startTimeMs: number;
    private startedAtIso: string;
    private events: RecordedErrorEvent[] = [];

    public companiesAttempted = 0;
    public companiesWithJobs = 0;
    public companiesNotFound = 0;
    public graphqlFallbacksUsed = 0;
    public rateLimitsEncountered = 0;
    public jobsCollected = 0;
    public jobsSanitized = 0;
    public jobsFilteredOut = 0;
    public dbErrors = 0;

    /**
     * @summary Initializes a new ErrorTracker instance for a scrape run
     */
    constructor(mode: 'db_scrape' | 'csv_scrape' = 'db_scrape') {
        this.mode = mode;
        this.startTimeMs = Date.now();
        this.startedAtIso = new Date(this.startTimeMs).toISOString();
    }

    /**
     * @summary Records a structured event (capped at MAX_EVENTS_STORED to bound memory)
     */
    public recordEvent(event: Omit<RecordedErrorEvent, 'timestamp'>): void {
        if (this.events.length >= MAX_EVENTS_STORED) return;
        this.events.push({
            timestamp: new Date().toISOString(),
            ...event
        });
    }

    /**
     * @summary Records validation and sanitization issues returned by Sanitizer
     */
    public recordValidationIssues(issues: ValidationIssue[]): void {
        for (const issue of issues) {
            if (issue.action === 'filtered') {
                this.jobsFilteredOut++;
            } else {
                this.jobsSanitized++;
            }

            this.recordEvent({
                category: 'validation_issue',
                companySlug: issue.companySlug,
                jobId: issue.jobId,
                field: issue.field,
                message: issue.reason,
                actionTaken: issue.action
            });
        }
    }

    /**
     * @summary Builds the complete ErrorReportDocument for the current run
     */
    public buildReport(): ErrorReportDocument {
        const completedAtMs = Date.now();
        return {
            schemaVersion: '1.0',
            summary: {
                runId: `run_${this.startTimeMs}`,
                mode: this.mode,
                startedAt: this.startedAtIso,
                completedAt: new Date(completedAtMs).toISOString(),
                durationSeconds: Number(((completedAtMs - this.startTimeMs) / 1000).toFixed(2)),
                companiesAttempted: this.companiesAttempted,
                companiesWithJobs: this.companiesWithJobs,
                companiesNotFound: this.companiesNotFound,
                graphqlFallbacksUsed: this.graphqlFallbacksUsed,
                rateLimitsEncountered: this.rateLimitsEncountered,
                jobsCollected: this.jobsCollected,
                jobsSanitized: this.jobsSanitized,
                jobsFilteredOut: this.jobsFilteredOut,
                dbErrors: this.dbErrors
            },
            events: this.events
        };
    }

    /**
     * @summary Writes the telemetry and error report to output/latest-error-report.json and dated file
     */
    public saveReport(outputDir: string = path.join(process.cwd(), 'output')): string | null {
        try {
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            const report = this.buildReport();
            const datePart = report.summary.startedAt.split('T')[0];
            const datedPath = path.join(outputDir, `error-report_${datePart}.json`);
            const latestPath = path.join(outputDir, 'latest-error-report.json');

            const serialized = JSON.stringify(report, null, 2);
            fs.writeFileSync(datedPath, serialized, 'utf-8');
            fs.writeFileSync(latestPath, serialized, 'utf-8');

            return latestPath;
        } catch {
            return null;
        }
    }

    /**
     * @summary Merges multiple worker process ErrorReportDocuments into a single aggregated telemetry report
     */
    public static mergeReports(
        reports: ErrorReportDocument[],
        startedAtMs: number,
        mode: 'db_scrape' | 'csv_scrape' = 'db_scrape'
    ): ErrorReportDocument {
        const completedAtMs = Date.now();
        const startedAtIso = new Date(startedAtMs).toISOString();
        const mergedEvents: RecordedErrorEvent[] = [];

        const summary: RunTelemetrySummary = {
            runId: `cluster_run_${startedAtMs}`,
            mode,
            startedAt: startedAtIso,
            completedAt: new Date(completedAtMs).toISOString(),
            durationSeconds: Number(((completedAtMs - startedAtMs) / 1000).toFixed(2)),
            companiesAttempted: 0,
            companiesWithJobs: 0,
            companiesNotFound: 0,
            graphqlFallbacksUsed: 0,
            rateLimitsEncountered: 0,
            jobsCollected: 0,
            jobsSanitized: 0,
            jobsFilteredOut: 0,
            dbErrors: 0
        };

        for (const r of reports) {
            summary.companiesAttempted += r.summary.companiesAttempted;
            summary.companiesWithJobs += r.summary.companiesWithJobs;
            summary.companiesNotFound += r.summary.companiesNotFound;
            summary.graphqlFallbacksUsed += r.summary.graphqlFallbacksUsed;
            summary.rateLimitsEncountered += r.summary.rateLimitsEncountered;
            summary.jobsCollected += r.summary.jobsCollected;
            summary.jobsSanitized += r.summary.jobsSanitized;
            summary.jobsFilteredOut += r.summary.jobsFilteredOut;
            summary.dbErrors += r.summary.dbErrors;

            for (const ev of r.events) {
                if (mergedEvents.length < MAX_EVENTS_STORED) {
                    mergedEvents.push(ev);
                }
            }
        }

        return {
            schemaVersion: '1.0',
            summary,
            events: mergedEvents
        };
    }

    /**
     * @summary Writes an aggregated multi-process ErrorReportDocument to output/latest-error-report.json
     */
    public static saveMergedReport(
        report: ErrorReportDocument,
        outputDir: string = path.join(process.cwd(), 'output')
    ): string | null {
        try {
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            const datePart = report.summary.startedAt.split('T')[0];
            const datedPath = path.join(outputDir, `error-report_${datePart}.json`);
            const latestPath = path.join(outputDir, 'latest-error-report.json');

            const serialized = JSON.stringify(report, null, 2);
            fs.writeFileSync(datedPath, serialized, 'utf-8');
            fs.writeFileSync(latestPath, serialized, 'utf-8');

            return latestPath;
        } catch {
            return null;
        }
    }
}
