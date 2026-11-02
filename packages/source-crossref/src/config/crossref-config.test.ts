import { parseConfig } from '@scholarly-mcp/core';
import { describe, expect, it } from 'vitest';
import { crossrefConfigSchema } from './crossref-config.js';

describe('crossrefConfigSchema', () => {
  it('needs only a prefix and fills safe defaults, using the public pool', () => {
    expect(parseConfig(crossrefConfigSchema, { CROSSREF_PREFIX: '10.1055' })).toEqual({
      CROSSREF_PREFIX: '10.1055',
      CROSSREF_API_URL: 'https://api.crossref.org',
      CROSSREF_ROWS: 100,
      CROSSREF_TIMEOUT_MS: 30_000,
      CROSSREF_MAX_RETRIES: 6,
    });
  });

  it('accepts a mailto for the polite pool and a publication-date scope', () => {
    const config = parseConfig(crossrefConfigSchema, {
      CROSSREF_PREFIX: '10.1055',
      CROSSREF_MAILTO: 'ingest@example.org',
      CROSSREF_FROM_PUB_DATE: '2024-01-01',
    });
    expect(config).toMatchObject({
      CROSSREF_MAILTO: 'ingest@example.org',
      CROSSREF_FROM_PUB_DATE: '2024-01-01',
    });
  });

  it.each([
    ['a missing prefix', {}, 'CROSSREF_PREFIX'],
    ['a prefix with a suffix', { CROSSREF_PREFIX: '10.1055/a-1' }, 'CROSSREF_PREFIX'],
    ['an invalid mailto', { CROSSREF_PREFIX: '10.1055', CROSSREF_MAILTO: 'nobody' }, 'MAILTO'],
    [
      'more rows than Crossref allows',
      { CROSSREF_PREFIX: '10.1055', CROSSREF_ROWS: '1001' },
      'ROWS',
    ],
  ])('fails fast on %s', (_case, env, variable) => {
    expect(() => parseConfig(crossrefConfigSchema, env)).toThrow(variable);
  });
});
