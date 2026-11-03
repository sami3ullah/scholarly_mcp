import type { BucketPolicy, RateBucketStore } from '@scholarly-mcp/core';
import { beforeEach, describe, expect, it } from 'vitest';

const signal = new AbortController().signal;
const start = new Date('2026-11-03T10:00:00Z');
const policy: BucketPolicy = { perMinute: 30, burst: 2 };

const at = (ms: number) => new Date(start.getTime() + ms);

/** The behaviour every rate-limit bucket store must share (ADR 0036). */
export function runRateBucketStoreContract(
  name: string,
  create: () => RateBucketStore | Promise<RateBucketStore>,
): void {
  describe(`${name} satisfies the rate bucket store contract`, () => {
    let store: RateBucketStore;
    beforeEach(async () => {
      store = await create();
    });

    it('starts full, allows a burst, then refuses with the wait for one token', async () => {
      expect(await store.take('tools:a', policy, at(0), signal)).toEqual({ allowed: true });
      expect(await store.take('tools:a', policy, at(0), signal)).toEqual({ allowed: true });
      expect(await store.take('tools:a', policy, at(0), signal)).toEqual({
        allowed: false,
        retryAfterSeconds: 2,
      });
    });

    it('keeps callers apart', async () => {
      const tight = { perMinute: 1, burst: 1 };
      await store.take('tools:a', tight, at(0), signal);
      expect(await store.take('tools:b', tight, at(0), signal)).toEqual({ allowed: true });
      expect((await store.take('tools:a', tight, at(0), signal)).allowed).toBe(false);
    });

    it('refills at the rate, never beyond the burst', async () => {
      for (let i = 0; i < 2; i += 1) await store.take('tools:a', policy, at(0), signal);
      expect((await store.take('tools:a', policy, at(1_999), signal)).allowed).toBe(false);
      expect(await store.take('tools:a', policy, at(2_000), signal)).toEqual({ allowed: true });
      const later = at(10 * 60_000);
      const takes = [];
      for (let i = 0; i < 3; i += 1) takes.push(await store.take('tools:a', policy, later, signal));
      expect(takes.map((take) => take.allowed)).toEqual([true, true, false]);
    });

    it('does not count a refused call against the caller', async () => {
      const tight = { perMinute: 60, burst: 1 };
      await store.take('tools:a', tight, at(0), signal);
      for (let i = 1; i <= 5; i += 1) await store.take('tools:a', tight, at(i * 100), signal);
      expect(await store.take('tools:a', tight, at(1_000), signal)).toEqual({ allowed: true });
    });

    it('treats a clock that moved backwards as no time passed', async () => {
      const tight = { perMinute: 60, burst: 1 };
      await store.take('tools:a', tight, at(5_000), signal);
      expect((await store.take('tools:a', tight, at(0), signal)).allowed).toBe(false);
      expect((await store.take('tools:a', tight, at(6_000), signal)).allowed).toBe(true);
    });

    it('allows exactly the burst when many calls arrive at once', async () => {
      const burst = { perMinute: 1, burst: 5 };
      const takes = await Promise.all(
        Array.from({ length: 20 }, () => store.take('tools:a', burst, at(0), signal)),
      );
      expect(takes.filter((take) => take.allowed)).toHaveLength(5);
    });

    it('sweeps only idle buckets under the prefix, which then start full', async () => {
      const tight = { perMinute: 1, burst: 1 };
      await store.take('tools:old', tight, at(0), signal);
      await store.take('landing:old', tight, at(0), signal);
      await store.take('tools:new', tight, at(60_000), signal);
      expect(await store.sweep('tools:', at(30_000), signal)).toBe(1);
      expect((await store.take('tools:old', tight, at(60_000), signal)).allowed).toBe(true);
      expect((await store.take('landing:old', tight, at(1_000), signal)).allowed).toBe(false);
      expect((await store.take('tools:new', tight, at(60_000), signal)).allowed).toBe(false);
    });
  });
}
