import { describe, expect, it } from 'vitest';
import { aCrossrefWork } from '../testing/a-crossref-work.js';
import { mapPublishedDate } from './map-published-date.js';

const parts = (...dateParts: (number | null)[]) => ({ 'date-parts': [dateParts] });

describe('mapPublishedDate', () => {
  it.each([
    [[2024, 2, 1], { year: 2024, month: 2, day: 1 }],
    [[2024, 6], { year: 2024, month: 6 }],
    [[2024], { year: 2024 }],
    [[2024, 2, 30], { year: 2024, month: 2 }],
    [[2024, 13, 1], { year: 2024 }],
    [[2024, null, null], { year: 2024 }],
  ])('maps %j to %j without inventing parts', (dateParts, expected) => {
    expect(mapPublishedDate(aCrossrefWork({ published: parts(...dateParts) }))).toEqual(expected);
  });

  it('falls back to the issued date', () => {
    const work = aCrossrefWork({ published: undefined, issued: parts(2023, 12) });
    expect(mapPublishedDate(work)).toEqual({ year: 2023, month: 12 });
  });

  it.each([
    ['no date', undefined],
    ['an empty date', parts()],
    ['a null year', parts(null)],
  ])('returns undefined for %s', (_case, published) => {
    expect(mapPublishedDate(aCrossrefWork({ published, issued: undefined }))).toBeUndefined();
  });
});
