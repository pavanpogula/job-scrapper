/**
 * @file Report Classification CLI
 * @summary Evaluates a scrape telemetry report, updates run history, writes <runId>.md / .issues.json, and sets GITHUB_OUTPUT
 * @tags CLI, Classifier, Self-Healing, Telemetry, CI
 */

import * as fs from 'fs';
import * as path from 'path';
import { classifyReport } from '../lib/ReportClassifier';
import { ErrorReportDocument } from '../lib/ErrorTracker';

/**
 * @summary Main CLI entry point for report classification
 */
async function main() {
    const args = process.argv.slice(2);
    let reportPath: string | undefined;
    let githubOutput: string | undefined;
    let runHistoryPath: string | undefined;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--report' && args[i + 1]) {
            reportPath = args[i + 1];
            i++;
        } else if (args[i] === '--github-output' && args[i + 1]) {
            githubOutput = args[i + 1];
            i++;
        } else if (args[i] === '--run-history' && args[i + 1]) {
            runHistoryPath = args[i + 1];
            i++;
        }
    }

    if (!reportPath) {
        reportPath = path.join(process.cwd(), 'output', 'latest-error-report.json');
    }

    if (!fs.existsSync(reportPath)) {
        console.error(`❌ Report file not found: ${reportPath}`);
        process.exit(1);
    }

    const reportContent = fs.readFileSync(reportPath, 'utf8');
    const report: ErrorReportDocument = JSON.parse(reportContent);

    console.log(`🔍 Classifying report: ${report.run?.runId || 'unknown'}`);
    const result = classifyReport(report, {
        githubOutput,
        runHistoryPath
    });

    console.log(`📊 Classification result:`);
    console.log(`   - Run ID: ${result.runId}`);
    console.log(`   - Actionable: ${result.actionable}`);
    console.log(`   - Infra Alert: ${result.infraAlert}`);
    console.log(`   - Issues for fixer: ${result.issues.length}`);
    if (result.issuesFilePath) {
        console.log(`   - Issues file: ${result.issuesFilePath}`);
    }
}

if (require.main === module) {
    main().catch(err => {
        console.error('Fatal classification error:', err);
        process.exit(1);
    });
}
