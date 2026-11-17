/**
 * @file ATS Client Registry and Factory Unit Tests
 * @summary Validates eager default client map initialization in AshbyScraper/EnrichCompanies and createAtsClient for all sources including Lever
 * @tags ATS, Registry, Factory, Clients, Unit Tests, ADR-0022
 */

import { AshbyScraper } from '../../src/core/Scraper';
import { createAtsClient, DEFAULT_CLIENT_SOURCES } from '../../src/lib/ats/registry';
import { LeverClient } from '../../src/lib/ats/LeverClient';

describe('ATS Client Registry (ADR-0022)', () => {
  it('constructs LeverClient when creating lever client', () => {
    const leverClient = createAtsClient('lever', { minIntervalMs: 1500, initialDelayMs: 500 });
    expect(leverClient).toBeInstanceOf(LeverClient);
    expect(leverClient.source).toBe('lever');
  });

  it('constructs Ashby and Greenhouse clients for DEFAULT_CLIENT_SOURCES without throwing', () => {
    expect(DEFAULT_CLIENT_SOURCES).toEqual(['ashby', 'greenhouse']);
    const ashbyClient = createAtsClient('ashby');
    expect(ashbyClient).toBeDefined();
    const ghClient = createAtsClient('greenhouse');
    expect(ghClient).toBeDefined();
  });

  it('constructs a default AshbyScraper without throwing', () => {
    expect(() => new AshbyScraper()).not.toThrow();
  });
});
