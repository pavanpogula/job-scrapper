/**
 * @file Unit tests for Gemini REST client
 * @summary Verifies structured output payload, thinkingConfig gating, retries (408/429/timeout), fatal errors (402), bad_json/blocked handling, usage accounting, and API key non-leakage (BF-027)
 * @tags test, unit, enrichment, model, gemini, http, BF-027
 */

import axios from 'axios';
import {
  DEFAULT_GEMINI_MODEL,
  GEMINI_ENDPOINT,
  GeminiClient,
} from '../../src/enrichment/model/GeminiClient';
import { ModelCallError } from '../../src/enrichment/model/ModelClient';
import {
  buildUserPrompt,
  MODEL_RESPONSE_SCHEMA,
  SYSTEM_PROMPT,
} from '../../src/enrichment/model/prompt';
import type { EnrichmentInput } from '../../src/enrichment/types';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const SAMPLE_INPUT: EnrichmentInput = {
  id: 'job-1',
  title: 'Staff Backend Engineer',
  descriptionPlain: 'You have 7+ years of experience building distributed systems.',
};

const VALID_ANSWER_JSON = JSON.stringify({
  minYears: 7,
  clearanceRequired: false,
  yearsEvidence: 'You have 7+ years of experience building distributed systems.',
  clearanceEvidence: null,
});

function make200Response(
  text: string = VALID_ANSWER_JSON,
  finishReason = 'STOP',
  usageMetadata: Record<string, number> = {
    promptTokenCount: 1200,
    candidatesTokenCount: 45,
    thoughtsTokenCount: 15,
  }
) {
  return {
    status: 200,
    data: {
      candidates: [
        {
          finishReason,
          content: {
            parts: [{ text }],
          },
        },
      ],
      usageMetadata,
    },
  };
}

