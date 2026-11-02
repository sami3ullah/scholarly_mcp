import { existsSync, renameSync, rmSync } from 'node:fs';
import { appError, type IndexMeta } from '@scholarly-mcp/core';
import { createSqliteIndexStore, type SqliteIndexStore } from '../create-sqlite-index-store.js';
import {
  INDEX_SCHEMA_VERSION,
  createIndexSchema,
  indexSchemaVersion,
} from '../database/index-schema.js';
import { writeIndexMeta } from '../database/index-meta-row.js';
import { openDatabase, type Db } from '../database/open-database.js';

/** A full run starts from an empty file; an incremental run from a copy of the live index. */
export type BuildKind = 'full' | 'incremental';

/** An index being built next to the live one, swapped in only after it is verified. */
export interface IndexBuild {
  readonly kind: BuildKind;
  /** True when an interrupted build of the same kind was picked up again. */
  readonly resumed: boolean;
  readonly db: Db;
  readonly store: SqliteIndexStore;
  /** Records `meta`, closes the file and atomically renames it over the live index. */
  commit(meta: IndexMeta): void;
  /** Closes the file and keeps it, so the next run of the same kind resumes it. */
  close(): void;
}

/** Where a build of the index at `indexPath` is written. */
export const buildPathOf = (indexPath: string): string => `${indexPath}.building`;

/**
 * Starts or resumes a build of the index at `indexPath` (PLAN.md "SQLite store"). A leftover
 * build of the same kind and schema is resumed, so its checkpoint and its rows carry on
 * together; any other leftover is discarded. An incremental build copies the live index with
 * `VACUUM INTO`, which is consistent even while the server reads it.
 */
export function beginIndexBuild(options: {
  readonly indexPath: string;
  readonly kind: BuildKind;
  readonly now: Date;
}): IndexBuild {
  const { indexPath, kind, now } = options;
  const buildPath = buildPathOf(indexPath);
  const leftover = existsSync(buildPath) ? openDatabase(buildPath) : undefined;
  if (leftover !== undefined && buildKindOf(leftover) === kind) {
    return indexBuild(leftover, { kind, resumed: true, indexPath, buildPath });
  }
  leftover?.close();
  removeDatabaseFiles(buildPath);

  if (kind === 'incremental') copyLiveIndex(indexPath, buildPath);
  const db = openDatabase(buildPath);
  if (kind === 'full') createIndexSchema(db);
  db.prepare('INSERT INTO index_build (id, kind, started_at) VALUES (1, ?, ?)').run(
    kind,
    now.toISOString(),
  );
  return indexBuild(db, { kind, resumed: false, indexPath, buildPath });
}

function indexBuild(
  db: Db,
  where: { kind: BuildKind; resumed: boolean; indexPath: string; buildPath: string },
): IndexBuild {
  db.pragma('journal_mode = WAL');
  const store = createSqliteIndexStore(db);
  return {
    kind: where.kind,
    resumed: where.resumed,
    db,
    store,
    commit(meta) {
      db.transaction(() => {
        db.prepare('DELETE FROM index_build').run();
        writeIndexMeta(db, meta);
      })();
      // One self-contained file, so read-only openers need no -wal or -shm next to it.
      db.pragma('journal_mode = DELETE');
      db.exec('VACUUM');
      db.close();
      renameSync(where.buildPath, where.indexPath);
    },
    close() {
      db.close();
    },
  };
}

function buildKindOf(db: Db): BuildKind | undefined {
  if (indexSchemaVersion(db) !== INDEX_SCHEMA_VERSION) return undefined;
  const row = db.prepare<[], { kind: BuildKind }>('SELECT kind FROM index_build').get();
  return row?.kind;
}

function copyLiveIndex(indexPath: string, buildPath: string): void {
  if (!existsSync(indexPath)) {
    throw appError('INDEX_UNAVAILABLE', 'No index to update yet; run a full build first');
  }
  const live = openDatabase(indexPath, { readonly: true });
  try {
    if (indexSchemaVersion(live) !== INDEX_SCHEMA_VERSION) {
      throw appError('INDEX_UNAVAILABLE', 'The index has an older layout; run a full build');
    }
    live.prepare('VACUUM INTO ?').run(buildPath);
  } finally {
    live.close();
  }
}

function removeDatabaseFiles(path: string): void {
  for (const suffix of ['', '-wal', '-shm', '-journal'])
    rmSync(`${path}${suffix}`, { force: true });
}
