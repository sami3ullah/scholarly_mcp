import type { Article } from '../article/article.js';
import type { Doi } from '../article/doi.js';
import type { Chunk } from '../chunk/chunk.js';
import type { IndexMeta } from '../indexing/index-meta.js';

/** An article together with all of its chunks, written as one unit. */
export interface ArticleRecord {
  readonly article: Article;
  readonly chunks: readonly Chunk[];
}

/** Write access to the index. Ingestion is its only user (key design decision 3). */
export interface ArticleWriter {
  /**
   * Inserts or replaces each article and all of its chunks, atomically per call. Idempotent:
   * writing the same records twice leaves the index unchanged.
   */
  upsert(records: readonly ArticleRecord[], signal: AbortSignal): Promise<void>;
  /** Removes an article and its chunks; does nothing when the DOI is not indexed. */
  remove(doi: Doi, signal: AbortSignal): Promise<void>;
  /** The stored content hash, so unchanged records can skip re-embedding. */
  contentHashOf(doi: Doi, signal: AbortSignal): Promise<string | undefined>;
  /** Records the description of a verified index. */
  writeIndexMeta(meta: IndexMeta, signal: AbortSignal): Promise<void>;
}
