import { appError, type Clock } from '@scholarly-mcp/core';
import { isFull, takeToken, type Bucket, type BucketPolicy } from './token-bucket.js';

/** Allows or refuses one tool call per caller. */
export interface RateLimiter {
  /** Throws `RATE_LIMITED` with `retryAfterSeconds` when the caller's bucket is empty. */
  take(callerId: string): void;
}

export interface RateLimiterDeps extends BucketPolicy {
  readonly clock: Clock;
  /** Buckets kept before full ones are swept; protects memory from many key ids. */
  readonly maxBuckets?: number;
}

/**
 * One token bucket per caller, in this process's memory. Several server processes each
 * allow the full rate; a shared limit would need a shared store (ADR 0031).
 */
export function createRateLimiter(deps: RateLimiterDeps): RateLimiter {
  const buckets = new Map<string, Bucket>();
  const maxBuckets = deps.maxBuckets ?? 10_000;

  const sweep = (now: number) => {
    for (const [id, bucket] of buckets) if (isFull(bucket, now, deps)) buckets.delete(id);
    // Still too many active callers: forget the oldest; they start with a full bucket.
    for (const id of buckets.keys()) {
      if (buckets.size <= maxBuckets) break;
      buckets.delete(id);
    }
  };

  return {
    take: (callerId) => {
      const now = deps.clock.now().getTime();
      const result = takeToken(buckets.get(callerId), now, deps);
      buckets.delete(callerId);
      buckets.set(callerId, result.bucket);
      if (buckets.size > maxBuckets) sweep(now);
      if (!result.allowed) {
        throw appError('RATE_LIMITED', 'Too many requests for this API key; retry later', {
          retryAfterSeconds: result.retryAfterSeconds,
        });
      }
    },
  };
}
