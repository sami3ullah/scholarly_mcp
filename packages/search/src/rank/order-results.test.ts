import type { Article, Doi } from '@scholarly-mcp/core';
import { anArticle } from '@scholarly-mcp/testkit';
import { describe, expect, it } from 'vitest';
import { orderResults, type Candidate } from './order-results.js';

const candidate = (article: Article, score: number): Candidate => ({
  article,
  best: { chunkId: `${article.doi}#0`, doi: article.doi, score },
});

const dois = (candidates: readonly Candidate[]) => candidates.map(({ article }) => article.doi);

describe('orderResults', () => {
  it('orders by fused score', () => {
    const low = candidate(anArticle().withDoi('10.1055/a-1').build(), 0.01);
    const high = candidate(anArticle().withDoi('10.1055/a-2').build(), 0.03);
    expect(dois(orderResults([low, high], 'query'))).toEqual(['10.1055/a-2', '10.1055/a-1']);
  });

  it('puts the newer article first when scores are equal', () => {
    const older = candidate(anArticle().withDoi('10.1055/a-1').publishedIn(2024, 5).build(), 0.02);
    const newer = candidate(anArticle().withDoi('10.1055/a-2').publishedIn(2024, 6).build(), 0.02);
    expect(dois(orderResults([older, newer], 'query'))).toEqual(['10.1055/a-2', '10.1055/a-1']);
  });

  it('puts the lower DOI first when scores and dates are equal', () => {
    const b = candidate(anArticle().withDoi('10.1055/a-2').publishedIn(2025).build(), 0.02);
    const a = candidate(anArticle().withDoi('10.1055/a-1').publishedIn(2025).build(), 0.02);
    expect(dois(orderResults([b, a], 'query'))).toEqual(['10.1055/a-1', '10.1055/a-2']);
  });

  it('sorts a year-only date before a dated one of the same year', () => {
    const yearOnly = candidate(anArticle().withDoi('10.1055/a-1').publishedIn(2025).build(), 0.02);
    const dated = candidate(
      anArticle().withDoi('10.1055/a-2').publishedIn(2025, 1, 2).build(),
      0.02,
    );
    expect(dois(orderResults([yearOnly, dated], 'q'))[0]).toBe('10.1055/a-2' as Doi);
  });

  it('boosts the article whose title is the query, ignoring case, punctuation and umlaut spelling', () => {
    const other = candidate(anArticle().withDoi('10.1055/a-1').build(), 0.05);
    const titled = candidate(
      anArticle()
        .withDoi('10.1055/a-2')
        .withTitle('Ärzte in der Notaufnahme: eine Umfrage')
        .build(),
      0.01,
    );
    expect(dois(orderResults([other, titled], 'aerzte in der notaufnahme eine umfrage'))).toEqual([
      '10.1055/a-2',
      '10.1055/a-1',
    ]);
  });

  it('does not boost a title that only contains the query', () => {
    const other = candidate(anArticle().withDoi('10.1055/a-1').build(), 0.05);
    const titled = candidate(
      anArticle().withDoi('10.1055/a-2').withTitle('Notaufnahme heute').build(),
      0.01,
    );
    expect(dois(orderResults([other, titled], 'Notaufnahme'))[0]).toBe('10.1055/a-1' as Doi);
  });
});
