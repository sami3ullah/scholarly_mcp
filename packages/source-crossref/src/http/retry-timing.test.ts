import { describe, expect, it } from 'vitest';
import { MAX_DELAY_MS, backoffDelay, minRequestGapMs, retryAfterMs } from './retry-timing.js';

describe('backoffDelay', () => {
  it('grows exponentially with the attempt at the top of the jitter range', () => {
    const top = () => 0.999_999;
    expect([0, 1, 2, 3].map((attempt) => backoffDelay(attempt, top))).toEqual([
      999, 1999, 3999, 7999,
    ]);
  });

  it('is jittered down to zero', () => {
    expect(backoffDelay(5, () => 0)).toBe(0);
    expect(backoffDelay(2, () => 0.5)).toBe(2000);
  });

  it('is capped', () => {
    expect(backoffDelay(30, () => 0.999_999)).toBeLessThan(MAX_DELAY_MS);
  });
});

describe('retryAfterMs', () => {
  const now = new Date('2026-11-02T10:00:00Z');

  it.each([
    ['seconds', '3', 3000],
    ['zero', '0', 0],
    ['an HTTP date', 'Mon, 02 Nov 2026 10:00:05 GMT', 5000],
    ['a date in the past', 'Mon, 02 Nov 2026 09:00:00 GMT', 0],
  ])('reads %s', (_case, header, expected) => {
    expect(retryAfterMs(header, now)).toBe(expected);
  });

  it.each([null, '', 'soon'])('ignores %j', (header) => {
    expect(retryAfterMs(header, now)).toBeUndefined();
  });
});

describe('minRequestGapMs', () => {
  it('spaces requests by the advertised rate limit', () => {
    const headers = new Headers({ 'x-rate-limit-limit': '1', 'x-rate-limit-interval': '1s' });
    expect(minRequestGapMs(headers)).toBe(1000);
    headers.set('x-rate-limit-limit', '50');
    expect(minRequestGapMs(headers)).toBe(20);
  });

  it.each([
    [{}],
    [{ 'x-rate-limit-limit': '0', 'x-rate-limit-interval': '1s' }],
    [{ 'x-rate-limit-limit': '5', 'x-rate-limit-interval': '1m' }],
  ])('is undefined without usable headers %j', (headers) => {
    expect(minRequestGapMs(new Headers(headers))).toBeUndefined();
  });
});
