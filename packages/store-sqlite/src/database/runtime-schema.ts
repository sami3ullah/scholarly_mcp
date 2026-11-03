import type { Db } from './open-database.js';

/*
 * The runtime database holds what the server writes while it runs. It is a separate file
 * from the index, because the index is rebuilt and swapped while sessions must live on.
 * Migrations only ever append: entry n moves `user_version` from n to n + 1.
 */
const MIGRATIONS: readonly string[] = [
  `CREATE TABLE landing_sessions (
     token TEXT PRIMARY KEY,
     results TEXT NOT NULL,
     language TEXT NOT NULL,
     api_key_id TEXT NOT NULL,
     created_at TEXT NOT NULL,
     expires_at TEXT NOT NULL,
     visit_count INTEGER NOT NULL DEFAULT 0
   ) STRICT;
   CREATE INDEX landing_sessions_by_expiry ON landing_sessions (expires_at);

   -- The metering outbox (SM-10): events wait here until exported.
   CREATE TABLE usage_events (
     id TEXT PRIMARY KEY,
     api_key_id TEXT NOT NULL,
     tool TEXT NOT NULL,
     result_count INTEGER NOT NULL,
     latency_ms REAL NOT NULL,
     status TEXT NOT NULL,
     billable INTEGER NOT NULL,
     occurred_at TEXT NOT NULL,
     exported_at TEXT
   ) STRICT;
   CREATE INDEX usage_events_pending ON usage_events (occurred_at) WHERE exported_at IS NULL;`,
  // SM-10: API keys, stored as SHA-256 hashes of their secrets; exported events age out.
  `CREATE TABLE api_keys (
     id TEXT PRIMARY KEY,
     label TEXT NOT NULL,
     secret_hash TEXT NOT NULL,
     institution_id TEXT,
     created_at TEXT NOT NULL,
     revoked_at TEXT
   ) STRICT;
   CREATE INDEX usage_events_exported ON usage_events (exported_at) WHERE exported_at IS NOT NULL;`,
  // SM-12 (ADR 0033): sessions know their tool; events become an envelope plus a JSON
  // payload, so referral events fit without a migration per kind. Old rows are tool calls.
  `ALTER TABLE landing_sessions ADD COLUMN tool TEXT;

   CREATE TABLE usage_events_v3 (
     id TEXT PRIMARY KEY,
     kind TEXT NOT NULL,
     api_key_id TEXT NOT NULL,
     occurred_at TEXT NOT NULL,
     exported_at TEXT,
     payload TEXT NOT NULL
   ) STRICT;
   INSERT INTO usage_events_v3 (id, kind, api_key_id, occurred_at, exported_at, payload)
     SELECT id, 'tool_call', api_key_id, occurred_at, exported_at,
            json_object('tool', tool, 'resultCount', result_count, 'latencyMs', latency_ms,
                        'status', status, 'billable', json(iif(billable, 'true', 'false')),
                        'cardsByJournal', json('[]'))
       FROM usage_events;
   DROP TABLE usage_events;
   ALTER TABLE usage_events_v3 RENAME TO usage_events;
   CREATE INDEX usage_events_pending ON usage_events (occurred_at) WHERE exported_at IS NULL;
   CREATE INDEX usage_events_exported ON usage_events (exported_at) WHERE exported_at IS NOT NULL;`,
  // SM-13 (ADR 0034): exporters claim events for a lease, so two never send the same batch.
  `ALTER TABLE usage_events ADD COLUMN claimed_until TEXT;`,
];

/** Brings a runtime database up to the latest schema; safe to call on every start. */
export function migrateRuntimeDatabase(db: Db): void {
  db.transaction(() => {
    const version = Number(db.pragma('user_version', { simple: true }));
    for (const [index, sql] of MIGRATIONS.entries()) {
      if (index < version) continue;
      db.exec(sql);
    }
    db.pragma(`user_version = ${String(MIGRATIONS.length)}`);
  })();
}
