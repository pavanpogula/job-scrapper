/**
 * @file Lever Wayback CDX Discovery & Validation Service
 * @summary Harvests Lever job board tokens from Wayback Machine CDX by prefix with resume support, validates live boards at <= 1 req/s, and upserts Company rows
 * @tags Discovery, Lever, Wayback Machine, CDX, Validation, State, Enrichment, ADR-0022
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { BoardRef } from '../lib/ats/AtsClient';
import { LeverClient, LeverSiteValidationStatus } from '../lib/ats/LeverClient';
import { allocateCompanySlug } from '../lib/ats/slug';
import { DiscoveryOptions, DiscoverySummary, fetchWithRetry } from './CdxWorker';

let defaultPrismaClient: PrismaClient | null = null;

/**
 * @summary Lazily instantiates a fallback PrismaClient only when callers omit prismaClient
 */
function getDefaultPrisma(): PrismaClient {
  if (!defaultPrismaClient) {
    defaultPrismaClient = new PrismaClient();
  }
  return defaultPrismaClient;
}

const CDX_API_URL = 'http://web.archive.org/cdx/search/cdx';

export const DEFAULT_LEVER_TIME_BUDGET_MS = 100 * 60 * 1000;
export const DEFAULT_LEVER_TOKEN_BUDGET = 500;
export const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export const LEVER_PRIMARY_PREFIXES: readonly string[] = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('');
export const LEVER_SUBPREFIX_SUFFIXES: readonly string[] = [
  ...'0123456789abcdefghijklmnopqrstuvwxyz'.split(''),
  '-',
  '.',
  '_',
  '%26',
];

export const LEVER_TOKEN_REGEX = /^[A-Za-z0-9][A-Za-z0-9._&-]{0,79}$/;

export const LEVER_RESERVED_SEGMENTS = new Set([
  'img',
  'css',
  'js',
  'assets',
  'static',
  'favicon.ico',
  'robots.txt',
  'sitemap.xml',
  'v0',
  'api',
  'search',
  'embed',
]);

export const DEFAULT_LEVER_STATE_PATH = path.resolve(
  __dirname,
  '../../output/lever-discovery-state.json'
);

export type LeverTokenOutcome = LeverSiteValidationStatus;

export interface LeverTokenState {
  firstSeen: string;
  outcome?: LeverTokenOutcome;
  checkedAt?: string;
}

export interface LeverHarvestState {
  nextPrefix: string | null;
  resumeKey: string | null;
  completedAt: string | null;
}

export interface LeverDiscoveryState {
  version: 1;
  harvest: LeverHarvestState;
  tokens: Record<string, LeverTokenState>;
}

export interface LeverDiscoveryOptions extends DiscoveryOptions {
  stateFilePath?: string;
  leverClient?: LeverClient;
  waybackMinIntervalMs?: number;
  waybackRetries?: number;
  waybackRetryDelayMs?: number;
  waybackTimeoutMs?: number;
  prefixes?: readonly string[];
  fromYear?: number;
}

export interface LeverDiscoverySummary extends DiscoverySummary {
  source: 'lever';
  harvestComplete: boolean;
  nextPrefix: string | null;
  prefixesQueried: number;
  prefixesFailed: number;
  waybackRowsRead: number;
  live: number;
  empty: number;
  notFound: number;
  deadBoard: number;
  errors: number;
  leftByBudget: number;
}

const VALID_OUTCOMES = new Set<string>(['live', 'empty', 'not_found', 'dead_board', 'error']);

/**
 * @summary Safely assigns a token state entry without invoking Object prototype setters
 */
