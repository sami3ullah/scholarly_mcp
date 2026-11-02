import { describe, expect, it } from 'vitest';
import { meanVector } from './mean-vector.js';

describe('meanVector', () => {
  it('averages vectors and normalises the result to unit length', () => {
    const mean = meanVector([Float32Array.of(1, 0), Float32Array.of(0, 1)]);
    expect(Array.from(mean ?? [])).toEqual([
      expect.closeTo(Math.SQRT1_2),
      expect.closeTo(Math.SQRT1_2),
    ]);
  });

  it('returns one vector unchanged in direction', () => {
    expect(Array.from(meanVector([Float32Array.of(0, 3)]) ?? [])).toEqual([0, 1]);
  });

  it.each([
    ['no vectors', []],
    ['vectors that cancel out', [Float32Array.of(1, 0), Float32Array.of(-1, 0)]],
  ])('returns undefined for %s', (_case, vectors) => {
    expect(meanVector(vectors)).toBeUndefined();
  });
});
