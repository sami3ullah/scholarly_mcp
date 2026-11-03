import { isAppError, type RateBucketStore } from '@scholarly-mcp/core';
import { createFakeClock, createTestLogger, type CapturedLine } from '@scholarly-mcp/testkit';
import { describe, expect, it } from 'vitest';
import { createMemoryBucketStore } from './create-memory-bucket-store.js';
import { createRateLimiter } from './create-rate-limiter.js';

const signal = new AbortController().signal;

describe('createRateLimiter', () => {
  const clock = createFakeClock(new Date('2026-11-03T10:00:00Z'));
  const logger = createTestLogger();

  it('limits each caller separately and says when to retry', async () => {
    const store = createMemoryBucketStore();
    const limiter = createRateLimiter({
      store,
      name: 'tools',
      perMinute: 30,
      burst: 2,
      clock,
      logger,
    });
    await limiter.take('key_a', signal);
    await limiter.take('key_a', signal);
    await limiter.take('key_b', signal);
    const thrown: unknown = await limiter.take('key_a', signal).catch((error: unknown) => error);
    expect(isAppError(thrown) && thrown).toMatchObject({
      code: 'RATE_LIMITED',
      retryAfterSeconds: 2,
    });
    clock.advance(2000);
    await expect(limiter.take('key_a', signal)).resolves.toBeUndefined();
  });

  it('keeps two limiters on one store apart', async () => {
    const store = createMemoryBucketStore();
    const tools = createRateLimiter({
      store,
      name: 'tools',
      perMinute: 1,
      burst: 1,
      clock,
      logger,
    });
    const landing = createRateLimiter({
      store,
      name: 'landing',
      perMinute: 1,
      burst: 1,
      clock,
      logger,
    });
    await tools.take('same', signal);
    await expect(landing.take('same', signal)).resolves.toBeUndefined();
  });

  it('sweeps only buckets idle long enough to have refilled', async () => {
    const store = createMemoryBucketStore();
    const limiter = createRateLimiter({
      store,
      name: 'tools',
      perMinute: 60,
      burst: 10,
      clock,
      logger,
    });
    await limiter.take('idle', signal);
    clock.advance(10_001);
    await limiter.take('busy', signal);
    expect(await limiter.sweep(signal)).toBe(1);
  });

  it('allows the call and warns when the store fails', async () => {
    const broken: RateBucketStore = {
      take: () => Promise.reject(new Error('connection refused')),
      sweep: () => Promise.resolve(0),
    };
    const lines: CapturedLine[] = [];
    const limiter = createRateLimiter({
      store: broken,
      name: 'tools',
      perMinute: 1,
      burst: 1,
      clock,
      logger: createTestLogger(lines),
    });
    await expect(limiter.take('key_a', signal)).resolves.toBeUndefined();
    expect(lines).toContainEqual(
      expect.objectContaining({ level: 'warn', message: 'Rate limit store failed; allowing' }),
    );
  });
});
