import { readFileSync } from 'node:fs';
import { DEFAULT_FULLTEXT_LICENSES, type Article, type License } from '@scholarly-mcp/core';
import { anArticle } from '@scholarly-mcp/testkit';

function load(file: string): string {
  return readFileSync(new URL(`../../fixtures/${file}`, import.meta.url), 'utf8');
}

/** A recorded `core` search for seven Thieme DOIs (fields the adapter reads only). */
export const searchBody = JSON.parse(load('search.json')) as {
  hitCount: number;
  resultList: { result: Record<string, unknown>[] };
};
/** The CC BY full text of 10.1055/a-2272-9794, verbatim. */
export const endoscopyXml = load('fulltext/PMC11288659.xml');

const CC_BY = DEFAULT_FULLTEXT_LICENSES[0];
const CC_BY_NC_ND = DEFAULT_FULLTEXT_LICENSES[1];
/** When the tests judge licences. */
export const NOW = new Date('2026-11-02T10:00:00Z');

function vor(url: string, start: string): License {
  return { url, contentVersion: 'vor', start: new Date(start) };
}

function article(doi: string, licenses: License[] = []): Article {
  return { ...anArticle().withDoi(doi).build(), licenses, isOpenAccess: licenses.length > 0 };
}

/** The recorded DOIs, with the licences Crossref holds for them. */
export const articles = {
  /** CC BY; Europe PMC full text PMC11288659 and MeSH. */
  endoscopy: article('10.1055/a-2272-9794', [vor(CC_BY, '2024-02-20')]),
  /** CC BY-NC-ND; full text PMC11410396 (a case report) and MeSH. */
  caseReport: article('10.1055/a-2328-7464', [vor(CC_BY_NC_ND, '2024-07-19')]),
  /** CC BY-NC-ND; German full text PMC11555776. */
  german: article('10.1055/a-2319-3045', [vor(CC_BY_NC_ND, '2024-07-24')]),
  /** Closed at Crossref; Europe PMC holds an author manuscript. */
  manuscript: article('10.1055/a-2567-5178'),
  /** CC BY at Crossref, but no full text in Europe PMC. */
  noFullText: article('10.1055/s-0046-1829078', [vor(CC_BY, '2026-10-09')]),
  /** CC BY-NC-ND; full text and author keywords. */
  keywords: article('10.1055/s-0044-1787668', [vor(CC_BY_NC_ND, '2024-06-06')]),
  /** Matched by a Europe PMC record that carries no DOI, so not a match. */
  unmatched: article('10.1055/s-0042-1751569', [vor(CC_BY, '2024-03-14')]),
};

export const allArticles = Object.values(articles);
