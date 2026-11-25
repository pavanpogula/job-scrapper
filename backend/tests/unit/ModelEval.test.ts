/**
 * @file Unit tests for owner-only model eval CLI
 * @summary Verifies missing-key refusal, golden-set scoring with injected client, flag validation, and zero network calls (BF-027)
 * @tags test, unit, enrichment, model, eval, BF-027
 */

import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { ModelAnswer, ModelClient } from '../../src/enrichment/model/ModelClient';
import { runModelEval } from '../../src/enrichment/model/ModelEvalCli';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const FIXTURES_DIR = path.resolve(__dirname, '../fixtures/job-attributes');

interface RawLabel {
  split: string;
  labelled: boolean;
  years: number | null;
  clearance: boolean;
  yearsEvidence?: string;
  clearanceEvidence?: string;
}

describe('ModelEvalCli', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('model eval refuses without key', async () => {
    const lines: string[] = [];
    const code = await runModelEval([], {}, { out: (l) => lines.push(l) });

    expect(code).toBe(1);
    expect(lines).toContain(
      'GEMINI_API_KEY is not set. Export it in your own shell first; nothing was sent.'
    );
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('model eval scores with an injected client', async () => {
    const labelsDoc = JSON.parse(
      fs.readFileSync(path.join(FIXTURES_DIR, 'labels.json'), 'utf8')
    ) as { labels: Record<string, RawLabel> };
    const jobsDoc = JSON.parse(
      fs.readFileSync(path.join(FIXTURES_DIR, 'jobs.json'), 'utf8')
    ) as Array<{ id: string; descriptionPlain: string }>;

    const client: ModelClient = {
      classify: async (input): Promise<ModelAnswer> => {
        const label = labelsDoc.labels[input.id];
        return {
          minYears: label.years,
          clearanceRequired: label.clearance,
          yearsEvidence: label.yearsEvidence ?? null,
          clearanceEvidence: label.clearanceEvidence ?? null,
        };
      },
    };

    const lines: string[] = [];
    const code = await runModelEval(
      [],
      {},
      { client, out: (l) => lines.push(l), fixturesDir: FIXTURES_DIR }
    );

    const output = lines.join('\n');
    expect(code).toBe(0);
    expect(output).toContain('accepted');
    expect(output).toContain('P/R');
    expect(mockedAxios.post).not.toHaveBeenCalled();
    for (const job of jobsDoc) {
      if (job.descriptionPlain.length >= 40) {
        expect(output).not.toContain(job.descriptionPlain.slice(0, 40));
      }
    }
  });

  it('supports --all-jobs and rejects invalid flags without calling network', async () => {
    const labelsDoc = JSON.parse(
      fs.readFileSync(path.join(FIXTURES_DIR, 'labels.json'), 'utf8')
    ) as { labels: Record<string, RawLabel> };

    const client: ModelClient & { getUsage: () => { calls: number; promptTokens: number; outputTokens: number } } =
      {
        classify: async (input): Promise<ModelAnswer> => {
          const label = labelsDoc.labels[input.id];
          return {
            minYears: label.years,
            clearanceRequired: label.clearance,
            yearsEvidence: label.yearsEvidence ?? null,
            clearanceEvidence: label.clearanceEvidence ?? null,
          };
        },
        getUsage: () => ({ calls: 2, promptTokens: 4000, outputTokens: 300 }),
      };

    const okLines: string[] = [];
    const okCode = await runModelEval(
      ['--set=tune', '--limit=2', '--all-jobs', '--max-calls=2', '--price-in=0.25', '--price-out=1.5'],
      {},
      { client, out: (l) => okLines.push(l), fixturesDir: FIXTURES_DIR }
    );
    expect(okCode).toBe(0);
    expect(okLines.join('\n')).toContain('Tokens in=4000 out=300');
    expect(okLines.join('\n')).toContain('2,000');

    const badLines: string[] = [];
    const badCode = await runModelEval(['--bogus'], {}, { client, out: (l) => badLines.push(l) });
    expect(badCode).toBe(1);
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });
});
