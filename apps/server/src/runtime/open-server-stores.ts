import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type {
  IndexReader,
  RateBucketStore,
  SessionStore,
  StoreConfig,
  UsageOutbox,
} from '@scholarly-mcp/core';
import type { FunnelStore } from '../funnel/run-funnel-command.js';
import { createMemoryBucketStore } from '../limits/create-memory-bucket-store.js';
import {
  assertMigrated,
  createPool,
  createPostgresBucketStore,
  createPostgresSessionStore,
  createPostgresUsageOutbox,
  openPostgresIndexReader,
  type Pool,
  type PostgresConfig,
} from '@scholarly-mcp/store-postgres';
import {
  createSqliteSessionStore,
  createSqliteUsageOutbox,
  openIndexReader,
  openRuntimeDatabase,
  type SqliteConfig,
} from '@scholarly-mcp/store-sqlite';

/** The store `STORE` picks, with its settings (ADR 0034). */
export type StoreSelection =
  | { readonly store: 'sqlite'; readonly config: SqliteConfig }
  | { readonly store: 'postgres'; readonly config: PostgresConfig };

/** The store's settings: Postgres ones are only read, and so only required, when picked. */
export function storeSelectionFrom(
  { STORE }: StoreConfig,
  sqlite: SqliteConfig,
  postgres: () => PostgresConfig,
): StoreSelection {
  return STORE === 'postgres'
    ? { store: 'postgres', config: postgres() }
    : { store: 'sqlite', config: sqlite };
}

/**
 * What the server keeps outside the process: the index, sessions, the outbox and,
 * on Postgres, rate-limit buckets shared by replicas (ADR 0036). With SQLite there is one
 * process, so its buckets stay in memory.
 */
export interface ServerStores {
  /** Opens the live index for `createLiveIndex`; rejects with `INDEX_UNAVAILABLE` meanwhile. */
  openIndex(signal: AbortSignal): Promise<IndexReader>;
  readonly sessions: SessionStore;
  readonly outbox: UsageOutbox;
  readonly buckets: RateBucketStore;
  close(): Promise<void>;
}

/**
 * Opens the server's stores. SQLite creates and migrates its runtime file; Postgres must
 * already be migrated by `ingest migrate`, as the server's role may not change the schema.
 */
export async function openServerStores(
  selection: StoreSelection,
  modelVersion: string,
  signal: AbortSignal,
): Promise<ServerStores> {
  if (selection.store === 'sqlite') {
    const { INDEX_PATH, RUNTIME_DB_PATH, SQLITE_SEARCH_WORKERS } = selection.config;
    mkdirSync(dirname(RUNTIME_DB_PATH), { recursive: true });
    const db = openRuntimeDatabase(RUNTIME_DB_PATH);
    return {
      openIndex: (openSignal) =>
        openIndexReader(INDEX_PATH, modelVersion, openSignal, {
          searchWorkers: SQLITE_SEARCH_WORKERS,
        }),
      sessions: createSqliteSessionStore(db),
      outbox: createSqliteUsageOutbox(db),
      buckets: createMemoryBucketStore(),
      close() {
        db.close();
        return Promise.resolve();
      },
    };
  }
  const { config } = selection;
  const pool = await migratedPool(config, 'scholarly-mcp-server', config.PG_POOL_MAX, signal);
  return {
    openIndex: (openSignal) => openPostgresIndexReader(pool, modelVersion, openSignal),
    sessions: createPostgresSessionStore(pool),
    outbox: createPostgresUsageOutbox(pool),
    buckets: createPostgresBucketStore(pool),
    close: () => pool.end(),
  };
}

/**
 * The funnel's view of the store's events (ADR 0035). It only reads them, so on Postgres
 * the server's role is enough. The SQLite file must exist; it is migrated as the server
 * would at boot.
 */
export async function openFunnelStore(
  selection: StoreSelection,
  retentionDays: number,
  signal: AbortSignal,
): Promise<FunnelStore> {
  const kept = `exported events kept ${String(retentionDays)} days`;
  if (selection.store === 'sqlite') {
    const { RUNTIME_DB_PATH } = selection.config;
    if (!existsSync(RUNTIME_DB_PATH)) throw new Error(`${RUNTIME_DB_PATH} does not exist`);
    const db = openRuntimeDatabase(RUNTIME_DB_PATH);
    return {
      outbox: createSqliteUsageOutbox(db),
      source: `the runtime database ${RUNTIME_DB_PATH} (${kept})`,
      close() {
        db.close();
        return Promise.resolve();
      },
    };
  }
  const pool = await migratedPool(selection.config, 'scholarly-mcp-funnel', 2, signal);
  return {
    outbox: createPostgresUsageOutbox(pool),
    source: `Postgres scholarly.usage_events (${kept})`,
    close: () => pool.end(),
  };
}

/** A pool on a database `ingest migrate` has brought up to this code's schema. */
async function migratedPool(
  config: PostgresConfig,
  applicationName: string,
  max: number,
  signal: AbortSignal,
): Promise<Pool> {
  const pool = createPool({
    url: config.DATABASE_URL,
    max,
    statementTimeoutMs: config.PG_STATEMENT_TIMEOUT_MS,
    applicationName,
  });
  try {
    await assertMigrated(pool, signal);
    return pool;
  } catch (error) {
    await pool.end();
    throw error;
  }
}
