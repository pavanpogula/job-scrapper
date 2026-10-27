/**
 * @file Run Telemetry & Error Tracker for Scraper & Bug-Fix Agent (v2.0)
 * @summary Collects API errors, validation/sanitization issues, DB errors, and run statistics into structured v2.0 JSON reports
 * @tags Telemetry, Error Tracking, Bug Fix Agent, Diagnostics, Reporting, SchemaV2
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { ValidationIssue } from './Sanitizer';
import { AtsSource } from './ats/source';

export type ErrorCategory =
    | 'api_error'
    | 'not_found'
    | 'graphql_fallback'
    | 'validation_filtered'
    | 'validation_sanitized'
    | 'validation_issue'
    | 'db_error'
    | 'company_quarantined'
    | 'company_unreachable'
    | 'company_error'
    | 'rate_limited'
    | 'suspicious_empty_board'
    | 'worker_failed'
    | 'cache_publish_failed'
    | 'cache_details_truncated'
    | 'sanity_gate_failed';

export interface RecordedErrorEvent {
    id?: string;
    timestamp: string;
    category: ErrorCategory;
    source?: AtsSource;
    subkind?: string;
    companySlug: string;
    jobId?: string;
    field?: string;
    message: string;
    actionTaken: string;
    httpStatus?: number;
    attempts?: number;
    samplePayload?: Record<string, any>;
}

export interface SourceTelemetrySummary {
    companiesAttempted: number;
    companiesWithJobs: number;
    jobsCollected: number;
    notFound: number;
    apiErrors: number;
}

export interface RunMetadata {
    runId: string;
    mode: 'cluster' | 'single' | 'csv';
    trigger: 'schedule' | 'workflow_dispatch' | 'local';
    gitSha: string;
    gitBranch: string;
    ciRunUrl?: string;
    nodeVersion: string;
    workers?: number;
    perWorkerConcurrency?: number;
    startedAt: string;
    completedAt: string;
    durationSeconds: number;
    outcome: 'success' | 'partial' | 'failed';
    exitCode: number;
}

export interface RunTelemetrySummary {
    runId: string;
    mode: string;
    startedAt: string;
    completedAt: string;
    durationSeconds: number;
    companiesAttempted: number;
    companiesWithJobs: number;
    companiesNotFound: number;
    companiesFailed: number;
    companiesQuarantined?: number;
    graphqlFallbacksUsed: number;
    rateLimitsEncountered: number;
    jobsCollected: number;
    jobsSanitized: number;
    jobsFilteredOut: number;
    jobsCreated?: number;
    jobsUpdated?: number;
    jobsUnchanged?: number;
    jobsReactivated?: number;
    jobsDeactivated?: number;
    dbErrors: number;
    dbActiveJobsBefore?: number;
    dbActiveJobsAfter?: number;
    bySource?: Partial<Record<AtsSource, SourceTelemetrySummary>>;
}

export interface CategoryTelemetry {
    count: number;
    distinctCompanies?: number;
    newThisRun?: number;
    bySubkind?: Record<string, number>;
}

export interface ErrorReportDocument {
    schemaVersion: '2.0';
    run: RunMetadata;
    summary: RunTelemetrySummary;
    workers?: Array<{
        workerId: number;
        pid?: number;
        companies: number;
        status: 'ok' | 'failed' | 'timeout';
        durationSeconds: number;
        error?: string;
    }>;
    cache?: Record<string, any>;
    categories: Record<string, CategoryTelemetry>;
    topFailingCompanies?: Array<{
        slug: string;
        category: string;
        consecutiveRuns: number;
        lastSuccessAt?: string | null;
    }>;
    issues?: any[];
    diffVsPrevious?: any;
    events: RecordedErrorEvent[];
}

const MAX_EVENTS_PER_CATEGORY = 100;
const MAX_LOCAL_REPORTS_KEPT = 60;

/**
 * @summary Generates standard runId in format YYYYMMDDTHHmmssZ-<mode>-<sha>
 * @param mode Operational mode (cluster, single, csv)
 * @param startTime Milliseconds timestamp
 * @returns Formatted run ID string
 */
