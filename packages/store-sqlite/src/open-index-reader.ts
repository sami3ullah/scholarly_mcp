import { existsSync } from 'node:fs';
import {
  appError,
  type ArticleReader,
  type ArticleSearch,
  type IndexMeta,
} from '@scholarly-mcp/core';
import { createSqliteIndexStore, type SqliteIndexStore } from './create-sqlite-index-store.js';
import { readIndexMeta } from './database/index-meta-row.js';
import { openDatabase, type Db } from './database/open-database.js';

/** The server's read-only view of the index, which follows atomic swaps. */
export interface IndexReader {
  readonly reader: ArticleReader;
  readonly search: ArticleSearch;
  /** The description of the index currently open. */
  meta(): IndexMeta;
  /**
   * Reopens the index file when a new version has been swapped in, and returns true when it
   * did. A new file with another model version, or a broken one, is refused with
   * `INDEX_UNAVAILABLE` and the current index stays open.
   */
  refresh(): boolean;
  close(): void;
}

interface Opened {
  readonly db: Db;
  readonly store: SqliteIndexStore;
  readonly meta: IndexMeta;
}

/**
 * Opens the index read-only (key design decision 3) and refuses one built with another
 * embedding model, so query and passage vectors are never mixed (PLAN.md edge cases).
 * Throws `INDEX_UNAVAILABLE` with a clear message when the file is missing or not usable,
 * for the server's readiness check to report.
 */
export function openIndexReader(path: string, modelVersion: string): IndexReader {
  let current = open(path, modelVersion);
  const store = () => current.store;

  return {
    reader: {
      findByDoi: (doi, signal) => store().reader.findByDoi(doi, signal),
      findManyByDoi: (dois, signal) => store().reader.findManyByDoi(dois, signal),
      findChunks: (ids, signal) => store().reader.findChunks(ids, signal),
      indexMeta: (signal) => store().reader.indexMeta(signal),
    },
    search: {
      lexical: (query, signal) => store().search.lexical(query, signal),
      vector: (query, signal) => store().search.vector(query, signal),
    },
    meta: () => current.meta,
    refresh() {
      const next = open(path, modelVersion);
      if (next.meta.version === current.meta.version) {
        next.db.close();
        return false;
      }
      // Queries run synchronously inside each call, so none is using the old handle now.
      const previous = current;
      current = next;
      previous.db.close();
      return true;
    },
    close() {
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
