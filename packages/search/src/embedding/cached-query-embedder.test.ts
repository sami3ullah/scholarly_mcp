import { createFakeEmbedder } from '@scholarly-mcp/testkit';
import { describe, expect, it, vi } from 'vitest';
import { createCachedQueryEmbedder } from './cached-query-embedder.js';

const signal = new AbortController().signal;

const countingEmbedder = () => {
  const embedder = createFakeEmbedder();
  const embedQuery = vi.fn<typeof embedder.embedQuery>((text, s) => embedder.embedQuery(text, s));
  return { embedQuery };
};

describe('createCachedQueryEmbedder', () => {
  it('embeds a repeated query once', async () => {
    const embedder = countingEmbedder();
    const cache = createCachedQueryEmbedder(embedder, 10);
    const first = await cache.embed('stroke', signal);
    const second = await cache.embed('stroke', signal);
    expect(embedder.embedQuery).toHaveBeenCalledTimes(1);
    expect(first.cached).toBe(false);
    expect(second).toEqual({ vector: first.vector, cached: true });
  });

  it('evicts the least recently used query', async () => {
    const embedder = countingEmbedder();
    const cache = createCachedQueryEmbedder(embedder, 2);
    await cache.embed('a', signal);
    await cache.embed('b', signal);
    await cache.embed('a', signal);
    await cache.embed('c', signal);
    expect((await cache.embed('a', signal)).cached).toBe(true);
    expect((await cache.embed('b', signal)).cached).toBe(false);
  });

  it('caches nothing with a capacity of 0', async () => {
    const cache = createCachedQueryEmbedder(countingEmbedder(), 0);
    await cache.embed('a', signal);
    expect((await cache.embed('a', signal)).cached).toBe(false);
  });

  it('does not cache a failed embedding', async () => {
    const embedder = countingEmbedder();
    embedder.embedQuery.mockRejectedValueOnce(new Error('boom'));
    const cache = createCachedQueryEmbedder(embedder, 10);
    await expect(cache.embed('a', signal)).rejects.toThrow('boom');
    expect((await cache.embed('a', signal)).cached).toBe(false);
  });
});
