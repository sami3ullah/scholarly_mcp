import { runRateBucketStoreContract } from '@scholarly-mcp/testkit';
import { describe, expect, it } from 'vitest';
import { createMemoryBucketStore } from './create-memory-bucket-store.js';

runRateBucketStoreContract('In-memory bucket store', () => createMemoryBucketStore());

describe('createMemoryBucketStore', () => {
  it('forgets the least recently used callers beyond its bound', async () => {
    const signal = new AbortController().signal;
    const store = createMemoryBucketStore(2);
    const now = new Date('2026-11-03T10:00:00Z');
    const policy = { perMinute: 60, burst: 1 };
    for (const id of ['a', 'b', 'c', 'd']) await store.take(id, policy, now, signal);
    // The oldest buckets were forgotten, so they start full again.
    expect((await store.take('a', policy, now, signal)).allowed).toBe(true);
    expect((await store.take('d', policy, now, signal)).allowed).toBe(false);
  });
});
