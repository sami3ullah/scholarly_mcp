import { appError, isAppError, type Doi, type SearchFilters } from '@scholarly-mcp/core';
import { createCachedQueryEmbedder } from '../embedding/cached-query-embedder.js';
import { decodeCursor, encodeCursor } from '../paging/cursor.js';
import { buildTeaser } from '../present/build-teaser.js';
import { whyMatched } from '../present/why-matched.js';
import { normalizeQuery } from '../query/normalize-query.js';
import { planQuery, type QueryPlan } from '../query/plan-query.js';
import { collapseToArticles } from '../rank/collapse-to-articles.js';
import { orderResults } from '../rank/order-results.js';
import { RRF_K, fuseRankings } from '../rank/rrf.js';
import type {
  SearchHit,
  SearchOptions,
  SearchRequest,
  SearchResult,
  SearchService,
  SearchServiceDeps,
} from './search-types.js';
import { relatedArticles } from './related-articles.js';
import { withBudget } from './with-budget.js';

/** The most results one page may hold (PLAN.md tool contracts). */
export const MAX_SEARCH_LIMIT = 10;

export const DEFAULT_SEARCH_OPTIONS: SearchOptions = {
  budgetMs: 2000,
  candidates: 50,
  cacheSize: 1000,
  rrfK: RRF_K,
};

/** Facts about one search for its log line. Never the query text (PLAN.md hard rules). */
interface SearchStats {
  mode: QueryPlan['kind'];
  lexicalHits: number;
  vectorHits: number;
  candidates: number;
  embeddingCached: boolean;
}

type TextPlan = Extract<QueryPlan, { kind: 'text' }>;

/**
 * Creates the search service: validates the query, looks a DOI up directly, otherwise runs
 * lexical and vector retrieval in parallel with the same filters, fuses them with RRF,
 * collapses chunks to articles and returns one page with teasers and match labels, all
 * within the time budget.
 */