export function generateRunId(mode: 'cluster' | 'single' | 'csv', startTime: number): string {
    const d = new Date(startTime);
    const pad = (n: number) => String(n).padStart(2, '0');
    const yyyy = d.getUTCFullYear();
    const mm = pad(d.getUTCMonth() + 1);
    const dd = pad(d.getUTCDate());
    const hh = pad(d.getUTCHours());
    const min = pad(d.getUTCMinutes());
    const ss = pad(d.getUTCSeconds());
    const timestamp = `${yyyy}${mm}${dd}T${hh}${min}${ss}Z`;

    let gitSha = 'unknown';
    try {
        gitSha = execSync('git rev-parse --short HEAD', {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore']
        }).trim();
    } catch {
        gitSha = 'unknown';
    }

    return `${timestamp}-${mode}-${gitSha}`;
}

/**
 * @summary Tracks errors, fallbacks, and sanitization events during a scrape run and writes agent-readable JSON reports
 */
export class ErrorTracker {
    public rawMode: 'db_scrape' | 'csv_scrape' | 'cluster';
    public canonicalMode: 'cluster' | 'single' | 'csv';
    public startTimeMs: number;
    public startedAtIso: string;
    public runId: string;

    private events: RecordedErrorEvent[] = [];
    private eventsByCategory = new Map<string, number>();
    private categoryCounts = new Map<string, number>();
    private categoryCompanies = new Map<string, Set<string>>();
    private categorySubkinds = new Map<string, Map<string, number>>();

    // Deduplication sets for accurate job counts
    private filteredJobIds = new Set<string>();
    private sanitizedJobIds = new Set<string>();

    public companiesAttempted = 0;
    public companiesWithJobs = 0;
    public companiesNotFound = 0;
    public companiesFailed = 0;
    public companiesQuarantined = 0;
    public graphqlFallbacksUsed = 0;
    public rateLimitsEncountered = 0;
    public jobsCollected = 0;
    public jobsSanitized = 0;
    public jobsFilteredOut = 0;
    public jobsCreated = 0;
    public jobsUpdated = 0;
    public jobsUnchanged = 0;
    public jobsReactivated = 0;
    public jobsDeactivated = 0;
    public dbErrors = 0;
    public dbActiveJobsBefore = 0;
    public dbActiveJobsAfter = 0;

    public outcome: 'success' | 'partial' | 'failed' = 'success';
    public exitCode = 0;
    public workersList: ErrorReportDocument['workers'] = [];
    public bySource: Partial<Record<AtsSource, SourceTelemetrySummary>> = {};

    /**
     * @summary Initializes a new ErrorTracker instance for a scrape run
     * @param mode Operational scrape mode
     */
    constructor(mode: 'db_scrape' | 'csv_scrape' | 'cluster' = 'db_scrape') {
        this.rawMode = mode;
        this.canonicalMode = mode === 'cluster' ? 'cluster' : mode === 'csv_scrape' ? 'csv' : 'single';
        this.startTimeMs = Date.now();
        this.startedAtIso = new Date(this.startTimeMs).toISOString();
        this.runId = generateRunId(this.canonicalMode, this.startTimeMs);
    }

    /**
     * @summary Returns or initializes per-source telemetry summary counters
     */
    public ensureSourceStats(source: AtsSource): SourceTelemetrySummary {
        let stats = this.bySource[source];
        if (!stats) {
            stats = {
                companiesAttempted: 0,
                companiesWithJobs: 0,
                jobsCollected: 0,
                notFound: 0,
                apiErrors: 0
            };
            this.bySource[source] = stats;
        }
        return stats;
    }

    /**
     * @summary Increments companiesAttempted for a given ATS source
     */
    public recordSourceAttempt(source: AtsSource): void {
        this.ensureSourceStats(source).companiesAttempted++;
    }

    /**
     * @summary Increments companiesWithJobs and jobsCollected for a given ATS source when jobs > 0
     */
    public recordSourceJobs(source: AtsSource, jobCount: number): void {
        const stats = this.ensureSourceStats(source);
        if (jobCount > 0) {
            stats.companiesWithJobs++;
            stats.jobsCollected += jobCount;
        }
    }

    /**
     * @summary Increments notFound counter for a given ATS source
     */
    public recordSourceNotFound(source: AtsSource): void {
        this.ensureSourceStats(source).notFound++;
    }

