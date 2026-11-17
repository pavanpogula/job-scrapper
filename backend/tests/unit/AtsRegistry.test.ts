/**
 * @file ATS Client Registry and Factory Unit Tests
 * @summary Validates eager default client map initialization in AshbyScraper/EnrichCompanies and verifies Lever client stub throws L2 message
 * @tags ATS, Registry, Factory, Clients, Unit Tests, ADR-0022
 */

import { AshbyScraper } from '../../src/core/Scraper';
import { createAtsClient, DEFAULT_CLIENT_SOURCES } from '../../src/lib/ats/registry';

describe('ATS Client Registry (ADR-0022)', () => {
  it('throws expected L2 message when creating Lever client', () => {
    expect(() => createAtsClient('lever')).toThrow('Lever client not implemented yet (L2)');
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