function setTokenEntry(
  tokens: Record<string, LeverTokenState>,
  token: string,
  entry: LeverTokenState
): void {
  Object.defineProperty(tokens, token, {
    value: entry,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

/**
 * @summary Extracts and validates a case-preserving Lever board token from a jobs.lever.co URL (EU and invalid hosts return null)
 */
export function extractLeverToken(rawUrl: string): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;

  // Reject explicit non-HTTP(S) schemes before prepending https://
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
    return null;
  }

  const normalizedUrl = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(normalizedUrl);
  } catch {
    return null;
  }

  if (parsed.hostname.toLowerCase() !== 'jobs.lever.co') {
    return null;
  }

  const segments = parsed.pathname.split('/').filter((s) => s.length > 0);
  if (segments.length === 0) {
    return null;
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(segments[0]);
  } catch {
    return null;
  }

  if (!decoded || /\s/.test(decoded)) {
    return null;
  }

  if (LEVER_RESERVED_SEGMENTS.has(decoded.toLowerCase())) {
    return null;
  }

  if (!LEVER_TOKEN_REGEX.test(decoded)) {
    return null;
  }

  return decoded;
}

/**
 * @summary Creates an empty v1 Lever discovery state starting at prefix "a"
 */
export function createFreshLeverState(): LeverDiscoveryState {
  return {
    version: 1,
    harvest: {
      nextPrefix: 'a',
      resumeKey: null,
      completedAt: null,
    },
    tokens: {},
  };
}

/**
 * @summary Loads Lever discovery state from disk, falling back cleanly to a fresh state if missing or corrupt
 */
export function loadLeverDiscoveryState(
  filePath: string = DEFAULT_LEVER_STATE_PATH
): LeverDiscoveryState {
  try {
    if (!fs.existsSync(filePath)) {
      return createFreshLeverState();
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return createFreshLeverState();
    }

    const obj = parsed as Record<string, unknown>;
    if (obj.version !== 1 || !obj.harvest || typeof obj.harvest !== 'object' || !obj.tokens || typeof obj.tokens !== 'object' || Array.isArray(obj.tokens)) {
      return createFreshLeverState();
    }

    const harvestRaw = obj.harvest as Record<string, unknown>;
    const nextPrefix =
      typeof harvestRaw.nextPrefix === 'string' && harvestRaw.nextPrefix.length > 0
        ? harvestRaw.nextPrefix
        : null;
    const resumeKey =
      typeof harvestRaw.resumeKey === 'string' && harvestRaw.resumeKey.length > 0
        ? harvestRaw.resumeKey
        : null;
    const completedAt =
      typeof harvestRaw.completedAt === 'string' && harvestRaw.completedAt.length > 0
        ? harvestRaw.completedAt
        : null;

    const tokens: Record<string, LeverTokenState> = {};
    const rawTokens = obj.tokens as Record<string, unknown>;
    for (const key of Object.keys(rawTokens)) {
      const val = rawTokens[key];
      if (!val || typeof val !== 'object' || Array.isArray(val)) continue;
      const entry = val as Record<string, unknown>;
      if (typeof entry.firstSeen !== 'string') continue;

      const cleanEntry: LeverTokenState = { firstSeen: entry.firstSeen };
      if (typeof entry.outcome === 'string' && VALID_OUTCOMES.has(entry.outcome)) {
        cleanEntry.outcome = entry.outcome as LeverTokenOutcome;
      }
      if (typeof entry.checkedAt === 'string') {
        cleanEntry.checkedAt = entry.checkedAt;
      }
      setTokenEntry(tokens, key, cleanEntry);
    }

    return {
      version: 1,
      harvest: {
        nextPrefix,
        resumeKey,
        completedAt,
      },
      tokens,
    };
  } catch {
    return createFreshLeverState();
  }
}

/**
 * @summary Persists Lever discovery state JSON to disk without logging sensitive contents
 */
export function saveLeverDiscoveryState(
  state: LeverDiscoveryState,
  filePath: string = DEFAULT_LEVER_STATE_PATH
): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8');
}

/**
 * @summary Builds the Wayback CDX query URL for a Lever prefix without double-encoding %26
 */
export function buildWaybackCdxUrl(
  prefix: string,
  fromYear: number,
  resumeKey?: string | null
): string {
  const base = `${CDX_API_URL}?url=jobs.lever.co/${prefix}&matchType=prefix&fl=original&collapse=urlkey&from=${fromYear}&limit=20000&showResumeKey=true`;
  return resumeKey ? `${base}&resumeKey=${encodeURIComponent(resumeKey)}` : base;
}

