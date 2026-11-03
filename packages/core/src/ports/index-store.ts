import type { Doi } from '../article/doi.js';
import type { ArticleReader } from './article-reader.js';
import type { ArticleSearch } from './article-search.js';
import type { ArticleRecord, ArticleWriter } from './article-writer.js';
import type { JournalDirectory } from './journal-directory.js';
import type { SyncStateStore } from './sync-state-store.js';

/** What a purge removed. */
export interface PurgeCounts {
  readonly articles: number;
  readonly chunks: number;
}

/**
 * Every face of one index, as each store adapter offers it. The server uses only `reader`,
 * `search` and `journals`; the ingest the rest.
 */
export interface IndexStore {
  readonly reader: ArticleReader;
  readonly writer: ArticleWriter;
  readonly search: ArticleSearch;
  readonly journals: JournalDirectory;
  readonly syncState: SyncStateStore;
  /** An article with all its chunks, so a rebuild can reuse embeddings of unchanged articles. */
  findRecord(doi: Doi, signal: AbortSignal): Promise<ArticleRecord | undefined>;
  /**
   * Removes all full text indexed under a licence, in one transaction, e.g. when a rights
   * holder asks (ADR 0003). Only a purge build calls it; the live index is never written.
   */
  purgeFullText(licenseUrl: string, signal: AbortSignal): Promise<PurgeCounts>;
}
