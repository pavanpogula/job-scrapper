/**
 * @file ATS Client Registry and Factory
 * @summary Central factory for constructing AtsClient instances and defining eager default client sources
 * @tags ATS, Registry, Factory, ADR-0021, ADR-0022
 */

import { AtsSource } from './source';
import { AtsClient } from './AtsClient';
import { AshbyAtsClient } from './AshbyAtsClient';
import { GreenhouseClient } from './GreenhouseClient';

/**
 * Sources whose ATS clients are constructed eagerly by default.
 * Lever is excluded until implemented in L2.
 */
export const DEFAULT_CLIENT_SOURCES: readonly AtsSource[] = ['ashby', 'greenhouse'];

/**
 * @summary Creates an AtsClient instance for the specified ATS source
 */
export function createAtsClient(source: AtsSource): AtsClient {
  switch (source) {
    case 'ashby':
      return new AshbyAtsClient();
    case 'greenhouse':
      return new GreenhouseClient();
    case 'lever':
      throw new Error('Lever client not implemented yet (L2)');
    default: {
      const exhaustiveCheck: never = source;
      throw new Error(`Unsupported ATS source: ${String(exhaustiveCheck)}`);
    }
  }
}
