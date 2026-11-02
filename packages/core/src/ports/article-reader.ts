import type { Article } from '../article/article.js';
import type { Doi } from '../article/doi.js';
import type { Chunk } from '../chunk/chunk.js';
import type { IndexMeta } from '../indexing/index-meta.js';

/** Read access to the index, used by the server. Implementations open the index read-only. */
export interface ArticleReader {
  /** Returns the article, or undefined when the DOI is not indexed. */
  findByDoi(doi: Doi, signal: AbortSignal): Promise<Article | undefined>;
  /** Returns the indexed articles among `dois`, in the order given; unknown DOIs are skipped. */
  findManyByDoi(dois: readonly Doi[], signal: AbortSignal): Promise<Article[]>;
  /** Returns the chunks with these ids, in the order given; unknown ids are skipped. */
  findChunks(ids: readonly string[], signal: AbortSignal): Promise<Chunk[]>;
  /** Returns all chunks of an article in ordinal order; empty when the DOI is not indexed. */
  findArticleChunks(doi: Doi, signal: AbortSignal): Promise<Chunk[]>;
  /** Describes the index, or undefined when none has been built yet. */
  indexMeta(signal: AbortSignal): Promise<IndexMeta | undefined>;
}
