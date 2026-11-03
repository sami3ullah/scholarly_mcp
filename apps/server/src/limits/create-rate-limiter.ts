import {
  appError,
  refillMs,
  type BucketPolicy,
  type Clock,
  type Logger,
  type RateBucketStore,
} from '@scholarly-mcp/core';

/** Allows or refuses one call per caller. */
export interface RateLimiter {
  /** Rejects with `RATE_LIMITED` and `retryAfterSeconds` when the caller's bucket is empty. */
  take(callerId: string, signal: AbortSignal): Promise<void>;
  /** Forgets this limiter's buckets that have been idle long enough to be full again. */
  sweep(signal: AbortSignal): Promise<number>;
}

export interface RateLimiterDeps extends BucketPolicy {
  readonly store: RateBucketStore;
  /** Keeps this limiter's buckets apart from another's in a shared store, e.g. `tools`. */
  readonly name: string;
  readonly clock: Clock;
  readonly logger: Logger;
}

/**
 * One token bucket per caller, kept in `store`: this process's memory, or Postgres so that
 * several replicas share one limit (ADR 0031, ADR 0036). When the store cannot answer, the
 * call is allowed and a warning logged: the limit protects capacity, it is not access
 * control, and the call itself will meet the same outage.
 */
export function createRateLimiter(deps: RateLimiterDeps): RateLimiter {
  const prefix = `${deps.name}:`;
  return {
    take: async (callerId, signal) => {
      let take;
      try {
        take = await deps.store.take(`${prefix}${callerId}`, deps, deps.clock.now(), signal);
      } catch (error) {
        deps.logger.warn({ err: error, limiter: deps.name }, 'Rate limit store failed; allowing');
        return;
      }
      if (!take.allowed) {
        throw appError('RATE_LIMITED', 'Too many requests; retry later', {
          retryAfterSeconds: take.retryAfterSeconds,
        });
      }
    },
    sweep: (signal) => {
      const before = new Date(deps.clock.now().getTime() - refillMs(deps));
      return deps.store.sweep(prefix, before, signal);
    },
  };
}
