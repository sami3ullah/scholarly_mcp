import { describe, expect, it } from 'vitest';
import { createBoundedCache } from './bounded-cache.js';

describe('createBoundedCache', () => {
  it('forgets entries after the TTL', () => {
    const cache = createBoundedCache<string>(1000);
    cache.set('a', 'x', 0);
    expect(cache.get('a', 999)).toBe('x');
    expect(cache.get('a', 1000)).toBeUndefined();
  });

  it('drops the oldest entry beyond its size', () => {
    const cache = createBoundedCache<number>(1000, 2);
    cache.set('a', 1, 0);
    cache.set('b', 2, 0);
    cache.set('c', 3, 0);
    expect([cache.get('a', 1), cache.get('b', 1), cache.get('c', 1)]).toEqual([undefined, 2, 3]);
  });

  it('holds nothing with a TTL of zero', () => {
    const cache = createBoundedCache<number>(0);
    cache.set('a', 1, 0);
    expect(cache.get('a', 0)).toBeUndefined();
  });
});