export function createSearchService(deps: SearchServiceDeps): SearchService {
  const options = { ...DEFAULT_SEARCH_OPTIONS, ...deps.options };
  const embeddings = createCachedQueryEmbedder(deps.embedder, options.cacheSize);
  const { reader, search, clock, logger } = deps;

  async function doiPage(doi: Doi, request: SearchRequest, offset: number, signal: AbortSignal) {
    const article = await reader.findByDoi(doi, signal);
    const visible =
      article !== undefined && (!article.isRetracted || request.filters.includeRetracted === true);
    const hits: SearchHit[] =
      visible && offset === 0
        ? [
            {
              article,
              teaser: buildTeaser(article),
              whyMatched: whyMatched({ chunk: undefined, title: article.title, terms: [] }),
            },
          ]
        : [];
    return {
      hits,
      total: visible ? 1 : 0,
      stats: { lexicalHits: 0, vectorHits: 0, embeddingCached: false },
    };
  }

  async function textPage(
    query: string,
    plan: TextPlan,
    request: SearchRequest,
    offset: number,
    signal: AbortSignal,
  ) {
    const { filters } = request;
    let embeddingCached = false;
    const [lexical, vector] = await Promise.all([
      plan.terms.length === 0
        ? []
        : search.lexical(
            {
              terms: plan.terms,
              ...(plan.language !== undefined && { language: plan.language }),
              filters,
              limit: options.candidates,
            },
            signal,
          ),
      embeddings.embed(plan.embeddingText, signal).then(({ vector: embedding, cached }) => {
        embeddingCached = cached;
        return search.vector({ embedding, filters, limit: options.candidates }, signal);
      }),
    ]);

    const best = collapseToArticles(fuseRankings([lexical, vector], options.rrfK));
    const articles = new Map(
      (
        await reader.findManyByDoi(
          best.map(({ doi }) => doi),
          signal,
        )
      ).map((article) => [article.doi, article]),
    );
    const ordered = orderResults(
      best.flatMap((chunk) => {
        const article = articles.get(chunk.doi);
        return article === undefined ? [] : [{ article, best: chunk }];
      }),
      query,
    );
    const page = ordered.slice(offset, offset + request.limit);
    const chunks = new Map(
      (
        await reader.findChunks(
          page.map(({ best: { chunkId } }) => chunkId),
          signal,
        )
      ).map((chunk) => [chunk.id, chunk]),
    );
    const hits = page.map(({ article, best: { chunkId } }): SearchHit => ({
      article,
      matchedChunkId: chunkId,
      teaser: buildTeaser(article),
      whyMatched: whyMatched({
        // A chunk can only be missing if the index changed mid-request; explain by title then.
        chunk: chunks.get(chunkId) ?? { text: article.title, origin: 'metadata' },
        title: article.title,
        terms: plan.terms,
      }),
    }));
    return {
      hits,
      total: ordered.length,
      stats: { lexicalHits: lexical.length, vectorHits: vector.length, embeddingCached },
    };
  }

  async function run(query: string, request: SearchRequest, signal: AbortSignal) {
    const meta = await reader.indexMeta(signal);
    if (meta === undefined) {
      throw appError('INDEX_UNAVAILABLE', 'The search index is not available yet; retry shortly');
    }
    const offset = request.cursor === undefined ? 0 : decodeCursor(request.cursor, meta.version);
    const plan = planQuery(query);
    const page =
      plan.kind === 'doi'
        ? await doiPage(plan.doi, request, offset, signal)
        : await textPage(query, plan, request, offset, signal);
    const next = offset + request.limit;
    const result: SearchResult = {
      hits: page.hits,
      indexVersion: meta.version,
      ...(next < page.total && {
        nextCursor: encodeCursor({ offset: next, indexVersion: meta.version }),
      }),
      ...(plan.kind === 'text' && plan.language !== undefined && { queryLanguage: plan.language }),
    };
    const stats: SearchStats = { mode: plan.kind, candidates: page.total, ...page.stats };
    return { result, stats, offset };
  }

  /** Runs one call under the budget and logs its outcome, never its input text. */
  async function measured<T>(
    kind: 'search' | 'related',
    signal: AbortSignal,
    work: (budget: AbortSignal) => Promise<{ value: T; fields: Record<string, unknown> }>,
  ): Promise<T> {
    const started = clock.now().getTime();
    const elapsed = () => clock.now().getTime() - started;
    try {
      const { value, fields } = await withBudget(options.budgetMs, signal, work);
      logger.info({ ...fields, durationMs: elapsed() }, `${kind} completed`);
      return value;
    } catch (error) {
      const code = isAppError(error) ? error.code : 'INTERNAL';
      const clientError =
        code === 'INVALID_INPUT' || code === 'CURSOR_STALE' || code === 'NOT_FOUND';
      logger[clientError ? 'info' : 'warn']({ code, durationMs: elapsed() }, `${kind} failed`);
      throw error;
    }
  }

  return {
    related(request, signal) {
      return measured('related', signal, async (budget) => {
        checkLimit(request.limit);
        const value = await relatedArticles(deps, options, request, budget);
        return { value, fields: { results: value.hits.length } };
      });
    },
    search(request, signal) {
      return measured('search', signal, async (budget) => {
        const query = normalizeQuery(request.query);
        checkRequest(request);
        const { result, stats, offset } = await run(query, request, budget);
        return {
          value: result,
          fields: { ...stats, queryLength: query.length, offset, results: result.hits.length },
        };
      });
    },
  };
}

/** Checks what the tool schema cannot: the limit range and that the years are in order. */
function checkRequest({ limit, filters }: SearchRequest): void {
  checkLimit(limit);
  checkYears(filters);
}

function checkLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_SEARCH_LIMIT) {
    throw appError(
      'INVALID_INPUT',
      `limit must be a whole number from 1 to ${String(MAX_SEARCH_LIMIT)}`,
      {
        field: 'limit',
      },
    );
  }
}

function checkYears({ yearFrom, yearTo }: SearchFilters): void {
  if (yearFrom !== undefined && yearTo !== undefined && yearFrom > yearTo) {
    throw appError(
      'INVALID_INPUT',
      `yearFrom (${String(yearFrom)}) is after yearTo (${String(yearTo)})`,
      {
        field: 'yearFrom',
      },
    );
  }
}
