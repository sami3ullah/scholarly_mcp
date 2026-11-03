import {
  appError,
  isAppError,
  type Article,
  type Doi,
  type SearchFilters,
  type VectorChunk,
} from '@scholarly-mcp/core';
import { createCachedQueryEmbedder } from '../embedding/cached-query-embedder.js';
import { decodeCursor, encodeCursor } from '../paging/cursor.js';
import { buildTeaser } from '../present/build-teaser.js';
import { whyMatched } from '../present/why-matched.js';
import { normalizeQuery } from '../query/normalize-query.js';
import { planQuery, type QueryPlan } from '../query/plan-query.js';
import { collapseToArticles } from '../rank/collapse-to-articles.js';
import { laneOfLanguage, languageLanes, relatedHits } from '../rank/language-lanes.js';
import { mixLanes } from '../rank/mix-lanes.js';
import { orderResults, type Candidate } from '../rank/order-results.js';
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

/**
 * Just above 1, so at the same rank an exact word match beats a neighbour by meaning, such
 * as a rare word found only in one article's full text (SM-08). Larger weights lowered
 * recall on the golden set (ADR 0026).
 */
export const LEXICAL_WEIGHT = 1.01;

/**
 * How much less similar to the query than the best vector hit a vector hit may be and still
 * count. Each language lane brings its own nearest neighbours, related or not; this keeps the
 * ones that are. Best on the golden set at 0.05 to 0.055, worse from 0.06 (ADR 0044).
 */
export const VECTOR_MARGIN = 0.055;

/**
 * The first results that hold both language lanes when both have related passages: the
 * tool's default page (ADR 0044).
 */
export const MIXED_WITHIN = 5;

/** The most results one page may hold (PLAN.md tool contracts). */
export const MAX_SEARCH_LIMIT = 10;

export const DEFAULT_SEARCH_OPTIONS: SearchOptions = {
  budgetMs: 2000,
  candidates: 50,
  cacheSize: 1000,
  rrfK: RRF_K,
  lexicalWeight: LEXICAL_WEIGHT,
  vectorMargin: VECTOR_MARGIN,
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
 * lexical and vector retrieval in parallel with the same filters, the vector side once per
 * language lane when no language is asked for, keeps vector hits near the best one, fuses
 * all lists with RRF, collapses chunks to articles, puts both languages among the first
 * results and returns one page with teasers and match labels, all within the time budget.
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
    const embedded = embeddings.embed(plan.embeddingText, signal);
    const [lexical, lanes] = await Promise.all([
      plan.terms.length === 0
        ? []
        : search.lexical(
            {
              terms: plan.terms,
              ...(plan.language !== undefined && { language: plan.language }),
              filters: request.filters,
              limit: options.candidates,
            },
            signal,
          ),
      embedded.then(({ vector: embedding }) =>
        Promise.all(
          languageLanes(request.filters).map((filters) =>
            search.vector({ embedding, filters, limit: options.candidates }, signal),
          ),
        ),
      ),
    ]);
    const { cached: embeddingCached } = await embedded;
    const related = relatedHits(lanes, options.vectorMargin);
    const best = collapseToArticles(
      fuseRankings([lexical, ...related], options.rrfK, [
        options.lexicalWeight,
        ...related.map(() => 1),
      ]),
    );
    const articles = new Map(
      (
        await reader.findManyByDoi(
          best.map(({ doi }) => doi),
          signal,
        )
      ).map((article) => [article.doi, article]),
    );
    const ranked = orderResults(
      best.flatMap((chunk) => {
        const article = articles.get(chunk.doi);
        return article === undefined ? [] : [{ article, best: chunk }];
      }),
      query,
    );
    const ordered = related.length > 1 ? await mixed(ranked, related, articles, signal) : ranked;
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
      stats: {
        lexicalHits: lexical.length,
        vectorHits: lanes.reduce((total, hits) => total + hits.length, 0),
        embeddingCached,
      },
    };
  }

  /**
   * Puts both language lanes among the first results (ADR 0044). A vector hit's lane is the
   * lane that found it; a word-only match among the first results takes the lane of its
   * passage's language. Only results related in meaning move up.
   */
  async function mixed(
    ranked: Candidate[],
    related: readonly (readonly VectorChunk[])[],
    articles: ReadonlyMap<Doi, Article>,
    signal: AbortSignal,
  ): Promise<Candidate[]> {
    const laneByChunk = new Map(
      related.flatMap((hits, lane) => hits.map(({ chunkId }) => [chunkId, lane] as const)),
    );
    const wordOnly = ranked
      .slice(0, MIXED_WITHIN)
      .map(({ best: { chunkId } }) => chunkId)
      .filter((chunkId) => !laneByChunk.has(chunkId));
    for (const chunk of await reader.findChunks(wordOnly, signal)) {
      laneByChunk.set(
        chunk.id,
        laneOfLanguage(chunk.language ?? articles.get(chunk.doi)?.language),
      );
    }
    const relatedInMeaning = new Set(related.flat().map(({ doi }) => doi));
    return mixLanes(
      ranked,
      ({ best: { chunkId } }) => laneByChunk.get(chunkId),
      MIXED_WITHIN,
      ({ article }) => relatedInMeaning.has(article.doi),
    );
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
