/**
 * @file Unit tests for report fixture installer (P3-T02)
 * @summary Validates installation of v2 report fixtures and exit code propagation
 * @tags Testing, Fixtures, Telemetry, Reports
 */

import fs from 'fs';
import path from 'path';
import { installReportFixture } from '../../src/utils/InstallReportFixture';

describe('InstallReportFixture CLI (P3-T02)', () => {
  const testFixturePath = 'tests/fixtures/reports/failed-run.json';

  it('installs failed-run fixture and returns exit code 1', () => {
    const exitCode = installReportFixture(testFixturePath);
    expect(exitCode).toBe(1);

    const fixtureData = JSON.parse(fs.readFileSync(testFixturePath, 'utf8'));
    const runId = fixtureData.run.runId;
    const month = fixtureData.run.startedAt.substring(0, 7);

    const installedReportPath = path.resolve(process.cwd(), 'output', 'reports', month, `${runId}.json`);
    expect(fs.existsSync(installedReportPath)).toBe(true);

    const latestReportPath = path.resolve(process.cwd(), 'output', 'latest-error-report.json');
    expect(fs.existsSync(latestReportPath)).toBe(true);

    const installedData = JSON.parse(fs.readFileSync(installedReportPath, 'utf8'));
    expect(installedData.run.exitCode).toBe(1);
    expect(installedData.summary.companiesFailed).toBe(40);
  });

  it('A8: strips leading backend/ from fixture path when running in backend cwd', () => {
    const exitCode = installReportFixture(`backend/${testFixturePath}`);
    expect(exitCode).toBe(1);

    const fixtureData = JSON.parse(fs.readFileSync(testFixturePath, 'utf8'));
    const runId = fixtureData.run.runId;
    const month = fixtureData.run.startedAt.substring(0, 7);

    const installedReportPath = path.resolve(process.cwd(), 'output', 'reports', month, `${runId}.json`);
    expect(fs.existsSync(installedReportPath)).toBe(true);
  });
});