/**
 * @summary Checks whether a trailing non-URL row/line looks like a Wayback resumeKey rather than a URL
 */
function looksLikeWaybackUrl(value: string): boolean {
  const lower = value.toLowerCase();
  return /^https?:\/\//i.test(value) || lower.startsWith('jobs.lever.co/') || lower.includes('jobs.lever.co/');
}

/**
 * @summary Parses plain-text or JSON-array Wayback CDX response into URL rows and optional trailing resumeKey
 */
export function parseWaybackCdxResponse(data: unknown): {
  urls: string[];
  resumeKey: string | null;
} {
  if (Array.isArray(data)) {
    const rows = data.map((row) => {
      if (Array.isArray(row)) {
        return row.length === 0 ? '' : String(row[0] ?? '').trim();
      }
      return typeof row === 'string' ? row.trim() : '';
    });

    while (rows.length > 0 && rows[rows.length - 1] === '') {
      rows.pop();
    }
    if (rows.length > 0 && rows[0] === 'original') {
      rows.shift();
    }

    let resumeKey: string | null = null;
    if (rows.length >= 2 && rows[rows.length - 2] === '' && rows[rows.length - 1] !== '') {
      resumeKey = rows[rows.length - 1];
      rows.splice(rows.length - 2, 2);
    } else if (rows.length >= 1 && rows[rows.length - 1] !== '' && !looksLikeWaybackUrl(rows[rows.length - 1])) {
      resumeKey = rows.pop() ?? null;
    }

    return {
      urls: rows.filter((u) => u.length > 0),
      resumeKey,
    };
  }

  if (typeof data === 'string') {
    const lines = data.split(/\r?\n/).map((line) => line.trim());
    while (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop();
    }
    if (lines.length > 0 && lines[0] === 'original') {
      lines.shift();
    }

    let resumeKey: string | null = null;
    if (lines.length >= 2 && lines[lines.length - 2] === '' && lines[lines.length - 1] !== '') {
      resumeKey = lines[lines.length - 1];
      lines.splice(lines.length - 2, 2);
    } else if (lines.length >= 1 && lines[lines.length - 1] !== '' && !looksLikeWaybackUrl(lines[lines.length - 1])) {
      resumeKey = lines.pop() ?? null;
    }

    return {
      urls: lines.filter((u) => u.length > 0),
      resumeKey,
    };
  }

  return { urls: [], resumeKey: null };
}

type WaybackPageResult =
  | { status: 'ok'; urls: string[]; resumeKey: string | null }
  | { status: 'deadline' }
  | { status: 'failed' };

/**
 * @summary Queries one paged prefix (following resumeKey until done or harvestDeadline) using paced Wayback CDX requests
 */
