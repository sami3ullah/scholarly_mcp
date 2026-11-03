import { appError, type Doi, type IndexStorage } from '@scholarly-mcp/core';
import { createPostgresIndexStore } from '../create-postgres-index-store.js';
import { INDEX_LAYOUT_VERSION, indexLayoutOf } from '../database/index-schema.js';
import { identifier, query, type Pool } from '../database/pool.js';
import { beginPostgresIndexBuild } from './index-build.js';
import { readLiveIndex } from './live-index.js';
import { verifyPostgresIndex } from './verify-index.js';

/**
 * The index schemas in a migrated database, as the ingest's storage port (ADR 0034). Needs
 * the writer role; `serverRole` is granted read access to each build when it is committed.
 * The pool is the caller's to close.
 */
export function createPostgresIndexStorage(options: {
  readonly pool: Pool;
  readonly serverRole?: string;
}): IndexStorage {
  const { pool, serverRole } = options;
  const liveSchema = async (signal: AbortSignal) => {
    signal.throwIfAborted();
    return (await readLiveIndex(pool))?.schema;
  };

  return {
    async openLive(signal) {
      const schema = await liveSchema(signal);
      if (schema === undefined) return undefined;
      const { rows } = await query<{ n: string }>(
        pool,
        signal,
        `SELECT count(*) AS n FROM ${identifier(schema)}.articles`,
      );
      const currentLayout = (await indexLayoutOf(pool, schema))?.version === INDEX_LAYOUT_VERSION;
      return {
        articleCount: Number(rows[0]?.n ?? 0),
        ...(currentLayout && { store: createPostgresIndexStore(pool, schema) }),
        dois: async (doisSignal) =>
          (
            await query<{ doi: Doi }>(
              pool,
              doisSignal,
              `SELECT doi FROM ${identifier(schema)}.articles ORDER BY doi COLLATE "C"`,
            )
          ).rows.map(({ doi }) => doi),
        close: () => Promise.resolve(),
      };
    },
    async beginBuild({ kind, now, dimensions }, signal) {
      const build = await beginPostgresIndexBuild(
        { pool, kind, now, dimensions, ...(serverRole !== undefined && { serverRole }) },
        signal,
      );
      return {
        kind: build.kind,
        resumed: build.resumed,
        store: build.store,
        verify: (verifyOptions, verifySignal) =>
          verifyPostgresIndex(pool, build.schema, verifyOptions, verifySignal),
        commit: (meta, commitSignal) => build.commit(meta, commitSignal),
        // The build's rows and its `index_build` row stay in the database for a resume.
        close: () => Promise.resolve(),
        discard: (discardSignal) => build.discard(discardSignal),
      };
    },
    async verifyLive(verifyOptions, signal) {
      const schema = await liveSchema(signal);
      if (schema === undefined) {
        throw appError(
          'INDEX_UNAVAILABLE',
          'No index has been committed yet; run the ingest first',
        );
      }
      return verifyPostgresIndex(pool, schema, verifyOptions, signal);
    },
  };
}
