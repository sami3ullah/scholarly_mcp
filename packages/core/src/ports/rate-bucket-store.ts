import type { BucketPolicy } from '../limits/token-bucket.js';

/** Whether a token was taken, and if not, how long until one is there. */
export type BucketTake =
  { readonly allowed: true } | { readonly allowed: false; readonly retryAfterSeconds: number };

/**
 * Token buckets by caller id (ADR 0031, ADR 0036). In memory for one process; in Postgres
 * when several server replicas must share one limit per key or visitor. Ids are API key
 * ids or hashed visitor ids, never addresses or query text.
 */
export interface RateBucketStore {
  /**
   * Takes one token from the bucket `id` at `now`, as one atomic step across every process
   * sharing the store. A bucket never seen starts full.
   */
  take(id: string, policy: BucketPolicy, now: Date, signal: AbortSignal): Promise<BucketTake>;
  /** Forgets the buckets whose id starts with `prefix` that were last used before `before`. */
  sweep(prefix: string, before: Date, signal: AbortSignal): Promise<number>;
}