    /**
     * @summary Records a structured event with category-capped storage and exact metric tracking
     * @param event The error event to record
     */
    public recordEvent(event: Omit<RecordedErrorEvent, 'timestamp'>): void {
        const cat = event.category;

        if (event.source) {
            const stats = this.ensureSourceStats(event.source);
            if (cat === 'api_error') {
                stats.apiErrors++;
            } else if (cat === 'not_found') {
                stats.notFound++;
            }
        }

        // Exact counter tracking
        const currCount = (this.categoryCounts.get(cat) ?? 0) + 1;
        this.categoryCounts.set(cat, currCount);

        // Distinct companies per category
        if (!this.categoryCompanies.has(cat)) {
            this.categoryCompanies.set(cat, new Set());
        }
        if (event.companySlug) {
            this.categoryCompanies.get(cat)!.add(event.companySlug);
        }

        // Subkind tracking
        if (event.subkind) {
            if (!this.categorySubkinds.has(cat)) {
                this.categorySubkinds.set(cat, new Map());
            }
            const subMap = this.categorySubkinds.get(cat)!;
            subMap.set(event.subkind, (subMap.get(event.subkind) ?? 0) + 1);
        }

        // Bound event list per category
        const storedForCat = this.eventsByCategory.get(cat) ?? 0;
        if (storedForCat < MAX_EVENTS_PER_CATEGORY) {
            this.eventsByCategory.set(cat, storedForCat + 1);
            this.events.push({
                id: `ev-${this.events.length + 1}`,
                timestamp: new Date().toISOString(),
                ...event
            });
        }
    }

    /**
     * @summary Records validation and sanitization issues returned by Sanitizer, splitting into filtered and sanitized
     * @param issues Validation issues list
     * @param source Optional ATS source identifier
     */
    public recordValidationIssues(issues: ValidationIssue[], source?: AtsSource): void {
        for (const issue of issues) {
            if (issue.action === 'filtered') {
                if (issue.jobId) this.filteredJobIds.add(issue.jobId);
                this.jobsFilteredOut = this.filteredJobIds.size;

                this.recordEvent({
                    category: 'validation_filtered',
                    ...(source ? { source } : {}),
                    subkind: issue.field || 'unknown',
                    companySlug: issue.companySlug,
                    jobId: issue.jobId,
                    field: issue.field,
                    message: issue.reason,
                    actionTaken: 'filtered'
                });
            } else {
                if (issue.jobId) this.sanitizedJobIds.add(issue.jobId);
                this.jobsSanitized = this.sanitizedJobIds.size;

                this.recordEvent({
                    category: 'validation_sanitized',
                    ...(source ? { source } : {}),
                    subkind: issue.field || 'unknown',
                    companySlug: issue.companySlug,
                    jobId: issue.jobId,
                    field: issue.field,
                    message: issue.reason,
                    actionTaken: issue.action
                });
            }
        }
    }