describe('GeminiClient', () => {
  const noSleep = async (): Promise<void> => undefined;

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('sends structured-output request', async () => {
    mockedAxios.post.mockResolvedValueOnce(make200Response());
    const client = new GeminiClient({
      apiKey: 'test-key-abc',
      sleep: noSleep,
    });

    const answer = await client.classify(SAMPLE_INPUT);

    expect(answer).toEqual({
      minYears: 7,
      clearanceRequired: false,
      yearsEvidence: 'You have 7+ years of experience building distributed systems.',
      clearanceEvidence: null,
    });
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);

    const [url, body, config] = mockedAxios.post.mock.calls[0];
    expect(url).toBe(`${GEMINI_ENDPOINT}/${DEFAULT_GEMINI_MODEL}:generateContent`);
    expect(url).not.toContain('key=');
    expect(config).toEqual({
      timeout: 30_000,
      headers: {
        'x-goog-api-key': 'test-key-abc',
        'Content-Type': 'application/json',
      },
    });
    expect(body).toEqual({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: buildUserPrompt(SAMPLE_INPUT) }] }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 512,
        responseMimeType: 'application/json',
        responseJsonSchema: MODEL_RESPONSE_SCHEMA,
        thinkingConfig: { thinkingLevel: 'minimal' },
      },
    });
    expect(client.getUsage()).toEqual({
      calls: 1,
      promptTokens: 1200,
      outputTokens: 60,
    });
  });

  it('omits thinkingConfig for models without minimal thinking', async () => {
    for (const model of ['gemini-2.5-flash-lite', 'gemini-3.8-flash']) {
      mockedAxios.post.mockResolvedValueOnce(make200Response());
      const client = new GeminiClient({
        apiKey: 'test-key-abc',
        model,
        sleep: noSleep,
      });

      await client.classify(SAMPLE_INPUT);

      const call = mockedAxios.post.mock.calls[mockedAxios.post.mock.calls.length - 1];
      expect(call[0]).toBe(`${GEMINI_ENDPOINT}/${model}:generateContent`);
      const body = call[1] as { generationConfig: Record<string, unknown> };
      expect(body.generationConfig).not.toHaveProperty('thinkingConfig');
    }
  });

  it('408 is retried', async () => {
    mockedAxios.post
      .mockRejectedValueOnce({ isAxiosError: true, response: { status: 408, headers: {} } })
      .mockResolvedValueOnce(make200Response());

    const client = new GeminiClient({
      apiKey: 'test-key-abc',
      sleep: noSleep,
    });

    const answer = await client.classify(SAMPLE_INPUT);
    expect(answer.minYears).toBe(7);
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    expect(client.getUsage().calls).toBe(1);
  });

  it('429 then success', async () => {
    const onRateLimit = jest.fn();
    mockedAxios.post
      .mockRejectedValueOnce({ isAxiosError: true, response: { status: 429, headers: {} } })
      .mockResolvedValueOnce(make200Response());

    const client = new GeminiClient({
      apiKey: 'test-key-abc',
      sleep: noSleep,
      onRateLimit,
    });

    const answer = await client.classify(SAMPLE_INPUT);
    expect(answer.minYears).toBe(7);
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    expect(onRateLimit).toHaveBeenCalledTimes(1);
    expect(client.getUsage().calls).toBe(1);
  });

  it('timeout exhausts retries', async () => {
    const timeoutErr = {
      isAxiosError: true,
      code: 'ECONNABORTED',
      message: 'timeout of 30000ms exceeded',
    };
    mockedAxios.post.mockRejectedValue(timeoutErr);

    const client = new GeminiClient({
      apiKey: 'test-key-abc',
      sleep: noSleep,
    });

    let caught: unknown;
    try {
      await client.classify(SAMPLE_INPUT);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ModelCallError);
    const modelErr = caught as ModelCallError;
    expect(modelErr.kind).toBe('timeout');
    expect(modelErr.attempts).toBe(4);
    expect(modelErr.responded).toBe(false);
    expect(mockedAxios.post).toHaveBeenCalledTimes(4);
  });

  it('bad JSON is a bad_json error', async () => {
    mockedAxios.post
      .mockResolvedValueOnce(make200Response('{"minYears":'))
      .mockResolvedValueOnce(make200Response(JSON.stringify({ minYears: 'seven' })));

    const client = new GeminiClient({
      apiKey: 'test-key-abc',
      sleep: noSleep,
    });

    await expect(client.classify(SAMPLE_INPUT)).rejects.toMatchObject({
      kind: 'bad_json',
      status: 200,
      responded: true,
      attempts: 1,
    });
    await expect(client.classify(SAMPLE_INPUT)).rejects.toMatchObject({
      kind: 'bad_json',
      status: 200,
      responded: true,
      attempts: 1,
    });
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
  });

  it('blocked response keeps rules answer', async () => {
    mockedAxios.post
      .mockResolvedValueOnce(make200Response(VALID_ANSWER_JSON, 'SAFETY'))
      .mockResolvedValueOnce({
        status: 200,
        data: {
          candidates: [],
          usageMetadata: { promptTokenCount: 500, candidatesTokenCount: 0 },
        },
      });

    const client = new GeminiClient({
      apiKey: 'test-key-abc',
      sleep: noSleep,
    });

    await expect(client.classify(SAMPLE_INPUT)).rejects.toMatchObject({
      kind: 'blocked',
      status: 200,
      responded: true,
    });
    await expect(client.classify(SAMPLE_INPUT)).rejects.toMatchObject({
      kind: 'blocked',
      status: 200,
      responded: true,
    });
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    expect(client.getUsage().calls).toBe(2);
  });

  it('402 is not retried', async () => {
    mockedAxios.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 402, headers: {} },
    });

    const client = new GeminiClient({
      apiKey: 'test-key-abc',
      sleep: noSleep,
    });

    let caught: unknown;
    try {
      await client.classify(SAMPLE_INPUT);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ModelCallError);
    const modelErr = caught as ModelCallError;
    expect(modelErr.kind).toBe('http');
    expect(modelErr.status).toBe(402);
    expect(modelErr.fatal).toBe(true);
    expect(modelErr.attempts).toBe(1);
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
  });

  it('never leaks the key in errors', async () => {
    const secretKey = 'AIza-FAKE-NEVER-LEAK-KEY-987654';
    mockedAxios.post.mockRejectedValueOnce({
      isAxiosError: true,
      message: `Request failed with key ${secretKey}`,
      config: {
        url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${secretKey}`,
        headers: {
          'x-goog-api-key': secretKey,
        },
      },
      response: {
        status: 403,
        data: { error: { message: `Invalid key ${secretKey}` } },
        headers: {},
      },
    });

    const client = new GeminiClient({
      apiKey: secretKey,
      sleep: noSleep,
    });

    let caught: unknown;
    try {
      await client.classify(SAMPLE_INPUT);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ModelCallError);
    const modelErr = caught as ModelCallError;
    expect(String(modelErr)).not.toContain(secretKey);
    expect(modelErr.message).not.toContain(secretKey);
    expect(modelErr.stack ?? '').not.toContain(secretKey);
    expect(JSON.stringify(modelErr)).not.toContain(secretKey);
  });
});
