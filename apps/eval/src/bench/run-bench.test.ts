import { appError } from '@scholarly-mcp/core';
import type { SearchRequest, SearchService } from '@scholarly-mcp/search';
import { anArticle } from '@scholarly-mcp/testkit';
import { describe, expect, it } from 'vitest';
import { benchCases, type BenchCase } from './bench-cases.js';
import { formatOutcomes } from './format-outcomes.js';
import { runBench } from './run-bench.js';
import { summarizeLatencies } from './summarize-latencies.js';

const signal = new AbortController().signal;
const request = (query: string): SearchRequest => ({ query, filters: {}, limit: 10 });

/** A clock that moves 10 ms per reading, so every search takes 10 ms. */
const steppingClock = () => {
  let ms = 0;
  return () => (ms += 10);
};

const article = anArticle().withDoi('10.1055/a-1').withTitle('Stroke prevention').build();

const service: SearchService = {
  search: ({ query }) => {
    if (query === 'bad') return Promise.reject(appError('TIMEOUT', 'slow'));
    if (query === 'none') return Promise.resolve({ hits: [], indexVersion: 'v1' });
    return Promise.resolve({
      hits: [{ article, teaser: '', whyMatched: 'Matched in title: stroke' }],
      indexVersion: 'v1',
    });
  },
};

describe('summarizeLatencies', () => {
  it('uses nearest-rank percentiles', () => {
    const samples = Array.from({ length: 20 }, (_, index) => index + 1);
    expect(summarizeLatencies(samples)).toEqual({
      count: 20,
      p50: 10,
      p95: 19,
      max: 20,
      mean: 10.5,
    });
  });

  it('is all zero without samples', () => {
    expect(summarizeLatencies([])).toEqual({ count: 0, p50: 0, p95: 0, max: 0, mean: 0 });
  });
});

describe('runBench', () => {
  const cases: BenchCase[] = [
    { group: 'en', request: request('stroke') },
    { group: 'edge', request: request('bad') },
    { group: 'edge', request: request('none') },
  ];

  it('times every search of every round, per group and overall', async () => {
    const report = await runBench(service, cases, { rounds: 2, now: steppingClock() }, signal);
    expect(report.overall).toMatchObject({ count: 6, p95: 10 });
    expect(report.byGroup['edge']?.count).toBe(4);
  });

  it("keeps each case's first answer, recording error codes instead of throwing", async () => {
    const { outcomes } = await runBench(
      service,
      cases,
      { rounds: 2, now: steppingClock() },
      signal,
    );
    expect(outcomes.map(({ errorCode, result }) => errorCode ?? result?.hits.length)).toEqual([
      1,
      'TIMEOUT',
      0,
    ]);
  });

  it('formats outcomes for a person to read', async () => {
    const { outcomes } = await runBench(
      service,
      cases,
      { rounds: 1, now: steppingClock() },
      signal,
    );
    const text = formatOutcomes(outcomes);
    expect(text).toContain(
      '[en] stroke {}\n  10.1055/a-1  Stroke prevention\n      Matched in title: stroke',
    );
    expect(text).toContain('[edge] bad {}\n  error TIMEOUT');
    expect(text).toContain('[edge] none {}\n  (no results)');
  });
});

describe('benchCases', () => {
  it('covers every group and looks up the given DOIs', () => {
    const cases = benchCases(['10.1055/a-1']);
    expect(new Set(cases.map(({ group }) => group))).toEqual(
      new Set(['de', 'en', 'mixed', 'edge', 'filtered', 'doi']),
    );
    expect(cases.at(-1)?.request.query).toBe('https://doi.org/10.1055/a-1');
  });

  it('includes a query longer than the 500-character cap', () => {
    expect(benchCases([]).some(({ request: { query } }) => query.length > 500)).toBe(true);
  });
});
