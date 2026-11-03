import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { takeToken, type Bucket } from './token-bucket.js';

const policy = { perMinute: 60, burst: 3 };

describe('takeToken', () => {
  it('starts full and allows a burst, then refuses with the wait for one token', () => {
    let bucket: Bucket | undefined;
    for (let call = 0; call < 3; call += 1) {
      const take = takeToken(bucket, 0, policy);
      expect(take.allowed).toBe(true);
      bucket = take.bucket;
    }
    const refused = takeToken(bucket, 0, policy);
    expect(refused).toMatchObject({ allowed: false, retryAfterSeconds: 1 });
  });

  it('refills at the rate and never beyond the burst', () => {
    const empty = { tokens: 0, updatedAt: 0 };
    expect(takeToken(empty, 999, policy).allowed).toBe(false);
    expect(takeToken(empty, 1000, policy).allowed).toBe(true);
    expect(takeToken(empty, 3_600_000, policy).bucket.tokens).toBe(2);
  });

  it('rounds the wait up to whole seconds, at least one', () => {
    const slow = { perMinute: 1, burst: 1 };
    expect(takeToken({ tokens: 0, updatedAt: 0 }, 0, slow)).toMatchObject({
      retryAfterSeconds: 60,
    });
    expect(takeToken({ tokens: 0.999, updatedAt: 0 }, 0, policy)).toMatchObject({
      retryAfterSeconds: 1,
    });
  });

  it('treats a clock that moved backwards as no time passed', () => {
    expect(takeToken({ tokens: 0, updatedAt: 5000 }, 1000, policy).allowed).toBe(false);
  });

  it('never allows more than burst plus the refill over any period', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 5000 }), { maxLength: 200 }), (gaps) => {
        let bucket: Bucket | undefined;
        let now = 0;
        let allowed = 0;
        for (const gap of gaps) {
          now += gap;
          const take = takeToken(bucket, now, policy);
          bucket = take.bucket;
          if (take.allowed) allowed += 1;
        }
        expect(allowed).toBeLessThanOrEqual(policy.burst + (now / 60_000) * policy.perMinute);
      }),
    );
  });
});
