import type { Doi } from '../article/doi.js';
import type { Language } from '../article/language.js';

/** Filters applied identically to the lexical and the vector side of a search. */
export interface SearchFilters {
  readonly language?: string;
  /**
   * A journal's ISSNs: an article matches when it carries any of them, because records of one
   * journal carry its print ISSN, its electronic ISSN or both. Empty matches nothing.
   */
  readonly journalIssns?: readonly string[];
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
  /**
   * The query's language when it was detected with confidence. Adapters stem the terms in
   * this language only, and in both German and English when it is absent.
   */
  readonly language?: Language;
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
