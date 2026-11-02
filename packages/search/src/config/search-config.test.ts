import { parseConfig } from '@scholarly-mcp/core';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SEARCH_OPTIONS } from '../service/create-search-service.js';
import { searchConfigSchema, searchOptionsFrom } from './search-config.js';

describe('searchConfigSchema', () => {
  it("defaults to the plan's budget and candidate counts", () => {
    const { budgetMs, candidates, cacheSize } = DEFAULT_SEARCH_OPTIONS;
    expect(searchOptionsFrom(parseConfig(searchConfigSchema, {}))).toEqual({
      budgetMs,
      candidates,
      cacheSize,
    });
  });

  it('reads overrides from the environment', () => {
    const config = parseConfig(searchConfigSchema, {
      SEARCH_CANDIDATES: '100',
      SEARCH_CACHE_SIZE: '0',
    });
    expect(searchOptionsFrom(config)).toMatchObject({ candidates: 100, cacheSize: 0 });
  });

  it('rejects a budget too small to embed a query', () => {
    expect(() => parseConfig(searchConfigSchema, { SEARCH_BUDGET_MS: '5' })).toThrow(
      /SEARCH_BUDGET_MS/,
    );
  });
});
