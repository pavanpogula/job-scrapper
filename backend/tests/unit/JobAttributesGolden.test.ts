/**
 * @file JobAttributesGolden.test.ts
 * @summary Combiner unit tests, golden-set integrity invariants, and precision/recall thresholds (BF-026)
 * @tags unit, enrichment, rules, golden-set, job-attributes, BF-026
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { extractAttributesByRules } from '../../src/enrichment/rules';
import { scoreYears, scoreClearance } from '../helpers/goldenScore';

interface GoldenJob {
  id: string;
  source: string;
  title: string;
  descriptionPlain: string;
}

interface GoldenLabel {
  split: 'tune' | 'holdout';
  labelled: boolean;
  years: number | null;
  clearance: boolean;
  yearsEvidence?: string;
  clearanceEvidence?: string;
  note?: string;
}

interface GoldenLabelsFile {
  schemaVersion: number;
  rule: string;
  labelledBy: string;
  ownerReviewed: boolean;
  labels: Record<string, GoldenLabel>;
}

const fixturesDir = path.resolve(__dirname, '../fixtures/job-attributes');
const goldenJobs: GoldenJob[] = JSON.parse(
  fs.readFileSync(path.join(fixturesDir, 'jobs.json'), 'utf8')
) as GoldenJob[];
const goldenLabelsDoc: GoldenLabelsFile = JSON.parse(
  fs.readFileSync(path.join(fixturesDir, 'labels.json'), 'utf8')
) as GoldenLabelsFile;

/**
 * @summary Runs extractAttributesByRules against a subset of golden jobs and returns predictions plus mismatch summaries
 */
function evaluateSplit(split?: 'tune' | 'holdout') {
  const subset = split ? goldenJobs.filter((j) => goldenLabelsDoc.labels[j.id]?.split === split) : goldenJobs;
  const yearPairs: Array<{ id: string; gold: number | null; pred: number | null }> = [];
  const clearancePairs: Array<{ id: string; gold: boolean; pred: boolean }> = [];
  const fullResults: Array<{
    id: string;
    gold: GoldenLabel;
    confidence: 'high' | 'low';
    years: number | null;
    clearance: boolean;
  }> = [];

  for (const job of subset) {
    const gold = goldenLabelsDoc.labels[job.id];
    const pred = extractAttributesByRules({
      id: job.id,
      title: job.title,
      descriptionPlain: job.descriptionPlain,
    });
    yearPairs.push({ id: job.id, gold: gold.years, pred: pred.experienceMinYears });
    clearancePairs.push({ id: job.id, gold: gold.clearance, pred: pred.clearanceRequired });
    fullResults.push({
      id: job.id,
      gold,
      confidence: pred.confidence,
      years: pred.experienceMinYears,
      clearance: pred.clearanceRequired,
    });
  }

  return { yearPairs, clearancePairs, fullResults };
}

describe('extractAttributesByRules', () => {
  it('marks source rules and high confidence when both rules are sure', () => {
    const attrs = extractAttributesByRules({
      id: 'unit-1',
      title: 'Staff Security Engineer',
      descriptionPlain: 'Requirements\n5+ years of software engineering experience\nActive Secret clearance',
    });
    expect(attrs.source).toBe('rules');
    expect(attrs.confidence).toBe('high');
    expect(attrs.experienceMinYears).toBe(5);
    expect(attrs.clearanceRequired).toBe(true);
    expect(attrs.evidence.years).toContain('5+ years');
    expect(attrs.evidence.clearance).toContain('Secret clearance');
  });

  it('marks low confidence when years are ambiguous', () => {
    const attrs = extractAttributesByRules({
      id: 'unit-2',
      title: 'Backend Engineer',
      descriptionPlain: 'Preferred qualifications\n5+ years of experience with Kubernetes',
    });
    expect(attrs.experienceMinYears).toBeNull();
    expect(attrs.confidence).toBe('low');
  });

  it('marks low confidence when clearance is ambiguous', () => {
    const attrs = extractAttributesByRules({
      id: 'unit-3',
      title: 'Systems Engineer',
      descriptionPlain: 'Secret clearance preferred',
    });
    expect(attrs.clearanceRequired).toBe(true);
    expect(attrs.confidence).toBe('low');
  });

  it('detects a clearance stated only in the title', () => {
    const attrs = extractAttributesByRules({
      id: 'unit-4',
      title: 'Engineer (TS/SCI)',
      descriptionPlain: '',
    });
    expect(attrs.clearanceRequired).toBe(true);
    expect(attrs.evidence.clearance).toContain('TS/SCI');
  });

  it('omits evidence keys that are null', () => {
    const attrs = extractAttributesByRules({
      id: 'unit-5',
      title: 'Product Designer',
      descriptionPlain: 'We build developer tools.',
    });
    expect(attrs.experienceMinYears).toBeNull();
    expect(attrs.clearanceRequired).toBe(false);
    expect(attrs.confidence).toBe('high');
    expect(attrs.evidence).toEqual({});
    expect('years' in attrs.evidence).toBe(false);
    expect('clearance' in attrs.evidence).toBe(false);
  });
});

