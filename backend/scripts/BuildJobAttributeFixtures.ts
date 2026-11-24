/**
 * @file BuildJobAttributeFixtures.ts
 * @summary Manual golden-set fixture builder fetching real postings via production ATS clients and normalizers
 * @tags scripts, enrichment, fixtures, golden-set, BF-026
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { AshbyAtsClient } from '../src/lib/ats/AshbyAtsClient';
import { AtsClient, BoardFetchResult, BoardRef, NormalizedJob } from '../src/lib/ats/AtsClient';
import { GreenhouseClient } from '../src/lib/ats/GreenhouseClient';
import { LeverClient } from '../src/lib/ats/LeverClient';
import { AtsSource } from '../src/lib/ats/source';
import { getDescriptionText } from '../src/enrichment/text';

export interface GoldenJob {
  id: string;
  source: 'ashby' | 'greenhouse' | 'lever';
  board: string;
  title: string;
  descriptionPlain: string;
  fetchedAt: string;
}

export interface GoldenLabelEntry {
  split: 'tune' | 'holdout';
  labelled: boolean;
  years: number | null;
  clearance: boolean;
  yearsEvidence?: string;
  clearanceEvidence?: string;
  note?: string;
}

export interface GoldenLabelsFile {
  schemaVersion: 1;
  rule: 'DESIGN §6.2 (2026-11-23)';
  labelledBy: 'implementer';
  ownerReviewed: boolean;
  labels: Record<string, GoldenLabelEntry>;
}

interface BoardSpec {
  key: string; // e.g. 'gh:epirus'
  prefix: 'ab' | 'gh' | 'lv';
  source: AtsSource;
  board: string;
  ref: BoardRef;
}

interface FetchedCandidate {
  job: GoldenJob;
  boardKey: string;
  hash: string;
  isResearch: boolean;
  isNonUsMatch: boolean;
}

const DEFENSE_BOARDS = [
  'gh:epirus',
  'gh:relativity',
  'gh:rocketlab',
  'gh:spacex',
  'ab:hadrian-automation',
  'ab:picogrid',
] as const;

const MAINSTREAM_BOARDS = [
  'gh:databricks',
  'gh:cloudflare',
  'ab:openai',
  'ab:notion',
  'lv:zoox',
] as const;

const NON_US_PATTERN =
  /(?:SC clearance|Developed Vetting|BPSS|\bNV1\b|\bNV2\b|Baseline clearance|\bNATO\b|Reliability Status)/i;

const REPO_ROOT = path.resolve(__dirname, '../..');
const RESEARCH_DIR = path.join(REPO_ROOT, 'docs/plans/job-attributes/research');
const FIXTURES_DIR = path.resolve(__dirname, '../tests/fixtures/job-attributes');
const JOBS_PATH = path.join(FIXTURES_DIR, 'jobs.json');
const LABELS_PATH = path.join(FIXTURES_DIR, 'labels.json');

/**
 * @summary Computes lowercase hex SHA-256 of a string
 */
function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * @summary Sleeps for the specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @summary Parses a board key such as 'gh:epirus' into its source, token, and BoardRef
 */
function parseBoardKey(key: string): BoardSpec {
  const parts = key.split(':');
  if (parts.length !== 2 || !parts[1]) {
    throw new Error(`Invalid board specification "${key}". Expected <ab|gh|lv>:<board>.`);
  }
  const [prefix, board] = parts;
  if (prefix === 'ab') {
    return {
      key,
      prefix: 'ab',
      source: 'ashby',
      board,
      ref: { slug: board, source: 'ashby', atsToken: board },
    };
  }
  if (prefix === 'gh') {
    return {
      key,
      prefix: 'gh',
      source: 'greenhouse',
      board,
      ref: { slug: `gh--${board}`, source: 'greenhouse', atsToken: board },
    };
  }
  if (prefix === 'lv') {
    return {
      key,
      prefix: 'lv',
      source: 'lever',
      board,
      ref: { slug: `lv--${board}`, source: 'lever', atsToken: board },
    };
  }
  throw new Error(`Unsupported board prefix "${prefix}" in "${key}".`);
}

