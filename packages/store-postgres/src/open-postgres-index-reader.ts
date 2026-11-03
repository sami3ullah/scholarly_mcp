import { appError, type IndexMeta, type IndexReader } from '@scholarly-mcp/core';
import { readLiveIndex } from './build/live-index.js';
import {
  createPostgresIndexStore,
  type PostgresIndexStore,
} from './create-postgres-index-store.js';
import { readIndexMeta } from './database/index-meta-row.js';
import { INDEX_LAYOUT_VERSION, indexLayoutOf } from './database/index-schema.js';
import { identifier, type Pool } from './database/pool.js';

interface Opened {
  readonly schema: string;
  readonly store: PostgresIndexStore;
  readonly meta: IndexMeta;
}

/**
 * The server's view of the build `scholarly.live_index` points at (ADR 0034). It refuses a
 * build of another embedding model or layout, so query and passage vectors are never mixed,
 * and moves to a new build when the pointer changes. The previous build is kept until the
 * next commit, so a query still running on it finishes. The pool is the caller's to close.
 */
export async function openPostgresIndexReader(
  pool: Pool,
  modelVersion: string,
  signal: AbortSignal,
): Promise<IndexReader> {
  let current = await openLive(pool, modelVersion, signal);
  const store = () => current.store;

  return {
    reader: {
      findByDoi: (doi, s) => store().reader.findByDoi(doi, s),
      findManyByDoi: (dois, s) => store().reader.findManyByDoi(dois, s),
      findChunks: (ids, s) => store().reader.findChunks(ids, s),
      findArticleChunks: (doi, s) => store().reader.findArticleChunks(doi, s),
      indexMeta: (s) => store().reader.indexMeta(s),
    },
    search: {
      lexical: (query, s) => store().search.lexical(query, s),
      vector: (query, s) => store().search.vector(query, s),
    },
    journals: { journals: (s) => store().journals.journals(s) },
    meta: () => current.meta,
    async refresh(refreshSignal) {
      refreshSignal.throwIfAborted();
      const live = await readLiveIndex(pool);
      if (live?.schema === current.schema) return false;
      current = await openLive(pool, modelVersion, refreshSignal);
      return true;
    },
    close: () => Promise.resolve(),
  };
}

async function openLive(pool: Pool, modelVersion: string, signal: AbortSignal): Promise<Opened> {
  signal.throwIfAborted();
  const live = await readLiveIndex(pool);
  if (live === undefined) {
    throw appError('INDEX_UNAVAILABLE', 'No index has been committed yet; run the ingest first');
  }
  const { schema } = live;
  try {
    const layout = await indexLayoutOf(pool, schema);
    if (layout?.version !== INDEX_LAYOUT_VERSION) {
      throw new Error(
        `Layout ${String(layout?.version ?? 'none')} is not ${String(INDEX_LAYOUT_VERSION)}`,
      );
    }
    const meta = await readIndexMeta(pool, identifier(schema));
    if (meta === undefined) throw new Error('The index was never committed');
    if (meta.modelVersion !== modelVersion) {
      throw new Error(`Index model ${meta.modelVersion} does not match ${modelVersion}`);
    }
    return { schema, store: createPostgresIndexStore(pool, schema), meta };
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw appError('INDEX_UNAVAILABLE', `Index ${schema} is not usable: ${reason}`, { cause });
  }
}
