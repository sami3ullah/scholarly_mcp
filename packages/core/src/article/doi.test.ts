import { describe, expect, it } from 'vitest';
import { normalizeDoi } from './doi.js';

describe('normalizeDoi', () => {
  it.each([
    ['10.1055/A-2204-4549', '10.1055/a-2204-4549'],
    ['https://doi.org/10.1055/a-2204-4549', '10.1055/a-2204-4549'],
    ['http://dx.doi.org/10.1055/a-2204-4549', '10.1055/a-2204-4549'],
    ['doi:10.1055/s-0043-1763660', '10.1055/s-0043-1763660'],
    ['  DOI: 10.1055/s-0043-1763660 ', '10.1055/s-0043-1763660'],
  ])('normalises %s', (input, expected) => {
    expect(normalizeDoi(input)).toBe(expected);
  });

  it.each(['', 'atrial fibrillation', '10.10/x', '10.1055/', '10.1055/has space'])(
    'returns undefined for non-DOI input %j',
    (input) => {
      expect(normalizeDoi(input)).toBeUndefined();
    },
  );
});
