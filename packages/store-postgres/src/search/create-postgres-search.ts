import type { ArticleSearch, Doi, RankedChunk } from '@scholarly-mcp/core';
import { hasStemAtWordEdge, trigramStems } from '@scholarly-mcp/lexical';
import { vectorText } from '../articles/rows.js';
import { inTransaction, query, type Pool } from '../database/pool.js';
import { containsPatterns, queryWords, weighWords } from '../text/ts-query.js';
import { filterSql } from './filter-sql.js';

interface HitRow {
  readonly id: string;
  readonly doi: string;
}

interface TrigramRow extends HitRow {
  readonly title_text_folded: string;
}

/*
 * Lexical rank, BM25-like (ADR 0034): each query word's `ts_rank` times its inverse document
 * frequency (`weighWords`, from the build's `term_stats`), summed. `ts_rank` alone has no IDF, so a common word repeated outranked a rare
 * one and German queries lost 3 recall points on the golden set. Weights in {D, C, B, A}
 * order keep SQLite's column ratio of title 2.0, stemmed text 1.0, folded text 0.5, halved
 * because `ts_rank` takes weights up to 1; normalisation 0 (no length damping) measured best.
 */
const TS_RANK = `ts_rank('{0.05, 0.25, 0.5, 1.0}', c.tsv, w.q, 0)`;

interface TermCountRow {
  readonly lexeme: string;
  readonly chunks: number;
}

/*
 * HNSW settings per vector query (ADR 0034). `strict_order` keeps scanning the graph until
 * enough rows pass the filters, in exact distance order; `max_scan_tuples` is raised so a
 * strict filter on the 90k-chunk corpus still fills its list. `ef_search` 400 gave the exact
 * scan's golden-set scores, 200 cost 0.8 recall points.
 */
const EF_SEARCH = 400;
const MAX_EF_SEARCH = 1000;
const MAX_SCAN_TUPLES = 1_000_000;

const ranked = (rows: readonly HitRow[]): RankedChunk[] =>
  rows.map((row, index) => ({ chunkId: row.id, doi: row.doi as Doi, rank: index + 1 }));

/**
 * Lexical search over the weighted `tsv`, each word weighed by its rarity, topped up from
 * the trigram index on the folded title and text (substrings, for German compounds) when it
 * finds fewer than the limit; a trigram hit counts only where a word starts or ends with the
 * stem, as in SQLite. Vector
 * search walks the HNSW index on cosine distance with the filters applied during the scan.
 */
export function createPostgresSearch(pool: Pool, s: string): ArticleSearch {
  return {
    lexical: async ({ terms, language, filters, limit }, signal) => {
      signal.throwIfAborted();
      const words = queryWords(terms, language);
      if (words.length === 0 || limit <= 0) return [];
      const [counts, total] = await Promise.all([
        termCounts(
          words.flatMap(({ lexemes }) => lexemes),
          signal,
        ),
        chunkTotal(signal),
      ]);
      const weighted = weighWords(words, counts, total);
      const where = filterSql(filters, 5);
      const { rows: hits } = await query<HitRow>(
        pool,
        signal,
        `WITH weighted AS MATERIALIZED (
           SELECT to_tsquery('simple', w.query) AS q, w.idf
           FROM unnest($3::text[], $4::float8[]) AS w(query, idf)
         )
         SELECT c.id, c.doi FROM ${s}.chunks c
         WHERE c.tsv @@ to_tsquery('simple', $1) AND ${where.sql}
         ORDER BY (SELECT sum(w.idf * ${TS_RANK}) FROM weighted w) DESC, c.id LIMIT $2`,
        [
          weighted
            .filter(({ matches }) => matches)
            .map(({ query: text }) => text)
            .join(' | '),
          limit,
          weighted.map(({ query: text }) => text),
          weighted.map(({ idf }) => idf),
          ...where.params,
        ],
      );
      const stems = trigramStems(terms, language);
      if (hits.length < limit && stems.length > 0) {
        const seen = new Set(hits.map((hit) => hit.id));
        const extra = (await trigramRows(stems, filters, limit, signal)).filter(
          (hit) => !seen.has(hit.id) && hasStemAtWordEdge(hit.title_text_folded, stems),
        );
        hits.push(...extra.slice(0, limit - hits.length));
      }
      return ranked(hits);
    },
    vector: async ({ embedding, filters, limit }, signal) => {
      signal.throwIfAborted();
      if (limit <= 0) return [];
      const where = filterSql(filters, 3);
      const rows = await inTransaction(pool, signal, async (client) => {
        await client.query(
          `SELECT set_config('hnsw.iterative_scan', 'strict_order', true),
             set_config('hnsw.ef_search', $1, true),
             set_config('hnsw.max_scan_tuples', $2, true)`,
          [String(Math.min(MAX_EF_SEARCH, Math.max(EF_SEARCH, limit))), String(MAX_SCAN_TUPLES)],
        );
        const result = await client.query<HitRow & { distance: number }>(
          `SELECT id, doi, distance FROM (
             SELECT c.id, c.doi, c.embedding <=> $1::vector AS distance FROM ${s}.chunks c
             WHERE ${where.sql} AND c.embedding <=> $1::vector < 1
             ORDER BY c.embedding <=> $1::vector LIMIT $2
           ) v
           ORDER BY distance, id`,
          [vectorText(embedding), limit, ...where.params],
        );
        return result.rows;
      });
      // `<=>` is the cosine distance, 1 - cos.
      return rows.map((row, index) => ({
        chunkId: row.id,
        doi: row.doi as Doi,
        rank: index + 1,
        similarity: 1 - row.distance,
      }));
    },
  };

  async function termCounts(
    lexemes: readonly string[],
    signal: AbortSignal,
  ): Promise<Map<string, number>> {
    const { rows } = await query<TermCountRow>(
      pool,
      signal,
      `SELECT lexeme, chunks FROM ${s}.term_stats WHERE lexeme = ANY($1::text[])`,
      [lexemes],
    );
    return new Map(rows.map((row) => [row.lexeme, row.chunks]));
  }

  /** The planner's row count, set by the ANALYZE at commit. */
  async function chunkTotal(signal: AbortSignal): Promise<number> {
    const { rows } = await query<{ n: number }>(
      pool,
      signal,
      `SELECT greatest(reltuples, 0)::float8 AS n FROM pg_class WHERE oid = $1::regclass`,
      [`${s}.chunks`],
    );
    return rows[0]?.n ?? 0;
  }

  async function trigramRows(
    stems: readonly string[],
    filters: Parameters<typeof filterSql>[0],
    limit: number,
    signal: AbortSignal,
  ): Promise<TrigramRow[]> {
    const where = filterSql(filters, 3);
    const { rows } = await query<TrigramRow>(
      pool,
      signal,
      `SELECT c.id, c.doi, c.title_text_folded FROM ${s}.chunks c
       WHERE c.title_text_folded LIKE ANY($1::text[]) AND ${where.sql}
       ORDER BY (SELECT count(*) FROM unnest($1::text[]) p
                 WHERE c.title_text_folded LIKE p) DESC, c.id
       LIMIT $2`,
      [containsPatterns(stems), limit, ...where.params],
    );
    return rows;
  }
}
