/**
 * @file Unit tests for enrichment model prompt and response schema
 * @summary Verifies requirement-first description trimming, fenced user prompt formatting, and Gemini JSON schema (BF-027)
 * @tags test, unit, enrichment, model, prompt, BF-027
 */

import {
  buildUserPrompt,
  MODEL_DESCRIPTION_MAX_CHARS,
  MODEL_RESPONSE_SCHEMA,
  SYSTEM_PROMPT,
  trimDescriptionForModel,
} from '../../src/enrichment/model/prompt';

describe('model prompt and schema', () => {
  it('trims long description keeping requirement lines', () => {
    const blurb = 'We build cloud software for modern teams and value collaborative culture across global offices.';
    const line80 = '5+ years of experience building distributed systems';
    const line120 = 'Must be able to obtain a Secret clearance';

    const lines: string[] = [];
    for (let i = 0; i < 150; i += 1) {
      if (i === 80) {
        lines.push(line80);
      } else if (i === 120) {
        lines.push(line120);
      } else {
        lines.push(`Line ${i}: ${blurb}`);
      }
    }
    const text = lines.join('\n');
    expect(text.length).toBeGreaterThan(9000);

    const trimmed = trimDescriptionForModel(text);
    expect(trimmed.length).toBeLessThanOrEqual(MODEL_DESCRIPTION_MAX_CHARS);
    expect(trimmed).toContain(line80);
    expect(trimmed).toContain(line120);

    const outLines = trimmed.split('\n');
    const idxMap = new Map<string, number>();
    lines.forEach((l, idx) => idxMap.set(l, idx));
    let prevIdx = -1;
    for (const line of outLines) {
      const origIdx = idxMap.get(line);
      expect(origIdx).toBeDefined();
      expect(origIdx!).toBeGreaterThan(prevIdx);
      prevIdx = origIdx!;
    }
    expect(outLines.indexOf(line80)).toBeLessThan(outLines.indexOf(line120));
  });

  it('short description is returned unchanged', () => {
    const shortText = 'Requirements:\n- 3+ years of backend TypeScript experience.\n'.padEnd(500, 'a');
    expect(shortText.length).toBe(500);
    expect(trimDescriptionForModel(shortText)).toBe(shortText);
  });

  it('user prompt carries title and fenced description', () => {
    expect(buildUserPrompt({ id: '1', title: 'SRE', descriptionPlain: 'x' })).toBe(
      'Job title: SRE\n\nJob posting (may be shortened):\n"""\nx\n"""'
    );
    expect(SYSTEM_PROMPT).toContain('minYears');
    expect(SYSTEM_PROMPT).toContain('clearanceRequired');
  });

  it('schema requires all four fields', () => {
    expect(MODEL_RESPONSE_SCHEMA.required).toEqual([
      'minYears',
      'clearanceRequired',
      'yearsEvidence',
      'clearanceEvidence',
    ]);
    expect(MODEL_RESPONSE_SCHEMA.additionalProperties).toBe(false);
    const props = MODEL_RESPONSE_SCHEMA.properties as Record<string, unknown>;
    expect(props.minYears).toEqual({
      type: ['integer', 'null'],
      minimum: 0,
      maximum: 30,
    });
  });
});