/**
 * @summary Extracts the '<ab|gh|lv>:<board>' key from a golden job id
 */
function boardKeyFromJobId(id: string): string {
  const parts = id.split(':');
  return `${parts[0]}:${parts[1]}`;
}

/**
 * @summary Assigns deterministic train/holdout split for a golden job id
 */
function assignSplit(
  id: string,
  researchTuneIds: Set<string>,
  researchHoldoutIds: Set<string>
): 'tune' | 'holdout' {
  if (researchHoldoutIds.has(id)) return 'holdout';
  if (researchTuneIds.has(id)) return 'tune';
  const bucket = parseInt(sha256(id).slice(0, 8), 16) % 5;
  return bucket < 2 ? 'holdout' : 'tune';
}

/**
 * @summary Parses CLI flags (--boards, --k, --k-defense, --find-non-us)
 */
function parseCliArgs(argv: string[]): {
  boardsOverride: string[] | null;
  k: number;
  kDefense: number;
  findNonUs: boolean;
} {
  let boardsOverride: string[] | null = null;
  let k = 12;
  let kDefense = 12;
  let findNonUs = false;

  for (const arg of argv) {
    if (arg.startsWith('--boards=')) {
      const raw = arg.slice('--boards='.length).trim();
      boardsOverride = raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (arg.startsWith('--k=')) {
      const parsed = Number.parseInt(arg.slice('--k='.length), 10);
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error(`Invalid --k value: ${arg}`);
      }
      k = parsed;
    } else if (arg.startsWith('--k-defense=')) {
      const parsed = Number.parseInt(arg.slice('--k-defense='.length), 10);
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error(`Invalid --k-defense value: ${arg}`);
      }
      kDefense = parsed;
    } else if (arg === '--find-non-us') {
      findNonUs = true;
    } else {
      throw new Error(`Unknown CLI argument: ${arg}`);
    }
  }

  return { boardsOverride, k, kDefense, findNonUs };
}

/**
 * @summary Reads research label_ids.json and holdout_ids.json from the research directory
 */
function loadResearchIds(): { tuneIds: Set<string>; holdoutIds: Set<string>; allIds: Set<string> } {
  const labelRaw = fs.readFileSync(path.join(RESEARCH_DIR, 'label_ids.json'), 'utf8');
  const holdoutRaw = fs.readFileSync(path.join(RESEARCH_DIR, 'holdout_ids.json'), 'utf8');
  const tuneList = JSON.parse(labelRaw) as string[];
  const holdoutList = JSON.parse(holdoutRaw) as string[];
  const tuneIds = new Set(tuneList);
  const holdoutIds = new Set(holdoutList);
  const allIds = new Set([...tuneList, ...holdoutList]);
  return { tuneIds, holdoutIds, allIds };
}

/**
 * @summary Loads existing jobs.json and labels.json fixtures when performing a merge-only rerun
 */
function loadExistingFixtures(): {
  existingJobs: Map<string, GoldenJob>;
  existingLabels: GoldenLabelsFile;
} {
  const existingJobs = new Map<string, GoldenJob>();
  let existingLabels: GoldenLabelsFile = {
    schemaVersion: 1,
    rule: 'DESIGN §6.2 (2026-11-23)',
    labelledBy: 'implementer',
    ownerReviewed: false,
    labels: {},
  };

  if (fs.existsSync(JOBS_PATH)) {
    const parsedJobs = JSON.parse(fs.readFileSync(JOBS_PATH, 'utf8')) as GoldenJob[];
    for (const job of parsedJobs) {
      existingJobs.set(job.id, job);
    }
  }

  if (fs.existsSync(LABELS_PATH)) {
    existingLabels = JSON.parse(fs.readFileSync(LABELS_PATH, 'utf8')) as GoldenLabelsFile;
  }

  return { existingJobs, existingLabels };
}

