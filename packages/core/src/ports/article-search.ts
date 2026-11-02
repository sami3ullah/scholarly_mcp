import type { Doi } from '../article/doi.js';

/** Filters applied identically to the lexical and the vector side of a search. */
export interface SearchFilters {
  readonly language?: string;
  readonly journalIssn?: string;
  readonly yearFrom?: number;
  readonly yearTo?: number;
  readonly openAccessOnly?: boolean;
  /** Retracted articles are excluded unless this is true. */
  readonly includeRetracted?: boolean;
}

/**
 * A lexical query as already-tokenised terms. Adapters quote each term themselves and never
 * pass raw user input to their query syntax.
 */
export interface LexicalQuery {
  readonly terms: readonly string[];
  readonly filters: SearchFilters;
  readonly limit: number;
}

/** A nearest-neighbour query over chunk embeddings. */
export interface VectorQuery {
  readonly embedding: Float32Array;
  readonly filters: SearchFilters;
  readonly limit: number;
}

/** A chunk hit with its 1-based rank in one result list. */
export interface RankedChunk {
  readonly chunkId: string;
  readonly doi: Doi;
  readonly rank: number;
}

/** The two retrieval primitives the search service fuses with RRF. */
export interface ArticleSearch {
  lexical(query: LexicalQuery, signal: AbortSignal): Promise<RankedChunk[]>;
  vector(query: VectorQuery, signal: AbortSignal): Promise<RankedChunk[]>;
}