async function harvestPrefixPages(
  prefix: string,
  initialResumeKey: string | null,
  ctx: {
    fromYear: number;
    harvestDeadline: number;
    retries: number;
    retryOn5xxDelayMs: number;
    timeoutMs: number;
    paceWayback: () => Promise<boolean>;
    onUrls: (urls: string[]) => void;
    onResumeKeyChange?: (resumeKey: string | null) => void;
  }
): Promise<{ status: 'done' | 'deadline' | 'failed'; lastResumeKey: string | null }> {
  let currentResumeKey = initialResumeKey;

  for (;;) {
    if (Date.now() >= ctx.harvestDeadline) {
      return { status: 'deadline', lastResumeKey: currentResumeKey };
    }

    ctx.onResumeKeyChange?.(currentResumeKey);
    const requestUrl = buildWaybackCdxUrl(prefix, ctx.fromYear, currentResumeKey);

    const pageResult: WaybackPageResult | null = await fetchWithRetry<WaybackPageResult>(
      async () => {
        const withinBudget = await ctx.paceWayback();
        if (!withinBudget) {
          return { status: 'deadline' };
        }
        const response = await axios.get<unknown>(requestUrl, {
          timeout: ctx.timeoutMs,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JobScraperBot/1.0)' },
        });
        const parsed = parseWaybackCdxResponse(response.data);
        return {
          status: 'ok',
          urls: parsed.urls,
          resumeKey: parsed.resumeKey,
        };
      },
      ctx.retries,
      {
        honorRetryAfter: true,
        maxRetryAfterMs: 60000,
        retryOn5xxDelayMs: ctx.retryOn5xxDelayMs,
      }
    );

    if (!pageResult) {
      return { status: 'failed', lastResumeKey: currentResumeKey };
    }

    if (pageResult.status === 'deadline') {
      return { status: 'deadline', lastResumeKey: currentResumeKey };
    }

    if (pageResult.status !== 'ok') {
      return { status: 'failed', lastResumeKey: currentResumeKey };
    }

    ctx.onUrls(pageResult.urls);

    if (!pageResult.resumeKey || pageResult.resumeKey === currentResumeKey) {
      return { status: 'done', lastResumeKey: null };
    }

    currentResumeKey = pageResult.resumeKey;
  }
}

/**
 * @summary Harvests Lever board tokens from Wayback Machine CDX with 50% time budget, state resume, 503/429 retries, and two-char prefix split fallback
 */
