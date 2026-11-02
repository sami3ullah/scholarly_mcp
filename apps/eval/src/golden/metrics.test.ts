import { describe, expect, it } from 'vitest';
import { scoreRanking } from './metrics.js';

const judged = new Map([
  ['a', 2],
  ['b', 1],
  ['c', 2],
]);

describe('scoreRanking', () => {
  it('scores a perfect ranking 1 on every metric', () => {
    expect(scoreRanking(['a', 'c', 'b', 'x'], judged)).toEqual({ recall: 1, rr: 1, ndcg: 1 });
  });

  it('counts unjudged results as not relevant', () => {
    const score = scoreRanking(['x', 'y', 'b'], judged);
    expect(score.recall).toBeCloseTo(1 / 3);
    expect(score.rr).toBeCloseTo(1 / 3);
    expect(score.ndcg).toBeGreaterThan(0);
    expect(score.ndcg).toBeLessThan(0.3);
  });

  it('caps recall at the cutoff, so many relevant articles can still reach 1', () => {
    const many = new Map(Array.from({ length: 15 }, (_, i) => [`d${String(i)}`, 1]));
    const ranking = Array.from({ length: 12 }, (_, i) => `d${String(i)}`);
    expect(scoreRanking(ranking, many).recall).toBe(1);
  });

  it('only looks at the first ten results', () => {
    const ranking = [...Array.from({ length: 10 }, (_, i) => `x${String(i)}`), 'a'];
    expect(scoreRanking(ranking, judged)).toEqual({ recall: 0, rr: 0, ndcg: 0 });
  });

  it('ranks a highly relevant article first above a partially relevant one', () => {
    expect(scoreRanking(['a', 'b'], judged).ndcg).toBeGreaterThan(
      scoreRanking(['b', 'a'], judged).ndcg,
    );
  });
});
