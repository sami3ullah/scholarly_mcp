import { isAppError } from '@scholarly-mcp/core';
import { createFakeClock } from '@scholarly-mcp/testkit';
import { describe, expect, it } from 'vitest';
import { createRateLimiter } from './create-rate-limiter.js';

describe('createRateLimiter', () => {
  it('limits each caller separately and says when to retry', () => {
    const clock = createFakeClock(new Date('2026-11-03T10:00:00Z'));
    const limiter = createRateLimiter({ perMinute: 30, burst: 2, clock });
    limiter.take('key_a');
    limiter.take('key_a');
    limiter.take('key_b');
    let thrown: unknown;
    try {
      limiter.take('key_a');
    } catch (error) {
      thrown = error;
    }
    expect(isAppError(thrown) && thrown).toMatchObject({
      code: 'RATE_LIMITED',
      retryAfterSeconds: 2,
    });
    clock.advance(2000);
    expect(() => {
      limiter.take('key_a');
    }).not.toThrow();
  });

  it('forgets callers beyond its bound without refusing anyone wrongly', () => {
    const clock = createFakeClock(new Date('2026-11-03T10:00:00Z'));
    const limiter = createRateLimiter({ perMinute: 60, burst: 1, clock, maxBuckets: 2 });
    for (const id of ['a', 'b', 'c', 'd']) limiter.take(id);
    // The oldest buckets were forgotten, so they start full again.
    expect(() => {
      limiter.take('a');
    }).not.toThrow();
    expect(() => {
      limiter.take('d');
    }).toThrow(/Too many requests/);
  });
});
