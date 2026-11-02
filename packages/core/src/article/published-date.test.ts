import { describe, expect, it } from 'vitest';
import { datePrecision, publishedDateSchema } from './published-date.js';

describe('publishedDateSchema', () => {
  it.each([{ year: 2024 }, { year: 2024, month: 2 }, { year: 2024, month: 2, day: 29 }])(
    'accepts %j',
    (date) => {
      expect(publishedDateSchema.safeParse(date).success).toBe(true);
    },
  );

  it.each([
    [{ year: 2024, day: 3 }, 'A day needs a month'],
    [{ year: 2023, month: 2, day: 29 }, 'Day is outside the month'],
    [{ year: 2024, month: 13 }, undefined],
    [{ year: 2024.5 }, undefined],
  ])('rejects %j', (date, message) => {
    const result = publishedDateSchema.safeParse(date);
    expect(result.success).toBe(false);
    if (message !== undefined) expect(result.error?.issues[0]?.message).toBe(message);
  });
});

describe('datePrecision', () => {
  it.each([
    [{ year: 2024 }, 'year'],
    [{ year: 2024, month: 5 }, 'month'],
    [{ year: 2024, month: 5, day: 1 }, 'day'],
  ] as const)('reports %j as %s precision', (date, precision) => {
    expect(datePrecision(date)).toBe(precision);
  });
});
