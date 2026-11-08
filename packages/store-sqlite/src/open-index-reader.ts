import { existsSync } from 'node:fs';
import {
  appError,
  type ArticleSearch,
  type IndexMeta,
  type IndexReader,
} from '@scholarly-mcp/core';
import { createSqliteIndexStore, type SqliteIndexStore } from './create-sqlite-index-store.js';
import { readIndexMeta } from './database/index-meta-row.js';
import { openDatabase, type Db } from './database/open-database.js';
import { createSearchPool, type SearchPool } from './search/search-pool.js';
import { withSignal } from './with-signal.js';

export type { IndexReader };

interface Opened {
  readonly db: Db;
  readonly store: SqliteIndexStore;
  readonly meta: IndexMeta;
}

export interface IndexReaderOptions {
  /**
   * Worker threads that run lexical and vector searches, each on its own connection
   * (ADR 0041). 0 runs them on the calling thread.
   */
  readonly searchWorkers?: number;
}

/**
 * Opens the index read-only (key design decision 3) and refuses one built with another
 * embedding model, so query and passage vectors are never mixed (ARCHITECTURE.md edge cases).
 * Throws `INDEX_UNAVAILABLE` with a clear message when the file is missing or not usable,
 * for the server's readiness check to report.
 */
export function openIndexReader(
  path: string,
  modelVersion: string,
  signal: AbortSignal,
  options: IndexReaderOptions = {},
): Promise<IndexReader> {
  return withSignal(signal, () => readerOf(path, modelVersion, options.searchWorkers ?? 0));
}

function readerOf(path: string, modelVersion: string, searchWorkers: number): IndexReader {
  let current = open(path, modelVersion);
  const store = () => current.store;
  // Started only once the file is known to be usable; the workers open it themselves.
  const pool: SearchPool | undefined =
    searchWorkers > 0 ? createSearchPool(path, searchWorkers) : undefined;
  const search: ArticleSearch = pool?.search ?? {
    lexical: (query, signal) => store().search.lexical(query, signal),
    vector: (query, signal) => store().search.vector(query, signal),
  };

  return {
    reader: {
      findByDoi: (doi, signal) => store().reader.findByDoi(doi, signal),
      findManyByDoi: (dois, signal) => store().reader.findManyByDoi(dois, signal),
      findChunks: (ids, signal) => store().reader.findChunks(ids, signal),
      findArticleChunks: (doi, signal) => store().reader.findArticleChunks(doi, signal),
      indexMeta: (signal) => store().reader.indexMeta(signal),
    },
    search,
    journals: { journals: (signal) => store().journals.journals(signal) },
    meta: () => current.meta,
    async refresh(signal) {
      const next = await withSignal(signal, () => open(path, modelVersion));
      if (next.meta.version === current.meta.version) {
        next.db.close();
        return false;
      }
      // The workers move first; a search one is running finishes on the old file. Until the
      // lookups here move too, a search may name a chunk they miss, which the search service
      // already treats as an index changing mid-request.
      try {
        await pool?.reopen();
      } catch (cause) {
        next.db.close();
        throw appError('INDEX_UNAVAILABLE', `Search workers could not reopen ${path}`, { cause });
      }
      // Queries on this thread run synchronously inside each call, so none uses the old
      // handle now.
      const previous = current;
      current = next;
      previous.db.close();
      return true;
    },
    async close() {
      await pool?.close();
      current.db.close();
    },
  };
}

function open(path: string, modelVersion: string): Opened {
  if (!existsSync(path)) {
    throw appError('INDEX_UNAVAILABLE', `No index file at ${path}; run the ingest first`);
  }
  let db: Db | undefined;
  try {
    db = openDatabase(path, { readonly: true });
    const meta = readIndexMeta(db);
    if (meta === undefined) throw new Error('The index was never committed');
    if (meta.modelVersion !== modelVersion) {
      throw new Error(`Index model ${meta.modelVersion} does not match ${modelVersion}`);
    }
    return { db, store: createSqliteIndexStore(db), meta };
  } catch (cause) {
    db?.close();
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw appError('INDEX_UNAVAILABLE', `Index at ${path} is not usable: ${reason}`, { cause });
  }
}
