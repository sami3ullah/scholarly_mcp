import type { Article } from '@scholarly-mcp/core';
import type { SearchService } from '@scholarly-mcp/search';
import { anArticle } from '@scholarly-mcp/testkit';
import { describe, expect, it } from 'vitest';
import type { GoldenSet } from './golden-set.js';
import { runGolden } from './run-golden.js';

const signal = new AbortController().signal;
const article = (doi: string): Article => anArticle().withDoi(doi).build();

/** Answers each query with the DOIs listed for it. */
function serviceAnswering(answers: Record<string, string[]>): Pick<SearchService, 'search'> {
  return {
    search: ({ query }) =>
      Promise.resolve({
        hits: (answers[query] ?? []).map((doi) => ({
          article: article(doi),
          teaser: '',
          whyMatched: '',
        })),
        indexVersion: 'v1',
      }),
  };
}

const set: GoldenSet = {
  version: 1,
  rubric: 'test',
  queries: [
    {
      id: 'de-1',
      group: 'de',
      query: 'eins',
      need: 'n',
      relevant: [{ doi: '10.1055/a-a', grade: 2 }],
    },
    {
      id: 'en-1',
      group: 'en',
      query: 'one',
      need: 'n',
      relevant: [{ doi: '10.1055/a-b', grade: 1 }],
    },
    { id: 'en-2', group: 'en', query: 'none', need: 'n', relevant: [] },
  ],
};

describe('runGolden', () => {
  it('scores each query and averages per group over judged queries only', async () => {
    const report = await runGolden(
      serviceAnswering({
        eins: ['10.1055/a-a'],
        one: ['10.1055/a-x', '10.1055/a-b'],
        none: ['10.1055/a-a'],
      }),
      set,
      signal,
    );
    expect(report.outcomes.map(({ ranking }) => ranking)).toEqual([
      ['10.1055/a-a'],
      ['10.1055/a-x', '10.1055/a-b'],
      ['10.1055/a-a'],
    ]);
    expect(report.byGroup.de).toEqual({ queries: 1, recall: 1, mrr: 1, ndcg: 1 });
    expect(report.byGroup.en).toMatchObject({ queries: 1, recall: 1, mrr: 0.5 });
    expect(report.byGroup.cross).toEqual({ queries: 0, recall: 0, mrr: 0, ndcg: 0 });
    expect(report.overall).toMatchObject({ queries: 2, recall: 1, mrr: 0.75 });
  });
});