export async function harvestLeverWayback(
  state: LeverDiscoveryState,
  options: {
    harvestDeadline: number;
    waybackMinIntervalMs?: number;
    waybackRetries?: number;
    waybackRetryDelayMs?: number;
    waybackTimeoutMs?: number;
    prefixes?: readonly string[];
    fromYear?: number;
  }
): Promise<{
  harvestComplete: boolean;
  prefixesQueried: number;
  prefixesFailed: number;
  waybackRowsRead: number;
}> {
  const prefixes = options.prefixes ?? LEVER_PRIMARY_PREFIXES;
  const minIntervalMs = options.waybackMinIntervalMs ?? 1000;
  const retries = options.waybackRetries ?? 3;
  const retryOn5xxDelayMs = options.waybackRetryDelayMs ?? 30000;
  const timeoutMs = options.waybackTimeoutMs ?? 45000;
  const fromYear = options.fromYear ?? new Date().getUTCFullYear() - 2;

  let lastCallStartMs: number | null = null;
  const paceWayback = async (): Promise<boolean> => {
    if (Date.now() >= options.harvestDeadline) {
      return false;
    }
    if (lastCallStartMs !== null) {
      const elapsed = Date.now() - lastCallStartMs;
      const waitMs = Math.max(0, minIntervalMs - elapsed);
      if (waitMs > 0) {
        if (Date.now() + waitMs >= options.harvestDeadline) {
          return false;
        }
        await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
      }
    }
    if (Date.now() >= options.harvestDeadline) {
      return false;
    }
    lastCallStartMs = Date.now();
    return true;
  };

  let prefixesQueried = 0;
  let prefixesFailed = 0;
  let waybackRowsRead = 0;

  const onUrls = (urls: string[]) => {
    const seenAt = new Date().toISOString();
    for (const url of urls) {
      waybackRowsRead++;
      const token = extractLeverToken(url);
      if (token && !Object.prototype.hasOwnProperty.call(state.tokens, token)) {
        setTokenEntry(state.tokens, token, { firstSeen: seenAt });
      }
    }
  };

  if (prefixes.length === 0) {
    state.harvest.nextPrefix = null;
    state.harvest.resumeKey = null;
    state.harvest.completedAt = new Date().toISOString();
    return { harvestComplete: true, prefixesQueried, prefixesFailed, waybackRowsRead };
  }

  let startIdx = 0;
  let resumeKey = state.harvest.resumeKey;
  if (state.harvest.nextPrefix) {
    const foundIdx = prefixes.indexOf(state.harvest.nextPrefix);
    if (foundIdx >= 0) {
      startIdx = foundIdx;
    } else {
      resumeKey = null;
    }
  } else {
    // Previous cycle completed; begin a fresh cycle from the first prefix
    state.harvest.completedAt = null;
    resumeKey = null;
  }

  for (let i = startIdx; i < prefixes.length; i++) {
    const prefix = prefixes[i];
    if (Date.now() >= options.harvestDeadline) {
      state.harvest.nextPrefix = prefix;
      state.harvest.resumeKey = resumeKey;
      return { harvestComplete: false, prefixesQueried, prefixesFailed, waybackRowsRead };
    }

    state.harvest.nextPrefix = prefix;
    state.harvest.resumeKey = resumeKey;
    prefixesQueried++;

    const primaryOutcome = await harvestPrefixPages(prefix, resumeKey, {
      fromYear,
      harvestDeadline: options.harvestDeadline,
      retries,
      retryOn5xxDelayMs,
      timeoutMs,
      paceWayback,
      onUrls,
      onResumeKeyChange: (rk) => {
        state.harvest.resumeKey = rk;
      },
    });

    resumeKey = null;

    if (primaryOutcome.status === 'deadline') {
      state.harvest.nextPrefix = prefix;
      state.harvest.resumeKey = primaryOutcome.lastResumeKey;
      return { harvestComplete: false, prefixesQueried, prefixesFailed, waybackRowsRead };
    }

    if (primaryOutcome.status === 'failed') {
      // Split once into two-character prefixes on persistent failure
      for (const suffix of LEVER_SUBPREFIX_SUFFIXES) {
        if (Date.now() >= options.harvestDeadline) {
          state.harvest.nextPrefix = prefix;
          state.harvest.resumeKey = null;
          return { harvestComplete: false, prefixesQueried, prefixesFailed, waybackRowsRead };
        }
        const subPrefix = `${prefix}${suffix}`;
        prefixesQueried++;
        const subOutcome = await harvestPrefixPages(subPrefix, null, {
          fromYear,
          harvestDeadline: options.harvestDeadline,
          retries,
          retryOn5xxDelayMs,
          timeoutMs,
          paceWayback,
          onUrls,
        });

        if (subOutcome.status === 'deadline') {
          state.harvest.nextPrefix = prefix;
          state.harvest.resumeKey = null;
          return { harvestComplete: false, prefixesQueried, prefixesFailed, waybackRowsRead };
        }

        if (subOutcome.status === 'failed') {
          prefixesFailed++;
        }
      }
    }

    if (i < prefixes.length - 1) {
      state.harvest.nextPrefix = prefixes[i + 1];
      state.harvest.resumeKey = null;
    } else {
      state.harvest.nextPrefix = null;
      state.harvest.resumeKey = null;
      state.harvest.completedAt = new Date().toISOString();
    }
  }

  return {
    harvestComplete: true,
    prefixesQueried,
    prefixesFailed,
    waybackRowsRead,
  };
}

/**
 * @summary Selects eligible Lever validation candidates in order: never-checked first, then rejections older than 30 days (oldest first)
 */
export function selectLeverValidationCandidates(
  tokens: Record<string, LeverTokenState>,
  knownTokens: Set<string>,
  nowMs: number = Date.now()
): {
  alreadyKnown: number;
  candidates: string[];
} {
  let alreadyKnown = 0;
  const neverChecked: string[] = [];
  const staleRejected: Array<{ token: string; checkedAtMs: number }> = [];

  for (const token of Object.keys(tokens)) {
    if (knownTokens.has(token)) {
      alreadyKnown++;
      continue;
    }

    const entry = tokens[token];
    if (!entry.outcome || !entry.checkedAt) {
      neverChecked.push(token);
      continue;
    }

    if (
      entry.outcome === 'empty' ||
      entry.outcome === 'not_found' ||
      entry.outcome === 'dead_board' ||
      entry.outcome === 'error'
    ) {
      const parsedMs = Date.parse(entry.checkedAt);
      const checkedAtMs = Number.isFinite(parsedMs) ? parsedMs : 0;
      if (nowMs - checkedAtMs > THIRTY_DAYS_MS) {
        staleRejected.push({ token, checkedAtMs });
      }
    }
  }

  staleRejected.sort((a, b) => a.checkedAtMs - b.checkedAtMs);

  return {
    alreadyKnown,
    candidates: [...neverChecked, ...staleRejected.map((item) => item.token)],
  };
}

