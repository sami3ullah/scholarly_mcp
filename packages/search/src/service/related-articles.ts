import { appError, type Doi } from '@scholarly-mcp/core';
import { meanVector } from '../embedding/mean-vector.js';
import { whyMatched } from '../present/why-matched.js';
import { buildTeaser } from '../present/build-teaser.js';
import { collapseToArticles } from '../rank/collapse-to-articles.js';
import { orderResults } from '../rank/order-results.js';
import { fuseRankings } from '../rank/rrf.js';
import type {
  RelatedRequest,
  RelatedResult,
  SearchHit,
  SearchOptions,
  SearchServiceDeps,
} from './search-types.js';

/**
 * Finds the articles nearest to an article's mean chunk vector (PLAN.md tool contracts):
 * vector search only, retracted articles left out, the article itself dropped. Unknown
 * DOIs are `NOT_FOUND`, so the model can fall back to a search.
 */
export async function relatedArticles(
  deps: Pick<SearchServiceDeps, 'reader' | 'search'>,
  options: Pick<SearchOptions, 'candidates' | 'rrfK'>,
  request: RelatedRequest,
  signal: AbortSignal,
): Promise<RelatedResult> {
  const { reader, search } = deps;
  const meta = await reader.indexMeta(signal);
  if (meta === undefined) {
    throw appError('INDEX_UNAVAILABLE', 'The search index is not available yet; retry shortly');
  }
  const article = await reader.findByDoi(request.doi, signal);
  if (article === undefined) throw notFound(request.doi);

  const own = await reader.findArticleChunks(article.doi, signal);
  const embedding = meanVector(own.map((chunk) => chunk.embedding));
  if (embedding === undefined) return { article, hits: [], indexVersion: meta.version };

  // The article's own chunks come first, so ask for that many more.
  const ranked = await search.vector(
    { embedding, filters: {}, limit: options.candidates + own.length },
    signal,
  );
  const best = collapseToArticles(fuseRankings([ranked], options.rrfK)).filter(
    ({ doi }) => doi !== article.doi,
  );
  const articles = new Map(
    (
      await reader.findManyByDoi(
        best.map(({ doi }) => doi),
        signal,
      )
    ).map((found) => [found.doi, found]),
  );
  const page = orderResults(
    best.flatMap((chunk) => {
      const found = articles.get(chunk.doi);
      return found === undefined ? [] : [{ article: found, best: chunk }];
    }),
  ).slice(0, request.limit);
  const chunks = new Map(
    (
      await reader.findChunks(
        page.map(({ best: { chunkId } }) => chunkId),
        signal,
      )
    ).map((chunk) => [chunk.id, chunk]),
  );
  const hits = page.map(({ article: found, best: { chunkId } }): SearchHit => ({
    article: found,
    matchedChunkId: chunkId,
    teaser: buildTeaser(found),
    whyMatched: whyMatched({
      chunk: chunks.get(chunkId) ?? { text: found.title, origin: 'metadata' },
      title: found.title,
      terms: [],
    }),
  }));
  return { article, hits, indexVersion: meta.version };
}

function notFound(doi: Doi) {
  return appError(
    'NOT_FOUND',
    `No indexed article has the DOI ${doi}; use search_articles to find articles on the topic`,
    { field: 'doi' },
  );
}