describe('scorer', () => {
  it('counts a wrong number as both FP and FN', () => {
    expect(scoreYears([{ gold: 5, pred: 3 }])).toEqual({
      tp: 0,
      fp: 1,
      fn: 1,
      tn: 0,
      precision: 0,
      recall: 0,
    });
  });
});

describe('golden set integrity', () => {
  it('has at least 200 jobs and 40 clearance positives', () => {
    const allLabels = Object.values(goldenLabelsDoc.labels);
    const clearancePositives = allLabels.filter((l) => l.clearance).length;
    expect(goldenJobs.length).toBeGreaterThanOrEqual(200);
    expect(clearancePositives).toBeGreaterThanOrEqual(40);
  });

  it('has a holdout of at least 80 jobs, 16 clearance positives and 40 non-null years', () => {
    const holdout = Object.values(goldenLabelsDoc.labels).filter((l) => l.split === 'holdout');
    const clearancePositives = holdout.filter((l) => l.clearance).length;
    const nonNullYears = holdout.filter((l) => l.years !== null).length;
    expect(holdout.length).toBeGreaterThanOrEqual(80);
    expect(clearancePositives).toBeGreaterThanOrEqual(16);
    expect(nonNullYears).toBeGreaterThanOrEqual(40);
  });

  it('labels exactly the jobs in jobs.json', () => {
    const jobIds = goldenJobs.map((j) => j.id);
    const uniqueJobIds = new Set(jobIds);
    const labelIds = Object.keys(goldenLabelsDoc.labels);
    const uniqueLabelIds = new Set(labelIds);

    expect(uniqueJobIds.size).toBe(jobIds.length);
    expect(uniqueLabelIds.size).toBe(labelIds.length);
    expect([...uniqueJobIds].sort()).toEqual([...uniqueLabelIds].sort());
  });

  it('every label is marked labelled', () => {
    for (const [id, lbl] of Object.entries(goldenLabelsDoc.labels)) {
      if (!lbl.labelled) {
        throw new Error(`Label ${id} is not marked labelled`);
      }
      expect(lbl.labelled).toBe(true);
    }
  });

  it('every evidence string is a substring of the description (whitespace-collapsed)', () => {
    for (const job of goldenJobs) {
      const lbl = goldenLabelsDoc.labels[job.id];
      const collapsed = job.descriptionPlain.replace(/\s+/g, ' ').trim();
      if (lbl.yearsEvidence !== undefined) {
        expect(lbl.yearsEvidence.length).toBeLessThanOrEqual(160);
        if (!collapsed.includes(lbl.yearsEvidence)) {
          throw new Error(`yearsEvidence not found in ${job.id}: ${lbl.yearsEvidence}`);
        }
      }
      if (lbl.clearanceEvidence !== undefined) {
        expect(lbl.clearanceEvidence.length).toBeLessThanOrEqual(160);
        if (!collapsed.includes(lbl.clearanceEvidence)) {
          throw new Error(`clearanceEvidence not found in ${job.id}: ${lbl.clearanceEvidence}`);
        }
      }
    }
  });

  it('every years label is null or an integer 0..30', () => {
    for (const [id, lbl] of Object.entries(goldenLabelsDoc.labels)) {
      if (lbl.years !== null) {
        if (!Number.isInteger(lbl.years) || lbl.years < 0 || lbl.years > 30) {
          throw new Error(`Invalid years label on ${id}: ${String(lbl.years)}`);
        }
      }
    }
  });
});

