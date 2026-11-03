import { describe, expect, it } from 'vitest';
import { fromJsonWithDates, toJsonWithDates } from './json-with-dates.js';

describe('JSON with dates', () => {
  it('round-trips nested dates', () => {
    const value = {
      at: new Date('2026-11-02T10:00:00.000Z'),
      licenses: [{ start: new Date('2024-01-01T00:00:00.000Z'), url: 'https://x.org' }],
      name: 'kept',
    };
    expect(fromJsonWithDates(toJsonWithDates(value))).toEqual(value);
  });

  it('leaves ordinary objects alone', () => {
    expect(fromJsonWithDates(toJsonWithDates({ date: '2024-01-01' }))).toEqual({
      date: '2024-01-01',
    });
  });
});
