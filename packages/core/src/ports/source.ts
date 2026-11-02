import type { Article } from '../article/article.js';

/** Which records a source should return, and where to resume. */
export interface SourceRequest {
  /** Opaque cursor from the previous page; absent for the first page. */
  readonly cursor?: string;
  /** Only records updated at or after this instant, for incremental syncs. */
  readonly updatedSince?: Date;
}

/** One page of canonical articles. A missing `nextCursor` means the run is complete. */
export interface SourcePage {
  readonly articles: readonly Article[];
  readonly nextCursor?: string;
}

/**
 * A content source such as Crossref. Adapters page through records and emit canonical
 * articles; ingestion checkpoints the cursor after every page.
 */
export interface Source {
  /** Stable name used as the SyncState key, e.g. `crossref`. */
  readonly name: string;
  fetchPage(request: SourceRequest, signal: AbortSignal): Promise<SourcePage>;
}
