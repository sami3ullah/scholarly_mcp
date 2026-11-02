import type { Doi, RankedChunk } from '@scholarly-mcp/core';

/** The RRF constant (key design decision 6). */
export const RRF_K = 60;

/** A chunk with its fused score across every result list it appears in. */
export interface FusedChunk {
  readonly chunkId: string;
  readonly doi: Doi;
  readonly score: number;
}

/**
 * Reciprocal Rank Fusion: each chunk scores the sum of 1 / (k + rank) over the lists it
 * appears in, so BM25 and cosine never need comparable scores. Sorted by score, then chunk
 * id, so equal input always gives equal output.
 */
export function fuseRankings(
  lists: readonly (readonly RankedChunk[])[],
  k: number = RRF_K,
): FusedChunk[] {
  const fused = new Map<string, { doi: Doi; score: number }>();
  for (const list of lists) {
    for (const { chunkId, doi, rank } of list) {
      const current = fused.get(chunkId);
      fused.set(chunkId, { doi, score: (current?.score ?? 0) + 1 / (k + rank) });
    }
  }
  return Array.from(fused, ([chunkId, { doi, score }]) => ({ chunkId, doi, score })).sort(
    (a, b) => b.score - a.score || compare(a.chunkId, b.chunkId),
  );
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
