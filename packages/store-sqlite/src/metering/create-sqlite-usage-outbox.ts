import { usageEventSchema, type UsageEvent, type UsageOutbox } from '@scholarly-mcp/core';
import type { Db } from '../database/open-database.js';
import { withSignal } from '../with-signal.js';

interface UsageRow {
  readonly id: string;
  readonly api_key_id: string;
  readonly tool: string;
  readonly result_count: number;
  readonly latency_ms: number;
  readonly status: string;
  readonly billable: number;
  readonly occurred_at: string;
  readonly exported_at: string | null;
}

/**
 * The metering outbox on the runtime database's `usage_events` table (ADR 0022). Rows hold
 * key id, tool, counts and latency, never query text. Several server processes may share
 * the file; each insert is one small WAL write.
 */
export function createSqliteUsageOutbox(db: Db): UsageOutbox {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO usage_events
       (id, api_key_id, tool, result_count, latency_ms, status, billable, occurred_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
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
        insert.run(
          event.id,
          event.apiKeyId,
          event.tool,
          event.resultCount,
          event.latencyMs,
          event.status,
          event.billable ? 1 : 0,
          event.occurredAt.toISOString(),
        );
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
    id: row.id,
    apiKeyId: row.api_key_id,
    tool: row.tool,
    resultCount: row.result_count,
    latencyMs: row.latency_ms,
    status: row.status,
    billable: row.billable === 1,
    occurredAt: new Date(row.occurred_at),
    ...(row.exported_at !== null && { exportedAt: new Date(row.exported_at) }),
  });
}
