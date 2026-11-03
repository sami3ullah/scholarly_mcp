import {
  LANDING_AUTHOR_LIMIT,
  type Article,
  type LandingArticle,
  type LandingArticleSummary,
} from '@scholarly-mcp/core';
import { buildTeaser } from '@scholarly-mcp/search';
import { cardAccess, cardLicense } from '../access/card-access.js';
import { authorName } from '../cards/build-card.js';
import { subjectLabels } from '../tools/get-article.js';

/** An article in the match list or related reading: the same metadata and teaser as its card. */
export function landingSummary(article: Article, now: Date): LandingArticleSummary {
  const firstAuthor = article.authors[0];
  return {
    doi: article.doi,
    title: article.title,
    journal: article.journal.name,
    year: article.published.year,
    ...(firstAuthor !== undefined && { firstAuthor: authorName(firstAuthor) }),
    teaser: buildTeaser(article),
    access: cardAccess(article, now),
    retracted: article.isRetracted,
  };
}

/** The chosen article: its summary plus the abstract and what a reader needs to cite it. */
export function landingArticle(article: Article, now: Date): LandingArticle {
  return {
    ...landingSummary(article, now),
    ...(article.subtitle !== undefined && { subtitle: article.subtitle }),
    authors: article.authors.slice(0, LANDING_AUTHOR_LIMIT).map(authorName),
    authorCount: article.authors.length,
    published: article.published,
    ...(article.language !== undefined && { language: article.language }),
    ...(article.abstract !== undefined && { abstract: article.abstract }),
    subjects: subjectLabels(article),
    license: cardLicense(article, now),
    articleUrl: article.landingUrl,
    doiUrl: doiUrl(article.doi),
  };
}

/** The doi.org link, with `#` and `?` escaped so they stay part of the DOI. */
export function doiUrl(doi: string): string {
  return `https://doi.org/${encodeURI(doi).replace(/[#?]/g, encodeURIComponent)}`;
}
