import { z } from 'zod';
import type { SearchOptions } from '../service/search-types.js';

/**
 * Search settings (ADR 0014). The defaults are the plan's: a 2 s budget and the top 50
 * chunks from each side. The RRF constant is a key design decision, so it is not configurable.
 */
export const searchConfigSchema = z.object({
  SEARCH_BUDGET_MS: z.coerce.number().int().min(100).max(30_000).default(2000),
  SEARCH_CANDIDATES: z.coerce.number().int().min(10).max(500).default(50),
  SEARCH_CACHE_SIZE: z.coerce.number().int().min(0).max(100_000).default(1000),
});

export type SearchConfig = z.output<typeof searchConfigSchema>;

/** The service options a parsed config sets. */
export function searchOptionsFrom(config: SearchConfig): Omit<SearchOptions, 'rrfK'> {
  return {
    budgetMs: config.SEARCH_BUDGET_MS,
    candidates: config.SEARCH_CANDIDATES,
    cacheSize: config.SEARCH_CACHE_SIZE,
  };
}