describe('golden set accuracy (BF-026)', () => {
  it('years precision and recall >= 0.90 on holdout', () => {
    const { yearPairs } = evaluateSplit('holdout');
    const score = scoreYears(yearPairs);
    if (score.precision < 0.9 || score.recall < 0.9) {
      const mismatches = yearPairs
        .filter((p) => p.gold !== p.pred)
        .map((p) => `${p.id}: gold=${String(p.gold)} pred=${String(p.pred)}`);
      throw new Error(
        `Holdout years P=${score.precision.toFixed(4)} R=${score.recall.toFixed(4)} below 0.90. Mismatches:\n${mismatches.join('\n')}`
      );
    }
    expect(score.precision).toBeGreaterThanOrEqual(0.9);
    expect(score.recall).toBeGreaterThanOrEqual(0.9);
  });

  it('clearance precision and recall >= 0.90 on holdout', () => {
    const { clearancePairs } = evaluateSplit('holdout');
    const score = scoreClearance(clearancePairs);
    if (score.precision < 0.9 || score.recall < 0.9) {
      const mismatches = clearancePairs
        .filter((p) => p.gold !== p.pred)
        .map((p) => `${p.id}: gold=${String(p.gold)} pred=${String(p.pred)}`);
      throw new Error(
        `Holdout clearance P=${score.precision.toFixed(4)} R=${score.recall.toFixed(4)} below 0.90. Mismatches:\n${mismatches.join('\n')}`
      );
    }
    expect(score.precision).toBeGreaterThanOrEqual(0.9);
    expect(score.recall).toBeGreaterThanOrEqual(0.9);
  });

  it('years and clearance precision and recall >= 0.90 on tune', () => {
    const { yearPairs, clearancePairs } = evaluateSplit('tune');
    const yearsScore = scoreYears(yearPairs);
    const clrScore = scoreClearance(clearancePairs);
    if (yearsScore.precision < 0.9 || yearsScore.recall < 0.9) {
      const mismatches = yearPairs
        .filter((p) => p.gold !== p.pred)
        .map((p) => `${p.id}: gold=${String(p.gold)} pred=${String(p.pred)}`);
      throw new Error(
        `Tune years P=${yearsScore.precision.toFixed(4)} R=${yearsScore.recall.toFixed(4)} below 0.90. Mismatches:\n${mismatches.join('\n')}`
      );
    }
    if (clrScore.precision < 0.9 || clrScore.recall < 0.9) {
      const mismatches = clearancePairs
        .filter((p) => p.gold !== p.pred)
        .map((p) => `${p.id}: gold=${String(p.gold)} pred=${String(p.pred)}`);
      throw new Error(
        `Tune clearance P=${clrScore.precision.toFixed(4)} R=${clrScore.recall.toFixed(4)} below 0.90. Mismatches:\n${mismatches.join('\n')}`
      );
    }
    expect(yearsScore.precision).toBeGreaterThanOrEqual(0.9);
    expect(yearsScore.recall).toBeGreaterThanOrEqual(0.9);
    expect(clrScore.precision).toBeGreaterThanOrEqual(0.9);
    expect(clrScore.recall).toBeGreaterThanOrEqual(0.9);
  });

  it('high-confidence predictions are >= 0.95 precise and low confidence is <= 35% of jobs', () => {
    const { fullResults } = evaluateSplit();
    const highConf = fullResults.filter((r) => r.confidence === 'high');
    const lowConf = fullResults.filter((r) => r.confidence === 'low');
    const highExact = highConf.filter(
      (r) => r.years === r.gold.years && r.clearance === r.gold.clearance
    );
    const highPrecision = highConf.length === 0 ? 1 : highExact.length / highConf.length;
    const lowShare = fullResults.length === 0 ? 0 : lowConf.length / fullResults.length;

    if (highPrecision < 0.95 || lowShare > 0.35) {
      const highMismatches = highConf
        .filter((r) => r.years !== r.gold.years || r.clearance !== r.gold.clearance)
        .map(
          (r) =>
            `${r.id}: gold=(${String(r.gold.years)},${String(r.gold.clearance)}) pred=(${String(r.years)},${String(r.clearance)})`
        );
      throw new Error(
        `highPrecision=${highPrecision.toFixed(4)} lowShare=${lowShare.toFixed(4)}. Mismatches:\n${highMismatches.join('\n')}`
      );
    }
    expect(highPrecision).toBeGreaterThanOrEqual(0.95);
    expect(lowShare).toBeLessThanOrEqual(0.35);
  });
});
