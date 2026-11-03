import { appError } from '@scholarly-mcp/core';
import { identifier, inTransaction, query, type Pool, type Queryable } from './pool.js';

/** The schema holding everything except the index builds themselves. */
export const CONTROL_SCHEMA = 'scholarly';

/*
 * Runtime tables and the index pointers (ADR 0034). Migrations only ever append: entry n
 * moves the recorded version from n to n + 1. The shapes follow the SQLite runtime file
 * after its migration 4: events are an envelope plus a `jsonb` payload (ADR 0033).
 */
const MIGRATIONS: readonly string[] = [
  `CREATE TABLE scholarly.landing_sessions (
     token text PRIMARY KEY,
     results jsonb NOT NULL,
     language text NOT NULL,
     tool text,
     api_key_id text NOT NULL,
     created_at timestamptz NOT NULL,
     expires_at timestamptz NOT NULL,
     visit_count integer NOT NULL DEFAULT 0
   );
   CREATE INDEX landing_sessions_by_expiry ON scholarly.landing_sessions (expires_at);

   CREATE TABLE scholarly.api_keys (
     id text PRIMARY KEY,
     label text NOT NULL,
     secret_hash text NOT NULL,
     institution_id text,
     created_at timestamptz NOT NULL,
     revoked_at timestamptz
   );

   CREATE TABLE scholarly.usage_events (
     id text COLLATE "C" PRIMARY KEY,
     kind text NOT NULL,
     api_key_id text NOT NULL,
     occurred_at timestamptz NOT NULL,
     exported_at timestamptz,
     claimed_until timestamptz,
     payload jsonb NOT NULL
   );
   CREATE INDEX usage_events_pending ON scholarly.usage_events (occurred_at, id)
     WHERE exported_at IS NULL;
   CREATE INDEX usage_events_exported ON scholarly.usage_events (exported_at)
     WHERE exported_at IS NOT NULL;

   -- The live index build and the one before it, which is kept until the next swap.
   CREATE TABLE scholarly.live_index (
     id integer PRIMARY KEY CHECK (id = 1),
     schema_name text NOT NULL,
     version text NOT NULL,
     previous_schema text,
     switched_at timestamptz NOT NULL
   );

   -- The build in progress, if any, so an interrupted one can be resumed.
   CREATE TABLE scholarly.index_build (
     id integer PRIMARY KEY CHECK (id = 1),
     schema_name text NOT NULL,
     kind text NOT NULL,
     layout integer NOT NULL,
     dimensions integer NOT NULL,
     started_at timestamptz NOT NULL
   );`,
  // Index builds need vectors and trigrams. Creating them may need a superuser; the compose
  // profile creates both up front, so this is then a no-op.
  `CREATE EXTENSION IF NOT EXISTS vector;
   CREATE EXTENSION IF NOT EXISTS pg_trgm;`,
  // The live funnel pages through all stored events by time (ADR 0035).
  `CREATE INDEX usage_events_by_time ON scholarly.usage_events (occurred_at, id);`,
];

/** The schema version this code needs. */
export const RUNTIME_SCHEMA_VERSION = MIGRATIONS.length;

/** Arbitrary, fixed key of the advisory lock that serialises migrations. */
const MIGRATION_LOCK = 7_340_013;

/**
 * Brings the database up to the latest schema; safe to call on every start and from
 * several processes at once. Needs a role that may create tables (the ingest's).
 */
export async function migrateDatabase(pool: Pool, signal: AbortSignal): Promise<void> {
  await inTransaction(pool, signal, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock($1)', [MIGRATION_LOCK]);
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${CONTROL_SCHEMA}`);
    await client.query(
      `CREATE TABLE IF NOT EXISTS scholarly.migrations (
         version integer PRIMARY KEY,
         applied_at timestamptz NOT NULL DEFAULT now()
       )`,
    );
    const version = await appliedVersion(client);
    for (const [index, sql] of MIGRATIONS.entries()) {
      if (index < version) continue;
      await client.query(sql);
      await client.query('INSERT INTO scholarly.migrations (version) VALUES ($1)', [index + 1]);
    }
  });
}

/**
 * Throws `INDEX_UNAVAILABLE` unless the database is migrated to this code's version, for
 * processes that must not migrate it themselves, such as the server.
 */
export async function assertMigrated(pool: Pool, signal: AbortSignal): Promise<void> {
  const exists = await query<{ found: boolean }>(
    pool,
    signal,
    "SELECT to_regclass('scholarly.migrations') IS NOT NULL AS found",
  );
  const version = exists.rows[0]?.found === true ? await appliedVersion(pool) : 0;
  if (version < RUNTIME_SCHEMA_VERSION) {
    throw appError(
      'INDEX_UNAVAILABLE',
      `The database schema is at version ${String(version)}, not ${String(RUNTIME_SCHEMA_VERSION)}; run "ingest migrate" first`,
    );
  }
}

/**
 * Gives the server's role what it needs (ADR 0034): reading and writing sessions and
 * events, reading keys and the index pointer. Index schemas get their grants when a build
 * is committed.
 */
export async function grantServerRole(
  pool: Pool,
  role: string,
  signal: AbortSignal,
): Promise<void> {
  const to = identifier(role);
  await inTransaction(pool, signal, async (client) => {
    await client.query(`GRANT USAGE ON SCHEMA scholarly TO ${to}`);
    await client.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON scholarly.landing_sessions, scholarly.usage_events TO ${to}`,
    );
    await client.query(
      `GRANT SELECT ON scholarly.api_keys, scholarly.live_index, scholarly.migrations TO ${to}`,
    );
  });
}

async function appliedVersion(db: Queryable): Promise<number> {
  const result = await db.query<{ version: number | null }>(
    'SELECT max(version) AS version FROM scholarly.migrations',
  );
  return result.rows[0]?.version ?? 0;
}
