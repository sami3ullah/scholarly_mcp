import { retryAfterSeconds, type RateBucketStore } from '@scholarly-mcp/core';
import { query, type Pool } from '../database/pool.js';

/*
 * One statement per take, so the row lock of the upsert makes it atomic across replicas.
 * Every SET expression reads the row as it was, so `refilled` is the same in all three.
 * It is `takeToken` in SQL: refill since the last count, capped at the burst; take one
 * token when there is one; record whether this call was allowed.
 */
const TAKE = `
  INSERT INTO scholarly.rate_buckets AS b (id, tokens, updated_at, allowed)
  VALUES ($1, $3::float8 - 1, $4, true)
  ON CONFLICT (id) DO UPDATE SET
    allowed = ${refilled()} >= 1,
    tokens = ${refilled()} - CASE WHEN ${refilled()} >= 1 THEN 1 ELSE 0 END,
    updated_at = greatest(b.updated_at, $4)
  RETURNING allowed, tokens`;

function refilled(): string {
  return `least($3::float8, b.tokens + greatest(0, extract(epoch FROM $4 - b.updated_at) * 1000) * $2::float8)`;
}

/**
 * Rate-limit buckets in Postgres, shared by every server replica, so a key or visitor gets
 * one limit however many processes answer (ADR 0036). The table is unlogged: a crash
 * empties it, which only refills everyone's bucket.
 */
export function createPostgresBucketStore(pool: Pool): RateBucketStore {
  return {
    take: async (id, policy, now, signal) => {
      const { rows } = await query<{ allowed: boolean; tokens: number }>(pool, signal, TAKE, [
        id,
        policy.perMinute / 60_000,
        policy.burst,
        now,
      ]);
      const row = rows[0];
      if (row === undefined) throw new Error('The bucket upsert returned no row');
      return row.allowed
        ? { allowed: true }
        : { allowed: false, retryAfterSeconds: retryAfterSeconds(row.tokens, policy) };
    },
    sweep: async (prefix, before, signal) => {
      const { rowCount } = await query(
        pool,
        signal,
        'DELETE FROM scholarly.rate_buckets WHERE starts_with(id, $1) AND updated_at < $2',
        [prefix, before],
      );
      return rowCount ?? 0;
    },
  };
}
