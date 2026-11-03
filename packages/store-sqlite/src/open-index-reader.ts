import { existsSync } from 'node:fs';
import { appError, type IndexMeta, type IndexReader } from '@scholarly-mcp/core';
import { createSqliteIndexStore, type SqliteIndexStore } from './create-sqlite-index-store.js';
import { readIndexMeta } from './database/index-meta-row.js';
import { openDatabase, type Db } from './database/open-database.js';
import { withSignal } from './with-signal.js';

export type { IndexReader };

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
export function openIndexReader(
  path: string,
  modelVersion: string,
  signal: AbortSignal,
): Promise<IndexReader> {
  return withSignal(signal, () => readerOf(path, modelVersion));
}

function readerOf(path: string, modelVersion: string): IndexReader {
  let current = open(path, modelVersion);
  const store = () => current.store;

  return {
    reader: {
      findByDoi: (doi, signal) => store().reader.findByDoi(doi, signal),
      findManyByDoi: (dois, signal) => store().reader.findManyByDoi(dois, signal),
      findChunks: (ids, signal) => store().reader.findChunks(ids, signal),
      findArticleChunks: (doi, signal) => store().reader.findArticleChunks(doi, signal),
      indexMeta: (signal) => store().reader.indexMeta(signal),
    },
    search: {
      lexical: (query, signal) => store().search.lexical(query, signal),
      vector: (query, signal) => store().search.vector(query, signal),
    },
    journals: { journals: (signal) => store().journals.journals(signal) },
    meta: () => current.meta,
    refresh: (signal) =>
      withSignal(signal, () => {
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
      }),
    close() {
      current.db.close();
      return Promise.resolve();
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
