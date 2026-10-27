/**
 * @file Report Classifier and Self-Healing Loop Gate (v2.0)
 * @summary Evaluates scrape reports against classification rules R-*, manages run-history.json, and outputs actionable issues
 * @tags Classifier, Error Report, Self-Healing, Telemetry, Rules
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { ErrorReportDocument } from './ErrorTracker';

export type Severity = 'S1' | 'S2' | 'S3';
export type IssueStatus = 'new' | 'recurring' | 'regressed';

export interface ClassifiedIssue {
    fingerprint: string;
    category: string;
    subkind?: string;
    severity: Severity;
    actionable: boolean;
    rule: string;
    count: number;
    companies: string[];
    sampleEventIds: string[];
    status: IssueStatus;
    firstSeenRunId: string;
    consecutiveRuns: number;
    relatedBF: string[];
    suggestedAction?: string;
    fixAttempts: number;
    openPr: string | null;
}

export interface RunHistoryItem {
    runId: string;
    startedAt: string;
    durationSeconds: number;
    outcome: string;
    companiesWithJobs: number;
    jobsCollected: number;
    dbActiveJobs?: number;
    fingerprints: string[];
    resolvedFingerprints?: string[];
}

export interface ClassificationResult {
    runId: string;
    actionable: boolean;
    infraAlert: boolean;
    issues: ClassifiedIssue[];
    markdownSummary: string;
    issuesFilePath?: string;
    markdownFilePath?: string;
}

/**
 * @summary Normalizes error message strings replacing variable segments (UUIDs, IDs, URLs, numbers) with stable placeholders
 * @param message Raw error message string
 * @returns Normalized template string for deterministic fingerprinting
 */
