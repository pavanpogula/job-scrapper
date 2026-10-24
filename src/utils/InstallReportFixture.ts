/**
 * @file Report Fixture Installer CLI
 * @summary Installs a v2 error report fixture into output/ for testing CI alerts and self-healing fixer
 * @tags CLI, Testing, Telemetry, Fixtures, CI
 */

import fs from 'fs';
import path from 'path';

/**
 * Installs a test report fixture into output/reports/<YYYY-MM>/<runId>.json
 * and exits with the report's exit code.
 */
export function installReportFixture(fixtureRelativePath: string): number {
  if (!fixtureRelativePath) {
    console.error('❌ Error: Fixture path argument required.');
    process.exit(1);
  }

  const fixturePath = path.resolve(process.cwd(), fixtureRelativePath);
  if (!fs.existsSync(fixturePath)) {
    console.error(`❌ Error: Fixture file not found: ${fixturePath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(fixturePath, 'utf8');
  const data = JSON.parse(raw);

  const runId = data.run?.runId || data.summary?.runId || 'fixture-run';
  const mode = data.run?.mode || data.summary?.mode || 'db_scrape';
  const startedAt = data.run?.startedAt || data.summary?.startedAt || new Date().toISOString();
  const monthDir = startedAt.substring(0, 7);

  const exitCode =
    typeof data.run?.exitCode === 'number'
      ? data.run.exitCode
      : (data.summary?.companiesFailed ?? 0) > 0
        ? 1
        : 0;

  const targetDir = path.resolve(process.cwd(), 'output', 'reports', monthDir);
  fs.mkdirSync(targetDir, { recursive: true });

  const targetReportPath = path.join(targetDir, `${runId}.json`);
  fs.writeFileSync(targetReportPath, JSON.stringify(data, null, 2), 'utf8');

  // Also update latest-<mode>.json and latest-error-report.json
  const outputDir = path.resolve(process.cwd(), 'output');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, `latest-${mode}.json`), JSON.stringify(data, null, 2), 'utf8');
  fs.writeFileSync(path.join(outputDir, 'latest-error-report.json'), JSON.stringify(data, null, 2), 'utf8');

  console.log(`📦 [Fixture] Installed report fixture: ${targetReportPath} (exitCode: ${exitCode})`);
  return exitCode;
}

if (require.main === module) {
  const fixtureArg = process.argv[2];
  const code = installReportFixture(fixtureArg);
  process.exit(code);
}