    /**
     * @summary Builds the complete ErrorReportDocument for the current run matching schema v2.0
     * @returns Complete ErrorReportDocument object
     */
    public buildReport(): ErrorReportDocument {
        const completedAtMs = Date.now();
        const durationSeconds = Number(((completedAtMs - this.startTimeMs) / 1000).toFixed(2));

        let gitSha = 'unknown';
        let gitBranch = process.env.GITHUB_REF_NAME || 'unknown';
        try {
            gitSha = execSync('git rev-parse --short HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
            if (gitBranch === 'unknown') {
                gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
            }
        } catch {
            // fallback
        }

        const categories: Record<string, CategoryTelemetry> = {};
        for (const [cat, count] of this.categoryCounts.entries()) {
            const entry: CategoryTelemetry = { count };
            const compSet = this.categoryCompanies.get(cat);
            if (compSet && compSet.size > 0) {
                entry.distinctCompanies = compSet.size;
            }
            const subMap = this.categorySubkinds.get(cat);
            if (subMap && subMap.size > 0) {
                entry.bySubkind = Object.fromEntries(subMap.entries());
            }
            categories[cat] = entry;
        }

        // Determine outcome
        const outcome = this.companiesFailed > 0 || this.dbErrors > 0
            ? (this.companiesWithJobs > 0 ? 'partial' : 'failed')
            : this.outcome;

        return {
            schemaVersion: '2.0',
            run: {
                runId: this.runId,
                mode: this.canonicalMode,
                trigger: (process.env.GITHUB_EVENT_NAME as any) || 'local',
                gitSha,
                gitBranch,
                ciRunUrl: process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
                    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
                    : undefined,
                nodeVersion: process.version,
                startedAt: this.startedAtIso,
                completedAt: new Date(completedAtMs).toISOString(),
                durationSeconds,
                outcome,
                exitCode: this.exitCode
            },
            summary: {
                runId: this.runId,
                mode: this.rawMode,
                startedAt: this.startedAtIso,
                completedAt: new Date(completedAtMs).toISOString(),
                durationSeconds,
                companiesAttempted: this.companiesAttempted,
                companiesWithJobs: this.companiesWithJobs,
                companiesNotFound: this.companiesNotFound,
                companiesFailed: this.companiesFailed,
                companiesQuarantined: this.companiesQuarantined,
                graphqlFallbacksUsed: this.graphqlFallbacksUsed,
                rateLimitsEncountered: this.rateLimitsEncountered,
                jobsCollected: this.jobsCollected,
                jobsSanitized: this.jobsSanitized,
                jobsFilteredOut: this.jobsFilteredOut,
                jobsCreated: this.jobsCreated,
                jobsUpdated: this.jobsUpdated,
                jobsUnchanged: this.jobsUnchanged,
                jobsReactivated: this.jobsReactivated,
                jobsDeactivated: this.jobsDeactivated,
                dbErrors: this.dbErrors,
                dbActiveJobsBefore: this.dbActiveJobsBefore,
                dbActiveJobsAfter: this.dbActiveJobsAfter,
                ...(Object.keys(this.bySource).length > 0 ? { bySource: this.bySource } : {})
            },
            workers: (this.workersList && this.workersList.length > 0) ? this.workersList : undefined,
            categories,
            events: this.events
        };
    }

    /**
     * @summary Prunes local report files exceeding the 60-report retention cap
     * @param outDir Base output directory
     */
    private pruneOldReports(outDir: string): void {
        try {
            const reportsRoot = path.join(outDir, 'reports');
            if (!fs.existsSync(reportsRoot)) return;

            const files: Array<{ filePath: string; mtime: number }> = [];
            const monthDirs = fs.readdirSync(reportsRoot, { withFileTypes: true });

            for (const dirent of monthDirs) {
                if (dirent.isDirectory()) {
                    const monthPath = path.join(reportsRoot, dirent.name);
                    const reportFiles = fs.readdirSync(monthPath);
                    for (const f of reportFiles) {
                        if (f.endsWith('.json')) {
                            const fp = path.join(monthPath, f);
                            const stat = fs.statSync(fp);
                            files.push({ filePath: fp, mtime: stat.mtimeMs });
                        }
                    }
                }
            }

            if (files.length > MAX_LOCAL_REPORTS_KEPT) {
                files.sort((a, b) => b.mtime - a.mtime);
                const toDelete = files.slice(MAX_LOCAL_REPORTS_KEPT);
                for (const item of toDelete) {
                    try {
                        fs.unlinkSync(item.filePath);
                        const mdPath = item.filePath.replace(/\.json$/, '.md');
                        if (fs.existsSync(mdPath)) fs.unlinkSync(mdPath);
                        const issuesPath = item.filePath.replace(/\.json$/, '.issues.json');
                        if (fs.existsSync(issuesPath)) fs.unlinkSync(issuesPath);
                    } catch {
                        // ignore delete error
                    }
                }
            }
        } catch {
            // ignore prune error
        }
    }

    /**
     * @summary Saves the complete report to structured output paths and writes latest-<mode>.json
     * @param baseDir Optional directory to write output to (defaults to ./output)
     * @returns Absolute path to saved JSON report
     */
    public saveReport(baseDir?: string): string {
        const outDir = baseDir || path.join(process.cwd(), 'output');
        const report = this.buildReport();
        const date = new Date(this.startTimeMs);
        const yyyyMm = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
        const reportsDir = path.join(outDir, 'reports', yyyyMm);
        fs.mkdirSync(reportsDir, { recursive: true });

        const reportPath = path.join(reportsDir, `${this.runId}.json`);
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

        // Mode-specific file
        const latestModePath = path.join(outDir, `latest-${this.canonicalMode}.json`);
        fs.writeFileSync(latestModePath, JSON.stringify(report, null, 2), 'utf8');

        // Backward compatibility: DB-mode runs write latest-error-report.json
        if (this.canonicalMode !== 'csv') {
            const compatPath = path.join(outDir, 'latest-error-report.json');
            fs.writeFileSync(compatPath, JSON.stringify(report, null, 2), 'utf8');
        }

        this.pruneOldReports(outDir);

        return reportPath;
    }

    /**
     * @summary Merges multiple worker reports into a single consolidated report
     * @param reports List of worker ErrorReportDocument reports
     * @param startedAtMs Overall scrape start time in ms
     * @param mode Run mode (cluster | db_scrape | csv_scrape)
     * @returns Consolidated ErrorReportDocument
     */
    public static mergeReports(
        reports: ErrorReportDocument[],
        startedAtMs: number,
        mode: 'db_scrape' | 'csv_scrape' | 'cluster' = 'cluster'
    ): ErrorReportDocument {
        const completedAtMs = Date.now();
        const canonicalMode = mode === 'csv_scrape' ? 'csv' : 'cluster';
        const runId = generateRunId(canonicalMode, startedAtMs);

        const summary: RunTelemetrySummary = {
            runId,
            mode,
            startedAt: new Date(startedAtMs).toISOString(),
            completedAt: new Date(completedAtMs).toISOString(),
            durationSeconds: Number(((completedAtMs - startedAtMs) / 1000).toFixed(2)),
            companiesAttempted: 0,
            companiesWithJobs: 0,
            companiesNotFound: 0,
            companiesFailed: 0,
            companiesQuarantined: 0,
            graphqlFallbacksUsed: 0,
            rateLimitsEncountered: 0,
            jobsCollected: 0,
            jobsSanitized: 0,
            jobsFilteredOut: 0,
            jobsCreated: 0,
            jobsUpdated: 0,
            jobsUnchanged: 0,
            jobsReactivated: 0,
            jobsDeactivated: 0,
            dbErrors: 0,
            dbActiveJobsBefore: 0,
            dbActiveJobsAfter: 0
        };

        const mergedCategories: Record<string, CategoryTelemetry> = {};
        const eventsByCategory = new Map<string, number>();
        const mergedEvents: RecordedErrorEvent[] = [];

        for (const r of reports) {
            summary.companiesAttempted += r.summary.companiesAttempted || 0;
            summary.companiesWithJobs += r.summary.companiesWithJobs || 0;
            summary.companiesNotFound += r.summary.companiesNotFound || 0;
            summary.companiesFailed += r.summary.companiesFailed || 0;
            summary.companiesQuarantined = (summary.companiesQuarantined || 0) + (r.summary.companiesQuarantined || 0);
            summary.graphqlFallbacksUsed += r.summary.graphqlFallbacksUsed || 0;
            summary.rateLimitsEncountered += r.summary.rateLimitsEncountered || 0;
            summary.jobsCollected += r.summary.jobsCollected || 0;
            summary.jobsSanitized += r.summary.jobsSanitized || 0;
            summary.jobsFilteredOut += r.summary.jobsFilteredOut || 0;
            summary.jobsCreated = (summary.jobsCreated || 0) + (r.summary.jobsCreated || 0);
            summary.jobsUpdated = (summary.jobsUpdated || 0) + (r.summary.jobsUpdated || 0);
            summary.jobsUnchanged = (summary.jobsUnchanged || 0) + (r.summary.jobsUnchanged || 0);
            summary.jobsReactivated = (summary.jobsReactivated || 0) + (r.summary.jobsReactivated || 0);
            summary.jobsDeactivated = (summary.jobsDeactivated || 0) + (r.summary.jobsDeactivated || 0);
            summary.dbErrors += r.summary.dbErrors || 0;

            if (r.summary.bySource) {
                summary.bySource = summary.bySource || {};
                for (const [src, srcStats] of Object.entries(r.summary.bySource)) {
                    if (!srcStats) continue;
                    const atsSrc = src as AtsSource;
                    if (!summary.bySource[atsSrc]) {
                        summary.bySource[atsSrc] = {
                            companiesAttempted: 0,
                            companiesWithJobs: 0,
                            jobsCollected: 0,
                            notFound: 0,
                            apiErrors: 0
                        };
                    }
                    const dest = summary.bySource[atsSrc]!;
                    dest.companiesAttempted += srcStats.companiesAttempted || 0;
                    dest.companiesWithJobs += srcStats.companiesWithJobs || 0;
                    dest.jobsCollected += srcStats.jobsCollected || 0;
                    dest.notFound += srcStats.notFound || 0;
                    dest.apiErrors += srcStats.apiErrors || 0;
                }
            }

            if (r.categories) {
                for (const [cat, data] of Object.entries(r.categories)) {
                    if (!mergedCategories[cat]) {
                        mergedCategories[cat] = { count: 0, distinctCompanies: 0 };
                    }
                    mergedCategories[cat].count += data.count || 0;
                    mergedCategories[cat].distinctCompanies =
                        (mergedCategories[cat].distinctCompanies || 0) + (data.distinctCompanies || 0);

                    if (data.bySubkind) {
                        mergedCategories[cat].bySubkind = mergedCategories[cat].bySubkind || {};
                        for (const [subk, count] of Object.entries(data.bySubkind)) {
                            mergedCategories[cat].bySubkind![subk] =
                                (mergedCategories[cat].bySubkind![subk] || 0) + count;
                        }
                    }
                }
            }

            for (const ev of r.events || []) {
                const count = eventsByCategory.get(ev.category) || 0;
                if (count < MAX_EVENTS_PER_CATEGORY) {
                    eventsByCategory.set(ev.category, count + 1);
                    mergedEvents.push(ev);
                }
            }
        }

        let gitSha = 'unknown';
        let gitBranch = process.env.GITHUB_REF_NAME || 'unknown';
        try {
            gitSha = execSync('git rev-parse --short HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
            if (gitBranch === 'unknown') {
                gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
            }
        } catch {
            // fallback
        }

        return {
            schemaVersion: '2.0',
            run: {
                runId,
                mode: canonicalMode,
                trigger: (process.env.GITHUB_EVENT_NAME as any) || 'local',
                gitSha,
                gitBranch,
                nodeVersion: process.version,
                startedAt: summary.startedAt,
                completedAt: summary.completedAt,
                durationSeconds: summary.durationSeconds,
                outcome: summary.companiesFailed > 0 || summary.dbErrors > 0 ? 'partial' : 'success',
                exitCode: summary.companiesFailed > 0 || summary.dbErrors > 0 ? 1 : 0
            },
            summary,
            categories: mergedCategories,
            events: mergedEvents
        };
    }

    /**
     * @summary Saves consolidated cluster report to reports/<YYYY-MM>/<runId>.json and latest-error-report.json
     * @param report Consolidated ErrorReportDocument
     * @param baseDir Optional directory to write output to (defaults to ./output)
     * @returns Absolute path to saved JSON report
     */
    public static saveMergedReport(report: ErrorReportDocument, baseDir?: string): string {
        const outDir = baseDir || path.join(process.cwd(), 'output');
        const date = new Date(report.run.startedAt);
        const yyyyMm = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
        const reportsDir = path.join(outDir, 'reports', yyyyMm);
        fs.mkdirSync(reportsDir, { recursive: true });

        const reportPath = path.join(reportsDir, `${report.run.runId}.json`);
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

        // Mode specific file
        const latestModePath = path.join(outDir, `latest-${report.run.mode}.json`);
        fs.writeFileSync(latestModePath, JSON.stringify(report, null, 2), 'utf8');

        // Backward compatibility: DB-mode run copies to latest-error-report.json
        if (report.run.mode !== 'csv') {
            const compatPath = path.join(outDir, 'latest-error-report.json');
            fs.writeFileSync(compatPath, JSON.stringify(report, null, 2), 'utf8');
        }

        return reportPath;
    }
}