export function normalizeMessage(message: string): string {
    if (!message) return '';
    return message
        .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>')
        .replace(/https?:\/\/[^\s]+/gi, '<URL>')
        .replace(/\b[0-9a-f]{8,}\b/gi, '<HEX>')
        .replace(/\b\d+\b/g, '<NUM>')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * @summary Computes deterministic SHA-1 fingerprint for an issue based on category, subkind, field, and normalized message
 * @param category Error category
 * @param subkind Optional subkind
 * @param field Optional affected field
 * @param message Error message
 * @returns 40-character hex SHA-1 fingerprint
 */
export function computeIssueFingerprint(
    category: string,
    subkind?: string,
    field?: string,
    message?: string
): string {
    const normalized = normalizeMessage(message || '');
    const key = `${category}|${subkind || ''}|${field || ''}|${normalized}`;
    return crypto.createHash('sha1').update(key).digest('hex');
}

/**
 * Category to Related BF map from doc 07 §2.2
 */
const CATEGORY_BF_MAP: Record<string, string[]> = {
    api_error: ['BF-001'],
    not_found: ['BF-001'],
    graphql_fallback: ['BF-001'],
    validation_filtered: ['BF-002', 'BF-003', 'BF-004'],
    validation_sanitized: ['BF-002', 'BF-003', 'BF-004'],
    db_error: ['BF-004', 'BF-010'],
    company_error: ['BF-006'],
    company_quarantined: ['BF-006'],
    company_unreachable: ['BF-006'],
    suspicious_empty_board: ['BF-006'],
    worker_failed: ['BF-008'],
    rate_limited: ['BF-001', 'BF-014'],
    cache_publish_failed: ['BF-010'],
    cache_details_truncated: ['BF-010'],
    sanity_gate_failed: ['BF-010']
};

/**
 * @summary Resolves source-aware related BF IDs for an issue category and source
 */
export function resolveRelatedBF(category: string, source?: string): string[] {
    if (source === 'greenhouse') {
        if (category === 'api_error' || category === 'not_found') {
            return ['BF-023'];
        }
        if (category === 'rate_limited') {
            return ['BF-014', 'BF-015', 'BF-023'];
        }
        if (category === 'validation_filtered' || category === 'validation_sanitized') {
            return ['BF-002', 'BF-003', 'BF-004', 'BF-023'];
        }
    }
    return CATEGORY_BF_MAP[category] || [];
}

/**
 * @summary Classifies an ErrorReportDocument against rules R-*, updates run-history.json, and produces classified issues
 * @param report Parsed ErrorReportDocument v2.0
 * @param options Configuration for paths, history, and open PRs
 * @returns ClassificationResult with actionable flag, issues list, and markdown summary
 */
export function classifyReport(
    report: ErrorReportDocument,
    options: {
        outputDir?: string;
        runHistoryPath?: string;
        githubOutput?: string;
        openPrs?: Array<{ headRefName: string; body: string }>;
    } = {}
): ClassificationResult {
    const outputDir = options.outputDir || path.join(process.cwd(), 'output');
    const historyPath = options.runHistoryPath || path.join(outputDir, 'run-history.json');
    const openPrs = options.openPrs || [];

    // 1. Read existing run history
    let history: RunHistoryItem[] = [];
    if (fs.existsSync(historyPath)) {
        try {
            history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
        } catch {
            history = [];
        }
    }

    const previousRun = history.length > 0 ? history[history.length - 1] : null;
    const allPastResolved = new Set<string>();
    for (const h of history) {
        if (h.resolvedFingerprints) {
            h.resolvedFingerprints.forEach(fp => allPastResolved.add(fp));
        }
    }

    // 2. Evaluate R-INFRA-1
    let isInfraAlert = false;
    const allEvents = report.events || [];
    const infraPattern = /P1000|P1001|P1017|authentication failed|password authentication|ENOTFOUND|quota exceeded|out of memory|budget exceeded/i;

    for (const ev of allEvents) {
        if (ev.category === 'db_error' && infraPattern.test(ev.message)) {
            isInfraAlert = true;
            break;
        }
    }

    // 3. Cluster events into candidate issues
    const issueMap = new Map<string, {
        fingerprint: string;
        category: string;
        source?: string;
        subkind?: string;
        field?: string;
        normalizedMsg: string;
        count: number;
        companies: Set<string>;
        eventIds: string[];
    }>();

    for (const ev of allEvents) {
        const fp = computeIssueFingerprint(ev.category, ev.subkind, ev.field, ev.message);
        const evSource =
            ev.source ||
            (ev.message?.includes('Greenhouse Board API') || ev.companySlug?.startsWith('gh--')
                ? 'greenhouse'
                : undefined);
        if (!issueMap.has(fp)) {
            issueMap.set(fp, {
                fingerprint: fp,
                category: ev.category,
                source: evSource,
                subkind: ev.subkind,
                field: ev.field,
                normalizedMsg: normalizeMessage(ev.message),
                count: 0,
                companies: new Set(),
                eventIds: []
            });
        }
        const item = issueMap.get(fp)!;
        if (!item.source && evSource) {
            item.source = evSource;
        }
        item.count++;
        if (ev.companySlug) item.companies.add(ev.companySlug);
        if (ev.id && item.eventIds.length < 5) item.eventIds.push(ev.id);
    }

    const classifiedIssues: ClassifiedIssue[] = [];

    // Helper to check PR coverage
    const findOpenPr = (fp: string): string | null => {
        for (const pr of openPrs) {
            if (pr.body && pr.body.includes(`<!-- fp:${fp} -->`)) {
                return pr.headRefName;
            }
        }
        return null;
    };

    // Helper to find consecutive runs for a fingerprint
    const getConsecutiveRuns = (fp: string): number => {
        let count = 1;
        for (let i = history.length - 1; i >= 0; i--) {
            if (history[i].fingerprints && history[i].fingerprints.includes(fp)) {
                count++;
            } else {
                break;
            }
        }
        return count;
    };

    // Helper to evaluate issue status
    const determineStatus = (fp: string): IssueStatus => {
        if (allPastResolved.has(fp)) {
            return 'regressed';
        }
        if (previousRun && previousRun.fingerprints && previousRun.fingerprints.includes(fp)) {
            return 'recurring';
        }
        return 'new';
    };

    // Evaluate individual clustered issues
    for (const item of issueMap.values()) {
        const fp = item.fingerprint;
        const status = determineStatus(fp);
        const consecutiveRuns = getConsecutiveRuns(fp);
        const openPr = findOpenPr(fp);
        const relatedBF = resolveRelatedBF(item.category, item.source);

        let actionable = false;
        let severity: Severity = 'S3';
        let rule = 'NOISE';

        if (status === 'regressed') {
            actionable = true;
            severity = 'S1';
            rule = 'R-REGRESS-1';
        } else if (item.category === 'db_error' && !isInfraAlert) {
            actionable = true;
            severity = 'S1';
            rule = 'R-DB-1';
        } else if (item.category === 'sanity_gate_failed') {
            actionable = true;
            severity = 'S1';
            rule = 'R-GATE-1';
        } else if (item.category === 'validation_filtered') {
            const filteredRatio = item.count / Math.max(1, report.summary.jobsCollected);
            if (status === 'new' || filteredRatio > 0.005) {
                actionable = true;
                severity = 'S2';
                rule = 'R-VAL-1';
            }
        } else if (item.category === 'validation_sanitized') {
            if (status === 'new' && item.count >= 50) {
                actionable = true;
                severity = 'S3';
                rule = 'R-VAL-2';
            }
        } else if (item.category === 'api_error') {
            const attempted = Math.max(1, report.summary.companiesAttempted);
            if (item.companies.size / attempted > 0.05 || consecutiveRuns >= 3) {
                actionable = true;
                severity = 'S2';
                rule = 'R-API-1';
            }
        } else if (item.category === 'company_error' || item.category === 'company_unreachable') {
            actionable = true;
            severity = 'S2';
            rule = 'R-CO-1';
        } else if (item.category === 'cache_publish_failed') {
            if (consecutiveRuns >= 2) {
                actionable = true;
                severity = 'S2';
                rule = 'R-CACHE-1';
            }
        } else if (item.category === 'cache_details_truncated') {
            actionable = true;
            severity = 'S3';
            rule = 'R-CACHE-2';
        }

        // Apply R-RECUR-1
        if (actionable && openPr) {
            // Already has open PR, don't trigger new fixer
            actionable = false;
            rule = 'R-RECUR-1';
        }

        if (actionable) {
            classifiedIssues.push({
                fingerprint: fp,
                category: item.category,
                subkind: item.subkind,
                severity,
                actionable,
                rule,
                count: item.count,
                companies: Array.from(item.companies).slice(0, 10),
                sampleEventIds: item.eventIds,
                status,
                firstSeenRunId: report.run.runId,
                consecutiveRuns,
                relatedBF,
                suggestedAction: item.normalizedMsg,
                fixAttempts: 0,
                openPr
            });
        }
    }

    // Evaluate summary-level rules (R-RUN-1, R-GATE-2, R-NF-2, R-RL-1)
    if (report.run.outcome !== 'success' && !isInfraAlert && classifiedIssues.length === 0) {
        const fp = computeIssueFingerprint('run_outcome', undefined, undefined, `Scrape run outcome: ${report.run.outcome}`);
        classifiedIssues.push({
            fingerprint: fp,
            category: 'run_outcome',
            severity: 'S1',
            actionable: true,
            rule: 'R-RUN-1',
            count: 1,
            companies: [],
            sampleEventIds: [],
            status: determineStatus(fp),
            firstSeenRunId: report.run.runId,
            consecutiveRuns: 1,
            relatedBF: ['BF-008'],
            suggestedAction: `Investigate run failure outcome=${report.run.outcome} exitCode=${report.run.exitCode}`,
            fixAttempts: 0,
            openPr: findOpenPr(fp)
        });
    }

    if (previousRun && previousRun.dbActiveJobs && report.summary.dbActiveJobsAfter) {
        const prevActive = previousRun.dbActiveJobs;
        const currActive = report.summary.dbActiveJobsAfter;
        if (currActive < prevActive * 0.8) {
            const fp = computeIssueFingerprint('early_warning', 'jobs_drop', undefined, 'Active jobs dropped by > 20%');
            classifiedIssues.push({
                fingerprint: fp,
                category: 'early_warning',
                subkind: 'jobs_drop',
                severity: 'S2',
                actionable: true,
                rule: 'R-GATE-2',
                count: 1,
                companies: [],
                sampleEventIds: [],
                status: 'new',
                firstSeenRunId: report.run.runId,
                consecutiveRuns: 1,
                relatedBF: ['BF-006'],
                suggestedAction: 'Active jobs dropped by > 20% against previous run',
                fixAttempts: 0,
                openPr: findOpenPr(fp)
            });
        }
    }

    // Sort issues by severity: S1 > S2 > S3, then regressed, then consecutiveRuns desc
    const sevScore: Record<Severity, number> = { S1: 3, S2: 2, S3: 1 };
    classifiedIssues.sort((a, b) => {
        if (sevScore[a.severity] !== sevScore[b.severity]) {
            return sevScore[b.severity] - sevScore[a.severity];
        }
        if (a.status === 'regressed' && b.status !== 'regressed') return -1;
        if (b.status === 'regressed' && a.status !== 'regressed') return 1;
        return b.consecutiveRuns - a.consecutiveRuns;
    });

    // Cap issues for fixer at 3
    const fixerIssues = classifiedIssues.slice(0, 3);
    const hasActionable = !isInfraAlert && fixerIssues.length > 0;

    // 4. Update run history (max 30 items)
    const currentFingerprints = classifiedIssues.map(i => i.fingerprint);
    const resolvedFingerprints: string[] = [];

    if (previousRun && previousRun.fingerprints) {
        for (const prevFp of previousRun.fingerprints) {
            if (!currentFingerprints.includes(prevFp)) {
                resolvedFingerprints.push(prevFp);
            }
        }
    }

    const historyEntry: RunHistoryItem = {
        runId: report.run.runId,
        startedAt: report.run.startedAt,
        durationSeconds: report.run.durationSeconds,
        outcome: report.run.outcome,
        companiesWithJobs: report.summary.companiesWithJobs,
        jobsCollected: report.summary.jobsCollected,
        dbActiveJobs: report.summary.dbActiveJobsAfter,
        fingerprints: currentFingerprints,
        resolvedFingerprints
    };

    history.push(historyEntry);
    if (history.length > 30) {
        history.shift();
    }

    try {
        fs.mkdirSync(path.dirname(historyPath), { recursive: true });
        fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf8');
    } catch {
        // ignore history write failure
    }

    // 5. Build Markdown summary
    const dStart = new Date(report.run.startedAt);
    const hh = String(dStart.getUTCHours()).padStart(2, '0');
    const mm = String(dStart.getUTCMinutes()).padStart(2, '0');
    const ss = String(dStart.getUTCSeconds()).padStart(2, '0');
    const startTimeUtc = `${hh}:${mm}:${ss} UTC`;

    const prevJobs = previousRun?.jobsCollected ?? '—';
    const deltaJobs = previousRun?.jobsCollected ? (report.summary.jobsCollected - previousRun.jobsCollected) : '—';
    const deltaJobsStr = typeof deltaJobs === 'number' ? (deltaJobs >= 0 ? `+${deltaJobs}` : `${deltaJobs}`) : '—';

    const prevCompanies = previousRun?.companiesWithJobs ?? '—';
    const deltaCompanies = previousRun?.companiesWithJobs ? (report.summary.companiesWithJobs - previousRun.companiesWithJobs) : '—';
    const deltaCompaniesStr = typeof deltaCompanies === 'number' ? (deltaCompanies >= 0 ? `+${deltaCompanies}` : `${deltaCompanies}`) : '—';

    let markdown = `# Scrape run ${report.run.runId} — ${report.run.outcome} (exit ${report.run.exitCode})\n`;
    markdown += `Started ${startTimeUtc} · ${report.run.durationSeconds} s · ${report.run.workers || 1} workers · sha ${report.run.gitSha}\n\n`;
    markdown += `| Metric | This run | Previous | Δ |\n`;
    markdown += `|---|---|---|---|\n`;
    markdown += `| Companies with jobs | ${report.summary.companiesWithJobs} | ${prevCompanies} | ${deltaCompaniesStr} |\n`;
    markdown += `| Jobs collected | ${report.summary.jobsCollected} | ${prevJobs} | ${deltaJobsStr} |\n`;
    markdown += `| Created / updated / deactivated | ${report.summary.jobsCreated ?? 0} / ${report.summary.jobsUpdated ?? 0} / ${report.summary.jobsDeactivated ?? 0} | — | |\n`;
    markdown += `| DB active jobs | ${report.summary.dbActiveJobsAfter ?? report.summary.jobsCollected} | ${previousRun?.dbActiveJobs ?? '—'} | — |\n`;
    markdown += `| Not found / failed | ${report.summary.companiesNotFound} / ${report.summary.companiesFailed} | — | |\n\n`;

    if (hasActionable) {
        markdown += `## Actionable issues (${fixerIssues.length}) — fixer triggered: yes\n`;
        for (const iss of fixerIssues) {
            const relatedBfStr = iss.relatedBF.length > 0 ? ` (${iss.relatedBF.join(', ')})` : '';
            const comps = iss.companies.length > 0 ? ` — ${iss.companies.join(', ')}` : '';
            markdown += `- **${iss.severity} ${iss.status.toUpperCase()}** \`${iss.category}/${iss.subkind || 'default'}\` ×${iss.count}${relatedBfStr} — "${iss.suggestedAction || 'Issue'}"${comps}\n`;
        }
        markdown += '\n';
    } else {
        markdown += `## Actionable issues (0) — fixer triggered: no\n\n`;
    }

    markdown += `## Noise\n`;
    markdown += `not_found ${report.summary.companiesNotFound} · graphql_fallback ${report.summary.graphqlFallbacksUsed}\n\n`;

    if (report.workers && report.workers.length > 0) {
        markdown += `## Workers\n`;
        markdown += report.workers.map(w => `w${w.workerId} ${w.status} ${w.durationSeconds} s`).join(' · ') + '\n';
    }

    // 6. Write artifact files
    const date = new Date(report.run.startedAt);
    const yyyyMm = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    const reportsDir = path.join(outputDir, 'reports', yyyyMm);
    fs.mkdirSync(reportsDir, { recursive: true });

    const mdPath = path.join(reportsDir, `${report.run.runId}.md`);
    fs.writeFileSync(mdPath, markdown, 'utf8');

    const issuesPath = path.join(reportsDir, `${report.run.runId}.issues.json`);
    fs.writeFileSync(issuesPath, JSON.stringify(fixerIssues, null, 2), 'utf8');

    // 7. Write to GITHUB_OUTPUT if specified
    if (options.githubOutput) {
        try {
            const outLines = [
                `actionable=${hasActionable ? 'true' : 'false'}`,
                `infra_alert=${isInfraAlert ? 'true' : 'false'}`,
                `run_id=${report.run.runId}`,
                `issues_file=${issuesPath}\n`
            ].join('\n');
            fs.appendFileSync(options.githubOutput, outLines, 'utf8');
        } catch {
            // ignore github output error
        }
    }

    return {
        runId: report.run.runId,
        actionable: hasActionable,
        infraAlert: isInfraAlert,
        issues: fixerIssues,
        markdownSummary: markdown,
        issuesFilePath: issuesPath,
        markdownFilePath: mdPath
    };
}
