/** A token bucket's state: tokens left and when they were last counted. */
export interface Bucket {
  readonly tokens: number;
  readonly updatedAt: number;
}

/** Refill rate and size of every bucket. */
export interface BucketPolicy {
  readonly perMinute: number;
  readonly burst: number;
}

/** The outcome of taking one token. */
export type Take =
  | { readonly allowed: true; readonly bucket: Bucket }
  | { readonly allowed: false; readonly bucket: Bucket; readonly retryAfterSeconds: number };

/**
 * Takes one token from a bucket that refills `perMinute` tokens a minute up to `burst`
 * (PLAN.md: per-key token bucket). A missing bucket starts full. When empty, the answer
 * says how many whole seconds until the next token. Pure, so time is passed in.
 */
export function takeToken(bucket: Bucket | undefined, now: number, policy: BucketPolicy): Take {
  const perMs = policy.perMinute / 60_000;
  const elapsed = bucket === undefined ? 0 : Math.max(0, now - bucket.updatedAt);
  const tokens =
    bucket === undefined ? policy.burst : Math.min(policy.burst, bucket.tokens + elapsed * perMs);
  if (tokens >= 1) return { allowed: true, bucket: { tokens: tokens - 1, updatedAt: now } };
  return {
    allowed: false,
    bucket: { tokens, updatedAt: now },
    retryAfterSeconds: Math.max(1, Math.ceil((1 - tokens) / perMs / 1000)),
  };
}

/** Whether a bucket has refilled completely, so forgetting it changes nothing. */
export function isFull(bucket: Bucket, now: number, policy: BucketPolicy): boolean {
  const refilled =
    bucket.tokens + Math.max(0, now - bucket.updatedAt) * (policy.perMinute / 60_000);
  return refilled >= policy.burst;
}
