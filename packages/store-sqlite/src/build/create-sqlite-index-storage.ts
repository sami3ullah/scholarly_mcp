import { existsSync } from 'node:fs';
import { appError, type Doi, type IndexStorage, type LiveIndexView } from '@scholarly-mcp/core';
import { createSqliteIndexStore } from '../create-sqlite-index-store.js';
import { INDEX_SCHEMA_VERSION, indexSchemaVersion } from '../database/index-schema.js';
import { openDatabase } from '../database/open-database.js';
import { withSignal } from '../with-signal.js';
import { beginIndexBuild } from './index-build.js';
import { verifyIndex } from './verify-index.js';

/**
 * The index file at `indexPath` and its builds beside it, as the ingest's storage port
 * (ADR 0034). Builds are swapped in by rename (ARCHITECTURE.md "SQLite store").
 */
export function createSqliteIndexStorage(indexPath: string): IndexStorage {
  const missing = () =>
    appError('INDEX_UNAVAILABLE', `No index file at ${indexPath}; run the ingest first`);

  return {
    openLive: (signal) =>
      withSignal(signal, (): LiveIndexView | undefined => {
        if (!existsSync(indexPath)) return undefined;
        const db = openDatabase(indexPath, { readonly: true });
        try {
          // Counted directly, as this works on any layout, old ones included.
          const articleCount = Number(db.prepare('SELECT count(*) FROM articles').pluck().get());
          const currentLayout = indexSchemaVersion(db) === INDEX_SCHEMA_VERSION;
          return {
            articleCount,
            ...(currentLayout && { store: createSqliteIndexStore(db) }),
            dois: (doisSignal) =>
              withSignal(
                doisSignal,
                () => db.prepare('SELECT doi FROM articles ORDER BY doi').pluck().all() as Doi[],
              ),
            close() {
              if (db.open) db.close();
              return Promise.resolve();
            },
          };
        } catch (error) {
          db.close();
          throw error;
        }
      }),
    beginBuild: (options, signal) =>
      withSignal(signal, () => {
        const build = beginIndexBuild({ indexPath, ...options });
        return {
          kind: build.kind,
          resumed: build.resumed,
          store: build.store,
          verify: (verifyOptions, verifySignal) =>
            verifyIndex(build.db, verifyOptions, verifySignal),
          commit: (meta, commitSignal) =>
            withSignal(commitSignal, () => {
              build.commit(meta);
            }),
          close() {
            if (build.db.open) build.close();
            return Promise.resolve();
          },
          discard: (discardSignal) =>
            withSignal(discardSignal, () => {
              build.discard();
            }),
        };
      }),
    async verifyLive(options, signal) {
      if (!existsSync(indexPath)) throw missing();
      // Not read-only: FTS5 runs its integrity check as an INSERT, which writes nothing.
      const db = openDatabase(indexPath, { mustExist: true });
      try {
        return await verifyIndex(db, options, signal);
      } finally {
        db.close();
      }
    },
  };
}
