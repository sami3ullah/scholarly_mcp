import {
  appError,
  type ArticleReader,
  type ArticleSearch,
  type JournalDirectory,
  type Logger,
} from '@scholarly-mcp/core';
import type { IndexReader } from '@scholarly-mcp/store-sqlite';

/** The index as the tools see it: always callable, open or not. */
export interface LiveIndex {
  readonly reader: ArticleReader;
  readonly search: ArticleSearch;
  readonly journals: JournalDirectory;
  /**
   * Opens the index when none is open yet, else picks up a newly swapped-in build. Never
   * throws: a missing or refused file is logged and the current index, if any, stays open.
   */
  refresh(): void;
  /** True once an index is open; readiness checks report it (SM-10). */
  isReady(): boolean;
  /** The open index's version, for caches keyed on it. */
  version(): string | undefined;
  close(): void;
}

/**
 * Keeps the server up while the index is missing or being replaced: calls fail with
 * `INDEX_UNAVAILABLE` until `refresh` manages to open it, instead of the process crashing
 * in a loop (PLAN.md edge cases). The model's message never names the file path.
 */
export function createLiveIndex(open: () => IndexReader, logger: Logger): LiveIndex {
  let current: IndexReader | undefined;
  let lastProblem: string | undefined;

  const openIndex = (): IndexReader => {
    if (current !== undefined) return current;
    throw appError(
      'INDEX_UNAVAILABLE',
      'The search index is not available right now; retry shortly',
    );
  };
  const call = async <T>(work: (index: IndexReader) => Promise<T>): Promise<T> => work(openIndex());

  const report = (error: unknown) => {
    const reason = error instanceof Error ? error.message : String(error);
    // Logged once per distinct problem, not on every refresh tick.
    if (reason !== lastProblem) logger.warn({ reason }, 'Index not available');
    lastProblem = reason;
  };

  return {
    reader: {
      findByDoi: (doi, signal) => call((index) => index.reader.findByDoi(doi, signal)),
      findManyByDoi: (dois, signal) => call((index) => index.reader.findManyByDoi(dois, signal)),
      findChunks: (ids, signal) => call((index) => index.reader.findChunks(ids, signal)),
      findArticleChunks: (doi, signal) =>
        call((index) => index.reader.findArticleChunks(doi, signal)),
      indexMeta: (signal) => call((index) => index.reader.indexMeta(signal)),
    },
    search: {
      lexical: (query, signal) => call((index) => index.search.lexical(query, signal)),
      vector: (query, signal) => call((index) => index.search.vector(query, signal)),
    },
    journals: { journals: (signal) => call((index) => index.journals.journals(signal)) },
    refresh() {
      try {
        if (current === undefined) {
          current = open();
          const { version, articleCount, chunkCount } = current.meta();
          logger.info({ version, articleCount, chunkCount }, 'Index opened');
        } else if (current.refresh()) {
          logger.info({ version: current.meta().version }, 'Index swapped in');
        }
        lastProblem = undefined;
      } catch (error) {
        report(error);
      }
    },
    isReady: () => current !== undefined,
    version: () => current?.meta().version,
    close() {
      current?.close();
      current = undefined;
    },
  };
}
