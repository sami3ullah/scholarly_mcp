import type { Article, ArticleCard, Author } from '@scholarly-mcp/core';
import { cardAccess, cardLicense } from '../access/card-access.js';

/** What a card is built from: a result's article and the labels search made for it. */
export interface CardSource {
  readonly article: Article;
  readonly teaser: string;
  readonly whyMatched: string;
}

/**
 * Builds the article card (ARCHITECTURE.md "The article card"). Only the teaser and `whyMatched`
 * come from article text; everything else is metadata (ADR 0016, ADR 0023).
 */
export function buildCard(source: CardSource, url: string, now: Date): ArticleCard {
  const { article } = source;
  const firstAuthor = article.authors[0];
  return {
    doi: article.doi,
    title: article.title,
    journal: article.journal.name,
    year: article.published.year,
    ...(firstAuthor !== undefined && { firstAuthor: authorName(firstAuthor) }),
    teaser: source.teaser,
    whyMatched: source.whyMatched,
    access: cardAccess(article),
    license: cardLicense(article, now),
    url,
  };
}

/** An author as a reader writes the name: given name first when known. */
export function authorName({ given, family }: Author): string {
  return given === undefined ? family : `${given} ${family}`;
}