/**
 * @summary Fetches one board through the production ATS client and returns normalized GoldenJob candidates
 */
async function fetchBoardCandidates(
  spec: BoardSpec,
  clients: Record<AtsSource, AtsClient>,
  fetchedAt: string
): Promise<{ ok: true; jobs: GoldenJob[] } | { ok: false; reason: string }> {
  const client = clients[spec.source];
  let result: BoardFetchResult;
  try {
    result =
      spec.source === 'ashby'
        ? await client.fetchBoard(spec.ref, { includeCompensation: true })
        : await client.fetchBoard(spec.ref);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `exception (${msg})` };
  }

  if (result.notFound) {
    return { ok: false, reason: 'notFound (404)' };
  }
  if (result.failure) {
    return {
      ok: false,
      reason: `failure (${result.failure.kind}${result.failure.status ? ` HTTP ${result.failure.status}` : ''}${result.failure.code ? ` ${result.failure.code}` : ''})`,
    };
  }
  if (spec.source === 'ashby' && result.fetchMode === 'fallback') {
    return { ok: false, reason: 'ashby graphql fallback skipped' };
  }

  const jobs: GoldenJob[] = [];
  for (const norm of result.jobs as NormalizedJob[]) {
    const descriptionPlain = getDescriptionText(norm.raw);
    if (descriptionPlain.trim().length === 0) {
      continue;
    }
    const id = `${spec.prefix}:${spec.board}:${norm.externalId}`;
    jobs.push({
      id,
      source: spec.source,
      board: spec.board,
      title: norm.title,
      descriptionPlain,
      fetchedAt,
    });
  }

  return { ok: true, jobs };
}

/**
 * @summary Enforces the 15% maximum share per board without ever removing frozen labelled rows
 */
function enforcePerBoardCap(
  selected: Map<string, FetchedCandidate>,
  frozenIds: Set<string>,
  maxShare = 0.15
): string[] {
  const droppedForCap: string[] = [];

  let changed = true;
  while (changed) {
    changed = false;
    const total = selected.size;
    if (total === 0) break;
    const cap = Math.floor(total * maxShare);
    const byBoard = new Map<string, FetchedCandidate[]>();

    for (const item of selected.values()) {
      const list = byBoard.get(item.boardKey) ?? [];
      list.push(item);
      byBoard.set(item.boardKey, list);
    }

    for (const [boardKey, list] of byBoard.entries()) {
      if (list.length <= cap) continue;
      // Prefer keeping frozen rows, then research rows, then lower sha256(id)
      const droppable = list
        .filter((item) => !frozenIds.has(item.job.id))
        .sort((a, b) => {
          if (a.isResearch !== b.isResearch) return a.isResearch ? 1 : -1;
          return b.hash.localeCompare(a.hash);
        });

      const excess = list.length - cap;
      if (droppable.length === 0) {
        console.warn(
          `Warning: board ${boardKey} has ${list.length}/${total} frozen rows exceeding ${Math.round(maxShare * 100)}% cap.`
        );
        continue;
      }

      const toDrop = droppable.slice(0, excess);
      for (const item of toDrop) {
        selected.delete(item.job.id);
        droppedForCap.push(item.job.id);
        changed = true;
      }
      if (changed) break;
    }
  }

  return droppedForCap;
}

/**
 * @summary Orchestrates board fetching, deterministic selection, merge-only persistence, and count reporting
 */
