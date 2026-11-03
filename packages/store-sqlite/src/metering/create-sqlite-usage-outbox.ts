import { usageEventSchema, type UsageEvent, type UsageOutbox } from '@scholarly-mcp/core';
import type { Db } from '../database/open-database.js';
import { withSignal } from '../with-signal.js';

interface ListParams {
  readonly from: string | null;
  readonly to: string | null;
  readonly key: string | null;
  readonly after: string | null;
  readonly afterId: string | null;
  readonly limit: number;
}

interface UsageRow {
  readonly id: string;
  readonly kind: string;
  readonly api_key_id: string;
  readonly occurred_at: string;
  readonly exported_at: string | null;
  readonly claimed_until: string | null;
  readonly payload: string;
}

/**
 * The metering outbox on the runtime database's `usage_events` table (ADR 0022, ADR 0033).
 * A row is an envelope (id, kind, key id, times) plus the kind's fields as JSON; none of
 * them holds query text or a landing token. Several server processes may share the file;
 * each insert is one small WAL write, and a claim leases its rows (ADR 0034).
 */
export function createSqliteUsageOutbox(db: Db): UsageOutbox {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO usage_events (id, kind, api_key_id, occurred_at, payload)
     VALUES (?, ?, ?, ?, ?)`,
  );
  // One statement, so the write lock makes the claim atomic across processes sharing the file.
  const claim = db.prepare<[string, string, number], UsageRow>(
    `UPDATE usage_events SET claimed_until = ?
     WHERE id IN (
       SELECT id FROM usage_events
       WHERE exported_at IS NULL AND (claimed_until IS NULL OR claimed_until <= ?)
       ORDER BY occurred_at, id LIMIT ?
     )
     RETURNING *`,
  );
  const release = db.prepare('UPDATE usage_events SET claimed_until = NULL WHERE id = ?');
  const mark = db.prepare(
    'UPDATE usage_events SET exported_at = ?, claimed_until = NULL WHERE id = ?',
  );
  const count = db.prepare<[], { n: number }>(
    'SELECT count(*) AS n FROM usage_events WHERE exported_at IS NULL',
  );
  const prune = db.prepare(
    'DELETE FROM usage_events WHERE exported_at IS NOT NULL AND exported_at < ?',
  );
  // Keyset paging on (occurred_at, id); each bound is skipped when its parameter is NULL.
  const list = db.prepare<[ListParams], UsageRow>(
    `SELECT * FROM usage_events
     WHERE (@from IS NULL OR occurred_at >= @from)
       AND (@to IS NULL OR occurred_at < @to)
       AND (@key IS NULL OR api_key_id = @key)
       AND (@after IS NULL OR occurred_at > @after OR (occurred_at = @after AND id > @afterId))
     ORDER BY occurred_at, id LIMIT @limit`,
  );
  const markAll = db.transaction((ids: readonly string[], at: string) => {
    for (const id of ids) mark.run(at, id);
  });
  const releaseAll = db.transaction((ids: readonly string[]) => {
    for (const id of ids) release.run(id);
  });

  return {
    append: (event, signal) =>
      withSignal(signal, () => {
        const { id, kind, apiKeyId, occurredAt, ...payload } = usageEventSchema.parse(event);
        delete payload.exportedAt;
        insert.run(id, kind, apiKeyId, occurredAt.toISOString(), JSON.stringify(payload));
      }),
    claim: (limit, now, leaseUntil, signal) =>
      withSignal(signal, () =>
        claim.all(leaseUntil.toISOString(), now.toISOString(), limit).sort(byAge).map(eventFromRow),
      ),
    release: (ids, signal) =>
      withSignal(signal, () => {
        releaseAll(ids);
      }),
    markExported: (ids, at, signal) =>
      withSignal(signal, () => {
        markAll(ids, at.toISOString());
      }),
    countPending: (signal) => withSignal(signal, () => count.get()?.n ?? 0),
    deleteExported: (before, signal) =>
      withSignal(signal, () => prune.run(before.toISOString()).changes),
    list: (query, signal) =>
      withSignal(signal, () =>
        list
          .all({
            from: query.from?.toISOString() ?? null,
            to: query.to?.toISOString() ?? null,
            key: query.apiKeyId ?? null,
            after: query.after?.occurredAt.toISOString() ?? null,
            afterId: query.after?.id ?? null,
            limit: Math.max(0, query.limit),
          })
          .map(eventFromRow),
      ),
  };
}

/** `RETURNING` gives no order; claims hand out events oldest first, ties by id. */
function byAge(a: UsageRow, b: UsageRow): number {
  return a.occurred_at.localeCompare(b.occurred_at) || a.id.localeCompare(b.id);
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
