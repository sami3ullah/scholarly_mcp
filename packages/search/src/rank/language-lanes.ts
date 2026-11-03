import type { SearchFilters, VectorChunk } from '@scholarly-mcp/core';

/**
 * The language lanes of a search's vector side (ADR 0044). Without a language filter it runs
 * once for German passages and once for all others, so the nearest passages of both
 * languages are found, not only those in the query's own; with one it runs once.
 */
export function languageLanes(filters: SearchFilters): SearchFilters[] {
  if (filters.language !== undefined || filters.excludeLanguage !== undefined) return [filters];
  return [
    { ...filters, language: LANE_LANGUAGE },
    { ...filters, excludeLanguage: LANE_LANGUAGE },
  ];
}

/**
 * The vector hits of every lane that are related to the query (ADR 0044): within
 * `vectorMargin` of the best hit of all lanes. Each lane brings its own nearest neighbours,
 * related or not; a lane with nothing related to the query keeps none.
 */
export function relatedHits(
  lanes: readonly (readonly VectorChunk[])[],
  vectorMargin: number,
): VectorChunk[][] {
  const floor =
    Math.max(...lanes.flatMap((hits) => hits.map(({ similarity }) => similarity))) - vectorMargin;
  return lanes.map((hits) => hits.filter(({ similarity }) => similarity >= floor));
}

/** The language that splits an unfiltered search into two lanes. */
const LANE_LANGUAGE = 'de';

/** The lane a passage in this language falls in: German, or any other (ADR 0044). */
export function laneOfLanguage(language: string | undefined): number {
  return language === LANE_LANGUAGE ? 0 : 1;
}
