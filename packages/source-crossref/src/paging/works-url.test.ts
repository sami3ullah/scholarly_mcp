import { describe, expect, it } from 'vitest';
import type { Doi } from '@scholarly-mcp/core';
import type { CrossrefConfig } from '../config/crossref-config.js';
import { worksUrl } from './works-url.js';

const config: CrossrefConfig = {
  CROSSREF_PREFIX: '10.1055',
  CROSSREF_FROM_PUB_DATE: '2024-01-01',
  CROSSREF_API_URL: 'https://api.crossref.org',
  CROSSREF_ROWS: 100,
  CROSSREF_TIMEOUT_MS: 30_000,
  CROSSREF_MAX_RETRIES: 6,
};

describe('worksUrl', () => {
  it('walks the prefix sorted by deposit date, scoped to journal articles', () => {
    const url = worksUrl(config, { cursor: '*' });
    expect(url.origin + url.pathname).toBe('https://api.crossref.org/prefixes/10.1055/works');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      filter: 'type:journal-article,from-pub-date:2024-01-01',
      sort: 'deposited',
      order: 'asc',
      rows: '100',
      cursor: '*',
    });
  });

  it('filters an incremental walk by the UTC update day', () => {
    const url = worksUrl(config, { cursor: 'abc', from: new Date('2026-10-30T23:30:00-02:00') });
    expect(url.searchParams.get('filter')).toBe(
      'type:journal-article,from-pub-date:2024-01-01,from-update-date:2026-10-31',
    );
  });

  it('looks up DOIs within the same scope', () => {
    const dois = ['10.1055/a-1', '10.1055/a-2'] as Doi[];
    const url = worksUrl({ ...config, CROSSREF_FROM_PUB_DATE: undefined }, { dois });
    expect(Object.fromEntries(url.searchParams)).toEqual({
      filter: 'type:journal-article,doi:10.1055/a-1,doi:10.1055/a-2',
      rows: '2',
    });
  });

  it('joins the polite pool when a mailto is set', () => {
    const url = worksUrl({ ...config, CROSSREF_MAILTO: 'ingest@example.org' }, { cursor: '*' });
    expect(url.searchParams.get('mailto')).toBe('ingest@example.org');
  });

  it('keeps a base path on the API URL', () => {
    const url = worksUrl(
      { ...config, CROSSREF_API_URL: 'http://localhost:8080/crossref' },
      { cursor: '*' },
    );
    expect(url.pathname).toBe('/crossref/prefixes/10.1055/works');
  });
});