/**
 * @summary Orchestrates Wayback CDX harvest (up to 50% time budget), paced validation of candidate tokens, and DB upsert for live Lever boards
 */
export async function runLeverDiscovery(
  options: LeverDiscoveryOptions = {}
): Promise<LeverDiscoverySummary> {
  const db: PrismaClient = options.prismaClient ?? getDefaultPrisma();
  const stateFilePath = options.stateFilePath ?? DEFAULT_LEVER_STATE_PATH;
  const timeBudgetMs = options.timeBudgetMs ?? DEFAULT_LEVER_TIME_BUDGET_MS;
  const tokenBudget = options.tokenBudget ?? DEFAULT_LEVER_TOKEN_BUDGET;

  const startTime = Date.now();
  const harvestDeadline = startTime + Math.floor(timeBudgetMs * 0.5);
  const overallDeadline = startTime + timeBudgetMs;

  console.log(
    `🚀 Starting Lever Discovery (token budget: ${tokenBudget === Number.MAX_SAFE_INTEGER ? 'all' : tokenBudget}, time budget: ${Math.round(timeBudgetMs / 1000)}s)...`
  );

  const state = loadLeverDiscoveryState(stateFilePath);

  let harvestResult = {
    harvestComplete: false,
    prefixesQueried: 0,
    prefixesFailed: 0,
    waybackRowsRead: 0,
  };

  let alreadyKnown = 0;
  let validated = 0;
  let inserted = 0;
  let live = 0;
  let empty = 0;
  let notFound = 0;
  let deadBoard = 0;
  let errors = 0;
  let leftByBudget = 0;

  try {
    harvestResult = await harvestLeverWayback(state, {
      harvestDeadline,
      waybackMinIntervalMs: options.waybackMinIntervalMs,
      waybackRetries: options.waybackRetries,
      waybackRetryDelayMs: options.waybackRetryDelayMs,
      waybackTimeoutMs: options.waybackTimeoutMs,
      prefixes: options.prefixes,
      fromYear: options.fromYear,
    });

    const existingCompanies = await db.company.findMany({
      where: { source: 'LEVER' },
      select: { atsToken: true },
    });
    const knownTokens = new Set<string>(
      existingCompanies.map((c) => c.atsToken).filter((t): t is string => Boolean(t))
    );

    const selection = selectLeverValidationCandidates(state.tokens, knownTokens, Date.now());
    alreadyKnown = selection.alreadyKnown;

    const toValidate = selection.candidates.slice(0, tokenBudget);
    const client = options.leverClient ?? new LeverClient();

    for (const token of toValidate) {
      if (Date.now() >= overallDeadline) {
        break;
      }

      const siteStatus = await client.validateSite(token);
      validated++;

      setTokenEntry(state.tokens, token, {
        ...state.tokens[token],
        outcome: siteStatus,
        checkedAt: new Date().toISOString(),
      });

      if (siteStatus === 'live') {
        live++;
        const slug = await allocateCompanySlug(db, 'lever', token);

        let fetchedName: string | undefined;
        let logoUrl: string | undefined;
        let enrichedNow = false;

        if (options.enrichMetadata && Date.now() < overallDeadline) {
          try {
            const ref: BoardRef = { slug, source: 'lever', atsToken: token };
            const meta = await client.fetchCompanyMetadata(ref, { includeLogo: true });
            if (meta.status === 'ok') {
              fetchedName = meta.name;
              logoUrl = meta.logoUrl;
              enrichedNow = true;
            }
          } catch {
            // Non-fatal metadata enrichment error; enrich:companies fills later
          }
        }

        await db.company.upsert({
          where: {
            source_atsToken: {
              source: 'LEVER',
              atsToken: token,
            },
          },
          create: {
            slug,
            source: 'LEVER',
            atsToken: token,
            ...(fetchedName ? { name: fetchedName } : {}),
            ...(logoUrl ? { logoUrl } : {}),
            ...(enrichedNow ? { lastEnrichedAt: new Date() } : {}),
            status: 'ACTIVE',
          },
          update: {
            ...(fetchedName ? { name: fetchedName } : {}),
            ...(logoUrl ? { logoUrl } : {}),
            ...(enrichedNow ? { lastEnrichedAt: new Date() } : {}),
            status: 'ACTIVE',
          },
        });
        inserted++;
      } else if (siteStatus === 'empty') {
        empty++;
      } else if (siteStatus === 'not_found') {
        notFound++;
      } else if (siteStatus === 'dead_board') {
        deadBoard++;
      } else {
        errors++;
      }
    }

    leftByBudget = Math.max(0, selection.candidates.length - validated);
  } finally {
    saveLeverDiscoveryState(state, stateFilePath);
  }

  const tokensFound = Object.keys(state.tokens).length;
  const summary: LeverDiscoverySummary = {
    source: 'lever',
    tokensFound,
    alreadyKnown,
    validated,
    inserted,
    skippedByBudget: leftByBudget,
    harvestComplete: harvestResult.harvestComplete,
    nextPrefix: state.harvest.nextPrefix,
    prefixesQueried: harvestResult.prefixesQueried,
    prefixesFailed: harvestResult.prefixesFailed,
    waybackRowsRead: harvestResult.waybackRowsRead,
    live,
    empty,
    notFound,
    deadBoard,
    errors,
    leftByBudget,
  };

  const harvestLabel = summary.harvestComplete
    ? 'yes'
    : `no (next prefix: ${summary.nextPrefix ?? 'a'})`;

  console.log('\n════════════════════════════════════════════════════════════');
  console.log('                LEVER DISCOVERY SUMMARY                     ');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`  • Harvest complete           : ${harvestLabel}`);
  console.log(`  • Prefixes queried / failed  : ${summary.prefixesQueried} / ${summary.prefixesFailed}`);
  console.log(`  • Wayback rows read          : ${summary.waybackRowsRead}`);
  console.log(`  • Unique tokens found        : ${summary.tokensFound}`);
  console.log(`  • Already known in DB        : ${summary.alreadyKnown}`);
  console.log(`  • Tokens validated           : ${summary.validated}`);
  console.log(`  • Live (inserted)            : ${summary.live}`);
  console.log(`  • Empty                      : ${summary.empty}`);
  console.log(`  • Not found                  : ${summary.notFound}`);
  console.log(`  • Dead board                 : ${summary.deadBoard}`);
  console.log(`  • Errors                     : ${summary.errors}`);
  console.log(`  • Left by budget/time        : ${summary.leftByBudget}`);
  console.log('════════════════════════════════════════════════════════════\n');

  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      const md = [
        '### Lever Discovery Summary',
        `- **Harvest complete**: ${harvestLabel}`,
        `- **Prefixes queried / failed**: ${summary.prefixesQueried} / ${summary.prefixesFailed}`,
        `- **Wayback rows read**: ${summary.waybackRowsRead}`,
        `- **Unique tokens found**: ${summary.tokensFound}`,
        `- **Already known in DB**: ${summary.alreadyKnown}`,
        `- **Tokens validated**: ${summary.validated}`,
        `- **Live (inserted)**: ${summary.live}`,
        `- **Empty**: ${summary.empty}`,
        `- **Not found**: ${summary.notFound}`,
        `- **Dead board**: ${summary.deadBoard}`,
        `- **Errors**: ${summary.errors}`,
        `- **Left by budget/time**: ${summary.leftByBudget}`,
      ].join('\n');
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
    } catch {
      // Ignore step summary write error
    }
  }

  return summary;
}
