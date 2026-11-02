import type { FusedChunk } from './rrf.js';

/**
 * Keeps one result per article: its best chunk, whose score becomes the article's score
 * (key design decision 7). Expects chunks sorted best first, as `fuseRankings` returns them.
 */
export function collapseToArticles(chunks: readonly FusedChunk[]): FusedChunk[] {
  const seen = new Set<string>();
  return chunks.filter(({ doi }) => {
    if (seen.has(doi)) return false;
    seen.add(doi);
    return true;
  });
}
