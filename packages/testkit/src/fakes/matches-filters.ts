import type { Article, Chunk, SearchFilters } from '@scholarly-mcp/core';

/** The filter semantics every store must implement, written as plainly as possible. */
export function matchesFilters(article: Article, chunk: Chunk, filters: SearchFilters): boolean {
  const { journal, published } = article;
  const language = chunk.language ?? article.language;
  if (article.isRetracted && filters.includeRetracted !== true) return false;
  if (filters.openAccessOnly === true && !article.isOpenAccess) return false;
  if (filters.language !== undefined && language !== filters.language) return false;
  if (filters.yearFrom !== undefined && published.year < filters.yearFrom) return false;
  if (filters.yearTo !== undefined && published.year > filters.yearTo) return false;
  if (
    filters.journalIssn !== undefined &&
    journal.issnPrint !== filters.journalIssn &&
    journal.issnElectronic !== filters.journalIssn
  ) {
    return false;
  }
  return true;
}
