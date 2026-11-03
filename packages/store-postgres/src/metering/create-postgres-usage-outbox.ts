import { usageEventSchema, type UsageEvent, type UsageOutbox } from '@scholarly-mcp/core';
import { query, type Pool } from '../database/pool.js';

interface UsageRow {
  readonly id: string;
  readonly kind: string;
  readonly api_key_id: string;
  readonly occurred_at: Date;
  readonly exported_at: Date | null;
  readonly payload: object;
}

/**
 * The metering outbox in Postgres (ADR 0033, ADR 0034): an envelope (id, kind, key id,
 * times, lease) plus the kind's fields as `jsonb`; none of them holds query text or a
 * landing token. A claim locks its rows `FOR UPDATE SKIP LOCKED`, so exporters on several
 * replicas never take the same batch.
 */
export function createPostgresUsageOutbox(pool: Pool): UsageOutbox {
  return {
    append: async (event, signal) => {
      const { id, kind, apiKeyId, occurredAt, ...payload } = usageEventSchema.parse(event);
      delete payload.exportedAt;
      await query(
        pool,
        signal,
        `INSERT INTO scholarly.usage_events (id, kind, api_key_id, occurred_at, payload)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
        [id, kind, apiKeyId, occurredAt, JSON.stringify(payload)],
      );
    },
    claim: async (limit, now, leaseUntil, signal) => {
      const { rows } = await query<UsageRow>(
        pool,
        signal,
        `WITH free AS (
           SELECT id FROM scholarly.usage_events
           WHERE exported_at IS NULL AND (claimed_until IS NULL OR claimed_until <= $1)
           ORDER BY occurred_at, id LIMIT $3
           FOR UPDATE SKIP LOCKED
         )
         UPDATE scholarly.usage_events e SET claimed_until = $2
         FROM free WHERE e.id = free.id
         RETURNING e.*`,
        [now, leaseUntil, Math.max(0, limit)],
      );
      return rows.sort(byAge).map(eventFromRow);
    },
    release: async (ids, signal) => {
      await query(
        pool,
        signal,
        'UPDATE scholarly.usage_events SET claimed_until = NULL WHERE id = ANY($1)',
        [ids],
      );
    },
    markExported: async (ids, at, signal) => {
      await query(
        pool,
        signal,
        `UPDATE scholarly.usage_events SET exported_at = $1, claimed_until = NULL
         WHERE id = ANY($2)`,
        [at, ids],
      );
    },
    countPending: async (signal) => {
      const { rows } = await query<{ n: number }>(
        pool,
        signal,
        'SELECT count(*)::integer AS n FROM scholarly.usage_events WHERE exported_at IS NULL',
      );
      return rows[0]?.n ?? 0;
    },
    deleteExported: async (before, signal) => {
      const result = await query(
        pool,
        signal,
        'DELETE FROM scholarly.usage_events WHERE exported_at IS NOT NULL AND exported_at < $1',
        [before],
      );
      return result.rowCount ?? 0;
    },
  };
}

/** `RETURNING` gives no order; claims hand out events oldest first, ties by id. */
function byAge(a: UsageRow, b: UsageRow): number {
  return a.occurred_at.getTime() - b.occurred_at.getTime() || compare(a.id, b.id);
}

/** Byte order, as the `id` column's C collation sorts in Postgres. */
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function eventFromRow(row: UsageRow): UsageEvent {
  return usageEventSchema.parse({
    ...row.payload,
    id: row.id,
    kind: row.kind,
    apiKeyId: row.api_key_id,
    occurredAt: row.occurred_at,
    ...(row.exported_at !== null && { exportedAt: row.exported_at }),
  });
}
