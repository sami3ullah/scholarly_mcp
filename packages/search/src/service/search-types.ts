import type {
  Article,
  ArticleReader,
  ArticleSearch,
  Clock,
  Doi,
  Embedder,
  Language,
  Logger,
  SearchFilters,
} from '@scholarly-mcp/core';

/** One search call: the tool's input after schema validation, journal resolved to an ISSN. */
export interface SearchRequest {
  readonly query: string;
  readonly filters: SearchFilters;
  /** Results per page, 1 to 10. */
  readonly limit: number;
  /** The `nextCursor` of the previous page. */
  readonly cursor?: string;
}

/**
 * One result. Carries the article for the tool layer to build its card from; only the
 * teaser and `whyMatched` may be shown from its text (ADR 0016).
 */
export interface SearchHit {
  readonly article: Article;
  /** The best-matching chunk, for the landing session; absent for a DOI lookup. */
  readonly matchedChunkId?: string;
  readonly teaser: string;
  readonly whyMatched: string;
}

/** A page of results. An empty `hits` is a valid answer, not an error. */
export interface SearchResult {
  readonly hits: readonly SearchHit[];
  /** Present when more results follow. */
  readonly nextCursor?: string;
  readonly indexVersion: string;
  /** The query language when it was clear. */
  readonly queryLanguage?: Language;
}

/** One "find related" call: the article to start from and how many neighbours to return. */
export interface RelatedRequest {
  readonly doi: Doi;
  /** Results to return, 1 to 10. */
  readonly limit: number;
}

/** The article a related search started from, with its nearest neighbours. */
export interface RelatedResult {
  readonly article: Article;
  readonly hits: readonly SearchHit[];
  readonly indexVersion: string;
}

/** Tuning knobs; SM-08 sets them from the golden set, not by feel. */
export interface SearchOptions {
  /** Time budget per search (PLAN.md: 2 s). */
  readonly budgetMs: number;
  /** Chunks fetched from each side before fusion (PLAN.md: top 50). */
  readonly candidates: number;
  /** Query embeddings kept in the LRU cache. */
  readonly cacheSize: number;
  /** The RRF constant k. */
  readonly rrfK: number;
  /**
   * The weight of the lexical list in fusion; the vector list counts 1. Above 1, an exact
   * word match beats a neighbour by meaning at the same rank (SM-08).
   */
  readonly lexicalWeight: number;
}

/** What the search service is built from. */
export interface SearchServiceDeps {
  readonly reader: ArticleReader;
  readonly search: ArticleSearch;
  readonly embedder: Pick<Embedder, 'embedQuery'>;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly options?: Partial<SearchOptions>;
}

/** Hybrid article search (PLAN.md "Query pipeline", steps 1 to 7 and 9). */
export interface SearchService {
  search(request: SearchRequest, signal: AbortSignal): Promise<SearchResult>;
  /** Nearest neighbours of an article by meaning; `NOT_FOUND` for an unknown DOI. */
  related(request: RelatedRequest, signal: AbortSignal): Promise<RelatedResult>;
}