export async function buildFixtures(argv: string[]): Promise<void> {
  const { boardsOverride, k, kDefense, findNonUs } = parseCliArgs(argv);
  const { tuneIds, holdoutIds, allIds: researchIds } = loadResearchIds();
  const { existingJobs, existingLabels } = loadExistingFixtures();

  const researchBoardKeys = Array.from(new Set([...researchIds].map(boardKeyFromJobId))).sort();
  const newJobBoardKeys = boardsOverride
    ? Array.from(new Set(boardsOverride))
    : Array.from(new Set([...DEFENSE_BOARDS, ...MAINSTREAM_BOARDS]));

  const boardsToFetchKeys = boardsOverride
    ? newJobBoardKeys
    : Array.from(new Set([...researchBoardKeys, ...newJobBoardKeys]));

  const boardSpecs = boardsToFetchKeys.map(parseBoardKey);
  const clients: Record<AtsSource, AtsClient> = {
    ashby: new AshbyAtsClient(),
    greenhouse: new GreenhouseClient(),
    lever: new LeverClient(),
  };

  const fetchedAt = new Date().toISOString();
  const fetchedByBoard = new Map<string, GoldenJob[]>();
  const skippedBoards: Array<{ key: string; reason: string }> = [];

  for (let i = 0; i < boardSpecs.length; i++) {
    if (i > 0) {
      await sleep(1000);
    }
    const spec = boardSpecs[i];
    const outcome = await fetchBoardCandidates(spec, clients, fetchedAt);
    if (!outcome.ok) {
      skippedBoards.push({ key: spec.key, reason: outcome.reason });
    } else {
      fetchedByBoard.set(spec.key, outcome.jobs);
    }
  }

  if (fetchedByBoard.size === 0) {
    console.error('❌ Every board fetch failed or was skipped; exiting 1 without writing files.');
    for (const skip of skippedBoards) {
      console.error(`  - ${skip.key}: ${skip.reason}`);
    }
    process.exitCode = 1;
    return;
  }

  const frozenIds = new Set<string>();
  const selected = new Map<string, FetchedCandidate>();

  // Preserve all existing jobs (never rewrite labelled: true rows)
  for (const [id, job] of existingJobs.entries()) {
    const label = existingLabels.labels[id];
    if (label?.labelled) {
      frozenIds.add(id);
    }
    selected.set(id, {
      job,
      boardKey: boardKeyFromJobId(id),
      hash: sha256(id),
      isResearch: researchIds.has(id),
      isNonUsMatch: NON_US_PATTERN.test(`${job.title}\n${job.descriptionPlain}`),
    });
  }

  const allFetchedById = new Map<string, GoldenJob>();
  for (const jobs of fetchedByBoard.values()) {
    for (const job of jobs) {
      allFetchedById.set(job.id, job);
    }
  }

  // (a) Live research IDs
  const droppedResearchIds: string[] = [];
  for (const resId of researchIds) {
    if (frozenIds.has(resId)) continue;
    const live = allFetchedById.get(resId);
    if (live) {
      selected.set(resId, {
        job: live,
        boardKey: boardKeyFromJobId(resId),
        hash: sha256(resId),
        isResearch: true,
        isNonUsMatch: NON_US_PATTERN.test(`${live.title}\n${live.descriptionPlain}`),
      });
    } else if (!selected.has(resId)) {
      const boardKey = boardKeyFromJobId(resId);
      if (fetchedByBoard.has(boardKey)) {
        droppedResearchIds.push(resId);
      }
    }
  }

  // (b) New jobs from configured new-job boards, ordered by sha256(id) ascending
  const defenseSet = new Set<string>(DEFENSE_BOARDS);
  for (const boardKey of newJobBoardKeys) {
    const liveJobs = fetchedByBoard.get(boardKey);
    if (!liveJobs) continue;

    const limit = defenseSet.has(boardKey) ? kDefense : k;
    const candidates = liveJobs
      .filter((job) => !researchIds.has(job.id) && !selected.has(job.id))
      .map((job) => ({
        job,
        boardKey,
        hash: sha256(job.id),
        isResearch: false,
        isNonUsMatch: NON_US_PATTERN.test(`${job.title}\n${job.descriptionPlain}`),
      }))
      .sort((a, b) => (a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0));

    // On reruns with higher k, keep total non-research rows from this board up to limit
    const existingNonResearchCount = Array.from(selected.values()).filter(
      (item) => item.boardKey === boardKey && !item.isResearch
    ).length;
    const needed = Math.max(0, limit - existingNonResearchCount);

    for (const item of candidates.slice(0, needed)) {
      selected.set(item.job.id, item);
    }
  }

  // (c) Optional non-US clearance sweep across all fetched postings
  let nonUsAdded = 0;
  if (findNonUs) {
    const nonUsCandidates = Array.from(allFetchedById.values())
      .filter(
        (job) => !selected.has(job.id) && NON_US_PATTERN.test(`${job.title}\n${job.descriptionPlain}`)
      )
      .map((job) => ({
        job,
        boardKey: boardKeyFromJobId(job.id),
        hash: sha256(job.id),
        isResearch: false,
        isNonUsMatch: true,
      }))
      .sort((a, b) => (a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0))
      .slice(0, 10);

    for (const item of nonUsCandidates) {
      selected.set(item.job.id, item);
      nonUsAdded++;
    }
  }

  const droppedForCap = enforcePerBoardCap(selected, frozenIds, 0.15);

  const finalJobs = Array.from(selected.values())
    .map((item) => item.job)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const nextLabels: Record<string, GoldenLabelEntry> = {};
  let newlyAddedCount = 0;
  for (const job of finalJobs) {
    const prev = existingLabels.labels[job.id];
    if (prev) {
      nextLabels[job.id] = prev;
    } else {
      newlyAddedCount++;
      nextLabels[job.id] = {
        split: assignSplit(job.id, tuneIds, holdoutIds),
        labelled: false,
        years: null,
        clearance: false,
      };
    }
  }

  const finalLabelsFile: GoldenLabelsFile = {
    schemaVersion: 1,
    rule: 'DESIGN §6.2 (2026-11-23)',
    labelledBy: 'implementer',
    ownerReviewed: existingLabels.ownerReviewed ?? false,
    labels: nextLabels,
  };

  fs.mkdirSync(FIXTURES_DIR, { recursive: true });
  fs.writeFileSync(JOBS_PATH, `${JSON.stringify(finalJobs, null, 2)}\n`, 'utf8');
  fs.writeFileSync(LABELS_PATH, `${JSON.stringify(finalLabelsFile, null, 2)}\n`, 'utf8');

  const perBoardCounts = new Map<string, number>();
  let holdoutCount = 0;
  let tuneCount = 0;
  for (const job of finalJobs) {
    const bk = boardKeyFromJobId(job.id);
    perBoardCounts.set(bk, (perBoardCounts.get(bk) ?? 0) + 1);
    if (nextLabels[job.id].split === 'holdout') holdoutCount++;
    else tuneCount++;
  }

  console.log(`Boards attempted: ${boardSpecs.length}`);
  console.log(`Boards succeeded: ${fetchedByBoard.size}`);
  console.log(`Boards skipped: ${skippedBoards.length}`);
  for (const skip of skippedBoards) {
    console.log(`  - skipped ${skip.key}: ${skip.reason}`);
  }
  console.log(`Research IDs dropped (not live / empty): ${droppedResearchIds.length}`);
  if (droppedResearchIds.length > 0) {
    console.log(`  - dropped IDs: ${droppedResearchIds.join(', ')}`);
  }
  console.log(`Non-US matches added (--find-non-us=${findNonUs}): ${nonUsAdded}`);
  console.log(`Dropped by 15% per-board cap: ${droppedForCap.length}`);
  console.log(
    `Jobs written: ${finalJobs.length} (new=${newlyAddedCount}, frozen=${frozenIds.size}, tune=${tuneCount}, holdout=${holdoutCount})`
  );
  console.log('Per-board breakdown:');
  for (const [bk, count] of Array.from(perBoardCounts.entries()).sort()) {
    const pct = ((count / finalJobs.length) * 100).toFixed(1);
    console.log(`  - ${bk}: ${count} (${pct}%)`);
  }
}

if (require.main === module) {
  buildFixtures(process.argv.slice(2)).catch((err: unknown) => {
    console.error('❌ BuildJobAttributeFixtures failed:', err);
    process.exit(1);
  });
}
