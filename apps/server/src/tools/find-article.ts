import { appError, type Article, type ArticleReader, type Doi } from '@scholarly-mcp/core';

/** Loads an indexed article, or fails with `NOT_FOUND` on `doi` pointing to a search. */
export async function findArticle(
  reader: ArticleReader,
  doi: Doi,
  signal: AbortSignal,
): Promise<Article> {
  const article = await reader.findByDoi(doi, signal);
  if (article !== undefined) return article;
  throw appError(
    'NOT_FOUND',
    `No indexed article has the DOI ${doi}; use search_articles to find articles on the topic`,
    { field: 'doi' },
  );
}
