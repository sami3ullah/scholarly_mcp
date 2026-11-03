import type { IndexMeta } from '../indexing/index-meta.js';
import type { ArticleReader } from './article-reader.js';
import type { ArticleSearch } from './article-search.js';
import type { JournalDirectory } from './journal-directory.js';

/**
 * The server's read-only view of the live index, which follows swaps: a renamed SQLite file
 * or a new Postgres build schema (ADR 0034).
 */
export interface IndexReader {
  readonly reader: ArticleReader;
  readonly search: ArticleSearch;
  readonly journals: JournalDirectory;
  /** The description of the index currently open. */
  meta(): IndexMeta;
  /**
   * Moves to a newly committed index, and resolves true when it did. One built with another
   * model version, or a broken one, is refused with `INDEX_UNAVAILABLE` and the current
   * index stays open.
   */
  refresh(signal: AbortSignal): Promise<boolean>;
  close(): Promise<void>;
}
