import type { Article } from '@scholarly-mcp/core';

/** The CSL-JSON fields this package fills; citation-js reads the rest as absent. */
export interface CslItem {
  readonly id: string;
  readonly type: 'article-journal';
  readonly title: string;
  readonly 'container-title': string;
  readonly ISSN?: string;
  readonly author?: readonly { readonly family: string; readonly given?: string }[];
  readonly volume?: string;
  readonly issue?: string;
  readonly page?: string;
  readonly issued: { readonly 'date-parts': [[number, ...number[]]] };
  readonly DOI: string;
  readonly URL: string;
  readonly language?: string;
}

/**
 * Maps an article to CSL-JSON. Only metadata goes in, never the abstract. The date keeps
 * the precision the source gave, so a year-only record cites as "2024" and not a made-up
 * day (ARCHITECTURE.md edge cases). The language stops English title casing of German titles. The
 * URL is the publisher's landing page, the link the citation points readers to.
 */
export function toCslItem(article: Article): CslItem {
  const { year, month, day } = article.published;
  const dateParts: [number, ...number[]] =
    month === undefined ? [year] : day === undefined ? [year, month] : [year, month, day];
  const title =
    article.subtitle === undefined ? article.title : `${article.title}: ${article.subtitle}`;
  const issn = article.journal.issnPrint ?? article.journal.issnElectronic;
  return {
    id: article.doi,
    type: 'article-journal',
    title,
    'container-title': article.journal.name,
    ...(issn !== undefined && { ISSN: issn }),
    ...(article.authors.length > 0 && {
      author: article.authors.map(({ family, given }) => ({
        family,
        ...(given !== undefined && { given }),
      })),
    }),
    ...(article.volume !== undefined && { volume: article.volume }),
    ...(article.issue !== undefined && { issue: article.issue }),
    ...(article.pages !== undefined && { page: article.pages }),
    issued: { 'date-parts': [dateParts] },
    DOI: article.doi,
    URL: article.landingUrl,
    ...(article.language !== undefined && { language: article.language }),
  };
}
