import {
  appError,
  type ArticleReader,
  type ArticleSearch,
  type IndexReader,
  type JournalDirectory,
  type Logger,
} from '@scholarly-mcp/core';

/** How long one open or refresh may take before it is given up until the next tick. */
const DEFAULT_TIMEOUT_MS = 20_000;

/** The index as the tools see it: always callable, open or not. */
export interface LiveIndex {
  readonly reader: ArticleReader;
  readonly search: ArticleSearch;
  readonly journals: JournalDirectory;
  /**
   * Opens the index when none is open yet, else picks up a newly swapped-in build. Never
   * rejects: a missing or refused index is logged and the current one, if any, stays open.
   * A call while one is still running waits for that one instead of starting another.
   */
  refresh(): Promise<void>;
  /** True once an index is open; readiness checks report it (SM-10). */
  isReady(): boolean;
  /** The open index's version, for caches keyed on it. */
  version(): string | undefined;
  close(): Promise<void>;
}

/**
 * Keeps the server up while the index is missing or being replaced: calls fail with
 * `INDEX_UNAVAILABLE` until `refresh` manages to open it, instead of the process crashing
 * in a loop (PLAN.md edge cases). The model's message never names the file path or schema.
 * Each open or refresh is given `timeoutMs`, so a hung database cannot stall the ticks.
 */
export function createLiveIndex(
  open: (signal: AbortSignal) => Promise<IndexReader>,
  logger: Logger,
  options: { readonly timeoutMs?: number } = {},
): LiveIndex {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let current: IndexReader | undefined;
  let lastProblem: string | undefined;
  let running: Promise<void> | undefined;
  let closed = false;

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

  const step = async () => {
    if (closed) return;
    const signal = AbortSignal.timeout(timeoutMs);
    try {
      if (current === undefined) {
        // `close` waits for this step, so an index opened meanwhile is closed there.
        current = await open(signal);
        const { version, articleCount, chunkCount } = current.meta();
        logger.info({ version, articleCount, chunkCount }, 'Index opened');
      } else if (await current.refresh(signal)) {
        logger.info({ version: current.meta().version }, 'Index swapped in');
      }
      lastProblem = undefined;
    } catch (error) {
      report(error);
    }
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
      running ??= step().finally(() => {
        running = undefined;
      });
      return running;
    },
    isReady: () => current !== undefined,
    version: () => current?.meta().version,
    async close() {
      closed = true;
      await running;
      const open = current;
      current = undefined;
      await open?.close();
    },
  };
}
