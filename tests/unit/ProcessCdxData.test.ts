/**
 * @file Process CDX Data Tests
 * @summary Unit tests for raw Wayback CDX JSON data processing, filtering, and slug extraction
 * @tags Unit Test, CDX, Filtering, Slug Extraction
 */

import * as fs from 'fs';
import { processRawCDXData } from '../../src/utils/ProcessCdxData';

jest.mock('fs');
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('ProcessCdxData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should filter out system paths, wildcards, numbers, UUIDs, hex strings, and CSS units', async () => {
    const rawData = [
      ['original'],
      ['https://jobs.ashbyhq.com/'],
      ['https://jobs.ashbyhq.com/multiverse'],
      ['https://jobs.ashbyhq.com/multiverse/jobs'],
      ['https://jobs.ashbyhq.com/.well-known/apple-app-site-association'],
      ['https://jobs.ashbyhq.com/$env'],
      ['https://jobs.ashbyhq.com/%25variable'],
      ['https://jobs.ashbyhq.com/*'],
      ['https://jobs.ashbyhq.com/12345'],
      ['https://jobs.ashbyhq.com/c02f928e-5917-4886-9dc4-ec3b6a94f1b2'],
      ['https://jobs.ashbyhq.com/0123456789abcdef0123456789abcdef'],
      ['https://jobs.ashbyhq.com/100vw'],
      ['https://jobs.ashbyhq.com/750ms'],
      ['https://jobs.ashbyhq.com/x'],
      ['https://jobs.ashbyhq.com/login'],
      ['https://jobs.ashbyhq.com/1password']
    ];

    const result = await processRawCDXData(rawData);

    // Only '1password' and 'multiverse' should pass
    expect(result).toEqual(['1password', 'multiverse']);
    expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
      'extracted-slugs.json',
      JSON.stringify(['1password', 'multiverse'], null, 2)
    );
  });

  it('should decode URI components and strip quotes from slugs', async () => {
    const rawData = [
      ['original'],
      ['https://jobs.ashbyhq.com/%22acme-corp%22'],
      ['https://jobs.ashbyhq.com/\'linear\'']
    ];

    const result = await processRawCDXData(rawData);

    expect(result).toEqual(['acme-corp', 'linear']);
  });
});
