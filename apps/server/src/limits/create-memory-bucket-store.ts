import { takeToken, type Bucket, type RateBucketStore } from '@scholarly-mcp/core';

/**
 * Token buckets in this process's memory, for a single server process (ADR 0031). Beyond
 * `maxBuckets` the least recently used are forgotten; they start full again, so memory
 * stays bounded however many key ids or visitors arrive.
 */
export function createMemoryBucketStore(maxBuckets = 10_000): RateBucketStore {
  const buckets = new Map<string, Bucket>();
  return {
    take: (id, policy, now) => {
      const result = takeToken(buckets.get(id), now.getTime(), policy);
      // Re-inserting keeps the map in least-recently-used order.
      buckets.delete(id);
      buckets.set(id, result.bucket);
      for (const oldest of buckets.keys()) {
        if (buckets.size <= maxBuckets) break;
        buckets.delete(oldest);
      }
      return Promise.resolve(
        result.allowed
          ? { allowed: true }
          : { allowed: false, retryAfterSeconds: result.retryAfterSeconds },
      );
    },
    sweep: (prefix, before) => {
      let removed = 0;
      for (const [id, bucket] of buckets) {
        if (id.startsWith(prefix) && bucket.updatedAt < before.getTime()) {
          buckets.delete(id);
          removed += 1;
        }
      }
      return Promise.resolve(removed);
    },
  };
}
