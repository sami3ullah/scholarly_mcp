import { foldText, type Article, type PublishedDate } from '@scholarly-mcp/core';
import { queryWords } from '../query/query-words.js';
import type { FusedChunk } from './rrf.js';

/** A collapsed result with its article loaded. */
export interface Candidate {
  readonly article: Article;
  readonly best: FusedChunk;
}

/**
 * Orders results for the page: an article whose title, with or without its subtitle, is the query
 * goes first (a pasted title, ARCHITECTURE.md edge cases), then by fused score; equal scores put
 * the newer article first, then the lower DOI, so ties are deterministic. Without a query nothing
 * is boosted.
 */
export function orderResults(candidates: readonly Candidate[], query?: string): Candidate[] {
  const wanted = query === undefined ? undefined : titleKey(query);
  const isTitle = ({ article }: Candidate) =>
    wanted !== undefined &&
    (titleKey(article.title) === wanted ||
      (article.subtitle !== undefined &&
        titleKey(`${article.title} ${article.subtitle}`) === wanted));
  return [...candidates].sort(
    (a, b) =>
      Number(isTitle(b)) - Number(isTitle(a)) ||
      b.best.score - a.best.score ||
      compareDates(b.article.published, a.article.published) ||
      (a.article.doi < b.article.doi ? -1 : a.article.doi > b.article.doi ? 1 : 0),
  );
}

/** A title compared by its folded words, so case, punctuation and umlaut spelling do not count. */
function titleKey(text: string): string {
  return queryWords(foldText(text)).join(' ');
}

/** Compares dates by the parts they have; a missing month or day sorts before any given one. */
function compareDates(a: PublishedDate, b: PublishedDate): number {
  return a.year - b.year || (a.month ?? 0) - (b.month ?? 0) || (a.day ?? 0) - (b.day ?? 0);
}
