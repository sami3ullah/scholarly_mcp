import { describe, expect, it } from 'vitest';
import { compareWithBaseline, type GoldenBaseline } from './compare-baseline.js';

const summary = { queries: 20, recall: 0.7, mrr: 0.9, ndcg: 0.6 };
const baseline: GoldenBaseline = {
  golden: 1,
  corpus: { articleCount: 100, chunkCount: 300 },
  overall: summary,
  byGroup: { de: summary, en: summary, cross: summary },
};

describe('compareWithBaseline', () => {
  it('passes equal and better scores', () => {
    const better = { ...summary, recall: 0.75 };
    expect(
      compareWithBaseline(baseline, {
        ...baseline,
        overall: better,
        byGroup: { ...baseline.byGroup, en: better },
      }),
    ).toEqual({ comparable: true, regressions: [] });
  });

  it('names every score that dropped by more than float noise', () => {
    const worse = { ...summary, recall: 0.68, ndcg: 0.5999 };
    expect(
      compareWithBaseline(baseline, { ...baseline, byGroup: { ...baseline.byGroup, de: worse } }),
    ).toEqual({
      comparable: true,
      regressions: [{ scope: 'de', metric: 'recall', baseline: 0.7, current: 0.68 }],
    });
  });

  it('refuses a baseline from another golden set or corpus', () => {
    expect(compareWithBaseline(baseline, { ...baseline, golden: 2 }).comparable).toBe(false);
    expect(
      compareWithBaseline(baseline, { ...baseline, corpus: { articleCount: 101, chunkCount: 300 } })
        .comparable,
    ).toBe(false);
  });
});
