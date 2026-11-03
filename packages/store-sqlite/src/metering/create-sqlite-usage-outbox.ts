import { usageEventSchema, type UsageEvent, type UsageOutbox } from '@scholarly-mcp/core';
import type { Db } from '../database/open-database.js';
import { withSignal } from '../with-signal.js';

interface UsageRow {
  readonly id: string;
  readonly kind: string;
  readonly api_key_id: string;
  readonly occurred_at: string;
  readonly exported_at: string | null;
  readonly payload: string;
}

/**
 * The metering outbox on the runtime database's `usage_events` table (ADR 0022, ADR 0033).
 * A row is an envelope (id, kind, key id, times) plus the kind's fields as JSON; none of
 * them holds query text or a landing token. Several server processes may share the file;
 * each insert is one small WAL write.
 */
export function createSqliteUsageOutbox(db: Db): UsageOutbox {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO usage_events (id, kind, api_key_id, occurred_at, payload)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const pending = db.prepare<[number], UsageRow>(
    `SELECT * FROM usage_events WHERE exported_at IS NULL ORDER BY occurred_at, id LIMIT ?`,
  );
  const mark = db.prepare('UPDATE usage_events SET exported_at = ? WHERE id = ?');
  const count = db.prepare<[], { n: number }>(
    'SELECT count(*) AS n FROM usage_events WHERE exported_at IS NULL',
  );
  const prune = db.prepare(
    'DELETE FROM usage_events WHERE exported_at IS NOT NULL AND exported_at < ?',
  );
  const markAll = db.transaction((ids: readonly string[], at: string) => {
    for (const id of ids) mark.run(at, id);
  });

  return {
    append: (event, signal) =>
      withSignal(signal, () => {
        const { id, kind, apiKeyId, occurredAt, ...payload } = usageEventSchema.parse(event);
        delete payload.exportedAt;
        insert.run(id, kind, apiKeyId, occurredAt.toISOString(), JSON.stringify(payload));
      }),
    pending: (limit, signal) => withSignal(signal, () => pending.all(limit).map(eventFromRow)),
    markExported: (ids, at, signal) =>
      withSignal(signal, () => {
        markAll(ids, at.toISOString());
      }),
    countPending: (signal) => withSignal(signal, () => count.get()?.n ?? 0),
    deleteExported: (before, signal) =>
      withSignal(signal, () => prune.run(before.toISOString()).changes),
  };
}

function eventFromRow(row: UsageRow): UsageEvent {
  return usageEventSchema.parse({
    ...(JSON.parse(row.payload) as object),
    id: row.id,
    kind: row.kind,
    apiKeyId: row.api_key_id,
    occurredAt: new Date(row.occurred_at),
    ...(row.exported_at !== null && { exportedAt: new Date(row.exported_at) }),
  });
}
