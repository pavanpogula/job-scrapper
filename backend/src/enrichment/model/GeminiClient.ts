/**
 * @file Gemini generateContent client
 * @summary axios REST call with structured JSON output, retry/backoff and usage counters for the enrichment model step
 * @tags Enrichment, Gemini, Model, HTTP, Retry, BF-027
 */

import axios from 'axios';
import {
  classifyFetchFailure,
  computeRetryDelayMs,
  getErrorHeaders,
  getHttpStatus,
  isRetryableError,
} from '../../lib/ats/http';
import type { EnrichmentInput } from '../types';
import { ModelAnswer, ModelCallError, ModelClient, ModelUsage } from './ModelClient';
import { buildUserPrompt, MODEL_RESPONSE_SCHEMA, SYSTEM_PROMPT } from './prompt';

export const DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-lite';
export const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

/** thinkingLevel 'minimal' only where aistudio.google.com/docs/thinking lists it (2026-11-23); other models: omit thinkingConfig */
export const MINIMAL_THINKING_MODELS: ReadonlySet<string> = new Set([
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
]);

export interface GeminiClientOptions {
  apiKey: string;
  model?: string;
  timeoutMs?: number;
  maxRetries?: number;
  baseDelayMs?: number;
  maxOutputTokens?: number;
  sleep?: (ms: number) => Promise<void>;
  onRateLimit?: () => void;
}

interface GeminiPart {
  text?: unknown;
}

interface GeminiCandidate {
  finishReason?: unknown;
  content?: {
    parts?: GeminiPart[];
  };
}

interface GeminiUsageMetadata {
  promptTokenCount?: unknown;
  candidatesTokenCount?: unknown;
  thoughtsTokenCount?: unknown;
}

interface GeminiGenerateResponse {
  candidates?: GeminiCandidate[];
  usageMetadata?: GeminiUsageMetadata;
}

/**
 * @summary Converts an optional token count field into a non-negative finite number
 */
function asTokenCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

/**
 * @summary Validates parsed JSON output against the expected ModelAnswer shape
 */
function parseModelAnswer(rawText: string, attempts: number): ModelAnswer {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new ModelCallError('bad_json', 200, attempts);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ModelCallError('bad_json', 200, attempts);
  }

  const obj = parsed as Record<string, unknown>;
  const { minYears, clearanceRequired, yearsEvidence, clearanceEvidence } = obj;

  const validMinYears =
    minYears === null || (typeof minYears === 'number' && Number.isFinite(minYears));
  const validClearance = typeof clearanceRequired === 'boolean';
  const validYearsEv = yearsEvidence === null || typeof yearsEvidence === 'string';
  const validClearanceEv = clearanceEvidence === null || typeof clearanceEvidence === 'string';

  if (!validMinYears || !validClearance || !validYearsEv || !validClearanceEv) {
    throw new ModelCallError('bad_json', 200, attempts);
  }

  return {
    minYears: minYears as number | null,
    clearanceRequired: clearanceRequired as boolean,
    yearsEvidence: yearsEvidence as string | null,
    clearanceEvidence: clearanceEvidence as string | null,
  };
}

/**
 * REST client calling Gemini `models/{model}:generateContent` with structured JSON output and bounded retries.
 */
export class GeminiClient implements ModelClient {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly maxOutputTokens: number;
  private readonly sleepFn: (ms: number) => Promise<void>;
  private readonly onRateLimit?: () => void;

  private calls = 0;
  private promptTokens = 0;
  private outputTokens = 0;

  /**
   * @summary Initializes a GeminiClient instance without reading process.env
   */
  constructor(opts: GeminiClientOptions) {
    this.apiKey = opts.apiKey;
    this.model = opts.model && opts.model.length > 0 ? opts.model : DEFAULT_GEMINI_MODEL;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.maxRetries = opts.maxRetries ?? 3;
    this.baseDelayMs = opts.baseDelayMs ?? 1_000;
    this.maxOutputTokens = opts.maxOutputTokens ?? 512;
    this.sleepFn = opts.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.onRateLimit = opts.onRateLimit;
  }

  /**
   * @summary Sends one job posting to Gemini generateContent with retries on 408/429/5xx and socket timeouts
   */
  async classify(input: EnrichmentInput): Promise<ModelAnswer> {
    const url = `${GEMINI_ENDPOINT}/${encodeURIComponent(this.model)}:generateContent`;
    const body = {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: buildUserPrompt(input) }] }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: this.maxOutputTokens,
        responseMimeType: 'application/json',
        responseJsonSchema: MODEL_RESPONSE_SCHEMA,
        ...(MINIMAL_THINKING_MODELS.has(this.model)
          ? { thinkingConfig: { thinkingLevel: 'minimal' } }
          : {}),
      },
    };
    const config = {
      timeout: this.timeoutMs,
      headers: {
        'x-goog-api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
    };

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const attempts = attempt + 1;
      try {
        const response = await axios.post<GeminiGenerateResponse>(url, body, config);
        const data = response?.data;
        const usageMeta = data?.usageMetadata;

        this.calls += 1;
        this.promptTokens += asTokenCount(usageMeta?.promptTokenCount);
        this.outputTokens +=
          asTokenCount(usageMeta?.candidatesTokenCount) + asTokenCount(usageMeta?.thoughtsTokenCount);

        const candidate = data?.candidates?.[0];
        if (!candidate || candidate.finishReason !== 'STOP') {
          throw new ModelCallError('blocked', 200, attempts);
        }

        const parts = candidate.content?.parts ?? [];
        const rawText = parts.map((p) => (typeof p?.text === 'string' ? p.text : '')).join('');
        if (rawText.trim().length === 0) {
          throw new ModelCallError('blocked', 200, attempts);
        }

        return parseModelAnswer(rawText, attempts);
      } catch (err) {
        if (err instanceof ModelCallError) {
          throw err;
        }

        const status = getHttpStatus(err);
        if (status === 429) {
          this.onRateLimit?.();
        }

        if (attempt < this.maxRetries && (isRetryableError(err) || status === 408)) {
          const delayMs = computeRetryDelayMs(
            attempt,
            this.baseDelayMs,
            status,
            getErrorHeaders(err)
          );
          await this.sleepFn(delayMs);
          continue;
        }

        const kind = status !== undefined ? 'http' : classifyFetchFailure(err, attempts).kind;
        throw new ModelCallError(kind, status, attempts);
      }
    }

    throw new ModelCallError('network', undefined, this.maxRetries + 1);
  }

  /**
   * @summary Returns cumulative HTTP 200 calls and prompt/output token counts
   */
  getUsage(): ModelUsage {
    return {
      calls: this.calls,
      promptTokens: this.promptTokens,
      outputTokens: this.outputTokens,
    };
  }
}
